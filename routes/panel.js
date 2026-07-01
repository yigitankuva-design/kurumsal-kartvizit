const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { benzersizCalisanSlugOlustur } = require('../utils/slug');
const XLSX = require('xlsx');
const multer = require('multer');
const { excelParse } = require('../utils/excel');
const { uploadMiddleware } = require('../middleware/upload');

const fotoUpload = uploadMiddleware('calisanlar');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// fotoUpload.single() bir dizi middleware döner (multer + sharp işleme) — hata
// olursa çökmek yerine flash mesajıyla forma geri döner.
function fotoUploadGuvenli(req, res, next) {
  const [multerMw, isleMw] = fotoUpload.single('foto');
  const hataYakala = (err) => {
    console.error(err);
    req.flash('error', err.message || 'Fotoğraf yüklenemedi.');
    res.redirect(`/firma/panel/${req.params.id}/duzenle`);
  };
  multerMw(req, res, (err) => {
    if (err) return hataYakala(err);
    isleMw(req, res, (err2) => {
      if (err2) return hataYakala(err2);
      next();
    });
  });
}

// Ana panel → dashboard'a yönlendir
router.get('/', (req, res) => res.redirect('/'));

// Çalışan ekleme formu
router.get('/ekle', (req, res) => {
  res.render('panel/ekle', { title: 'Yeni Çalışan' });
});

// Çalışan ekleme POST
router.post('/ekle', async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, biyografi, ilaclar } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect('/');
  }
  try {
    const slug = await benzersizCalisanSlugOlustur(req.session.firmaId, ad, soyad);
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
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Çalışan eklenemedi.');
    res.redirect('/');
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
    return res.redirect('/?tab=excel');
  }
  const { calisanlar, hatalar } = excelParse(req.file.buffer);
  let eklenen = 0;
  for (const c of calisanlar) {
    try {
      const slug = await benzersizCalisanSlugOlustur(req.session.firmaId, c.ad, c.soyad);
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
  res.redirect('/?tab=excel');
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
      return res.redirect('/');
    }
    const firmaResult = await pool.query('SELECT slug FROM firmalar WHERE id = $1', [req.session.firmaId]);
    res.render('panel/duzenle', {
      title: 'Çalışan Düzenle',
      calisan: calisanResult.rows[0],
      firma_slug: firmaResult.rows[0].slug
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// Çalışan düzenleme — hem POST hem PUT (slide-in panel PUT kullanır)
async function duzenleHandler(req, res) {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, biyografi, ilaclar } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect('/');
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
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncelleme başarısız.');
    res.redirect('/');
  }
}
router.post('/:id/duzenle', fotoUploadGuvenli, duzenleHandler);
router.put('/:id/duzenle', fotoUploadGuvenli, duzenleHandler);

// Durum değiştirme
router.patch('/:id/durum', async (req, res) => {
  const { durum } = req.body;
  if (!['aktif', 'pasif'].includes(durum)) return res.redirect('/');
  try {
    await pool.query('UPDATE calisanlar SET durum=$1 WHERE id=$2 AND firma_id=$3', [durum, req.params.id, req.session.firmaId]);
  } catch (err) {
    console.error(err);
  }
  res.redirect('/');
});

module.exports = router;
