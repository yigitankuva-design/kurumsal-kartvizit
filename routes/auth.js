const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { pool } = require('../db');
const { firmaSlugOlustur } = require('../utils/slug');
const { createLoginLimiter } = require('../middleware/rateLimiter');
const girisLimiter = createLoginLimiter('/');

router.get('/kayit', (req, res) => res.redirect('/'));
router.get('/giris', (req, res) => res.redirect('/'));

router.post('/kayit', async (req, res) => {
  const { ad, yetkili_email, kullanici_adi, sifre } = req.body;

  if (!ad || !yetkili_email || !kullanici_adi || !sifre) {
    req.flash('error', 'Tüm alanları doldurun.');
    return res.redirect('/');
  }

  try {
    const hash = await bcrypt.hash(sifre, 12);
    let slug = firmaSlugOlustur(ad);

    const existing = await pool.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const result = await pool.query(
      `INSERT INTO firmalar (ad, slug, sektor, marka_rengi, yetkili_email, kullanici_adi, yetkili_sifre_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ad, slug, 'diger', '#1a73e8', yetkili_email, kullanici_adi, hash]
    );

    req.session.firmaId = result.rows[0].id;
    req.flash('success', 'Firma kaydı başarılı!');
    res.redirect('/');
  } catch (err) {
    if (err.code === '23505') {
      req.flash('error', err.constraint && err.constraint.includes('kullanici_adi') ? 'Bu kullanıcı adı zaten alınmış.' : 'Bu email zaten kayıtlı.');
      return res.redirect('/');
    }
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/');
  }
});

router.post('/giris', girisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;

  if (!giris_bilgisi || !sifre) {
    req.flash('error', 'E-posta/kullanıcı adı ve şifre gerekli.');
    return res.redirect('/');
  }

  try {
    const result = await pool.query(
      'SELECT * FROM firmalar WHERE yetkili_email = $1 OR kullanici_adi = $1',
      [giris_bilgisi]
    );

    if (!result.rows.length) {
      req.flash('error', 'E-posta/kullanıcı adı veya şifre hatalı.');
      return res.redirect('/');
    }

    const firma = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, firma.yetkili_sifre_hash);

    if (!eslesme) {
      req.flash('error', 'E-posta/kullanıcı adı veya şifre hatalı.');
      return res.redirect('/');
    }

    req.session.firmaId = firma.id;
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/');
  }
});

router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
