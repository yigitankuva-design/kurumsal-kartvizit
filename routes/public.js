const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { vcfOlustur } = require('../utils/vcf');

// Yardımcı: profil sorgusunu çalıştır ve branding objesi hazırla
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
  // Bayi varsa bayi markası, yoksa firma markası
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
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

// VCF — eski URL (geriye dönük)
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

// Profil sayfası — eski URL (geriye dönük)
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
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

module.exports = router;
