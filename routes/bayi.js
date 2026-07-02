const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { requireBayi } = require('../middleware/authMiddleware');
const { firmaSlugOlustur, benzersizCalisanSlugOlustur } = require('../utils/slug');
const { uploadMiddleware } = require('../middleware/upload');
const { createLoginLimiter, firmaEkleLimiter } = require('../middleware/rateLimiter');
const { biyografiTemizle } = require('../utils/sanitize');

const fotoUpload = uploadMiddleware('calisanlar');
const bayiGirisLimiter = createLoginLimiter('/bayi/giris');

// fotoUpload.single() bir dizi middleware döner (multer + sharp işleme) — hata
// olursa çökmek yerine flash mesajıyla forma geri döner.
function fotoUploadGuvenli(redirectYolu) {
  return (req, res, next) => {
    const [multerMw, isleMw] = fotoUpload.single('foto');
    const hataYakala = (err) => {
      console.error(err);
      req.flash('error', err.message || 'Fotoğraf yüklenemedi.');
      res.redirect(redirectYolu(req));
    };
    multerMw(req, res, (err) => {
      if (err) return hataYakala(err);
      isleMw(req, res, (err2) => {
        if (err2) return hataYakala(err2);
        next();
      });
    });
  };
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

router.get('/giris', (req, res) => {
  res.redirect('/');
});

router.post('/giris', bayiGirisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    req.flash('error', 'E-posta/kullanıcı adı ve şifre zorunlu.');
    return res.redirect('/');
  }
  try {
    const result = await pool.query(
      'SELECT * FROM bayiler WHERE (email = $1 OR kullanici_adi = $1) AND aktif = true',
      [giris_bilgisi]
    );
    if (!result.rows.length) {
      req.flash('error', 'E-posta/kullanıcı adı veya şifre hatalı.');
      return res.redirect('/');
    }
    const bayi = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, bayi.sifre_hash);
    if (!eslesme) {
      req.flash('error', 'E-posta/kullanıcı adı veya şifre hatalı.');
      return res.redirect('/');
    }
    req.session.bayiId = bayi.id;
    req.session.bayiAd = bayi.ad;
    res.redirect('/bayi/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/');
  }
});

router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ── PANEL — FİRMA LİSTESİ ────────────────────────────────────────────────────

router.get('/panel', requireBayi, async (req, res) => {
  try {
    const bayiResult = await pool.query('SELECT * FROM bayiler WHERE id = $1', [req.session.bayiId]);
    const firmalarResult = await pool.query(
      `SELECT f.*, COUNT(c.id) as calisan_sayisi
       FROM firmalar f
       LEFT JOIN calisanlar c ON c.firma_id = f.id
       WHERE f.bayi_id = $1
       GROUP BY f.id ORDER BY f.created_at DESC`,
      [req.session.bayiId]
    );
    res.render('bayi/panel', {
      title: 'Bayi Paneli',
      bayi: bayiResult.rows[0],
      firmalar: firmalarResult.rows
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/');
  }
});

// ── FİRMA EKLE / SİL ─────────────────────────────────────────────────────────

router.get('/panel/firma-ekle', requireBayi, (req, res) => {
  res.render('bayi/firma-ekle', { title: 'Yeni Müşteri Ekle' });
});

router.post('/panel/firma-ekle', requireBayi, firmaEkleLimiter, async (req, res) => {
  const { ad, sektor, marka_rengi } = req.body;
  if (!ad) {
    req.flash('error', 'Müşteri adı zorunlu.');
    return res.redirect('/bayi/panel/firma-ekle');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bayiSonuc = await client.query(
      'SELECT kredi_bakiyesi FROM bayiler WHERE id = $1 FOR UPDATE',
      [req.session.bayiId]
    );
    if (!bayiSonuc.rows.length || bayiSonuc.rows[0].kredi_bakiyesi < 1) {
      await client.query('ROLLBACK');
      req.flash('error', 'Krediniz kalmadı, lütfen kredi yükleyin.');
      return res.redirect('/bayi/panel/kredi-yukle');
    }

    let slug = firmaSlugOlustur(ad);
    const check = await client.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    // Firma girişi olmayacak — dummy email/sifre
    const dummyEmail = `${slug}-${Date.now()}@bayi.local`;
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 8);

    const firmaSonuc = await client.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor, marka_rengi, bayi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ad, slug, dummyEmail, dummyHash, sektor || 'diger', marka_rengi || '#1a73e8', req.session.bayiId]
    );

    await client.query('UPDATE bayiler SET kredi_bakiyesi = kredi_bakiyesi - 1 WHERE id = $1', [req.session.bayiId]);

    await client.query(
      `INSERT INTO kredi_hareketleri (bayi_id, tip, miktar, aciklama, firma_id)
       VALUES ($1, 'harcama', -1, $2, $3)`,
      [req.session.bayiId, `Firma eklendi: ${ad}`, firmaSonuc.rows[0].id]
    );

    await client.query('COMMIT');
    req.flash('success', `${ad} eklendi.`);
    res.redirect('/bayi/panel');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    req.flash('error', 'Eklenemedi.');
    res.redirect('/bayi/panel/firma-ekle');
  } finally {
    client.release();
  }
});

