const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { vcfOlustur } = require('../utils/vcf');
const { cevirmenOlustur } = require('../utils/i18n');

const RAF_TIKLAMA_TIPLERI = ['katalog', 'website', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok', 'whatsapp'];

async function eczaneGetir(kod) {
  const result = await pool.query(
    `SELECT e.id as eczane_id, e.ad as eczane_ad, e.kod,
            f.ad as firma_ad, f.logo_url, f.marka_rengi, f.katalog_url,
            f.website, f.instagram, f.linkedin, f.twitter, f.youtube, f.tiktok, f.whatsapp
     FROM eczaneler e JOIN firmalar f ON f.id = e.firma_id
     WHERE e.kod = $1`,
    [kod]
  );
  return result.rows[0] || null;
}

// Raf kartı sayfası — müşteri okutması
router.get('/raf/:kod', async (req, res) => {
  try {
    const veri = await eczaneGetir(req.params.kod);
    if (!veri) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Sayfa bulunamadı.', layout: false });
    }
    try {
      await pool.query('INSERT INTO raf_okutmalar (eczane_id) VALUES ($1)', [veri.eczane_id]);
    } catch (kayitHatasi) {
      console.error('raf okutma kaydı başarısız:', kayitHatasi);
    }
    res.render('public/raf', { title: veri.firma_ad, veri, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

// Raf kartı tıklama takibi
router.get('/raf/:kod/tikla/:tip', async (req, res) => {
  const { kod, tip } = req.params;
  try {
    const veri = await eczaneGetir(kod);
    if (!veri) return res.status(404).send('Bulunamadı.');

    if (!RAF_TIKLAMA_TIPLERI.includes(tip)) return res.redirect(`/raf/${kod}`);

    await pool.query('INSERT INTO raf_tiklamalar (eczane_id, tip) VALUES ($1, $2)', [veri.eczane_id, tip]);

    const hedefler = {
      katalog: veri.katalog_url,
      website: veri.website,
      instagram: veri.instagram,
      linkedin: veri.linkedin,
      twitter: veri.twitter,
      youtube: veri.youtube,
      tiktok: veri.tiktok,
      whatsapp: veri.whatsapp ? `https://wa.me/${veri.whatsapp.replace(/\D/g, '')}` : null,
    };
    const hedef = hedefler[tip];
    if (hedef) return res.redirect(hedef);
    res.redirect(`/raf/${kod}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/raf/${kod}`);
  }
});

async function profilGetir(firmaSlug, calisanSlug, bayiSlug = null) {
  let query, params;

  if (bayiSlug) {
    query = `
      SELECT c.*, f.ad as firma_ad, f.slug as firma_slug, f.sektor,
             f.logo_url as firma_logo, f.marka_rengi as firma_rengi,
             b.ad as bayi_ad, b.slug as bayi_slug,
             b.logo_url as bayi_logo, b.marka_rengi as bayi_rengi
      FROM calisanlar c
      JOIN firmalar f ON f.id = c.firma_id
      JOIN bayiler b ON b.id = f.bayi_id
      WHERE b.slug = $1 AND f.slug = $2 AND c.slug = $3`;
    params = [bayiSlug, firmaSlug, calisanSlug];
  } else {
    query = `
      SELECT c.*, f.ad as firma_ad, f.slug as firma_slug, f.sektor,
             f.logo_url as firma_logo, f.marka_rengi as firma_rengi,
             NULL as bayi_ad, NULL as bayi_slug,
             NULL as bayi_logo, NULL as bayi_rengi
      FROM calisanlar c
      JOIN firmalar f ON f.id = c.firma_id
      WHERE f.slug = $1 AND c.slug = $2`;
    params = [firmaSlug, calisanSlug];
  }

  const result = await pool.query(query, params);
  if (!result.rows.length) return null;

  const row = result.rows[0];
  const branding = {
    logo_url: row.bayi_logo || row.firma_logo,
    marka_rengi: row.bayi_rengi || row.firma_rengi || '#1a73e8',
    ad: row.bayi_ad || row.firma_ad
  };

  return { calisan: row, branding };
}

// VCF — bayi URL
router.get('/bayi/:bayiSlug/:firmaSlug/:calisanSlug/vcf', async (req, res) => {
  try {
    const veri = await profilGetir(req.params.firmaSlug, req.params.calisanSlug, req.params.bayiSlug);
    if (!veri || veri.calisan.durum !== 'aktif') return res.status(404).send('Profil bulunamadı.');
    const c = veri.calisan;
    const vcfContent = vcfOlustur({ ...c, firma_ad: c.firma_ad });
    const dosyaAdi = `${c.ad}-${c.soyad}.vcf`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
    res.send(vcfContent);
  } catch (err) {
    console.error(err);
    res.status(500).send('Hata.');
  }
});

// Profil sayfası — bayi URL
router.get('/bayi/:bayiSlug/:firmaSlug/:calisanSlug', async (req, res) => {
  try {
    const veri = await profilGetir(req.params.firmaSlug, req.params.calisanSlug, req.params.bayiSlug);
    if (!veri) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Sayfa bulunamadı.', layout: false });
    }
    const { calisan, branding } = veri;
    if (calisan.durum === 'pasif') {
      return res.status(404).render('public/404', { title: 'Profil Aktif Değil', mesaj: 'Bu profil artık aktif değil.', layout: false });
    }
    await pool.query('UPDATE calisanlar SET goruntuleme_sayisi = goruntuleme_sayisi + 1 WHERE id = $1', [calisan.id]);
    const vcfUrl = `/bayi/${req.params.bayiSlug}/${req.params.firmaSlug}/${calisan.slug}/vcf`;
    const profilUrl = `/bayi/${req.params.bayiSlug}/${req.params.firmaSlug}/${calisan.slug}`;
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const t = cevirmenOlustur(lang);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, profilUrl, lang, t, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

// VCF — standart URL
router.get('/:firmaSlug/:calisanSlug/vcf', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.ad, c.soyad, c.telefon, c.email, c.unvan, f.ad as firma_ad
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2 AND c.durum = 'aktif'`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );
    if (!result.rows.length) return res.status(404).send('Profil bulunamadı.');
    const vcfContent = vcfOlustur(result.rows[0]);
    const dosyaAdi = `${result.rows[0].ad}-${result.rows[0].soyad}.vcf`
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
    res.send(vcfContent);
  } catch (err) {
    console.error(err);
    res.status(500).send('Hata.');
  }
});

// Link tıklama takibi
router.get('/:firmaSlug/:calisanSlug/t/:tip', async (req, res) => {
  const { tip } = req.params;
  const izinliTipler = ['telefon', 'email', 'linkedin', 'instagram', 'twitter', 'youtube', 'website', 'whatsapp', 'tiktok', 'sahibinden', 'hurriyet_emlak', 'google_yorum', 'vcf', 'qr'];
  try {
    const result = await pool.query(
      `SELECT c.id, c.telefon, c.email, c.linkedin, c.instagram, c.twitter, c.youtube, c.website,
              c.whatsapp, c.tiktok, c.sahibinden, c.hurriyet_emlak, c.google_yorum_link
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2 AND c.durum = 'aktif'`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );
    if (!result.rows.length) return res.status(404).send('Bulunamadı.');
    const calisan = result.rows[0];

    if (izinliTipler.includes(tip)) {
      await pool.query('INSERT INTO link_tiklama (calisan_id, tip) VALUES ($1, $2)', [calisan.id, tip]);
    }

    const hedefler = {
      telefon: calisan.telefon ? `tel:${calisan.telefon}` : null,
      email: calisan.email ? `mailto:${calisan.email}` : null,
      linkedin: calisan.linkedin,
      instagram: calisan.instagram,
      twitter: calisan.twitter,
      youtube: calisan.youtube,
      website: calisan.website,
      whatsapp: calisan.whatsapp ? `https://wa.me/${calisan.whatsapp.replace(/\D/g, '')}` : null,
      tiktok: calisan.tiktok,
      sahibinden: calisan.sahibinden,
      hurriyet_emlak: calisan.hurriyet_emlak,
      google_yorum: calisan.google_yorum_link,
      vcf: `/${req.params.firmaSlug}/${req.params.calisanSlug}/vcf`,
    };

    const hedef = hedefler[tip];
    if (hedef) return res.redirect(hedef);
    res.redirect(`/${req.params.firmaSlug}/${req.params.calisanSlug}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/${req.params.firmaSlug}/${req.params.calisanSlug}`);
  }
});

// Google Yorum yönlendirme
router.get('/:firmaSlug/:calisanSlug/degerlendir', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.google_yorum_link
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2 AND c.durum = 'aktif'`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );
    if (!result.rows.length || !result.rows[0].google_yorum_link) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Değerlendirme linki bulunamadı.', layout: false });
    }
    res.redirect(result.rows[0].google_yorum_link);
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

// Profil sayfası — standart URL
router.get('/:firmaSlug/:calisanSlug', async (req, res) => {
  try {
    const veri = await profilGetir(req.params.firmaSlug, req.params.calisanSlug);
    if (!veri) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Sayfa bulunamadı.', layout: false });
    }
    const { calisan, branding } = veri;
    if (calisan.durum === 'pasif') {
      return res.status(404).render('public/404', { title: 'Profil Aktif Değil', mesaj: 'Bu profil artık aktif değil.', layout: false });
    }
    await pool.query('UPDATE calisanlar SET goruntuleme_sayisi = goruntuleme_sayisi + 1 WHERE id = $1', [calisan.id]);
    const vcfUrl = `/${req.params.firmaSlug}/${calisan.slug}/vcf`;
    const profilUrl = `/${req.params.firmaSlug}/${calisan.slug}`;
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const t = cevirmenOlustur(lang);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, profilUrl, lang, t, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

module.exports = router;
