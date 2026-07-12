require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const methodOverride = require('method-override');
const ejsLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('./db');
const { hiyerarsiAgaciKur, mumessilPerformansi } = require('./utils/sahaAnaliz');

const authRoutes = require('./routes/auth');
const panelRoutes = require('./routes/panel');
const superadminRoutes = require('./routes/superadmin');
const bayiRoutes = require('./routes/bayi');
const mobilApiRoutes = require('./routes/mobilApi');
const kurumsalRoutes = require('./routes/kurumsal');
const kullaniciRoutes = require('./routes/kullanicilar');
const { router: odemeRoutes } = require('./routes/odeme');
const publicRoutes = require('./routes/public');
const dosyaRoutes = require('./routes/dosya');
const { requireFirma, requireKurumsalPaket, requireRolIzni } = require('./middleware/authMiddleware');
const { createLoginLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false, // Landing/dashboard/profil sayfalarındaki inline <style>/<script> kullanımı nedeniyle bu fazda kapalı
}));

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layout');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride((req) => {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
  return req.query._method;
}));

app.use(session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(flash());
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.session = req.session;
  next();
});

app.use('/firma', authRoutes);
app.use('/firma/panel', requireFirma, requireRolIzni('tam_yetkili', 'sadece_calisan'), panelRoutes);
app.use('/superadmin', superadminRoutes);
app.use('/bayi', bayiRoutes);
app.use('/bayi', odemeRoutes);
app.use('/api/mobil', mobilApiRoutes);
app.use('/dosya', dosyaRoutes);
app.use('/kurumsal', requireFirma, requireKurumsalPaket, requireRolIzni('tam_yetkili', 'sadece_saha'), kurumsalRoutes);
app.use('/firma/kullanicilar', requireFirma, requireRolIzni('tam_yetkili'), kullaniciRoutes);

// Tek giriş noktası: firma, bayi veya süperadmin — hangisi eşleşirse ona giriş yapılır
const girisLimiter = createLoginLimiter('/');
app.post('/giris', girisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    req.flash('error', 'E-posta/kullanıcı adı ve şifre gerekli.');
    return res.redirect('/');
  }
  try {
    const suKullaniciAdi = (process.env.SUPERADMIN_USERNAME || '').trim();
    const suSifre = (process.env.SUPERADMIN_PASSWORD || '').trim();
    if (giris_bilgisi.trim() === suKullaniciAdi && sifre.trim() === suSifre) {
      req.session.superadmin = true;
      return res.redirect('/');
    }

    const firmaSonuc = await pool.query(
      'SELECT * FROM firmalar WHERE LOWER(yetkili_email) = LOWER($1) OR LOWER(kullanici_adi) = LOWER($1)',
      [giris_bilgisi]
    );
    if (firmaSonuc.rows.length) {
      const firma = firmaSonuc.rows[0];
      if (await bcrypt.compare(sifre, firma.yetkili_sifre_hash)) {
        req.session.firmaId = firma.id;
        return res.redirect('/');
      }
    }

    const kullaniciSonuc = await pool.query(
      'SELECT * FROM firma_kullanicilari WHERE LOWER(email) = LOWER($1)',
      [giris_bilgisi]
    );
    if (kullaniciSonuc.rows.length) {
      const kullanici = kullaniciSonuc.rows[0];
      if (await bcrypt.compare(sifre, kullanici.sifre_hash)) {
        req.session.firmaId = kullanici.firma_id;
        req.session.rol = kullanici.rol;
        return res.redirect('/');
      }
    }

    const bayiSonuc = await pool.query(
      'SELECT * FROM bayiler WHERE (LOWER(email) = LOWER($1) OR LOWER(kullanici_adi) = LOWER($1)) AND aktif = true',
      [giris_bilgisi]
    );
    if (bayiSonuc.rows.length) {
      const bayi = bayiSonuc.rows[0];
      if (await bcrypt.compare(sifre, bayi.sifre_hash)) {
        req.session.bayiId = bayi.id;
        req.session.bayiAd = bayi.ad;
        return res.redirect('/');
      }
    }

    req.flash('error', 'E-posta/kullanıcı adı veya şifre hatalı.');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/');
  }
});

