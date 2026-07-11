const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { benzersizCalisanSlugOlustur } = require('../utils/slug');
const XLSX = require('xlsx');
const multer = require('multer');
const { excelParse } = require('../utils/excel');
const { uploadMiddleware } = require('../middleware/upload');
const { biyografiTemizle } = require('../utils/sanitize');
const { calisanAltZinciriIdleri } = require('../utils/hiyerarsi');
const { islemKaydet } = require('../utils/islemGecmisi');

const fotoUpload = uploadMiddleware('calisanlar');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// fotoUpload.single() bir dizi middleware döner (multer + sharp işleme) — hata
// olursa çökmek yerine flash mesajıyla forma geri döner.
function fotoUploadGuvenli(redirectYolu) {
  return (req, res, next) => {
    const [multerMw, isleMw] = fotoUpload.single('foto');
    const hataYakala = (err) => {
      console.error(err);
      req.flash('error', err.message || 'Fotoğraf yüklenemedi.');
      res.redirect(typeof redirectYolu === 'function' ? redirectYolu(req) : redirectYolu);
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

// Ana panel → dashboard'a yönlendir
router.get('/', (req, res) => res.redirect('/'));

// Çalışan ekleme formu
router.get('/ekle', (req, res) => {
  res.render('panel/ekle', { title: 'Yeni Çalışan' });
});

// Çalışan ekleme POST
router.post('/ekle', fotoUploadGuvenli('/firma/panel/ekle'), async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, kvkk, giris_email, giris_sifre } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect('/');
  }
  if (!kvkk) {
    req.flash('error', 'Devam etmek için KVKK onayı gerekiyor.');
    return res.redirect('/');
  }
  const girisEmailDeger = giris_email && giris_email.trim() ? giris_email.trim() : null;
  if (girisEmailDeger && !(giris_sifre && giris_sifre.trim())) {
    req.flash('error', 'Giriş e-postası girildiyse şifre de zorunludur.');
    return res.redirect('/');
  }
  try {
    const slug = await benzersizCalisanSlugOlustur(req.session.firmaId, ad, soyad);
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    const biyografiTemiz = biyografiTemizle(biyografi);
    const fotoUrl = req.file?.location || null;
    const girisSifreHashDeger = girisEmailDeger ? await bcrypt.hash(giris_sifre.trim(), 12) : null;
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, foto_url, slug, giris_email, giris_sifre_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [req.session.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null,
       instagram || null, twitter || null, youtube || null, website || null,
       whatsapp || null, tiktok || null, sahibinden || null, hurriyet_emlak || null,
       adres || null, google_yorum_link || null,
       biyografiTemiz, ilaclarArray, fotoUrl, slug, girisEmailDeger, girisSifreHashDeger]
    );
    req.flash('success', `${ad} ${soyad} eklendi.`);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', err.code === '23505' ? 'Bu giriş e-postası zaten kullanılıyor.' : 'Çalışan eklenemedi.');
    res.redirect('/');
  }
});

