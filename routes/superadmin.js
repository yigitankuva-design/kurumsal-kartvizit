const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { requireSuperadmin } = require('../middleware/authMiddleware');
const { firmaSlugOlustur } = require('../utils/slug');
const { createLoginLimiter } = require('../middleware/rateLimiter');
const superadminGirisLimiter = createLoginLimiter('/superadmin/giris');

router.get('/giris', (req, res) => res.redirect('/'));

router.post('/giris', superadminGirisLimiter, (req, res) => {
  const { kullanici_adi, sifre } = req.body;
  const dogruKullaniciAdi = (process.env.SUPERADMIN_USERNAME || '').trim();
  const dogruSifre = (process.env.SUPERADMIN_PASSWORD || '').trim();
  if (
    kullanici_adi && sifre &&
    kullanici_adi.trim() === dogruKullaniciAdi &&
    sifre.trim() === dogruSifre
  ) {
    req.session.superadmin = true;
    res.redirect('/');
  } else {
    req.flash('error', 'Kullanıcı adı veya şifre hatalı.');
    res.redirect('/');
  }
});

router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.get('/', requireSuperadmin, (req, res) => res.redirect('/'));

router.post('/firma-sil/:id', requireSuperadmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [req.params.id]);
    req.flash('success', 'Firma silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/');
});

// Bayi ekleme
router.post('/bayi-ekle', requireSuperadmin, async (req, res) => {
  const { ad, email, kullanici_adi, sifre, marka_rengi, abonelik_bitis_tarihi } = req.body;
  if (!ad || !email || !kullanici_adi || !sifre) {
    req.flash('error', 'Ad, email, kullanıcı adı ve şifre zorunlu.');
    return res.redirect('/?tab=bayiler');
  }
  try {
    const hash = await bcrypt.hash(sifre, 12);
    let slug = firmaSlugOlustur(ad);
    const check = await pool.query('SELECT id FROM bayiler WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    await pool.query(
      `INSERT INTO bayiler (ad, slug, email, kullanici_adi, sifre_hash, marka_rengi, abonelik_bitis_tarihi)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ad, slug, email, kullanici_adi, hash, marka_rengi || '#1a73e8', abonelik_bitis_tarihi || null]
    );
    req.flash('success', `${ad} bayisi eklendi.`);
  } catch (err) {
    console.error(err);
    req.flash('error', err.code === '23505' ? (err.constraint && err.constraint.includes('kullanici_adi') ? 'Bu kullanıcı adı zaten alınmış.' : 'Bu email zaten kayıtlı.') : 'Bayi eklenemedi.');
  }
  res.redirect('/?tab=bayiler');
});

// Bayi abonelik bitiş tarihini güncelle
router.post('/bayi-abonelik/:id', requireSuperadmin, async (req, res) => {
  try {
    await pool.query('UPDATE bayiler SET abonelik_bitis_tarihi = $1 WHERE id = $2', [req.body.abonelik_bitis_tarihi || null, req.params.id]);
    req.flash('success', 'Abonelik tarihi güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=bayiler');
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
  res.redirect('/?tab=bayiler');
});

// Firma paketini güncelle
router.post('/firma-paket/:id', requireSuperadmin, async (req, res) => {
  const paketler = ['basic', 'premium', 'kurumsal'];
  if (!paketler.includes(req.body.paket)) {
    req.flash('error', 'Geçersiz paket.');
    return res.redirect('/');
  }
  try {
    await pool.query('UPDATE firmalar SET paket = $1 WHERE id = $2', [req.body.paket, req.params.id]);
    req.flash('success', 'Paket güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/');
});

module.exports = router;