router.post('/panel/firma-sil/:id', requireBayi, async (req, res) => {
  try {
    await pool.query('DELETE FROM firmalar WHERE id = $1 AND bayi_id = $2', [req.params.id, req.session.bayiId]);
    req.flash('success', 'Müşteri silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/bayi/panel');
});

// ── ÇALIŞAN LİSTESİ ──────────────────────────────────────────────────────────

router.get('/panel/:firmaId/calisanlar', requireBayi, async (req, res) => {
  try {
    const firmaResult = await pool.query(
      `SELECT f.*, b.slug as bayi_slug FROM firmalar f
       JOIN bayiler b ON b.id = f.bayi_id
       WHERE f.id = $1 AND f.bayi_id = $2`,
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/bayi/panel');

    const calisanlarResult = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
      [req.params.firmaId]
    );
    const firma = firmaResult.rows[0];
    const calisanlar = calisanlarResult.rows;

    res.render('bayi/calisanlar', {
      title: `${firma.ad} — Çalışanlar`,
      firma,
      calisanlar,
      aktifSayisi: calisanlar.filter(c => c.durum === 'aktif').length,
      pasifSayisi: calisanlar.filter(c => c.durum === 'pasif').length
    });
  } catch (err) {
    console.error(err);
    res.redirect('/bayi/panel');
  }
});

// ── ÇALIŞAN EKLE ─────────────────────────────────────────────────────────────

router.get('/panel/:firmaId/calisan-ekle', requireBayi, async (req, res) => {
  const firmaResult = await pool.query(
    'SELECT f.*, b.slug as bayi_slug FROM firmalar f JOIN bayiler b ON b.id = f.bayi_id WHERE f.id = $1 AND f.bayi_id = $2',
    [req.params.firmaId, req.session.bayiId]
  );
  if (!firmaResult.rows.length) return res.redirect('/bayi/panel');
  res.render('bayi/calisan-ekle', { title: 'Yeni Çalışan', firma: firmaResult.rows[0] });
});

router.post('/panel/:firmaId/calisan-ekle', requireBayi,
  fotoUploadGuvenli((req) => `/bayi/panel/${req.params.firmaId}/calisan-ekle`),
  async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, kvkk } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(`/bayi/panel/${req.params.firmaId}/calisan-ekle`);
  }
  if (!kvkk) {
    req.flash('error', 'Devam etmek için KVKK onayı gerekiyor.');
    return res.redirect(`/bayi/panel/${req.params.firmaId}/calisan-ekle`);
  }
  try {
    // Firma bayiye ait mi kontrol et
    const firmaResult = await pool.query(
      'SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/bayi/panel');

    const slug = await benzersizCalisanSlugOlustur(req.params.firmaId, ad, soyad);

    const fotoUrl = req.file?.location || null;
    const biyografiTemiz = biyografiTemizle(biyografi);

    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [req.params.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null, instagram || null, twitter || null,
       youtube || null, website || null, whatsapp || null, tiktok || null, sahibinden || null,
       hurriyet_emlak || null, adres || null, google_yorum_link || null,
       biyografiTemiz, fotoUrl, slug]
    );
    req.flash('success', `${ad} ${soyad} eklendi.`);
    res.redirect(`/bayi/panel/${req.params.firmaId}/calisanlar`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Çalışan eklenemedi.');
    res.redirect(`/bayi/panel/${req.params.firmaId}/calisan-ekle`);
  }
});

