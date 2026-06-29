const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { requireBayi } = require('../middleware/authMiddleware');
const { firmaSlugOlustur } = require('../utils/slug');

// Giriş formu
router.get('/giris', (req, res) => {
  res.render('bayi/giris', { title: 'Bayi Girişi', layout: 'layout' });
});

// Giriş POST
router.post('/giris', async (req, res) => {
  const { email, sifre } = req.body;
  if (!email || !sifre) {
    req.flash('error', 'Email ve şifre zorunlu.');
    return res.redirect('/bayi/giris');
  }
  try {
    const result = await pool.query('SELECT * FROM bayiler WHERE email = $1 AND aktif = true', [email]);
    if (!result.rows.length) {
      req.flash('error', 'Email veya şifre hatalı.');
      return res.redirect('/bayi/giris');
    }
    const bayi = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, bayi.sifre_hash);
    if (!eslesme) {
      req.flash('error', 'Email veya şifre hatalı.');
      return res.redirect('/bayi/giris');
    }
    req.session.bayiId = bayi.id;
    req.session.bayiAd = bayi.ad;
    res.redirect('/bayi/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/bayi/giris');
  }
});

// Çıkış
router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/bayi/giris'));
});

// Bayi paneli — firmalar listesi
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
    res.redirect('/bayi/giris');
  }
});

// Firma ekleme formu
router.get('/panel/firma-ekle', requireBayi, (req, res) => {
  res.render('bayi/firma-ekle', { title: 'Yeni Firma Ekle' });
});

// Firma ekleme POST
router.post('/panel/firma-ekle', requireBayi, async (req, res) => {
  const { ad, yetkili_email, sifre, sektor, marka_rengi } = req.body;
  if (!ad || !yetkili_email || !sifre) {
    req.flash('error', 'Firma adı, email ve şifre zorunlu.');
    return res.redirect('/bayi/panel/firma-ekle');
  }
  try {
    const hash = await bcrypt.hash(sifre, 12);
    let slug = firmaSlugOlustur(ad);
    const check = await pool.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor, marka_rengi, bayi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ad, slug, yetkili_email, hash, sektor || 'diger', marka_rengi || '#1a73e8', req.session.bayiId]
    );
    req.flash('success', `${ad} firması eklendi.`);
    res.redirect('/bayi/panel');
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      req.flash('error', 'Bu email adresi zaten kayıtlı.');
    } else {
      req.flash('error', 'Firma eklenemedi.');
    }
    res.redirect('/bayi/panel/firma-ekle');
  }
});

// Firma sil
router.post('/panel/firma-sil/:id', requireBayi, async (req, res) => {
  try {
    await pool.query('DELETE FROM firmalar WHERE id = $1 AND bayi_id = $2', [req.params.id, req.session.bayiId]);
    req.flash('success', 'Firma silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/bayi/panel');
});

module.exports = router;
