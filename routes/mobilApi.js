const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { bayiTokenUret } = require('../utils/jwt');
const { createJsonLimiter } = require('../middleware/rateLimiter');
const { requireBayiToken } = require('../middleware/tokenAuth');

const mobilGirisLimiter = createJsonLimiter('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');

router.post('/giris', mobilGirisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    return res.status(400).json({ ok: false, error: 'E-posta/kullanıcı adı ve şifre zorunlu.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM bayiler WHERE (email = $1 OR kullanici_adi = $1) AND aktif = true',
      [giris_bilgisi]
    );
    if (!result.rows.length) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const bayi = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, bayi.sifre_hash);
    if (!eslesme) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const token = bayiTokenUret(bayi.id);
    res.json({ ok: true, token, bayi: { id: bayi.id, ad: bayi.ad } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/musteriler', requireBayiToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.ad, f.slug, COUNT(c.id) as calisan_sayisi
       FROM firmalar f LEFT JOIN calisanlar c ON c.firma_id = f.id
       WHERE f.bayi_id = $1 GROUP BY f.id ORDER BY f.created_at DESC`,
      [req.bayiId]
    );
    res.json({ ok: true, musteriler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/musteriler/:firmaId/calisanlar', requireBayiToken, async (req, res) => {
  try {
    const firmaResult = await pool.query(
      'SELECT id, ad, slug FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.bayiId]
    );
    if (!firmaResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı.' });
    }
    const calisanlarResult = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
      [req.params.firmaId]
    );
    res.json({ ok: true, firma: firmaResult.rows[0], calisanlar: calisanlarResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/abonelik', requireBayiToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT abonelik_bitis_tarihi FROM bayiler WHERE id = $1', [req.bayiId]);
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Bayi bulunamadı.' });
    }
    const bitis = result.rows[0].abonelik_bitis_tarihi;
    const aktif = !bitis || new Date(bitis) >= new Date();
    res.json({ ok: true, abonelikBitisTarihi: bitis, aktif });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

module.exports = router;
