const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const multer = require('multer');
const { pool } = require('../db');
const { benzersizEczaneKoduUret, benzersizEczaciKoduUret } = require('../utils/eczaneKod');
const { eczaneExcelParse } = require('../utils/excel');
const { uploadMiddleware, pdfUploadMiddleware } = require('../middleware/upload');

const logoUpload = uploadMiddleware('firma-logolar');
const katalogUpload = pdfUploadMiddleware('kataloglar');
const eczaciPdfUpload = pdfUploadMiddleware('eczaci-dokumanlar');
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// Eczacı sayfası içeriğini güncelle (başlık + metin + video linki)
router.post('/eczaci-icerik', async (req, res) => {
  const { eczaci_baslik, eczaci_metin, eczaci_video_url } = req.body;
  try {
    await pool.query(
      `UPDATE firmalar SET eczaci_baslik=$1, eczaci_metin=$2, eczaci_video_url=$3 WHERE id=$4`,
      [eczaci_baslik || null, eczaci_metin || null, eczaci_video_url || null, req.session.firmaId]
    );
    req.flash('success', 'Eczacı sayfası güncellendi.');
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

// Eczacı eğitim PDF'i yükle
router.post('/eczaci-pdf', guvenliUpload(eczaciPdfUpload, 'eczaci_pdf', '/?tab=icerik'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE firmalar SET eczaci_pdf_url=$1 WHERE id=$2', [req.file.location, req.session.firmaId]);
      req.flash('success', 'Eğitim dokümanı güncellendi.');
    } else {
      req.flash('error', 'Dosya kaydedilemedi (depolama yapılandırılmamış).');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Doküman yüklenemedi.');
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

// Mevcut eczaneye eczacı kartı kodu üret (eczane oluşturulduğunda otomatik üretilir,
// bu uç migration öncesi oluşturulmuş eczaneler için)
router.post('/eczane/:id/eczaci-kod-uret', async (req, res) => {
  try {
    const mevcut = await pool.query(
      'SELECT eczaci_kod FROM eczaneler WHERE id=$1 AND firma_id=$2',
      [req.params.id, req.session.firmaId]
    );
    if (!mevcut.rows.length) {
      req.flash('error', 'Eczane bulunamadı.');
      return res.redirect('/?tab=raf');
    }
    if (!mevcut.rows[0].eczaci_kod) {
      const kod = await benzersizEczaciKoduUret();
      await pool.query(
        'UPDATE eczaneler SET eczaci_kod=$1 WHERE id=$2 AND firma_id=$3',
        [kod, req.params.id, req.session.firmaId]
      );
      req.flash('success', 'Eczacı kartı kodu üretildi.');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Kod üretilemedi.');
  }
  res.redirect('/?tab=raf');
});

router.post('/calisan/:id/kart-isaretle', async (req, res) => {
  const yazildi = req.body.yazildi === 'true';
  try {
    await pool.query(
      'UPDATE calisanlar SET karta_yazildi = $1 WHERE id = $2 AND firma_id = $3',
      [yazildi, req.params.id, req.session.firmaId]
    );
  } catch (err) {
    console.error(err);
    req.flash('error', 'İşaretlenemedi.');
  }
  res.redirect('/?tab=istatistik');
});

router.post('/eczane/:id/kart-isaretle', async (req, res) => {
  const yazildi = req.body.yazildi === 'true';
  const tip = req.body.tip === 'eczaci' ? 'eczaci' : 'musteri';
  try {
    await pool.query(
      `UPDATE eczaneler SET ${tip}_karta_yazildi = $1 WHERE id = $2 AND firma_id = $3`,
      [yazildi, req.params.id, req.session.firmaId]
    );
  } catch (err) {
    console.error(err);
    req.flash('error', 'İşaretlenemedi.');
  }
  res.redirect('/?tab=raf');
});

router.get('/eczane-sablon', (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['ad', 'adres'],
    ['Örnek Eczane', 'Merkez Mah. No:1'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Eczaneler');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="eczaneler-sablon.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

router.post('/eczane-toplu-yukle', excelUpload.single('excel'), async (req, res) => {
  if (!req.file) {
    req.flash('error', 'Dosya seçilmedi.');
    return res.redirect('/?tab=excel');
  }
  const { eczaneler, hatalar } = eczaneExcelParse(req.file.buffer);
  let eklenen = 0;
  for (const e of eczaneler) {
    try {
      const kod = await benzersizEczaneKoduUret();
      const eczaciKod = await benzersizEczaciKoduUret();
      await pool.query(
        'INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod, onayli) VALUES ($1,$2,$3,$4,$5, false)',
        [req.session.firmaId, e.ad, e.adres, kod, eczaciKod]
      );
      eklenen++;
    } catch (err) {
      console.error(err);
      hatalar.push(`${e.ad}: eklenemedi`);
    }
  }
  const mesaj = `${eklenen} eczane eklendi.${hatalar.length ? ' Hatalar: ' + hatalar.join('; ') : ''}`;
  req.flash(hatalar.length && eklenen === 0 ? 'error' : 'success', mesaj);
  res.redirect('/?tab=excel');
});

router.post('/eczane/:id/onayla', async (req, res) => {
  try {
    await pool.query(
      'UPDATE eczaneler SET onayli = true WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.session.firmaId]
    );
  } catch (err) {
    console.error(err);
    req.flash('error', 'Onaylanamadı.');
  }
  res.redirect('/?tab=raf');
});

module.exports = router;
