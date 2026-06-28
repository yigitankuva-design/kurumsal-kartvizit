const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { vcfOlustur } = require('../utils/vcf');

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

router.get('/:firmaSlug/:calisanSlug', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, f.ad as firma_ad, f.slug as firma_slug,
              f.logo_url, f.marka_rengi, f.sektor
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );
    if (!result.rows.length) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Sayfa bulunamadı.', layout: false });
    }
    const calisan = result.rows[0];
    if (calisan.durum === 'pasif') {
      return res.status(404).render('public/404', { title: 'Profil Aktif Değil', mesaj: 'Bu profil artık aktif değil.', layout: false });
    }
    await pool.query('UPDATE calisanlar SET goruntuleme_sayisi = goruntuleme_sayisi + 1 WHERE id = $1', [calisan.id]);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

module.exports = router;
