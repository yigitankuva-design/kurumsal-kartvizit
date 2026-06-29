const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { calisanSlugOlustur } = require('../utils/slug');
const XLSX = require('xlsx');
const multer = require('multer');
const { excelParse } = require('../utils/excel');
const { uploadMiddleware } = require('../middleware/upload');

const fotoUpload = uploadMiddleware('calisanlar');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Ana panel
router.get('/', async (req, res) => {
  try {
    const firmaResult = await pool.query('SELECT * FROM firmalar WHERE id = $1', [req.session.firmaId]);
    const calisanlarResult = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
      [req.session.firmaId]
    );

    const firma = firmaResult.rows[0];
    const calisanlar = calisanlarResult.rows;
    const aktifSayisi = calisanlar.filter(c => c.durum === 'aktif').length;
    const pasifSayisi = calisanlar.filter(c => c.durum === 'pasif').length;
    const toplamGoruntulenme = calisanlar.reduce((sum, c) => sum + (c.goruntuleme_sayisi || 0), 0);
    const tab = req.query.tab || 'calisanlar';

    let linkAnalytics = [];
    if (tab === 'analytics') {
      const ids = calisanlar.map(c => c.id);
      if (ids.length) {
        const aResult = await pool.query(
          `SELECT c.ad, c.soyad, lt.tip, COUNT(*) as sayi
           FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
           WHERE c.firma_id = $1
           GROUP BY c.ad, c.soyad, lt.tip
           ORDER BY sayi DESC`,
          [req.session.firmaId]
        );
        linkAnalytics = aResult.rows;
      }
    }

    res.render('panel/panel', { title: 'Panel', firma, calisanlar, aktifSayisi, pasifSayisi, toplamGoruntulenme, tab, linkAnalytics });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/firma/giris');
  }
});

// Çalışan ekleme formu
router.get('/ekle', (req, res) => {
  res.render('panel/ekle', { title: 'Yeni Çalışan' });
});

// Çalışan ekleme POST
router.post('/ekle', async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, biyografi, ilaclar } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect('/firma/panel/ekle');
  }
  try {
    let slug = calisanSlugOlustur();
    for (let i = 0; i < 5; i++) {
      const check = await pool.query('SELECT id FROM calisanlar WHERE firma_id = $1 AND slug = $2', [req.session.firmaId, slug]);
      if (!check.rows.length) break;
      slug = calisanSlugOlustur();
    }
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, biyografi, ilaclar, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [req.session.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null,
       instagram || null, twitter || null, youtube || null, website || null,
       biyografi || null, ilaclarArray, slug]
    );
    req.flash('success', `${ad} ${soyad} eklendi.`);
    res.redirect('/firma/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Çalışan eklenemedi.');
    res.redirect('/firma/panel/ekle');
  }
});

// Excel şablon indir
router.get('/excel-sablon', (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['ad', 'soyad', 'unvan', 'departman', 'telefon', 'email', 'linkedin', 'biyografi'],
    ['Örnek', 'Kişi', 'Satış Müdürü', 'Satış', '+905001112233', 'ornek@firma.com', '', '']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Çalışanlar');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="calisanlar-sablon.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// Excel toplu yükleme
router.post('/toplu-yukle', upload.single('excel'), async (req, res) => {
  if (!req.file) {
    req.flash('error', 'Dosya seçilmedi.');
    return res.redirect('/firma/panel?tab=excel');
  }
  const { calisanlar, hatalar } = excelParse(req.file.buffer);
  let eklenen = 0;
  for (const c of calisanlar) {
    try {
      const slug = calisanSlugOlustur();
      await pool.query(
        `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, slug)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.session.firmaId, c.ad, c.soyad, c.unvan, c.departman, c.telefon, c.email, c.linkedin, c.biyografi, slug]
      );
      eklenen++;
    } catch (err) {
      hatalar.push(`${c.ad} ${c.soyad}: eklenemedi`);
    }
  }
  const mesaj = `${eklenen} çalışan eklendi.${hatalar.length ? ' Hatalar: ' + hatalar.join('; ') : ''}`;
  req.flash(hatalar.length && eklenen === 0 ? 'error' : 'success', mesaj);
  res.redirect('/firma/panel?tab=excel');
});

// Çalışan düzenleme formu
router.get('/:id/duzenle', async (req, res) => {
  try {
    const calisanResult = await pool.query(
      'SELECT * FROM calisanlar WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.session.firmaId]
    );
    if (!calisanResult.rows.length) {
      req.flash('error', 'Çalışan bulunamadı.');
      return res.redirect('/firma/panel');
    }
    const firmaResult = await pool.query('SELECT slug FROM firmalar WHERE id = $1', [req.session.firmaId]);
    res.render('panel/duzenle', {
      title: 'Çalışan Düzenle',
      calisan: calisanResult.rows[0],
      firma_slug: firmaResult.rows[0].slug
    });
  } catch (err) {
    console.error(err);
    res.redirect('/firma/panel');
  }
});

// Çalışan düzenleme POST (foto upload destekli)
router.post('/:id/duzenle', fotoUpload.single('foto'), async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, biyografi, ilaclar } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(`/firma/panel/${req.params.id}/duzenle`);
  }
  try {
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    const fotoUrl = req.file ? (req.file.location || null) : undefined;

    const baseFields = [ad, soyad, unvan || null, departman || null, telefon || null,
      email || null, linkedin || null, instagram || null, twitter || null,
      youtube || null, website || null, biyografi || null, ilaclarArray];

    if (fotoUrl !== undefined) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
         email=$6, linkedin=$7, instagram=$8, twitter=$9, youtube=$10, website=$11,
         biyografi=$12, ilaclar=$13, foto_url=$14 WHERE id=$15 AND firma_id=$16`,
        [...baseFields, fotoUrl, req.params.id, req.session.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
         email=$6, linkedin=$7, instagram=$8, twitter=$9, youtube=$10, website=$11,
         biyografi=$12, ilaclar=$13 WHERE id=$14 AND firma_id=$15`,
        [...baseFields, req.params.id, req.session.firmaId]
      );
    }

    req.flash('success', 'Çalışan güncellendi.');
    res.redirect('/firma/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncelleme başarısız.');
    res.redirect(`/firma/panel/${req.params.id}/duzenle`);
  }
});

// Durum değiştirme
router.patch('/:id/durum', async (req, res) => {
  const { durum } = req.body;
  if (!['aktif', 'pasif'].includes(durum)) return res.redirect('/firma/panel');
  try {
    await pool.query('UPDATE calisanlar SET durum=$1 WHERE id=$2 AND firma_id=$3', [durum, req.params.id, req.session.firmaId]);
  } catch (err) {
    console.error(err);
  }
  res.redirect('/firma/panel');
});

module.exports = router;
