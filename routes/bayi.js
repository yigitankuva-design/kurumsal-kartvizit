const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { requireBayi } = require('../middleware/authMiddleware');
const { firmaSlugOlustur, benzersizCalisanSlugOlustur } = require('../utils/slug');
const { uploadMiddleware } = require('../middleware/upload');
const { createLoginLimiter, firmaEkleLimiter } = require('../middleware/rateLimiter');
const { biyografiTemizle } = require('../utils/sanitize');

const fotoUpload = uploadMiddleware('calisanlar');
const bayiGirisLimiter = createLoginLimiter('/bayi/giris');

function adSoyadAyir(adSoyad) {
  const parcalar = adSoyad.trim().split(/\s+/);
  if (parcalar.length === 1) return { ad: parcalar[0], soyad: '' };
  return { ad: parcalar.slice(0, -1).join(' '), soyad: parcalar[parcalar.length - 1] };
}

// fotoUpload.single() bir dizi middleware döner (multer + sharp işleme) — hata
// olursa çökmek yerine flash mesajıyla forma geri döner.
function fotoUploadGuvenli(redirectYolu) {
  return (req, res, next) => {
    const [multerMw, isleMw] = fotoUpload.single('foto');
    const hataYakala = (err) => {
      console.error(err);
      req.flash('error', err.message || 'Fotoğraf yüklenemedi.');
      res.redirect(redirectYolu(req));
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

// ── AUTH ──────────────────────────────────────────────────────────────────────

router.get('/giris', (req, res) => {
  res.redirect('/');
});

router.post('/giris', bayiGirisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    req.flash('error', 'E-posta/kullanıcı adı ve şifre zorunlu.');
    return res.redirect('/');
  }
  try {
    const result = await pool.query(
      'SELECT * FROM bayiler WHERE (email = $1 OR kullanici_adi = $1) AND aktif = true',
      [giris_bilgisi]
    );
    if (!result.rows.length) {
      req.flash('error', 'E-posta/kullanıcı adı veya şifre hatalı.');
      return res.redirect('/');
    }
    const bayi = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, bayi.sifre_hash);
    if (!eslesme) {
      req.flash('error', 'E-posta/kullanıcı adı veya şifre hatalı.');
      return res.redirect('/');
    }
    req.session.bayiId = bayi.id;
    req.session.bayiAd = bayi.ad;
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

// ── PANEL — FİRMA LİSTESİ (artık '/' üzerinde) ───────────────────────────────

router.get('/panel', requireBayi, (req, res) => res.redirect('/'));

// ── FİRMA EKLE / SİL ─────────────────────────────────────────────────────────

router.post('/panel/firma-ekle', requireBayi, firmaEkleLimiter,
  fotoUploadGuvenli(() => '/'),
  async (req, res) => {
  const {
    isletme_adi, sektor, marka_rengi,
    ad_soyad, unvan, departman, telefon, email, adres, biyografi,
    linkedin, instagram, twitter, youtube, website, whatsapp, tiktok,
    sahibinden, hurriyet_emlak, google_yorum_link, kvkk,
  } = req.body;

  if (!ad_soyad || !ad_soyad.trim()) {
    req.flash('error', 'Ad soyad zorunlu.');
    return res.redirect('/');
  }
  if (!kvkk) {
    req.flash('error', 'Devam etmek için KVKK onayı gerekiyor.');
    return res.redirect('/');
  }
  const { ad, soyad } = adSoyadAyir(ad_soyad);
  if (!soyad) {
    req.flash('error', 'Lütfen ad ve soyadı birlikte yazın.');
    return res.redirect('/');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bayiSonuc = await client.query(
      'SELECT kredi_bakiyesi, abonelik_bitis_tarihi FROM bayiler WHERE id = $1 FOR UPDATE',
      [req.session.bayiId]
    );
    if (!bayiSonuc.rows.length) {
      await client.query('ROLLBACK');
      return res.redirect('/');
    }
    const bitisTarihi = bayiSonuc.rows[0].abonelik_bitis_tarihi;
    if (bitisTarihi && new Date(bitisTarihi) < new Date()) {
      await client.query('ROLLBACK');
      req.flash('error', 'Aboneliğinizin süresi dolmuş. Lütfen bizimle iletişime geçin.');
      return res.redirect('/');
    }
    if (bayiSonuc.rows[0].kredi_bakiyesi < 1) {
      await client.query('ROLLBACK');
      req.flash('error', 'Krediniz kalmadı, lütfen kredi yükleyin.');
      return res.redirect('/bayi/panel/kredi-yukle');
    }

    const firmaAd = (isletme_adi && isletme_adi.trim()) || `${ad} ${soyad}`;
    let slug = firmaSlugOlustur(firmaAd);
    const check = await client.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    // Firma girişi olmayacak — dummy email/sifre
    const dummyEmail = `${slug}-${Date.now()}@bayi.local`;
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 8);

    const firmaSonuc = await client.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor, marka_rengi, bayi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [firmaAd, slug, dummyEmail, dummyHash, sektor || 'diger', marka_rengi || '#1a73e8', req.session.bayiId]
    );
    const firmaId = firmaSonuc.rows[0].id;

    const calisanSlug = await benzersizCalisanSlugOlustur(firmaId, ad, soyad);
    const fotoUrl = req.file?.location || null;
    const biyografiTemiz = biyografiTemizle(biyografi);

    await client.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, adres,
        linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden,
        hurriyet_emlak, google_yorum_link, biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [firmaId, ad, soyad, unvan || null, departman || null, telefon || null, email || null, adres || null,
       linkedin || null, instagram || null, twitter || null, youtube || null, website || null,
       whatsapp || null, tiktok || null, sahibinden || null, hurriyet_emlak || null, google_yorum_link || null,
       biyografiTemiz, fotoUrl, calisanSlug]
    );

    await client.query('UPDATE bayiler SET kredi_bakiyesi = kredi_bakiyesi - 1 WHERE id = $1', [req.session.bayiId]);

    await client.query(
      `INSERT INTO kredi_hareketleri (bayi_id, tip, miktar, aciklama, firma_id)
       VALUES ($1, 'harcama', -1, $2, $3)`,
      [req.session.bayiId, `Müşteri eklendi: ${firmaAd}`, firmaId]
    );

    await client.query('COMMIT');
    req.flash('success', `${ad} ${soyad} eklendi.`);
    res.redirect(`/?firma=${firmaId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    req.flash('error', 'Eklenemedi.');
    res.redirect('/');
  } finally {
    client.release();
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
  res.redirect('/');
});

// ── ÇALIŞAN EKLE (artık '/' üzerindeki kayan panelden) ───────────────────────

router.post('/panel/:firmaId/calisan-ekle', requireBayi,
  fotoUploadGuvenli((req) => `/?firma=${req.params.firmaId}`),
  async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, kvkk } = req.body;
  const geriDon = `/?firma=${req.params.firmaId}`;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(geriDon);
  }
  if (!kvkk) {
    req.flash('error', 'Devam etmek için KVKK onayı gerekiyor.');
    return res.redirect(geriDon);
  }
  try {
    // Firma bayiye ait mi kontrol et
    const firmaResult = await pool.query(
      'SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/');

    const slug = await benzersizCalisanSlugOlustur(req.params.firmaId, ad, soyad);

    const fotoUrl = req.file?.location || null;
    const biyografiTemiz = biyografiTemizle(biyografi);

    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [req.params.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null, instagram || null, twitter || null,
       youtube || null, website || null, whatsapp || null, tiktok || null, sahibinden || null,
       hurriyet_emlak || null, adres || null, google_yorum_link || null,
       biyografiTemiz, fotoUrl, slug]
    );
    req.flash('success', `${ad} ${soyad} eklendi.`);
    res.redirect(geriDon);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Çalışan eklenemedi.');
    res.redirect(geriDon);
  }
});

// ── ÇALIŞAN DÜZENLE (artık '/' üzerindeki kayan panelden) ────────────────────

router.post('/panel/:firmaId/calisan/:id/duzenle', requireBayi,
  fotoUploadGuvenli((req) => `/?firma=${req.params.firmaId}`),
  async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi } = req.body;
  const geriDon = `/?firma=${req.params.firmaId}`;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(geriDon);
  }
  try {
    const firmaResult = await pool.query(
      'SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/');

    const fotoUrl = req.file?.location || null;
    const biyografiTemiz = biyografiTemizle(biyografi);

    if (fotoUrl) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,instagram=$8,twitter=$9,youtube=$10,website=$11,
         whatsapp=$12,tiktok=$13,sahibinden=$14,hurriyet_emlak=$15,adres=$16,google_yorum_link=$17,
         biyografi=$18,foto_url=$19
         WHERE id=$20 AND firma_id=$21`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, instagram||null, twitter||null, youtube||null, website||null,
         whatsapp||null, tiktok||null, sahibinden||null, hurriyet_emlak||null, adres||null, google_yorum_link||null,
         biyografiTemiz, fotoUrl,
         req.params.id, req.params.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,instagram=$8,twitter=$9,youtube=$10,website=$11,
         whatsapp=$12,tiktok=$13,sahibinden=$14,hurriyet_emlak=$15,adres=$16,google_yorum_link=$17,
         biyografi=$18
         WHERE id=$19 AND firma_id=$20`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, instagram||null, twitter||null, youtube||null, website||null,
         whatsapp||null, tiktok||null, sahibinden||null, hurriyet_emlak||null, adres||null, google_yorum_link||null,
         biyografiTemiz,
         req.params.id, req.params.firmaId]
      );
    }
    req.flash('success', 'Çalışan güncellendi.');
    res.redirect(geriDon);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
    res.redirect(geriDon);
  }
});

// ── ÇALIŞAN SİL / DURUM ──────────────────────────────────────────────────────

router.post('/panel/:firmaId/calisan/:id/sil', requireBayi, async (req, res) => {
  try {
    const firmaResult = await pool.query(
      'SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.session.bayiId]
    );
    if (!firmaResult.rows.length) return res.redirect('/');

    await pool.query('DELETE FROM calisanlar WHERE id = $1 AND firma_id = $2', [req.params.id, req.params.firmaId]);
    req.flash('success', 'Çalışan silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect(`/?firma=${req.params.firmaId}`);
});

router.patch('/panel/:firmaId/calisan/:id/durum', requireBayi, async (req, res) => {
  const { durum } = req.body;
  if (!['aktif', 'pasif'].includes(durum)) return res.redirect('/');
  try {
    await pool.query(
      'UPDATE calisanlar SET durum=$1 WHERE id=$2 AND firma_id=$3',
      [durum, req.params.id, req.params.firmaId]
    );
  } catch (err) {
    console.error(err);
  }
  res.redirect(`/?firma=${req.params.firmaId}`);
});

module.exports = router;
