const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const { pool } = require('../db');
const { benzersizEczaneKoduUret, benzersizEczaciKoduUret } = require('../utils/eczaneKod');
const { eczaneExcelParse, aoaToXlsxBuffer } = require('../utils/excel');
const { uploadMiddleware, pdfUploadMiddleware } = require('../middleware/upload');
const { islemKaydet } = require('../utils/islemGecmisi');
const { basrilkSatiriUygula, kolonGenislikleriAyarla } = require('../utils/excelStil');
const { mumessilPerformansi } = require('../utils/sahaAnaliz');

// pdfkit'in yerleşik fontları (Helvetica) Türkçe'ye özgü karakterleri (ı, ş, ğ vb.)
// desteklemediği için PDF çıktısında sadeleştirilmiş (ASCII) metin kullanılır.
const TURKCE_HARF_HARITASI = { İ: 'I', I: 'I', ı: 'i', Ş: 'S', ş: 's', Ğ: 'G', ğ: 'g', Ü: 'U', ü: 'u', Ö: 'O', ö: 'o', Ç: 'C', ç: 'c', '↑': '+', '↓': '-' };
function pdfMetin(deger) {
  return String(deger).replace(/[İIışŞğĞüÜöÖçÇ↑↓]/g, (harf) => TURKCE_HARF_HARITASI[harf] || harf);
}

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
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ziyaretler');
    basrilkSatiriUygula(ws, ['Temsilci', 'Eczane', 'Tarih', 'Not']);
    result.rows.forEach(r => {
      ws.addRow([`${r.temsilci_ad} ${r.temsilci_soyad}`, r.eczane_ad, r.created_at, r.temsilci_notu || '']).getCell(3).numFmt = 'dd.mm.yyyy hh:mm';
    });
    kolonGenislikleriAyarla(ws);
    const buffer = await wb.xlsx.writeBuffer();
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

    // Özet sayfası (ilk sayfa) — KPI'lar
    const kpiSonuc = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM ziyaretler z JOIN calisanlar c ON c.id=z.calisan_id WHERE c.firma_id=$1) AS toplam_ziyaret,
         (SELECT COUNT(*) FROM eczaneler WHERE firma_id=$1) AS toplam_eczane,
         (SELECT COUNT(*) FROM eczaneler WHERE firma_id=$1 AND musteri_karta_yazildi=true) AS kartli_eczane,
         (SELECT COUNT(*) FROM indirim_kodlari WHERE firma_id=$1) AS indirim_uretilen,
         (SELECT COUNT(*) FROM indirim_kodlari WHERE firma_id=$1 AND kullanildi) AS indirim_kullanilan`,
      [firmaId]
    );
    const kpi = kpiSonuc.rows[0];
    const oran = (a, b) => (Number(b) ? Math.round((Number(a) / Number(b)) * 100) : 0);
    const wsOzet = wb.addWorksheet('Özet');
    basrilkSatiriUygula(wsOzet, ['Metrik', 'Değer']);
    wsOzet.addRow(['Rapor tarihi', new Date()]).getCell(2).numFmt = 'dd.mm.yyyy';
    wsOzet.addRow(['Toplam ziyaret', Number(kpi.toplam_ziyaret)]);
    wsOzet.addRow(['Toplam eczane', Number(kpi.toplam_eczane)]);
    wsOzet.addRow(['Kart kapsaması', oran(kpi.kartli_eczane, kpi.toplam_eczane) / 100]).getCell(2).numFmt = '0%';
    wsOzet.addRow(['İndirim dönüşümü', oran(kpi.indirim_kullanilan, kpi.indirim_uretilen) / 100]).getCell(2).numFmt = '0%';
    kolonGenislikleriAyarla(wsOzet);

    // Mümessil Performansı sayfası — geride satırlar kırmızı
    const perfSonuc = await pool.query(
      `SELECT c.id, c.ad, c.soyad, c.unvan,
              COUNT(*) FILTER (WHERE z.created_at >= NOW() - INTERVAL '30 days') AS ziyaret30,
              COUNT(*) FILTER (WHERE z.created_at >= NOW() - INTERVAL '90 days') AS ziyaret90,
              MAX(z.created_at) AS son_ziyaret
       FROM calisanlar c LEFT JOIN ziyaretler z ON z.calisan_id = c.id
       WHERE c.firma_id = $1 AND c.durum='aktif' AND c.ekip_yoneticisi=false
       GROUP BY c.id, c.ad, c.soyad, c.unvan`,
      [firmaId]
    );
    const perf = mumessilPerformansi(perfSonuc.rows.map(r => ({
      id: r.id, ad: r.ad, soyad: r.soyad, unvan: r.unvan,
      ziyaret30: Number(r.ziyaret30), ziyaret90: Number(r.ziyaret90), sonZiyaret: r.son_ziyaret,
    })));
    const wsPerf = wb.addWorksheet('Mümessil Performansı');
    basrilkSatiriUygula(wsPerf, ['Mümessil', 'Son 30g', 'Son 90g', 'Son Ziyaret', 'Durum']);
    perf.forEach(r => {
      const satir = wsPerf.addRow([`${r.ad} ${r.soyad}`, r.ziyaret30, r.ziyaret90, r.sonZiyaret || '', r.durum === 'yildiz' ? 'Yıldız' : r.durum === 'geride' ? 'Geride' : 'Normal']);
      if (r.sonZiyaret) satir.getCell(4).numFmt = 'dd.mm.yyyy';
      if (r.durum === 'geride') satir.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } }; });
    });
    kolonGenislikleriAyarla(wsPerf);

    const wsZiyaret = wb.addWorksheet('Ziyaretler');
    basrilkSatiriUygula(wsZiyaret, ['Temsilci', 'Eczane', 'Tarih', 'Not']);
    ziyaretlerSonuc.rows.forEach(r => {
      wsZiyaret.addRow([`${r.temsilci_ad} ${r.temsilci_soyad}`, r.eczane_ad, r.created_at, r.temsilci_notu || '']).getCell(3).numFmt = 'dd.mm.yyyy hh:mm';
    });
    kolonGenislikleriAyarla(wsZiyaret);

    const wsEczane = wb.addWorksheet('Eczane Özeti');
    basrilkSatiriUygula(wsEczane, ['Eczane', 'Raf Okutma', 'Eczacı Okutma', 'Ziyaret Sayısı', 'Son Ziyaret']);
    eczaneOzetSonuc.rows.forEach(r => {
      wsEczane.addRow([r.ad, Number(r.raf_okutma), Number(r.eczaci_okutma), Number(r.ziyaret_sayisi), r.son_ziyaret || '']);
    });
    kolonGenislikleriAyarla(wsEczane);

    const wsTemsilci = wb.addWorksheet('Temsilci Özeti');
    basrilkSatiriUygula(wsTemsilci, ['Temsilci', 'Ziyaret Sayısı', 'Benzersiz Eczane']);
    temsilciOzetSonuc.rows.forEach(r => {
      wsTemsilci.addRow([`${r.ad} ${r.soyad}`, Number(r.ziyaret_sayisi), Number(r.benzersiz_eczane)]);
    });
    kolonGenislikleriAyarla(wsTemsilci);

    const wsIndirim = wb.addWorksheet('İndirim Kullanımı');
    basrilkSatiriUygula(wsIndirim, ['Eczane', 'Kod', 'Yüzde', 'Oluşturulma', 'Kullanıldı', 'Kullanılma Tarihi']);
    indirimSonuc.rows.forEach(r => {
      wsIndirim.addRow([r.eczane_ad, r.kod, r.yuzde, r.olusturulma_tarihi, r.kullanildi ? 'Evet' : 'Hayır', r.kullanilma_tarihi || '']);
    });
    kolonGenislikleriAyarla(wsIndirim);

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

// Haftalık özet PDF raporu (pdfkit ile vektör grafiklerle çizilir, harici bağımlılık gerektirmez)
router.get('/rapor-pdf', async (req, res) => {
  try {
    const firmaId = req.session.firmaId;
    const firmaSonuc = await pool.query('SELECT ad FROM firmalar WHERE id = $1', [firmaId]);
    const firmaAdi = firmaSonuc.rows[0].ad;

    const buDonemSonuc = await pool.query(
      `SELECT COUNT(*) AS toplam, COUNT(*) FILTER (WHERE lt.tip = 'profil_goruntuleme') AS goruntuleme
       FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
       WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '7 days'`,
      [firmaId]
    );
    const oncekiDonemSonuc = await pool.query(
      `SELECT COUNT(*) AS toplam, COUNT(*) FILTER (WHERE lt.tip = 'profil_goruntuleme') AS goruntuleme
       FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
       WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '14 days' AND lt.created_at < NOW() - INTERVAL '7 days'`,
      [firmaId]
    );
    const gunlukSonuc = await pool.query(
      `SELECT DATE(lt.created_at) AS gun, COUNT(*) AS sayi
       FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
       WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '14 days'
       GROUP BY gun ORDER BY gun`,
      [firmaId]
    );
    const dagilimSonuc = await pool.query(
      `SELECT lt.tip, COUNT(*) AS sayi
       FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
       WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY lt.tip ORDER BY sayi DESC LIMIT 6`,
      [firmaId]
    );
    const liderlikSonuc = await pool.query(
      `SELECT c.ad, c.soyad, COUNT(*) AS sayi
       FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
       WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY c.id, c.ad, c.soyad ORDER BY sayi DESC LIMIT 5`,
      [firmaId]
    );

    const buDonem = buDonemSonuc.rows[0];
    const oncekiDonem = oncekiDonemSonuc.rows[0];
    const yuzdeDegisim = (yeni, eski) => {
      yeni = Number(yeni); eski = Number(eski);
      if (eski === 0) return yeni > 0 ? null : 0;
      return Math.round(((yeni - eski) / eski) * 100);
    };
    const tiklamaDegisim = yuzdeDegisim(buDonem.toplam, oncekiDonem.toplam);
    const goruntulemeDegisim = yuzdeDegisim(buDonem.goruntuleme, oncekiDonem.goruntuleme);

    const bugunUtc = new Date();
    bugunUtc.setUTCHours(0, 0, 0, 0);
    const gunlukHarita = {};
    gunlukSonuc.rows.forEach(r => { gunlukHarita[r.gun.toISOString().slice(0, 10)] = Number(r.sayi); });
    const sparkline = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(bugunUtc);
      d.setUTCDate(d.getUTCDate() - i);
      sparkline.push(gunlukHarita[d.toISOString().slice(0, 10)] || 0);
    }

    const degisimEtiketi = (deger) => {
      if (deger === null) return 'yeni veri';
      if (deger > 0) return `↑ %${deger}`;
      if (deger < 0) return `↓ %${Math.abs(deger)}`;
      return 'değişim yok';
    };
    const degisimRenk = (deger) => {
      if (deger === null || deger === 0) return '#6b6a63';
      return deger > 0 ? '#16a34a' : '#dc2626';
    };

    res.setHeader('Content-Disposition', 'attachment; filename="haftalik-ozet.pdf"');
    res.setHeader('Content-Type', 'application/pdf');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).fillColor('#c8a84b').text('NFCKartify', 50, 50, { continued: true }).fillColor('#1c1c20').text(pdfMetin(' — Haftalık Özet Raporu'));
    doc.fontSize(11).fillColor('#6b6a63').text(pdfMetin(firmaAdi));
    doc.text(new Date().toLocaleDateString('tr-TR'));
    doc.moveDown(1);

    const kpiY = doc.y;
    const kutuGenislik = 220;
    doc.roundedRect(50, kpiY, kutuGenislik, 70, 6).stroke('#e4e1d5');
    doc.fontSize(22).fillColor('#1c1c20').text(String(buDonem.toplam), 62, kpiY + 10);
    doc.fontSize(9).fillColor('#6b6a63').text(pdfMetin('Son 7 gün — toplam tıklama'), 62, kpiY + 38);
    doc.fontSize(9).fillColor(degisimRenk(tiklamaDegisim)).text(pdfMetin(degisimEtiketi(tiklamaDegisim)), 62, kpiY + 52);

    doc.roundedRect(50 + kutuGenislik + 20, kpiY, kutuGenislik, 70, 6).stroke('#e4e1d5');
    doc.fontSize(22).fillColor('#1c1c20').text(String(buDonem.goruntuleme), 62 + kutuGenislik + 20, kpiY + 10);
    doc.fontSize(9).fillColor('#6b6a63').text(pdfMetin('Son 7 gün — profil görüntüleme'), 62 + kutuGenislik + 20, kpiY + 38);
    doc.fontSize(9).fillColor(degisimRenk(goruntulemeDegisim)).text(pdfMetin(degisimEtiketi(goruntulemeDegisim)), 62 + kutuGenislik + 20, kpiY + 52);

    doc.x = 50;
    doc.y = kpiY + 95;

    doc.fontSize(13).fillColor('#1c1c20').text(pdfMetin('Son 14 Gün — Tıklama Trendi'));
    doc.moveDown(0.3);
    const grafikX = 50, grafikY = doc.y, grafikGenislik = 490, grafikYukseklik = 80;
    const maxDeger = Math.max(1, ...sparkline);
    doc.rect(grafikX, grafikY, grafikGenislik, grafikYukseklik).stroke('#e4e1d5');
    const adimX = grafikGenislik / (sparkline.length - 1);
    doc.strokeColor('#c8a84b').lineWidth(2);
    sparkline.forEach((deger, i) => {
      const x = grafikX + i * adimX;
      const y = grafikY + grafikYukseklik - (deger / maxDeger) * (grafikYukseklik - 10) - 5;
      if (i === 0) doc.moveTo(x, y); else doc.lineTo(x, y);
    });
    doc.stroke();
    doc.x = 50;
    doc.y = grafikY + grafikYukseklik + 20;

    if (dagilimSonuc.rows.length) {
      doc.fontSize(13).fillColor('#1c1c20').text(pdfMetin('Tıklama Dağılımı — Son 30 Gün'));
      doc.moveDown(0.3);
      const barMax = Math.max(...dagilimSonuc.rows.map(r => Number(r.sayi)));
      const barGenislikMax = 300;
      dagilimSonuc.rows.forEach(r => {
        const y = doc.y;
        const genislik = Math.max(4, (Number(r.sayi) / barMax) * barGenislikMax);
        doc.rect(150, y, genislik, 14).fill('#c8a84b');
        doc.fontSize(9).fillColor('#1c1c20').text(pdfMetin(r.tip), 50, y + 2, { width: 95 });
        doc.fillColor('#6b6a63').text(String(r.sayi), 150 + genislik + 6, y + 2);
        doc.x = 50;
        doc.y = y + 18;
      });
      doc.moveDown(0.5);
    }

    if (liderlikSonuc.rows.length) {
      doc.fontSize(13).fillColor('#1c1c20').text(pdfMetin('Liderlik Tablosu — Son 30 Gün'));
      doc.moveDown(0.3);
      liderlikSonuc.rows.forEach((r, i) => {
        doc.fontSize(10).fillColor('#1c1c20').text(pdfMetin(`${i + 1}. ${r.ad} ${r.soyad}`), 50, doc.y, { continued: true, width: 300 });
        doc.fillColor('#6b6a63').text(pdfMetin(`  ${r.sayi} etkileşim`));
      });
    }

    doc.fontSize(8).fillColor('#9a9890').text(pdfMetin('NFCKartify tarafından oluşturuldu — nfckartify.com.tr'), 50, doc.page.height - 60);

    doc.end();
  } catch (err) {
    console.error(err);
    req.flash('error', 'PDF raporu oluşturulamadı.');
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

router.get('/eczane-sablon', async (req, res) => {
  const buffer = await aoaToXlsxBuffer([
    ['ad', 'adres'],
    ['Örnek Eczane', 'Merkez Mah. No:1'],
  ], 'Eczaneler');
  res.setHeader('Content-Disposition', 'attachment; filename="eczaneler-sablon.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

router.post('/eczane-toplu-yukle', excelUpload.single('excel'), async (req, res) => {
  if (!req.file) {
    req.flash('error', 'Dosya seçilmedi.');
    return res.redirect('/?tab=excel');
  }
  const { eczaneler, hatalar } = await eczaneExcelParse(req.file.buffer);
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
