const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { bayiTokenUret, calisanTokenUret, firmaTokenUret, firmaTokenDogrula } = require('../utils/jwt');
const { createJsonLimiter } = require('../middleware/rateLimiter');
const { requireBayiToken, requireCalisanToken, requireFirmaToken } = require('../middleware/tokenAuth');
const { uploadMiddleware } = require('../middleware/upload');
const {
  profilOlustur,
  GecersizProfilHatasi,
  AbonelikSuresiDolmusHatasi,
} = require('../services/musteriService');

const fotoUpload = uploadMiddleware('calisanlar');
const mobilProfilLimiter = createJsonLimiter('Çok fazla işlem yaptınız. Lütfen biraz sonra tekrar deneyin.');
const kartYazildiLimiter = createJsonLimiter('Çok fazla işlem yaptınız. Lütfen biraz sonra tekrar deneyin.');

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
      'SELECT * FROM bayiler WHERE (LOWER(email) = LOWER($1) OR LOWER(kullanici_adi) = LOWER($1)) AND aktif = true',
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
    const result = await pool.query('SELECT * FROM calisanlar WHERE LOWER(giris_email) = LOWER($1)', [giris_email]);
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

const firmaGirisLimiter = createJsonLimiter('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');

router.post('/firma-giris', firmaGirisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    return res.status(400).json({ ok: false, error: 'E-posta/kullanıcı adı ve şifre zorunlu.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM firmalar WHERE LOWER(yetkili_email) = LOWER($1) OR LOWER(kullanici_adi) = LOWER($1)',
      [giris_bilgisi]
    );
    if (!result.rows.length || !result.rows[0].yetkili_sifre_hash) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const firma = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, firma.yetkili_sifre_hash);
    if (!eslesme) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const token = firmaTokenUret(firma.id);
    res.json({ ok: true, token, firma: { id: firma.id, ad: firma.ad } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/firma/calisanlarimiz', requireFirmaToken, async (req, res) => {
  try {
    const firmaResult = await pool.query('SELECT id, ad, slug FROM firmalar WHERE id = $1', [req.firmaId]);
    if (!firmaResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Firma bulunamadı.' });
    }
    const calisanlarResult = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 AND onayli = true ORDER BY created_at DESC',
      [req.firmaId]
    );
    res.json({ ok: true, firma: firmaResult.rows[0], calisanlar: calisanlarResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/firma/eczanelerimiz', requireFirmaToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, ad, adres, kod, eczaci_kod, musteri_karta_yazildi, musteri_kart_kilitli, eczaci_karta_yazildi, eczaci_kart_kilitli FROM eczaneler WHERE firma_id = $1 AND onayli = true AND durum = 'aktif' ORDER BY created_at DESC`,
      [req.firmaId]
    );
    res.json({ ok: true, eczaneler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/musteriler', requireBayiToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.ad, f.slug, COUNT(c.id) FILTER (WHERE c.onayli) as calisan_sayisi
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
      'SELECT * FROM calisanlar WHERE firma_id = $1 AND onayli = true ORDER BY created_at DESC',
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

router.post('/ziyaret-kaydet', requireCalisanToken, mobilProfilLimiter, async (req, res) => {
  const { eczane_kod, not } = req.body;
  if (!eczane_kod) {
    return res.status(400).json({ ok: false, error: 'Eczane kodu zorunlu.' });
  }
  try {
    const calisanResult = await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [req.calisanId]);
    if (!calisanResult.rows.length) {
      return res.status(401).json({ ok: false, error: 'Çalışan bulunamadı.' });
    }
    const eczaneResult = await pool.query('SELECT id, firma_id, ad FROM eczaneler WHERE kod = $1', [eczane_kod]);
    if (!eczaneResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Eczane bulunamadı.' });
    }
    const eczane = eczaneResult.rows[0];
    if (eczane.firma_id !== calisanResult.rows[0].firma_id) {
      return res.status(403).json({ ok: false, error: 'Bu eczaneye ziyaret kaydedemezsiniz.' });
    }
    await pool.query(
      'INSERT INTO ziyaretler (calisan_id, eczane_id, temsilci_notu) VALUES ($1, $2, $3)',
      [req.calisanId, eczane.id, not?.trim() || null]
    );
    res.status(201).json({ ok: true, eczaneAdi: eczane.ad });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/ziyaretlerim', requireCalisanToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.ad AS eczane_adi, z.created_at, z.temsilci_notu
       FROM ziyaretler z JOIN eczaneler e ON e.id = z.eczane_id
       WHERE z.calisan_id = $1
       ORDER BY z.created_at DESC`,
      [req.calisanId]
    );
    res.json({ ok: true, ziyaretler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/eczanelerim', requireCalisanToken, async (req, res) => {
  try {
    const calisanResult = await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [req.calisanId]);
    if (!calisanResult.rows.length) {
      return res.status(401).json({ ok: false, error: 'Çalışan bulunamadı.' });
    }
    const result = await pool.query(
      `SELECT id, ad, adres, kod, eczaci_kod, musteri_karta_yazildi, musteri_kart_kilitli, eczaci_karta_yazildi, eczaci_kart_kilitli FROM eczaneler WHERE firma_id = $1 AND onayli = true AND durum = 'aktif' ORDER BY created_at DESC`,
      [calisanResult.rows[0].firma_id]
    );
    res.json({ ok: true, eczaneler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

async function tokenSahibiCoz(token) {
  let payload;
  try {
    payload = firmaTokenDogrula(token);
  } catch {
    return null;
  }
  if (payload.firmaId != null) {
    return { tur: 'firma', firmaId: payload.firmaId };
  }
  if (payload.calisanId != null) {
    const c = await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [payload.calisanId]);
    return c.rows.length ? { tur: 'calisan', firmaId: c.rows[0].firma_id } : null;
  }
  if (payload.bayiId != null) {
    return { tur: 'bayi', bayiId: payload.bayiId };
  }
  return null;
}

router.post('/kart-yazildi', kartYazildiLimiter, async (req, res) => {
  const { tip, id } = req.body;
  const kilitli = req.body.kilitli === true || req.body.kilitli === 'true';
  if (!tip || !id || !['calisan', 'musteri', 'eczaci'].includes(tip)) {
    return res.status(400).json({ ok: false, error: 'tip ve id zorunlu.' });
  }
  const header = req.headers.authorization || '';
  const [bearerTip, token] = header.split(' ');
  if (bearerTip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  const sahip = await tokenSahibiCoz(token);
  if (!sahip) {
    return res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
  try {
    const hedefFirmaId = tip === 'calisan'
      ? (await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [id])).rows[0]?.firma_id
      : (await pool.query('SELECT firma_id FROM eczaneler WHERE id = $1', [id])).rows[0]?.firma_id;
    if (!hedefFirmaId) {
      return res.status(404).json({ ok: false, error: 'Kayıt bulunamadı.' });
    }
    if (sahip.tur === 'bayi') {
      const f = await pool.query('SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2', [hedefFirmaId, sahip.bayiId]);
      if (!f.rows.length) return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    } else if (hedefFirmaId !== sahip.firmaId) {
      return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    }

    if (tip === 'calisan') {
      await pool.query(
        'UPDATE calisanlar SET karta_yazildi = true, kart_kilitli = $1, kart_yazma_tarihi = NOW() WHERE id = $2',
        [kilitli, id]
      );
    } else {
      const kolonOn = tip === 'musteri' ? 'musteri' : 'eczaci';
      await pool.query(
        `UPDATE eczaneler SET ${kolonOn}_karta_yazildi = true, ${kolonOn}_kart_kilitli = $1, ${kolonOn}_kart_yazma_tarihi = NOW() WHERE id = $2`,
        [kilitli, id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.get('/katalog-durumu', requireCalisanToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.katalog_guncelleme_tarihi, c.son_gorulen_katalog_tarihi
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE c.id = $1`,
      [req.calisanId]
    );
    if (!result.rows.length) return res.status(401).json({ ok: false, error: 'Çalışan bulunamadı.' });
    const { katalog_guncelleme_tarihi, son_gorulen_katalog_tarihi } = result.rows[0];
    const yeniKatalogVar = katalog_guncelleme_tarihi !== null && (
      son_gorulen_katalog_tarihi === null ||
      new Date(katalog_guncelleme_tarihi) > new Date(son_gorulen_katalog_tarihi)
    );
    res.json({ ok: true, yeni_katalog_var: yeniKatalogVar, katalog_guncelleme_tarihi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.post('/katalog-gorundu', requireCalisanToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE calisanlar SET son_gorulen_katalog_tarihi = (SELECT katalog_guncelleme_tarihi FROM firmalar WHERE id = calisanlar.firma_id)
       WHERE id = $1`,
      [req.calisanId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

module.exports = router;