// ── ÇALIŞAN DÜZENLE ──────────────────────────────────────────────────────────

router.get('/panel/:firmaId/calisan/:id/duzenle', requireBayi, async (req, res) => {
  try {
    const firmaResult = await pool.query(
      'SELECT f.*, b.slug as bayi_slug FROM firmalar f JOIN bayiler b ON b.id = f.bayi_id WHERE f.id = $1 AND f.bayi_id = $2',
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/bayi/panel');

    const calisanResult = await pool.query(
      'SELECT * FROM calisanlar WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.params.firmaId]
    );
    if (!calisanResult.rows.length) return res.redirect(`/bayi/panel/${req.params.firmaId}/calisanlar`);

    res.render('bayi/calisan-duzenle', {
      title: 'Çalışan Düzenle',
      firma: firmaResult.rows[0],
      calisan: calisanResult.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.redirect('/bayi/panel');
  }
});

router.post('/panel/:firmaId/calisan/:id/duzenle', requireBayi,
  fotoUploadGuvenli((req) => `/bayi/panel/${req.params.firmaId}/calisan/${req.params.id}/duzenle`),
  async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(`/bayi/panel/${req.params.firmaId}/calisan/${req.params.id}/duzenle`);
  }
  try {
    const firmaResult = await pool.query(
      'SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/bayi/panel');

    const fotoUrl = req.file?.location || null;
    const biyografiTemiz = biyografiTemizle(biyografi);

    if (fotoUrl) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,instagram=$8,twitter=$9,youtube=$10,website=$11,
         whatsapp=$12,tiktok=$13,sahibinden=$14,hurriyet_emlak=$15,adres=$16,google_yorum_link=$17,
         biyografi=$18,foto_url=$19
         WHERE id=$20 AND firma_id=$21`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, instagram||null, twitter||null, youtube||null, website||null,
         whatsapp||null, tiktok||null, sahibinden||null, hurriyet_emlak||null, adres||null, google_yorum_link||null,
         biyografiTemiz, fotoUrl,
         req.params.id, req.params.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,instagram=$8,twitter=$9,youtube=$10,website=$11,
         whatsapp=$12,tiktok=$13,sahibinden=$14,hurriyet_emlak=$15,adres=$16,google_yorum_link=$17,
         biyografi=$18
         WHERE id=$19 AND firma_id=$20`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, instagram||null, twitter||null, youtube||null, website||null,
         whatsapp||null, tiktok||null, sahibinden||null, hurriyet_emlak||null, adres||null, google_yorum_link||null,
         biyografiTemiz,
         req.params.id, req.params.firmaId]
      );
    }
    req.flash('success', 'Çalışan güncellendi.');
    res.redirect(`/bayi/panel/${req.params.firmaId}/calisanlar`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
    res.redirect(`/bayi/panel/${req.params.firmaId}/calisan/${req.params.id}/duzenle`);
  }
});

// ── ÇALIŞAN SİL / DURUM ──────────────────────────────────────────────────────

router.post('/panel/:firmaId/calisan/:id/sil', requireBayi, async (req, res) => {
  try {
    const firmaResult = await pool.query(
      'SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/bayi/panel');

    await pool.query('DELETE FROM calisanlar WHERE id = $1 AND firma_id = $2', [req.params.id, req.params.firmaId]);
    req.flash('success', 'Çalışan silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect(`/bayi/panel/${req.params.firmaId}/calisanlar`);
});

router.patch('/panel/:firmaId/calisan/:id/durum', requireBayi, async (req, res) => {
  const { durum } = req.body;
  if (!['aktif', 'pasif'].includes(durum)) return res.redirect('/bayi/panel');
  try {
    await pool.query(
      'UPDATE calisanlar SET durum=$1 WHERE id=$2 AND firma_id=$3',
      [durum, req.params.id, req.params.firmaId]
    );
  } catch (err) {
    console.error(err);
  }
  res.redirect(`/bayi/panel/${req.params.firmaId}/calisanlar`);
});

module.exports = router;
