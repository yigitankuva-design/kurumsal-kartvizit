require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const methodOverride = require('method-override');
const ejsLayouts = require('express-ejs-layouts');
const path = require('path');
const { pool } = require('./db');

const authRoutes = require('./routes/auth');
const panelRoutes = require('./routes/panel');
const superadminRoutes = require('./routes/superadmin');
const publicRoutes = require('./routes/public');

const app = express();

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
app.use('/firma/panel', panelRoutes);
app.use('/superadmin', superadminRoutes);
app.use('/', publicRoutes);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Sunucu çalışıyor: http://localhost:${PORT}`));
}

module.exports = app;
