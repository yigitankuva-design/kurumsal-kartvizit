const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { requireSuperadmin } = require('../middleware/authMiddleware');
const { firmaSlugOlustur } = require('../utils/slug');

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
    const firmalarResult = await pool.query(`
      SELECT f.*, COUNT(c.id) as calisan_sayisi, b.ad as bayi_ad
      FROM firmalar f
      LEFT JOIN calisanlar c ON c.firma_id = f.id
      LEFT JOIN bayiler b ON b.id = f.bayi_id
      GROUP BY f.id, b.ad ORDER BY f.created_at DESC
    `);
    const bayilerResult = await pool.query('SELECT * FROM bayiler ORDER BY created_at DESC');
    const tab = req.query.tab || 'firmalar';
    res.render('superadmin/index', {
      title: 'Süper Admin',
      firmalar: firmalarResult.rows,
      bayiler: bayilerResult.rows,
      tab
    });
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

// Bayi ekleme
router.post('/bayi-ekle', requireSuperadmin, async (req, res) => {
  const { ad, email, sifre, marka_rengi } = req.body;
  if (!ad || !email || !sifre) {
    req.flash('error', 'Ad, email ve şifre zorunlu.');
    return res.redirect('/superadmin?tab=bayiler');
  }
  try {
    const hash = await bcrypt.hash(sifre, 12);
    let slug = firmaSlugOlustur(ad);
    const check = await pool.query('SELECT id FROM bayiler WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    await pool.query(
      'INSERT INTO bayiler (ad, slug, email, sifre_hash, marka_rengi) VALUES ($1,$2,$3,$4,$5)',
      [ad, slug, email, hash, marka_rengi || '#1a73e8']
    );
    req.flash('success', `${ad} bayisi eklendi.`);
  } catch (err) {
    console.error(err);
    req.flash('error', err.code === '23505' ? 'Bu email zaten kayıtlı.' : 'Bayi eklenemedi.');
  }
  res.redirect('/superadmin?tab=bayiler');
});

// Bayi sil
router.post('/bayi-sil/:id', requireSuperadmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [req.params.id]);
    req.flash('success', 'Bayi silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/superadmin?tab=bayiler');
});

module.exports = router;
