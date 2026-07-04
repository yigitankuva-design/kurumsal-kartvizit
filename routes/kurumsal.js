const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { pool } = require('../db');
const { benzersizEczaneKoduUret, benzersizEczaciKoduUret } = require('../utils/eczaneKod');
const { uploadMiddleware, pdfUploadMiddleware } = require('../middleware/upload');

const logoUpload = uploadMiddleware('firma-logolar');
const katalogUpload = pdfUploadMiddleware('kataloglar');

// upload middleware dizisini hata yakalayarak çalıştırır (bayi.js'teki desenle aynı)
function guvenliUpload(uploadCifti, alanAdi, geriDon) {
  return (req, res, next) => {
    const [ilkMw, ikinciMw] = uploadCifti.single(alanAdi);
    const hataYakala = (err) => {
      console.error(err);
      req.flash('error', err.message || 'Dosya yüklenemedi.');
      res.redirect(geriDon);
    };
    ilkMw(req, res, (err) => {
      if (err) return hataYakala(err);
      ikinciMw(req, res, (err2) => {
        if (err2) return hataYakala(err2);
        next();
      });
    });
  };
}

// İçerik linklerini güncelle
router.post('/icerik', async (req, res) => {
  const { website, instagram, linkedin, twitter, youtube, tiktok, whatsapp } = req.body;
  try {
    await pool.query(
      `UPDATE firmalar SET website=$1, instagram=$2, linkedin=$3, twitter=$4,
        youtube=$5, tiktok=$6, whatsapp=$7 WHERE id=$8`,
      [website || null, instagram || null, linkedin || null, twitter || null,
       youtube || null, tiktok || null, whatsapp || null, req.session.firmaId]
    );
    req.flash('success', 'İçerik güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=icerik');
});

// Eczane ekle
router.post('/eczane-ekle', async (req, res) => {
  const { ad, adres } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Eczane adı zorunlu.');
    return res.redirect('/?tab=raf');
  }
  try {
    const kod = await benzersizEczaneKoduUret();
    const eczaciKod = await benzersizEczaciKoduUret();
    await pool.query(
      'INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod) VALUES ($1, $2, $3, $4, $5)',
      [req.session.firmaId, ad.trim(), adres || null, kod, eczaciKod]
    );
    req.flash('success', `${ad} eklendi.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Eklenemedi.');
  }
  res.redirect('/?tab=raf');
});

// Eczane düzenle (kod değişmez — fiziksel karta yazılmış olabilir)
router.post('/eczane/:id/duzenle', async (req, res) => {
  const { ad, adres } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Eczane adı zorunlu.');
    return res.redirect('/?tab=raf');
  }
  try {
    await pool.query(
      'UPDATE eczaneler SET ad=$1, adres=$2 WHERE id=$3 AND firma_id=$4',
      [ad.trim(), adres || null, req.params.id, req.session.firmaId]
    );
    req.flash('success', 'Eczane güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=raf');
});

// Eczane sil
router.post('/eczane/:id/sil', async (req, res) => {
  try {
    await pool.query('DELETE FROM eczaneler WHERE id=$1 AND firma_id=$2', [req.params.id, req.session.firmaId]);
    req.flash('success', 'Eczane silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/?tab=raf');
});

// Logo yükle
router.post('/logo', guvenliUpload(logoUpload, 'logo', '/?tab=icerik'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE firmalar SET logo_url=$1 WHERE id=$2', [req.file.location, req.session.firmaId]);
      req.flash('success', 'Logo güncellendi.');
    } else {
      req.flash('error', 'Dosya alınamadı.');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Logo yüklenemedi.');
  }
  res.redirect('/?tab=icerik');
});

// Katalog PDF yükle
router.post('/katalog', guvenliUpload(katalogUpload, 'katalog', '/?tab=icerik'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE firmalar SET katalog_url=$1 WHERE id=$2', [req.file.location, req.session.firmaId]);
      req.flash('success', 'Katalog güncellendi.');
    } else {
      // dev ortamında storage yok — location null; kullanıcıya yine bilgi ver
      req.flash('error', 'Dosya kaydedilemedi (depolama yapılandırılmamış).');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Katalog yüklenemedi.');
  }
  res.redirect('/?tab=icerik');
});

// Ziyaret kayıtlarını Excel'e aktar
router.get('/ziyaretler-excel', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.ad AS temsilci_ad, c.soyad AS temsilci_soyad, e.ad AS eczane_ad, z.created_at
       FROM ziyaretler z
       JOIN calisanlar c ON c.id = z.calisan_id
       JOIN eczaneler e ON e.id = z.eczane_id
       WHERE c.firma_id = $1
       ORDER BY z.created_at DESC`,
      [req.session.firmaId]
    );
    const ws = XLSX.utils.aoa_to_sheet([
      ['Temsilci', 'Eczane', 'Tarih'],
      ...result.rows.map(r => [`${r.temsilci_ad} ${r.temsilci_soyad}`, r.eczane_ad, r.created_at.toISOString()]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ziyaretler');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="ziyaretler.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Excel oluşturulamadı.');
    res.redirect('/?tab=saha');
  }
});

module.exports = router;
