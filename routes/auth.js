const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { pool } = require('../db');
const { firmaSlugOlustur } = require('../utils/slug');

router.get('/kayit', (req, res) => res.redirect('/'));
router.get('/giris', (req, res) => res.redirect('/'));

router.post('/kayit', async (req, res) => {
  const { ad, yetkili_email, sifre } = req.body;

  if (!ad || !yetkili_email || !sifre) {
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
      `INSERT INTO firmalar (ad, slug, sektor, marka_rengi, yetkili_email, yetkili_sifre_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [ad, slug, 'diger', '#1a73e8', yetkili_email, hash]
    );

    req.session.firmaId = result.rows[0].id;
    req.flash('success', 'Firma kaydı başarılı!');
    res.redirect('/firma/panel');
  } catch (err) {
    if (err.code === '23505') {
      req.flash('error', 'Bu email zaten kayıtlı.');
      return res.redirect('/');
    }
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/');
  }
});

router.post('/giris', async (req, res) => {
  const { yetkili_email, sifre } = req.body;

  if (!yetkili_email || !sifre) {
    req.flash('error', 'Email ve şifre gerekli.');
    return res.redirect('/');
  }

  try {
    const result = await pool.query(
      'SELECT * FROM firmalar WHERE yetkili_email = $1',
      [yetkili_email]
    );

    if (!result.rows.length) {
      req.flash('error', 'Email veya şifre hatalı.');
      return res.redirect('/');
    }

    const firma = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, firma.yetkili_sifre_hash);

    if (!eslesme) {
      req.flash('error', 'Email veya şifre hatalı.');
      return res.redirect('/');
    }

    req.session.firmaId = firma.id;
    res.redirect('/firma/panel');
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
