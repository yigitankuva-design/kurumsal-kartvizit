const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { requireBayi } = require('../middleware/authMiddleware');
const { firmaSlugOlustur, calisanSlugOlustur } = require('../utils/slug');
const { uploadMiddleware } = require('../middleware/upload');

const fotoUpload = uploadMiddleware('calisanlar');

// ── AUTH ──────────────────────────────────────────────────────────────────────

router.get('/giris', (req, res) => {
  res.render('bayi/giris', { title: 'Bayi Girişi', layout: 'layout' });
});

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

router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/bayi/giris'));
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
    res.redirect('/bayi/giris');
  }
});

// ── FİRMA EKLE / SİL ─────────────────────────────────────────────────────────

router.get('/panel/firma-ekle', requireBayi, (req, res) => {
  res.render('bayi/firma-ekle', { title: 'Yeni Müşteri Ekle' });
});

router.post('/panel/firma-ekle', requireBayi, async (req, res) => {
  const { ad, sektor, marka_rengi } = req.body;
  if (!ad) {
    req.flash('error', 'Müşteri adı zorunlu.');
    return res.redirect('/bayi/panel/firma-ekle');
  }
  try {
    let slug = firmaSlugOlustur(ad);
    const check = await pool.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    // Firma girişi olmayacak — dummy email/sifre
    const dummyEmail = `${slug}-${Date.now()}@bayi.local`;
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 8);

    await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor, marka_rengi, bayi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ad, slug, dummyEmail, dummyHash, sektor || 'diger', marka_rengi || '#1a73e8', req.session.bayiId]
    );
    req.flash('success', `${ad} eklendi.`);
    res.redirect('/bayi/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Eklenemedi.');
    res.redirect('/bayi/panel/firma-ekle');
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

router.post('/panel/:firmaId/calisan-ekle', requireBayi, fotoUpload.single('foto'), async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, biyografi } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(`/bayi/panel/${req.params.firmaId}/calisan-ekle`);
  }
  try {
    // Firma bayiye ait mi kontrol et
    const firmaResult = await pool.query(
      'SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/bayi/panel');

    let slug = calisanSlugOlustur();
    for (let i = 0; i < 5; i++) {
      const check = await pool.query(
        'SELECT id FROM calisanlar WHERE firma_id = $1 AND slug = $2',
        [req.params.firmaId, slug]
      );
      if (!check.rows.length) break;
      slug = calisanSlugOlustur();
    }

    const fotoUrl = req.file?.location || null;

    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [req.params.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null, biyografi || null, fotoUrl, slug]
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

router.post('/panel/:firmaId/calisan/:id/duzenle', requireBayi, fotoUpload.single('foto'), async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, biyografi } = req.body;
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

    if (fotoUrl) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,biyografi=$8,foto_url=$9
         WHERE id=$10 AND firma_id=$11`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, biyografi||null, fotoUrl,
         req.params.id, req.params.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,biyografi=$8
         WHERE id=$9 AND firma_id=$10`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, biyografi||null,
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