// Excel şablon indir
router.get('/excel-sablon', (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['ad', 'soyad', 'unvan', 'departman', 'telefon', 'email', 'linkedin', 'instagram', 'twitter', 'biyografi'],
    ['Örnek', 'Kişi', 'Satış Müdürü', 'Satış', '+905001112233', 'ornek@firma.com', '', '', '', '']
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
        `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, biyografi, slug, onayli)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, false)`,
        [req.session.firmaId, c.ad, c.soyad, c.unvan, c.departman, c.telefon, c.email, c.linkedin, c.instagram, c.twitter, c.biyografi, slug]
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

router.post('/calisan/:id/onayla', async (req, res) => {
  try {
    await pool.query(
      'UPDATE calisanlar SET onayli = true WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.session.firmaId]
    );
  } catch (err) {
    console.error(err);
    req.flash('error', 'Onaylanamadı.');
  }
  res.redirect('/?tab=calisanlar');
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
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, giris_email, giris_sifre, amiri_id, ekip_yoneticisi } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect('/');
  }
  try {
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    const biyografiTemiz = biyografiTemizle(biyografi);
    const fotoUrl = req.file ? (req.file.location || null) : undefined;

    const baseFields = [ad, soyad, unvan || null, departman || null, telefon || null,
      email || null, linkedin || null, instagram || null, twitter || null,
      youtube || null, website || null, whatsapp || null, tiktok || null,
      sahibinden || null, hurriyet_emlak || null, adres || null, google_yorum_link || null,
      biyografiTemiz, ilaclarArray];

    if (fotoUrl !== undefined) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
         email=$6, linkedin=$7, instagram=$8, twitter=$9, youtube=$10, website=$11,
         whatsapp=$12, tiktok=$13, sahibinden=$14, hurriyet_emlak=$15, adres=$16, google_yorum_link=$17,
         biyografi=$18, ilaclar=$19, foto_url=$20 WHERE id=$21 AND firma_id=$22`,
        [...baseFields, fotoUrl, req.params.id, req.session.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
         email=$6, linkedin=$7, instagram=$8, twitter=$9, youtube=$10, website=$11,
         whatsapp=$12, tiktok=$13, sahibinden=$14, hurriyet_emlak=$15, adres=$16, google_yorum_link=$17,
         biyografi=$18, ilaclar=$19 WHERE id=$20 AND firma_id=$21`,
        [...baseFields, req.params.id, req.session.firmaId]
      );
    }

    const girisEmailDeger = giris_email && giris_email.trim() ? giris_email.trim() : null;
    if (!girisEmailDeger) {
      await pool.query(
        'UPDATE calisanlar SET giris_email=NULL, giris_sifre_hash=NULL WHERE id=$1 AND firma_id=$2',
        [req.params.id, req.session.firmaId]
      );
    } else if (giris_sifre && giris_sifre.trim()) {
      const girisSifreHashDeger = await bcrypt.hash(giris_sifre.trim(), 12);
      await pool.query(
        'UPDATE calisanlar SET giris_email=$1, giris_sifre_hash=$2 WHERE id=$3 AND firma_id=$4',
        [girisEmailDeger, girisSifreHashDeger, req.params.id, req.session.firmaId]
      );
      await islemKaydet(req.session.firmaId, 'calisan_sifre_degisti', 'calisan', Number(req.params.id), `${ad} ${soyad}`);
    } else {
      await pool.query(
        'UPDATE calisanlar SET giris_email=$1 WHERE id=$2 AND firma_id=$3',
        [girisEmailDeger, req.params.id, req.session.firmaId]
      );
    }

    const amiriIdDeger = amiri_id && amiri_id.trim() ? Number(amiri_id) : null;
    if (amiriIdDeger !== null) {
      if (amiriIdDeger === Number(req.params.id)) {
        req.flash('error', 'Bir kişi kendi amiri olamaz.');
        return res.redirect('/');
      }
      const altZincir = await calisanAltZinciriIdleri(req.params.id);
      if (altZincir.includes(amiriIdDeger)) {
        req.flash('error', 'Bu kişi zaten bu zincirde — döngü oluşur.');
        return res.redirect('/');
      }
    }
    await pool.query(
      'UPDATE calisanlar SET amiri_id=$1, ekip_yoneticisi=$2 WHERE id=$3 AND firma_id=$4',
      [amiriIdDeger, ekip_yoneticisi === 'true', req.params.id, req.session.firmaId]
    );

    req.flash('success', 'Çalışan güncellendi.');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', err.code === '23505' ? 'Bu giriş e-postası zaten kullanılıyor.' : 'Güncelleme başarısız.');
    res.redirect('/');
  }
}
router.post('/:id/duzenle', fotoUploadGuvenli((req) => `/firma/panel/${req.params.id}/duzenle`), duzenleHandler);
router.put('/:id/duzenle', fotoUploadGuvenli((req) => `/firma/panel/${req.params.id}/duzenle`), duzenleHandler);

// Durum değiştirme
router.patch('/:id/durum', async (req, res) => {
  const { durum } = req.body;
  if (!['aktif', 'pasif'].includes(durum)) return res.redirect('/');
  try {
    const c = await pool.query(
      'UPDATE calisanlar SET durum=$1 WHERE id=$2 AND firma_id=$3 RETURNING ad, soyad',
      [durum, req.params.id, req.session.firmaId]
    );
    if (c.rows.length && durum === 'pasif') {
      await islemKaydet(req.session.firmaId, 'calisan_pasife_alindi', 'calisan', Number(req.params.id), `${c.rows[0].ad} ${c.rows[0].soyad}`);
    }
  } catch (err) {
    console.error(err);
  }
  res.redirect('/');
});

module.exports = router;
