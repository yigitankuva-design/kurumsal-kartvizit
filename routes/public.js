const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { vcfOlustur } = require('../utils/vcf');
const { cevirmenOlustur } = require('../utils/i18n');
const { youtubeIdCikar } = require('../utils/youtube');
const { instagramLinkOlustur, twitterLinkOlustur, tiktokLinkOlustur, urlNormallestir, youtubeLinkOlustur } = require('../utils/sosyalMedya');
const { ipHashOlustur } = require('../utils/ipHash');
const { benzersizIndirimKoduUret } = require('../utils/indirimKod');
const { createJsonLimiter } = require('../middleware/rateLimiter');

const RAF_TIKLAMA_TIPLERI = ['katalog', 'website', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok', 'whatsapp'];

async function eczaneGetir(kod) {
  const result = await pool.query(
    `SELECT e.id as eczane_id, e.ad as eczane_ad, e.kod,
            f.ad as firma_ad, f.logo_url, f.marka_rengi, f.katalog_url,
            f.website, f.instagram, f.linkedin, f.twitter, f.youtube, f.tiktok, f.whatsapp,
            f.indirim_aktif, f.indirim_yuzdesi
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
      const ipHash = ipHashOlustur(req.ip);
      await pool.query('INSERT INTO raf_okutmalar (eczane_id, ip_hash) VALUES ($1, $2)', [veri.eczane_id, ipHash]);
    } catch (kayitHatasi) {
      console.error('raf okutma kaydı başarısız:', kayitHatasi);
    }
    const urunlerSonuc = await pool.query(
      'SELECT id, ad, aciklama, foto_url, pdf_url FROM urunler WHERE firma_id = (SELECT firma_id FROM eczaneler WHERE id = $1) AND aktif = true ORDER BY sira',
      [veri.eczane_id]
    );
    const qrHedef = `${req.protocol}://${req.get('host')}/raf/${veri.kod}`;
    res.render('public/raf', { title: veri.firma_ad, veri, urunler: urunlerSonuc.rows, qrHedef, layout: false });
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
      website: urlNormallestir(veri.website),
      instagram: instagramLinkOlustur(veri.instagram),
      linkedin: urlNormallestir(veri.linkedin),
      twitter: twitterLinkOlustur(veri.twitter),
      youtube: youtubeLinkOlustur(veri.youtube),
      tiktok: tiktokLinkOlustur(veri.tiktok),
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

// Ürün tıklama takibi + yönlendirme (PDF'li ürünler için)
router.get('/raf/:kod/urun/:urunId/tikla', async (req, res) => {
  try {
    const veri = await eczaneGetir(req.params.kod);
    if (!veri) return res.status(404).send('Bulunamadı.');

    const urunSonuc = await pool.query(
      'SELECT pdf_url FROM urunler WHERE id = $1 AND firma_id = (SELECT firma_id FROM eczaneler WHERE id = $2) AND aktif = true',
      [req.params.urunId, veri.eczane_id]
    );
    if (!urunSonuc.rows.length) return res.status(404).send('Bulunamadı.');

    await pool.query('INSERT INTO urun_tiklamalar (urun_id, eczane_id) VALUES ($1, $2)', [req.params.urunId, veri.eczane_id]);

    if (urunSonuc.rows[0].pdf_url) {
      return res.redirect(urunSonuc.rows[0].pdf_url);
    }
    res.redirect(`/raf/${req.params.kod}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Bir hata oluştu.');
  }
});

// İndirim kodu al — günde/eczane başına cookie ile tekilleştirilir
router.post('/raf/:kod/indirim-kodu-al', createJsonLimiter('Çok fazla istek. Lütfen biraz sonra tekrar deneyin.'), async (req, res) => {
  try {
    const veri = await eczaneGetir(req.params.kod);
    if (!veri) return res.status(404).json({ ok: false, error: 'Bulunamadı.' });
    if (!veri.indirim_aktif) return res.status(403).json({ ok: false, error: 'İndirim kampanyası aktif değil.' });

    let cerezId = req.cookies?.indirim_cerez_id;
    if (!cerezId) {
      cerezId = require('crypto').randomBytes(16).toString('hex');
      res.cookie('indirim_cerez_id', cerezId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    }

    const mevcut = await pool.query(
      `SELECT kod, yuzde FROM indirim_kodlari
       WHERE eczane_id = $1 AND cerez_id = $2 AND olusturulma_tarihi::date = CURRENT_DATE
       ORDER BY id DESC LIMIT 1`,
      [veri.eczane_id, cerezId]
    );
    if (mevcut.rows.length) {
      return res.json({ ok: true, kod: mevcut.rows[0].kod, yuzde: mevcut.rows[0].yuzde });
    }

    const firmaIdSonuc = await pool.query('SELECT firma_id FROM eczaneler WHERE id = $1', [veri.eczane_id]);
    const yeniKod = await benzersizIndirimKoduUret();
    await pool.query(
      'INSERT INTO indirim_kodlari (firma_id, eczane_id, kod, yuzde, cerez_id) VALUES ($1, $2, $3, $4, $5)',
      [firmaIdSonuc.rows[0].firma_id, veri.eczane_id, yeniKod, veri.indirim_yuzdesi, cerezId]
    );
    res.json({ ok: true, kod: yeniKod, yuzde: veri.indirim_yuzdesi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Bir hata oluştu.' });
  }
});

async function eczaciGetir(kod) {
  const result = await pool.query(
    `SELECT e.id as eczane_id, e.ad as eczane_ad,
            f.ad as firma_ad, f.logo_url, f.marka_rengi,
            f.eczaci_baslik, f.eczaci_metin, f.eczaci_pdf_url, f.eczaci_video_url
     FROM eczaneler e JOIN firmalar f ON f.id = e.firma_id
     WHERE e.eczaci_kod = $1`,
    [kod]
  );
  return result.rows[0] || null;
}

// Eczacı kartı PDF tıklama takibi
router.get('/eczaci/:kod/tikla/pdf', async (req, res) => {
  const { kod } = req.params;
  try {
    const veri = await eczaciGetir(kod);
    if (!veri || !veri.eczaci_pdf_url) return res.redirect(`/eczaci/${kod}`);
    await pool.query('INSERT INTO eczaci_tiklamalar (eczane_id, tip) VALUES ($1, $2)', [veri.eczane_id, 'pdf']);
    res.redirect(veri.eczaci_pdf_url);
  } catch (err) {
    console.error(err);
    res.redirect(`/eczaci/${kod}`);
  }
});

// Eczacı kartı sayfası — eczacının kendi okutması
router.get('/eczaci/:kod', async (req, res) => {
  try {
    const veri = await eczaciGetir(req.params.kod);
    if (!veri) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Sayfa bulunamadı.', layout: false });
    }
    try {
      await pool.query('INSERT INTO eczaci_okutmalar (eczane_id) VALUES ($1)', [veri.eczane_id]);
    } catch (kayitHatasi) {
      console.error('eczacı okutma kaydı başarısız:', kayitHatasi);
    }
    veri.eczaci_video_id = youtubeIdCikar(veri.eczaci_video_url);
    const qrHedef = `${req.protocol}://${req.get('host')}/eczaci/${req.params.kod}`;
    res.render('public/eczaci', { title: veri.firma_ad, veri, qrHedef, eczaciKod: req.params.kod, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

// İndirim kodu doğrula — eczacı kendi eczacı sayfasında kodu girer
router.post('/eczaci/:kod/indirim-dogrula', createJsonLimiter('Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.'), async (req, res) => {
  const kod = (req.body.kod || '').trim();
  try {
    const eczaneSonuc = await pool.query('SELECT id AS eczane_id FROM eczaneler WHERE eczaci_kod = $1', [req.params.kod]);
    if (!eczaneSonuc.rows.length) return res.status(404).json({ ok: false, error: 'Eczane bulunamadı.' });
    const eczaneId = eczaneSonuc.rows[0].eczane_id;

    if (!kod) return res.status(400).json({ ok: false, error: 'Kod girilmedi.' });

    const guncelleme = await pool.query(
      `UPDATE indirim_kodlari
       SET kullanildi = true, kullanilma_tarihi = NOW()
       WHERE kod = $1 AND eczane_id = $2 AND kullanildi = false AND olusturulma_tarihi::date = CURRENT_DATE
       RETURNING yuzde`,
      [kod, eczaneId]
    );
    if (guncelleme.rows.length) {
      return res.json({ ok: true, yuzde: guncelleme.rows[0].yuzde });
    }

    const mevcut = await pool.query(
      `SELECT eczane_id, kullanildi, (olusturulma_tarihi::date = CURRENT_DATE) AS bugun
       FROM indirim_kodlari WHERE kod = $1`,
      [kod]
    );
    if (!mevcut.rows.length) return res.status(404).json({ ok: false, error: 'Kod geçersiz.' });
    const satir = mevcut.rows[0];
    if (satir.eczane_id !== eczaneId) return res.status(403).json({ ok: false, error: 'Bu kod bu eczaneye ait değil.' });
    if (!satir.bugun) return res.status(410).json({ ok: false, error: 'Bu kodun süresi dolmuş.' });
    return res.status(409).json({ ok: false, error: 'Bu kod zaten kullanılmış.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Bir hata oluştu.' });
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
    const qrHedef = `${req.protocol}://${req.get('host')}${profilUrl}`;
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const t = cevirmenOlustur(lang);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, profilUrl, qrHedef, lang, t, layout: false });
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
      linkedin: urlNormallestir(calisan.linkedin),
      instagram: instagramLinkOlustur(calisan.instagram),
      twitter: twitterLinkOlustur(calisan.twitter),
      youtube: youtubeLinkOlustur(calisan.youtube),
      website: urlNormallestir(calisan.website),
      whatsapp: calisan.whatsapp ? `https://wa.me/${calisan.whatsapp.replace(/\D/g, '')}` : null,
      tiktok: tiktokLinkOlustur(calisan.tiktok),
      sahibinden: urlNormallestir(calisan.sahibinden),
      hurriyet_emlak: urlNormallestir(calisan.hurriyet_emlak),
      google_yorum: urlNormallestir(calisan.google_yorum_link),
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
    res.redirect(urlNormallestir(result.rows[0].google_yorum_link));
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
    const qrHedef = `${req.protocol}://${req.get('host')}${profilUrl}`;
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const t = cevirmenOlustur(lang);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, profilUrl, qrHedef, lang, t, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

module.exports = router;
