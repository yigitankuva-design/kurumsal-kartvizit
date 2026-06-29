const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { pool } = require('../db');
const { firmaSlugOlustur } = require('../utils/slug');

router.get('/kayit', (req, res) => {
  res.render('auth/kayit', { title: 'Firma Kaydı' });
});

router.post('/kayit', async (req, res) => {
  const { ad, sektor, marka_rengi, yetkili_email, sifre } = req.body;

  if (!ad || !yetkili_email || !sifre) {
    req.flash('error', 'Tüm alanları doldurun.');
    return res.redirect('/firma/kayit');
  }

  try {
    const hash = await bcrypt.hash(sifre, 12);
    let slug = firmaSlugOlustur(ad);

    const existing = await pool.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const result = await pool.query(
      `INSERT INTO firmalar (ad, slug, sektor, marka_rengi, yetkili_email, yetkili_sifre_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [ad, slug, sektor || 'diger', marka_rengi || '#1a73e8', yetkili_email, hash]
    );

    req.session.firmaId = result.rows[0].id;
    req.flash('success', 'Firma kaydı başarılı!');
    res.redirect('/firma/panel');
  } catch (err) {
    if (err.code === '23505') {
      req.flash('error', 'Bu email zaten kayıtlı.');
      return res.redirect('/firma/kayit');
    }
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/firma/kayit');
  }
});

router.get('/giris', (req, res) => {
  res.render('auth/giris', { title: 'Firma Girişi' });
});

router.post('/giris', async (req, res) => {
  const { yetkili_email, sifre } = req.body;

  if (!yetkili_email || !sifre) {
    req.flash('error', 'Email ve şifre gerekli.');
    return res.redirect('/firma/giris');
  }

  try {
    const result = await pool.query(
      'SELECT * FROM firmalar WHERE yetkili_email = $1',
      [yetkili_email]
    );

    if (!result.rows.length) {
      req.flash('error', 'Email veya şifre hatalı.');
      return res.redirect('/firma/giris');
    }

    const firma = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, firma.yetkili_sifre_hash);

    if (!eslesme) {
      req.flash('error', 'Email veya şifre hatalı.');
      return res.redirect('/firma/giris');
    }

    req.session.firmaId = firma.id;
    res.redirect('/firma/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/firma/giris');
  }
});

router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/firma/giris'));
});

module.exports = router;
