require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const methodOverride = require('method-override');
const ejsLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const path = require('path');
const { pool } = require('./db');

const authRoutes = require('./routes/auth');
const panelRoutes = require('./routes/panel');
const superadminRoutes = require('./routes/superadmin');
const bayiRoutes = require('./routes/bayi');
const publicRoutes = require('./routes/public');
const { requireFirma } = require('./middleware/authMiddleware');

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
app.use(methodOverride('_method'));

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
app.use('/firma/panel', requireFirma, panelRoutes);
app.use('/superadmin', superadminRoutes);
app.use('/bayi', bayiRoutes);

// Ana sayfa: giriş yapılmışsa dashboard, yoksa landing
app.get('/', async (req, res) => {
  const error = req.flash('error');
  const success = req.flash('success');
  if (!req.session.firmaId) {
    return res.render('public/landing', { layout: false, error, success });
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
    const tab = req.query.tab || 'calisanlar';

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

    res.render('public/dashboard', {
      layout: false, firma, calisanlar, aktifSayisi, pasifSayisi,
      toplamGoruntulenme, tab, linkAnalytics, error, success
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
