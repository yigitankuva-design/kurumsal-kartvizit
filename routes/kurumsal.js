const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { pool } = require('../db');
const { benzersizEczaneKoduUret, benzersizEczaciKoduUret } = require('../utils/eczaneKod');
const { eczaneExcelParse } = require('../utils/excel');
const { uploadMiddleware, pdfUploadMiddleware } = require('../middleware/upload');
const { islemKaydet } = require('../utils/islemGecmisi');

const logoUpload = uploadMiddleware('firma-logolar');
const katalogUpload = pdfUploadMiddleware('kataloglar');
const eczaciPdfUpload = pdfUploadMiddleware('eczaci-dokumanlar');
const urunFotoUpload = uploadMiddleware('urunler');
const urunPdfUpload = pdfUploadMiddleware('urun-dokumanlar');
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
    const silinen = await pool.query('DELETE FROM eczaneler WHERE id=$1 AND firma_id=$2 RETURNING ad', [req.params.id, req.session.firmaId]);
    if (silinen.rows.length) {
      await islemKaydet(req.session.firmaId, 'eczane_silindi', 'eczane', Number(req.params.id), silinen.rows[0].ad);
    }
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
      await pool.query('UPDATE firmalar SET katalog_url=$1, katalog_guncelleme_tarihi=NOW() WHERE id=$2', [req.file.location, req.session.firmaId]);
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
      `SELECT c.ad AS temsilci_ad, c.soyad AS temsilci_soyad, e.ad AS eczane_ad, z.created_at, z.temsilci_notu
       FROM ziyaretler z
       JOIN calisanlar c ON c.id = z.calisan_id
       JOIN eczaneler e ON e.id = z.eczane_id
       WHERE c.firma_id = $1
       ORDER BY z.created_at DESC`,
      [req.session.firmaId]
    );
    const ws = XLSX.utils.aoa_to_sheet([
      ['Temsilci', 'Eczane', 'Tarih', 'Not'],
      ...result.rows.map(r => [`${r.temsilci_ad} ${r.temsilci_soyad}`, r.eczane_ad, r.created_at.toISOString(), r.temsilci_notu || '']),
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

// Çok sayfalı gelişmiş rapor (Ziyaretler, Eczane Özeti, Temsilci Özeti, İndirim Kullanımı)
router.get('/rapor-excel', async (req, res) => {
  try {
    const firmaId = req.session.firmaId;

    const ziyaretlerSonuc = await pool.query(
      `SELECT c.ad AS temsilci_ad, c.soyad AS temsilci_soyad, e.ad AS eczane_ad, z.created_at, z.temsilci_notu
       FROM ziyaretler z
       JOIN calisanlar c ON c.id = z.calisan_id
       JOIN eczaneler e ON e.id = z.eczane_id
       WHERE c.firma_id = $1
       ORDER BY z.created_at DESC`,
      [firmaId]
    );
    const eczaneOzetSonuc = await pool.query(
      `SELECT e.ad,
         (SELECT COUNT(*) FROM raf_okutmalar r WHERE r.eczane_id = e.id) AS raf_okutma,
         (SELECT COUNT(*) FROM eczaci_okutmalar eo WHERE eo.eczane_id = e.id) AS eczaci_okutma,
         (SELECT COUNT(*) FROM ziyaretler z WHERE z.eczane_id = e.id) AS ziyaret_sayisi,
         (SELECT MAX(z.created_at) FROM ziyaretler z WHERE z.eczane_id = e.id) AS son_ziyaret
       FROM eczaneler e WHERE e.firma_id = $1 ORDER BY e.ad`,
      [firmaId]
    );
    const temsilciOzetSonuc = await pool.query(
      `SELECT c.ad, c.soyad, COUNT(*) AS ziyaret_sayisi, COUNT(DISTINCT z.eczane_id) AS benzersiz_eczane
       FROM ziyaretler z JOIN calisanlar c ON c.id = z.calisan_id
       WHERE c.firma_id = $1
       GROUP BY c.id, c.ad, c.soyad ORDER BY ziyaret_sayisi DESC`,
      [firmaId]
    );
    const indirimSonuc = await pool.query(
      `SELECT e.ad AS eczane_ad, i.kod, i.yuzde, i.olusturulma_tarihi, i.kullanildi, i.kullanilma_tarihi
       FROM indirim_kodlari i JOIN eczaneler e ON e.id = i.eczane_id
       WHERE i.firma_id = $1
       ORDER BY i.olusturulma_tarihi DESC`,
      [firmaId]
    );

    const wb = new ExcelJS.Workbook();
    const basliklariUygula = (ws, basliklar) => {
      ws.addRow(basliklar);
      const baslikSatiri = ws.getRow(1);
      baslikSatiri.font = { bold: true, color: { argb: 'FF000000' } };
      baslikSatiri.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8A84B' } };
      ws.columns.forEach(col => { col.width = 22; });
    };

    const wsZiyaret = wb.addWorksheet('Ziyaretler');
    basliklariUygula(wsZiyaret, ['Temsilci', 'Eczane', 'Tarih', 'Not']);
    ziyaretlerSonuc.rows.forEach(r => {
      wsZiyaret.addRow([`${r.temsilci_ad} ${r.temsilci_soyad}`, r.eczane_ad, r.created_at, r.temsilci_notu || '']);
    });

    const wsEczane = wb.addWorksheet('Eczane Özeti');
    basliklariUygula(wsEczane, ['Eczane', 'Raf Okutma', 'Eczacı Okutma', 'Ziyaret Sayısı', 'Son Ziyaret']);
    eczaneOzetSonuc.rows.forEach(r => {
      wsEczane.addRow([r.ad, Number(r.raf_okutma), Number(r.eczaci_okutma), Number(r.ziyaret_sayisi), r.son_ziyaret || '']);
    });

    const wsTemsilci = wb.addWorksheet('Temsilci Özeti');
    basliklariUygula(wsTemsilci, ['Temsilci', 'Ziyaret Sayısı', 'Benzersiz Eczane']);
    temsilciOzetSonuc.rows.forEach(r => {
      wsTemsilci.addRow([`${r.ad} ${r.soyad}`, Number(r.ziyaret_sayisi), Number(r.benzersiz_eczane)]);
    });

    const wsIndirim = wb.addWorksheet('İndirim Kullanımı');
    basliklariUygula(wsIndirim, ['Eczane', 'Kod', 'Yüzde', 'Oluşturulma', 'Kullanıldı', 'Kullanılma Tarihi']);
    indirimSonuc.rows.forEach(r => {
      wsIndirim.addRow([r.eczane_ad, r.kod, r.yuzde, r.olusturulma_tarihi, r.kullanildi ? 'Evet' : 'Hayır', r.kullanilma_tarihi || '']);
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename="rapor.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Rapor oluşturulamadı.');
    res.redirect('/?tab=genel');
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

// Eczane toplu işlem: onayla / pasife-al / aktif-yap / sil
router.post('/eczane/toplu-islem', async (req, res) => {
  const { idler, islem } = req.body;
  const izinliIslemler = ['onayla', 'pasife-al', 'aktif-yap', 'sil'];
  if (!Array.isArray(idler) || !idler.length || !izinliIslemler.includes(islem)) {
    return res.status(400).json({ ok: false, error: 'Geçersiz istek.' });
  }
  try {
    if (islem === 'onayla') {
      await pool.query('UPDATE eczaneler SET onayli = true WHERE id = ANY($1) AND firma_id = $2', [idler, req.session.firmaId]);
    } else if (islem === 'pasife-al') {
      await pool.query("UPDATE eczaneler SET durum = 'pasif' WHERE id = ANY($1) AND firma_id = $2", [idler, req.session.firmaId]);
    } else if (islem === 'aktif-yap') {
      await pool.query("UPDATE eczaneler SET durum = 'aktif' WHERE id = ANY($1) AND firma_id = $2", [idler, req.session.firmaId]);
    } else if (islem === 'sil') {
      await pool.query('DELETE FROM eczaneler WHERE id = ANY($1) AND firma_id = $2', [idler, req.session.firmaId]);
    }
    await islemKaydet(req.session.firmaId, `eczane_toplu_${islem.replace('-', '_')}`, 'eczane', null, `${idler.length} eczane`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'İşlem başarısız.' });
  }
});

router.get('/eczane/:id/detay', async (req, res) => {
  try {
    const eczaneKontrol = await pool.query(
      'SELECT id FROM eczaneler WHERE id=$1 AND firma_id=$2',
      [req.params.id, req.session.firmaId]
    );
    if (!eczaneKontrol.rows.length) return res.status(404).json({ error: 'Eczane bulunamadı.' });

    const okutma = await pool.query(
      'SELECT COUNT(*) as toplam, COUNT(DISTINCT ip_hash) as farkli_kisi FROM raf_okutmalar WHERE eczane_id=$1',
      [req.params.id]
    );
    const tiklama = await pool.query(
      'SELECT tip, COUNT(*) as sayi FROM raf_tiklamalar WHERE eczane_id=$1 GROUP BY tip',
      [req.params.id]
    );
    const pdf = await pool.query(
      "SELECT COUNT(*) as sayi FROM eczaci_tiklamalar WHERE eczane_id=$1 AND tip='pdf'",
      [req.params.id]
    );
    const ziyaretEtkisi = await pool.query(
      `WITH ziyaret_sirali AS (
        SELECT id, created_at,
               LEAD(created_at) OVER (ORDER BY created_at) AS sonraki_ziyaret
        FROM ziyaretler
        WHERE eczane_id = $1
      )
      SELECT z.created_at AS ziyaret_tarihi,
             (SELECT COUNT(*) FROM raf_okutmalar r
              WHERE r.eczane_id = $1
                AND r.created_at > z.created_at
                AND r.created_at <= COALESCE(z.sonraki_ziyaret, NOW()))
             AS sonraki_okutma_sayisi
      FROM ziyaret_sirali z
      ORDER BY z.created_at DESC`,
      [req.params.id]
    );

    const tiklamaDagilimi = {};
    tiklama.rows.forEach(r => { tiklamaDagilimi[r.tip] = Number(r.sayi); });

    res.json({
      okutma_sayisi: Number(okutma.rows[0].toplam),
      farkli_kisi_tahmini: Number(okutma.rows[0].farkli_kisi),
      tiklama_dagilimi: tiklamaDagilimi,
      pdf_acilma_sayisi: Number(pdf.rows[0].sayi),
      ziyaret_etkisi: ziyaretEtkisi.rows.map(r => ({
        ziyaret_tarihi: r.ziyaret_tarihi,
        sonraki_okutma_sayisi: Number(r.sonraki_okutma_sayisi),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Detay alınamadı.' });
  }
});

// İndirim kampanyası ayarları
router.post('/indirim-ayar', async (req, res) => {
  const { indirim_aktif, indirim_yuzdesi } = req.body;
  const yuzde = parseInt(indirim_yuzdesi, 10);
  if (!Number.isInteger(yuzde) || yuzde < 1 || yuzde > 100) {
    req.flash('error', 'Yüzde 1-100 arasında olmalı.');
    return res.redirect('/?tab=indirim');
  }
  try {
    await pool.query(
      'UPDATE firmalar SET indirim_aktif=$1, indirim_yuzdesi=$2 WHERE id=$3',
      [indirim_aktif === 'true', yuzde, req.session.firmaId]
    );
    await islemKaydet(req.session.firmaId, 'indirim_ayar_degisti', null, null, `aktif=${indirim_aktif === 'true'}, yüzde=${yuzde}`);
    req.flash('success', 'İndirim ayarları güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=indirim');
});

// Ürün ekle
router.post('/urunler', guvenliUpload(urunFotoUpload, 'foto', '/?tab=urunler'), async (req, res) => {
  const { ad, aciklama } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Ürün adı zorunlu.');
    return res.redirect('/?tab=urunler');
  }
  try {
    const siraSonuc = await pool.query('SELECT COALESCE(MAX(sira), -1) + 1 AS sonraki FROM urunler WHERE firma_id = $1', [req.session.firmaId]);
    await pool.query(
      'INSERT INTO urunler (firma_id, ad, aciklama, foto_url, sira) VALUES ($1, $2, $3, $4, $5)',
      [req.session.firmaId, ad.trim(), aciklama || null, req.file?.location || null, siraSonuc.rows[0].sonraki]
    );
    req.flash('success', 'Ürün eklendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Ürün eklenemedi.');
  }
  res.redirect('/?tab=urunler');
});

// Ürün düzenle
// Ürün düzenleme — hem POST hem PUT (multipart formlarda method-override _method
// alanını okuyamaz, çünkü express.urlencoded() multipart body'yi parse edemez —
// panel.js'teki duzenleHandler ile aynı desen)
async function urunDuzenleHandler(req, res) {
  const { ad, aciklama, aktif } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Ürün adı zorunlu.');
    return res.redirect('/?tab=urunler');
  }
  try {
    if (req.file?.location) {
      await pool.query(
        'UPDATE urunler SET ad=$1, aciklama=$2, aktif=$3, foto_url=$4 WHERE id=$5 AND firma_id=$6',
        [ad.trim(), aciklama || null, aktif !== 'false', req.file.location, req.params.id, req.session.firmaId]
      );
    } else {
      await pool.query(
        'UPDATE urunler SET ad=$1, aciklama=$2, aktif=$3 WHERE id=$4 AND firma_id=$5',
        [ad.trim(), aciklama || null, aktif !== 'false', req.params.id, req.session.firmaId]
      );
    }
    req.flash('success', 'Ürün güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=urunler');
}
router.post('/urunler/:id', guvenliUpload(urunFotoUpload, 'foto', '/?tab=urunler'), urunDuzenleHandler);
router.put('/urunler/:id', guvenliUpload(urunFotoUpload, 'foto', '/?tab=urunler'), urunDuzenleHandler);

// Ürün sil
router.delete('/urunler/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM urunler WHERE id=$1 AND firma_id=$2', [req.params.id, req.session.firmaId]);
    req.flash('success', 'Ürün silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/?tab=urunler');
});

// Ürün PDF yükle
router.post('/urunler/:id/pdf', guvenliUpload(urunPdfUpload, 'pdf', '/?tab=urunler'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE urunler SET pdf_url=$1 WHERE id=$2 AND firma_id=$3', [req.file.location, req.params.id, req.session.firmaId]);
      req.flash('success', 'Ürün dokümanı yüklendi.');
    } else {
      req.flash('error', 'Dosya kaydedilemedi (depolama yapılandırılmamış).');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Doküman yüklenemedi.');
  }
  res.redirect('/?tab=urunler');
});

// Ürün sırasını güncelle
router.put('/urunler/:id/sira', async (req, res) => {
  try {
    await pool.query('UPDATE urunler SET sira=$1 WHERE id=$2 AND firma_id=$3', [req.body.sira, req.params.id, req.session.firmaId]);
    res.redirect('/?tab=urunler');
  } catch (err) {
    console.error(err);
    res.redirect('/?tab=urunler');
  }
});

module.exports = router;
