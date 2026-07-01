const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { firmaSlugOlustur, benzersizCalisanSlugOlustur } = require('../utils/slug');
const { biyografiTemizle } = require('../utils/sanitize');
const { uploadMiddleware } = require('../middleware/upload');
const { createLoginLimiter } = require('../middleware/rateLimiter');

const fotoUpload = uploadMiddleware('calisanlar');
const basvuruLimiter = createLoginLimiter('/basvuru');

function adSoyadAyir(adSoyad) {
  const parcalar = adSoyad.trim().split(/\s+/);
  if (parcalar.length === 1) return { ad: parcalar[0], soyad: '' };
  return { ad: parcalar.slice(0, -1).join(' '), soyad: parcalar[parcalar.length - 1] };
}

router.get('/basvuru', (req, res) => {
  res.render('public/basvuru', { title: 'Kart Başvurusu', layout: false, error: req.flash('error') });
});

router.post('/basvuru', basvuruLimiter, (req, res, next) => {
  const [multerMw, isleMw] = fotoUpload.single('fotograf');
  const hataYakala = (err) => {
    console.error(err);
    req.flash('error', err.message || 'Fotoğraf yüklenemedi.');
    return res.redirect('/basvuru');
  };
  multerMw(req, res, (err) => {
    if (err) return hataYakala(err);
    isleMw(req, res, (err2) => {
      if (err2) return hataYakala(err2);
      next();
    });
  });
}, async (req, res) => {
  const {
    ad_soyad, telefon, eposta, meslek_unvan, isletme_adi, whatsapp, adres,
    instagram, linkedin, tiktok, twitter, sahibinden, hurriyet_emlak, website,
    google_yorum_link, tanitim, kvkk,
  } = req.body;

  if (!ad_soyad || !ad_soyad.trim() || !telefon || !telefon.trim()) {
    req.flash('error', 'Ad soyad ve telefon zorunlu.');
    return res.redirect('/basvuru');
  }
  if (!kvkk) {
    req.flash('error', 'Devam etmek için KVKK onayı gerekiyor.');
    return res.redirect('/basvuru');
  }

  const { ad, soyad } = adSoyadAyir(ad_soyad);
  if (!soyad) {
    req.flash('error', 'Lütfen ad ve soyadınızı birlikte yazın.');
    return res.redirect('/basvuru');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const firmaAd = (isletme_adi && isletme_adi.trim()) || `${ad} ${soyad}`;
    let slug = firmaSlugOlustur(firmaAd);
    const slugCheck = await client.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (slugCheck.rows.length) slug = `${slug}-${Date.now().toString().slice(-4)}`;

    const dummyEmail = `${slug}-${Date.now()}@basvuru.local`;
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 8);

    const firmaSonuc = await client.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor)
       VALUES ($1,$2,$3,$4,'diger') RETURNING id`,
      [firmaAd, slug, dummyEmail, dummyHash]
    );
    const firmaId = firmaSonuc.rows[0].id;

    const calisanSlug = await benzersizCalisanSlugOlustur(firmaId, ad, soyad);
    const biyografiTemiz = biyografiTemizle(tanitim);
    const fotoUrl = req.file?.location || null;

    await client.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, telefon, email, whatsapp, adres,
        instagram, linkedin, tiktok, twitter, sahibinden, hurriyet_emlak, website, google_yorum_link,
        biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [firmaId, ad, soyad, meslek_unvan || null, telefon || null, eposta || null, whatsapp || null, adres || null,
       instagram || null, linkedin || null, tiktok || null, twitter || null, sahibinden || null,
       hurriyet_emlak || null, website || null, google_yorum_link || null,
       biyografiTemiz, fotoUrl, calisanSlug]
    );

    await client.query('COMMIT');
    res.redirect(`/${slug}/${calisanSlug}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    req.flash('error', 'Başvuru gönderilemedi, lütfen tekrar deneyin.');
    res.redirect('/basvuru');
  } finally {
    client.release();
  }
});

module.exports = router;
