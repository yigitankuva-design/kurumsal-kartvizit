const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireSuperadmin } = require('../middleware/authMiddleware');

router.get('/giris', (req, res) => {
  res.render('superadmin/giris', { title: 'Süper Admin Girişi', layout: 'layout' });
});

router.post('/giris', (req, res) => {
  const { sifre } = req.body;
  if (sifre === process.env.SUPERADMIN_PASSWORD) {
    req.session.superadmin = true;
    res.redirect('/superadmin');
  } else {
    req.flash('error', 'Şifre hatalı.');
    res.redirect('/superadmin/giris');
  }
});

router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/superadmin/giris'));
});

router.get('/', requireSuperadmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, COUNT(c.id) as calisan_sayisi
      FROM firmalar f
      LEFT JOIN calisanlar c ON c.firma_id = f.id
      GROUP BY f.id ORDER BY f.created_at DESC
    `);
    res.render('superadmin/index', { title: 'Süper Admin', firmalar: result.rows });
  } catch (err) {
    console.error(err);
    res.send('Hata.');
  }
});

router.post('/firma-sil/:id', requireSuperadmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [req.params.id]);
    req.flash('success', 'Firma silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/superadmin');
});

module.exports = router;
