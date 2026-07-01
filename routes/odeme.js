const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireBayi } = require('../middleware/authMiddleware');
const { tokenHashOlustur, callbackHashDogrula } = require('../utils/paytr');

const KREDI_BIRIM_FIYAT = 30; // TL/kredi — "elle gir" ile özel miktar girişinde kullanılır
const KREDI_PAKETLERI = [
  { kredi: 100, tutar: 3000 },
  { kredi: 250, tutar: 7500 },
  { kredi: 1000, tutar: 30000 },
];

// Kredi yükleme sayfası
router.get('/panel/kredi-yukle', requireBayi, async (req, res) => {
  try {
    const bayiSonuc = await pool.query('SELECT kredi_bakiyesi FROM bayiler WHERE id = $1', [req.session.bayiId]);
    res.render('bayi/kredi-yukle', {
      title: 'Kredi Yükle',
      krediBakiyesi: bayiSonuc.rows[0].kredi_bakiyesi,
      paketler: KREDI_PAKETLERI,
      birimFiyat: KREDI_BIRIM_FIYAT,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/bayi/panel');
  }
});

// Paket seçimi -> PayTR token isteği -> iframe sayfası
router.post('/panel/kredi-yukle', requireBayi, async (req, res) => {
  const kredi = parseInt(req.body.kredi, 10);
  if (!Number.isInteger(kredi) || kredi < 1 || kredi > 1000000) {
    req.flash('error', 'Geçersiz kredi miktarı.');
    return res.redirect('/bayi/panel/kredi-yukle');
  }
  const paket = KREDI_PAKETLERI.find((p) => p.kredi === kredi);
  const tutar = paket ? paket.tutar : kredi * KREDI_BIRIM_FIYAT;

  try {
    const bayiSonuc = await pool.query('SELECT * FROM bayiler WHERE id = $1', [req.session.bayiId]);
    const bayi = bayiSonuc.rows[0];
    const merchantOid = `KRD${req.session.bayiId}${Date.now()}`;

    await pool.query(
      `INSERT INTO odemeler (bayi_id, paytr_merchant_oid, kredi_miktari, tutar, durum)
       VALUES ($1, $2, $3, $4, 'beklemede')`,
      [req.session.bayiId, merchantOid, kredi, tutar]
    );

    const paymentAmount = Math.round(tutar * 100); // kuruş cinsinden
    const userBasket = Buffer.from(
      JSON.stringify([[`${kredi} Kredi Paketi`, tutar.toFixed(2), 1]])
    ).toString('base64');
    const userIp = req.ip;
    const noInstallment = 1;
    const maxInstallment = 1;
    const currency = 'TL';
    const testMode = process.env.NODE_ENV === 'production' ? 0 : 1;

    const paytrToken = tokenHashOlustur({
      merchantId: process.env.PAYTR_MERCHANT_ID,
      userIp,
      merchantOid,
      email: bayi.email,
      paymentAmount,
      userBasket,
      noInstallment,
      maxInstallment,
      currency,
      testMode,
      merchantSalt: process.env.PAYTR_MERCHANT_SALT,
      merchantKey: process.env.PAYTR_MERCHANT_KEY,
    });

    const govde = new URLSearchParams({
      merchant_id: process.env.PAYTR_MERCHANT_ID,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email: bayi.email,
      payment_amount: String(paymentAmount),
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: '1',
      no_installment: String(noInstallment),
      max_installment: String(maxInstallment),
      user_name: bayi.ad,
      user_address: 'Belirtilmedi',
      user_phone: '05000000000',
      merchant_ok_url: `${req.protocol}://${req.get('host')}/bayi/odeme/basarili`,
      merchant_fail_url: `${req.protocol}://${req.get('host')}/bayi/panel/kredi-yukle`,
      timeout_limit: '30',
      currency,
      test_mode: String(testMode),
    });

    const paytrYaniti = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: govde,
    });
    const sonuc = await paytrYaniti.json();

    if (sonuc.status !== 'success') {
      console.error('PayTR token hatasi:', sonuc.reason);
      req.flash('error', 'Ödeme başlatılamadı: ' + (sonuc.reason || 'bilinmeyen hata'));
      return res.redirect('/bayi/panel/kredi-yukle');
    }

    res.render('bayi/odeme-iframe', { title: 'Ödeme', iframeToken: sonuc.token });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Ödeme başlatılamadı.');
    res.redirect('/bayi/panel/kredi-yukle');
  }
});

// PayTR bildirim (callback) — PayTR sunucusu tarafından çağrılır, oturum gerektirmez
router.post('/odeme/paytr-callback', async (req, res) => {
  const { merchant_oid, status, total_amount, hash } = req.body;

  const gecerli = callbackHashDogrula({
    merchantOid: merchant_oid,
    status,
    totalAmount: total_amount,
    merchantSalt: process.env.PAYTR_MERCHANT_SALT,
    merchantKey: process.env.PAYTR_MERCHANT_KEY,
    gelenHash: hash,
  });

  if (!gecerli) {
    console.error('PayTR callback hash dogrulanamadi:', merchant_oid);
    return res.status(400).send('PAYTR notification failed: bad hash');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const odemeSonuc = await client.query(
      'SELECT * FROM odemeler WHERE paytr_merchant_oid = $1 FOR UPDATE',
      [merchant_oid]
    );
    if (!odemeSonuc.rows.length || odemeSonuc.rows[0].durum === 'basarili') {
      await client.query('ROLLBACK');
      return res.send('OK');
    }
    const odeme = odemeSonuc.rows[0];

    if (status === 'success') {
      await client.query(
        `UPDATE odemeler SET durum = 'basarili', onaylanma_tarihi = NOW() WHERE id = $1`,
        [odeme.id]
      );
      await client.query(
        'UPDATE bayiler SET kredi_bakiyesi = kredi_bakiyesi + $1 WHERE id = $2',
        [odeme.kredi_miktari, odeme.bayi_id]
      );
      await client.query(
        `INSERT INTO kredi_hareketleri (bayi_id, tip, miktar, aciklama, odeme_id)
         VALUES ($1, 'yukleme', $2, $3, $4)`,
        [odeme.bayi_id, odeme.kredi_miktari, `PayTR ödeme: ${odeme.kredi_miktari} kredi paketi`, odeme.id]
      );
    } else {
      await client.query(`UPDATE odemeler SET durum = 'basarisiz' WHERE id = $1`, [odeme.id]);
    }

    await client.query('COMMIT');
    res.send('OK');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    // "OK" DONDURULMEZ — PayTR bu durumda bildirimi tekrar gonderir
    res.status(500).send('Hata');
  } finally {
    client.release();
  }
});

// Ödeme sonrası bilgilendirme sayfası
router.get('/odeme/basarili', requireBayi, (req, res) => {
  res.render('bayi/odeme-basarili', { title: 'Ödeme Alındı' });
});

module.exports = { router, KREDI_PAKETLERI };
