const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { bayiTokenUret, calisanTokenUret } = require('../utils/jwt');
const { createJsonLimiter } = require('../middleware/rateLimiter');
const { requireBayiToken, requireCalisanToken } = require('../middleware/tokenAuth');
const { uploadMiddleware } = require('../middleware/upload');
const {
  profilOlustur,
  GecersizProfilHatasi,
  AbonelikSuresiDolmusHatasi,
} = require('../services/musteriService');

const fotoUpload = uploadMiddleware('calisanlar');
const mobilProfilLimiter = createJsonLimiter('Çok fazla işlem yaptınız. Lütfen biraz sonra tekrar deneyin.');

function fotoUploadGuvenliJson() {
  return (req, res, next) => {
    const [multerMw, isleMw] = fotoUpload.single('foto');
    const hataYakala = (err) => {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message || 'Fotoğraf yüklenemedi.' });
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

const mobilGirisLimiter = createJsonLimiter('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');

router.post('/giris', mobilGirisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    return res.status(400).json({ ok: false, error: 'E-posta/kullanıcı adı ve şifre zorunlu.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM bayiler WHERE (email = $1 OR kullanici_adi = $1) AND aktif = true',
      [giris_bilgisi]
    );
    if (!result.rows.length) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const bayi = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, bayi.sifre_hash);
    if (!eslesme) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const token = bayiTokenUret(bayi.id);
    res.json({ ok: true, token, bayi: { id: bayi.id, ad: bayi.ad } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

const temsilciGirisLimiter = createJsonLimiter('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');

router.post('/temsilci-giris', temsilciGirisLimiter, async (req, res) => {
  const { giris_email, sifre } = req.body;
  if (!giris_email || !sifre) {
    return res.status(400).json({ ok: false, error: 'Giriş e-postası ve şifre zorunlu.' });
  }
  try {
    const result = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', [giris_email]);
    if (!result.rows.length || !result.rows[0].giris_sifre_hash) {
      return res.status(401).json({ ok: false, error: 'Giriş e-postası veya şifre hatalı.' });
    }
    const calisan = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, calisan.giris_sifre_hash);
    if (!eslesme) {
      return res.status(401).json({ ok: false, error: 'Giriş e-postası veya şifre hatalı.' });
    }
    const token = calisanTokenUret(calisan.id);
    res.json({ ok: true, token, calisan: { id: calisan.id, ad: calisan.ad, soyad: calisan.soyad, firmaId: calisan.firma_id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/musteriler', requireBayiToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.ad, f.slug, COUNT(c.id) as calisan_sayisi
       FROM firmalar f LEFT JOIN calisanlar c ON c.firma_id = f.id
       WHERE f.bayi_id = $1 GROUP BY f.id ORDER BY f.created_at DESC`,
      [req.bayiId]
    );
    res.json({ ok: true, musteriler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/musteriler/:firmaId/calisanlar', requireBayiToken, async (req, res) => {
  try {
    const firmaResult = await pool.query(
      'SELECT id, ad, slug FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.bayiId]
    );
    if (!firmaResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı.' });
    }
    const calisanlarResult = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
      [req.params.firmaId]
    );
    res.json({ ok: true, firma: firmaResult.rows[0], calisanlar: calisanlarResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/abonelik', requireBayiToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT abonelik_bitis_tarihi FROM bayiler WHERE id = $1', [req.bayiId]);
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Bayi bulunamadı.' });
    }
    const bitis = result.rows[0].abonelik_bitis_tarihi;
    const aktif = !bitis || new Date(bitis) >= new Date();
    res.json({ ok: true, abonelikBitisTarihi: bitis, aktif });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.post('/profil-olustur', requireBayiToken, mobilProfilLimiter, fotoUploadGuvenliJson(), async (req, res) => {
  try {
    const sonuc = await profilOlustur(req.bayiId, req.body, req.file?.location || null);
    const siteUrl = process.env.SITE_URL || 'https://www.nfckartify.com.tr';
    res.status(201).json({
      ok: true,
      firmaId: sonuc.firmaId,
      url: `${siteUrl}/${sonuc.firmaSlug}/${sonuc.calisanSlug}`,
    });
  } catch (err) {
    if (err instanceof GecersizProfilHatasi) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err instanceof AbonelikSuresiDolmusHatasi) {
      return res.status(403).json({ ok: false, error: err.message });
    }
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

module.exports = router;