// Ana sayfa: giriş yapılmışsa dashboard (firma, bayi ya da süperadmin), yoksa landing
app.get('/', async (req, res) => {
  if (req.session.superadmin) {
    try {
      const firmalarResult = await pool.query(`
        SELECT f.*, COUNT(c.id) as calisan_sayisi, b.ad as bayi_ad
        FROM firmalar f
        LEFT JOIN calisanlar c ON c.firma_id = f.id
        LEFT JOIN bayiler b ON b.id = f.bayi_id
        GROUP BY f.id, b.ad ORDER BY f.created_at DESC
      `);
      const bayilerResult = await pool.query('SELECT * FROM bayiler ORDER BY created_at DESC');
      const tab = req.query.tab || 'firmalar';
      return res.render('public/admin-dashboard', {
        layout: false, firmalar: firmalarResult.rows, bayiler: bayilerResult.rows, tab
      });
    } catch (err) {
      console.error(err);
      return res.render('public/landing', { layout: false, error: ['Bir hata oluştu.'], success: [] });
    }
  }

  if (req.session.bayiId) {
    try {
      const bayiResult = await pool.query('SELECT * FROM bayiler WHERE id = $1', [req.session.bayiId]);
      if (!bayiResult.rows.length) {
        req.session.destroy(() => {});
        return res.render('public/landing', { layout: false, error: ['Oturum sona erdi.'], success: [] });
      }
      const bayi = bayiResult.rows[0];
      const firmaId = req.query.firma;

      if (firmaId) {
        const firmaResult = await pool.query(
          'SELECT * FROM firmalar WHERE id = $1 AND bayi_id = $2',
          [firmaId, bayi.id]
        );
        if (!firmaResult.rows.length) return res.redirect('/');
        const firma = firmaResult.rows[0];
        const calisanlarResult = await pool.query(
          'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
          [firmaId]
        );
        const calisanlar = calisanlarResult.rows;
        return res.render('public/bayi-dashboard', {
          layout: false, view: 'calisanlar', bayi, firma, calisanlar,
          aktifSayisi: calisanlar.filter(c => c.durum === 'aktif').length,
          pasifSayisi: calisanlar.filter(c => c.durum === 'pasif').length,
        });
      }

      const firmalarResult = await pool.query(
        `SELECT f.*, COUNT(c.id) as calisan_sayisi
         FROM firmalar f LEFT JOIN calisanlar c ON c.firma_id = f.id
         WHERE f.bayi_id = $1 GROUP BY f.id ORDER BY f.created_at DESC`,
        [bayi.id]
      );
      return res.render('public/bayi-dashboard', {
        layout: false, view: 'musteriler', bayi, firmalar: firmalarResult.rows
      });
    } catch (err) {
      console.error(err);
      return res.render('public/landing', { layout: false, error: ['Bir hata oluştu.'], success: [] });
    }
  }

  if (!req.session.firmaId) {
    return res.render('public/landing', { layout: false });
  }
  try {
    const firmaResult = await pool.query('SELECT * FROM firmalar WHERE id = $1', [req.session.firmaId]);
    if (!firmaResult.rows.length) {
      req.session.destroy(() => {});
      return res.render('public/landing', { layout: false, error: ['Oturum sona erdi.'], success: [] });
    }
    const firma = firmaResult.rows[0];
    const calisanlarResult = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
      [req.session.firmaId]
    );
    const calisanlar = calisanlarResult.rows;
    const aktifSayisi = calisanlar.filter(c => c.durum === 'aktif').length;
    const pasifSayisi = calisanlar.filter(c => c.durum === 'pasif').length;
    const toplamGoruntulenme = calisanlar.reduce((sum, c) => sum + (c.goruntuleme_sayisi || 0), 0);
    let tab = req.query.tab || 'calisanlar';
    const CALISAN_ROLU_TABLARI = ['calisanlar', 'istatistik', 'excel', 'genel', 'analytics', 'gecmis', 'organizasyon'];
    const SAHA_ROLU_TABLARI = ['icerik', 'urunler', 'indirim', 'raf', 'saha', 'genel', 'analytics', 'gecmis'];
    if (req.session.rol === 'sadece_calisan' && !CALISAN_ROLU_TABLARI.includes(tab)) tab = 'calisanlar';
    if (req.session.rol === 'sadece_saha' && !SAHA_ROLU_TABLARI.includes(tab)) tab = 'genel';
    if (tab === 'kullanicilar' && req.session.rol && req.session.rol !== 'tam_yetkili') tab = 'genel';

    let islemGecmisi = [];
    if (tab === 'gecmis') {
      const gResult = await pool.query(
        'SELECT * FROM islem_gecmisi WHERE firma_id = $1 ORDER BY created_at DESC LIMIT 100',
        [req.session.firmaId]
      );
      islemGecmisi = gResult.rows;
    }

    let kullanicilarListesi = [];
    if (tab === 'kullanicilar' && (!req.session.rol || req.session.rol === 'tam_yetkili')) {
      const kullanicilarSonuc = await pool.query(
        'SELECT id, ad, email, rol, created_at FROM firma_kullanicilari WHERE firma_id = $1 ORDER BY created_at DESC',
        [req.session.firmaId]
      );
      kullanicilarListesi = kullanicilarSonuc.rows;
    }

    let hiyerarsiAgaci = [];
    if (tab === 'organizasyon' && calisanlar.length) {
      const ziyaretSayiResult = await pool.query(
        `SELECT z.calisan_id, COUNT(*) AS sayi
         FROM ziyaretler z JOIN calisanlar c ON c.id = z.calisan_id
         WHERE c.firma_id = $1 AND z.created_at >= NOW() - INTERVAL '90 days'
         GROUP BY z.calisan_id`,
        [req.session.firmaId]
      );
      const ziyaretMap = {};
      ziyaretSayiResult.rows.forEach(r => { ziyaretMap[r.calisan_id] = Number(r.sayi); });
      const aktifCalisanlar = calisanlar.filter(c => c.durum === 'aktif');
      hiyerarsiAgaci = hiyerarsiAgaciKur(aktifCalisanlar, ziyaretMap);
    }

    let genelBakis = null;
    if (tab === 'genel' && calisanlar.length) {
      const buDonemResult = await pool.query(
        `SELECT COUNT(*) AS toplam, COUNT(*) FILTER (WHERE lt.tip = 'profil_goruntuleme') AS goruntuleme
         FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
         WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '7 days'`,
        [req.session.firmaId]
      );
      const oncekiDonemResult = await pool.query(
        `SELECT COUNT(*) AS toplam, COUNT(*) FILTER (WHERE lt.tip = 'profil_goruntuleme') AS goruntuleme
         FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
         WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '14 days' AND lt.created_at < NOW() - INTERVAL '7 days'`,
        [req.session.firmaId]
      );
      const gunlukResult = await pool.query(
        `SELECT DATE(lt.created_at) AS gun, COUNT(*) AS sayi
         FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
         WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '14 days'
         GROUP BY gun ORDER BY gun`,
        [req.session.firmaId]
      );
      const isiHaritasiResult = await pool.query(
        `SELECT DATE(lt.created_at) AS gun, COUNT(*) AS sayi
         FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
         WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '90 days'
         GROUP BY gun ORDER BY gun`,
        [req.session.firmaId]
      );
      const dagilimResult = await pool.query(
        `SELECT lt.tip, COUNT(*) AS sayi
         FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
         WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '90 days'
         GROUP BY lt.tip ORDER BY sayi DESC`,
        [req.session.firmaId]
      );
      const liderlikResult = await pool.query(
        `SELECT c.ad, c.soyad, COUNT(*) AS sayi
         FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
         WHERE c.firma_id = $1 AND lt.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY c.id, c.ad, c.soyad ORDER BY sayi DESC LIMIT 5`,
        [req.session.firmaId]
      );

      const buDonem = buDonemResult.rows[0];
      const oncekiDonem = oncekiDonemResult.rows[0];

      const yuzdeDegisim = (yeni, eski) => {
        yeni = Number(yeni); eski = Number(eski);
        if (eski === 0) return yeni > 0 ? null : 0;
        return Math.round(((yeni - eski) / eski) * 100);
      };

      const gunlukHarita = {};
      gunlukResult.rows.forEach(r => {
        gunlukHarita[r.gun.toISOString().slice(0, 10)] = Number(r.sayi);
      });
      const bugunUtc = new Date();
      bugunUtc.setUTCHours(0, 0, 0, 0);
      const sparkline = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(bugunUtc);
        d.setUTCDate(d.getUTCDate() - i);
        sparkline.push(gunlukHarita[d.toISOString().slice(0, 10)] || 0);
      }

      const isiHaritaHarita = {};
      isiHaritasiResult.rows.forEach(r => {
        isiHaritaHarita[r.gun.toISOString().slice(0, 10)] = Number(r.sayi);
      });
      const isiGunleri = [];
      for (let i = 89; i >= 0; i--) {
        const d = new Date(bugunUtc);
        d.setUTCDate(d.getUTCDate() - i);
        isiGunleri.push({ tarih: d.toISOString().slice(0, 10), sayi: isiHaritaHarita[d.toISOString().slice(0, 10)] || 0 });
      }
      const isiMax = Math.max(1, ...isiGunleri.map(g => g.sayi));
      const isiHaritasi = isiGunleri.map(g => ({
        tarih: g.tarih,
        sayi: g.sayi,
        seviye: g.sayi === 0 ? 0 : Math.min(4, Math.ceil((g.sayi / isiMax) * 4))
      }));

      genelBakis = {
        tiklamaBuDonem: Number(buDonem.toplam),
        tiklamaDegisim: yuzdeDegisim(buDonem.toplam, oncekiDonem.toplam),
        goruntulemeBuDonem: Number(buDonem.goruntuleme),
        goruntulemeDegisim: yuzdeDegisim(buDonem.goruntuleme, oncekiDonem.goruntuleme),
        sparkline,
        isiHaritasi,
        tiklamaDagilimi: dagilimResult.rows.map(r => ({ tip: r.tip, sayi: Number(r.sayi) })),
        liderlikTablosu: liderlikResult.rows.map(r => ({ ad: r.ad, soyad: r.soyad, sayi: Number(r.sayi) }))
      };
    }

    let linkAnalytics = [];
    if (tab === 'analytics' && calisanlar.length) {
      const aResult = await pool.query(
        `SELECT c.ad, c.soyad, lt.tip, COUNT(*) as sayi
         FROM link_tiklama lt JOIN calisanlar c ON c.id = lt.calisan_id
         WHERE c.firma_id = $1
         GROUP BY c.ad, c.soyad, lt.tip ORDER BY sayi DESC`,
        [req.session.firmaId]
      );
      linkAnalytics = aResult.rows;
    }

    let eczaneler = [];
    if (tab === 'raf' && firma.paket === 'kurumsal') {
      const eczanelerResult = await pool.query(
        `SELECT e.*, (SELECT COUNT(*) FROM raf_okutmalar r WHERE r.eczane_id = e.id) as okutma_sayisi,
           (SELECT COUNT(*) FROM eczaci_okutmalar eo WHERE eo.eczane_id = e.id) as eczaci_okutma_sayisi
         FROM eczaneler e WHERE e.firma_id = $1 ORDER BY e.created_at DESC`,
        [req.session.firmaId]
      );
      eczaneler = eczanelerResult.rows;
    }

    const urunlerSonuc = firma.paket === 'kurumsal'
      ? await pool.query('SELECT * FROM urunler WHERE firma_id = $1 ORDER BY sira', [firma.id])
      : { rows: [] };

    let indirimIstatistik = { toplamUretilen: 0, toplamKullanilan: 0, eczaneBazli: [] };
    if (tab === 'indirim' && firma.paket === 'kurumsal') {
      const toplamResult = await pool.query(
        `SELECT COUNT(*) AS uretilen, COUNT(*) FILTER (WHERE kullanildi) AS kullanilan
         FROM indirim_kodlari WHERE firma_id = $1`,
        [req.session.firmaId]
      );
      const eczaneBazliResult = await pool.query(
        `SELECT e.ad, COUNT(*) FILTER (WHERE i.kullanildi) AS kullanilan_sayi
         FROM indirim_kodlari i JOIN eczaneler e ON e.id = i.eczane_id
         WHERE i.firma_id = $1
         GROUP BY e.id, e.ad
         HAVING COUNT(*) FILTER (WHERE i.kullanildi) > 0
         ORDER BY kullanilan_sayi DESC`,
        [req.session.firmaId]
      );
      indirimIstatistik = {
        toplamUretilen: Number(toplamResult.rows[0].uretilen),
        toplamKullanilan: Number(toplamResult.rows[0].kullanilan),
        eczaneBazli: eczaneBazliResult.rows.map(r => ({ ad: r.ad, kullanilanSayi: Number(r.kullanilan_sayi) })),
      };
    }

    let sahaIstatistik = { gunlukZiyaret: [], temsilciZiyaret: [], eczaneOkutma: [], tiklamaDagilimi: [], tiklamaDagilimiEczaneBazli: [], ziyaretEdilmeyenEczaneler: [], ziyaretNotlari: [] };
    if (tab === 'saha' && firma.paket === 'kurumsal') {
      const gunlukResult = await pool.query(
        `SELECT TO_CHAR(z.created_at, 'YYYY-MM-DD') AS gun, COUNT(*) AS sayi
         FROM ziyaretler z JOIN calisanlar c ON c.id = z.calisan_id
         WHERE c.firma_id = $1 AND z.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY gun ORDER BY gun`,
        [req.session.firmaId]
      );
      const temsilciResult = await pool.query(
        `SELECT c.ad, c.soyad, COUNT(*) AS sayi
         FROM ziyaretler z JOIN calisanlar c ON c.id = z.calisan_id
         WHERE c.firma_id = $1
         GROUP BY c.id, c.ad, c.soyad ORDER BY sayi DESC LIMIT 10`,
        [req.session.firmaId]
      );
      const eczaneIstatistikResult = await pool.query(
        `SELECT e.ad, COUNT(*) AS sayi
         FROM raf_okutmalar r JOIN eczaneler e ON e.id = r.eczane_id
         WHERE e.firma_id = $1
         GROUP BY e.id, e.ad ORDER BY sayi DESC LIMIT 10`,
        [req.session.firmaId]
      );
      const tiklamaResult = await pool.query(
        `SELECT t.tip, COUNT(*) AS sayi
         FROM raf_tiklamalar t JOIN eczaneler e ON e.id = t.eczane_id
         WHERE e.firma_id = $1
         GROUP BY t.tip ORDER BY sayi DESC`,
        [req.session.firmaId]
      );
      const tiklamaEczaneBazliResult = await pool.query(
        `SELECT e.ad AS eczane_ad, t.tip, COUNT(*) AS sayi
         FROM raf_tiklamalar t JOIN eczaneler e ON e.id = t.eczane_id
         WHERE e.firma_id = $1
         GROUP BY e.id, e.ad, t.tip ORDER BY e.ad, sayi DESC`,
        [req.session.firmaId]
      );
      const ziyaretEdilmeyenResult = await pool.query(
        `SELECT e.ad, MAX(z.created_at) as son_ziyaret
         FROM eczaneler e
         LEFT JOIN ziyaretler z ON z.eczane_id = e.id
         WHERE e.firma_id = $1
         GROUP BY e.id, e.ad
         HAVING MAX(z.created_at) IS NULL OR MAX(z.created_at) < NOW() - INTERVAL '60 days'
         ORDER BY son_ziyaret ASC NULLS FIRST`,
        [req.session.firmaId]
      );
      const notlarResult = await pool.query(
        `SELECT c.ad, c.soyad, e.ad AS eczane_ad, z.created_at
         FROM ziyaretler z
         JOIN calisanlar c ON c.id = z.calisan_id
         JOIN eczaneler e ON e.id = z.eczane_id
         WHERE c.firma_id = $1 AND z.temsilci_notu IS NOT NULL
         ORDER BY z.created_at DESC LIMIT 20`,
        [req.session.firmaId]
      );
      sahaIstatistik = {
        gunlukZiyaret: gunlukResult.rows.map(r => ({ gun: r.gun, sayi: Number(r.sayi) })),
        temsilciZiyaret: temsilciResult.rows.map(r => ({ ad: r.ad, soyad: r.soyad, sayi: Number(r.sayi) })),
        eczaneOkutma: eczaneIstatistikResult.rows.map(r => ({ ad: r.ad, sayi: Number(r.sayi) })),
        tiklamaDagilimi: tiklamaResult.rows.map(r => ({ tip: r.tip, sayi: Number(r.sayi) })),
        tiklamaDagilimiEczaneBazli: tiklamaEczaneBazliResult.rows.map(r => ({ eczaneAd: r.eczane_ad, tip: r.tip, sayi: Number(r.sayi) })),
        ziyaretEdilmeyenEczaneler: ziyaretEdilmeyenResult.rows.map(r => ({ ad: r.ad, sonZiyaret: r.son_ziyaret })),
        ziyaretNotlari: notlarResult.rows.map(r => ({
          ad: r.ad, soyad: r.soyad, eczaneAd: r.eczane_ad, notVarMi: true, tarih: r.created_at
        })),
      };
    }

    const ara = req.query.ara || '';
    const sayfa = parseInt(req.query.sayfa, 10) || 1;

    res.render('public/dashboard', {
      layout: false, firma, calisanlar, aktifSayisi, pasifSayisi,
      toplamGoruntulenme, tab, linkAnalytics, eczaneler, sahaIstatistik, urunler: urunlerSonuc.rows,
      indirimIstatistik, ara, sayfa, islemGecmisi, genelBakis, kullanicilarListesi, hiyerarsiAgaci, rol: req.session.rol
    });
  } catch (err) {
    console.error(err);
    res.render('public/landing', { layout: false, error: ['Bir hata oluştu.'], success: [] });
  }
});

app.get('/health', (req, res) => res.sendStatus(200));

app.use('/', publicRoutes);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Sunucu çalışıyor: http://localhost:${PORT}`));
}

module.exports = app;
