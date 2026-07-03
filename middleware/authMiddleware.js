function requireFirma(req, res, next) {
  if (!req.session.firmaId) {
    req.flash('error', 'Lütfen giriş yapın.');
    return res.redirect('/firma/giris');
  }
  next();
}

function requireSuperadmin(req, res, next) {
  if (!req.session.superadmin) {
    req.flash('error', 'Lütfen yönetici girişi yapın.');
    return res.redirect('/');
  }
  next();
}

function requireBayi(req, res, next) {
  if (!req.session.bayiId) {
    req.flash('error', 'Lütfen bayi girişi yapın.');
    return res.redirect('/');
  }
  next();
}

async function requireKurumsalPaket(req, res, next) {
  try {
    const { pool } = require('../db');
    const r = await pool.query('SELECT paket FROM firmalar WHERE id = $1', [req.session.firmaId]);
    if (!r.rows.length || r.rows[0].paket !== 'kurumsal') return res.redirect('/');
    next();
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
}

module.exports = { requireFirma, requireSuperadmin, requireBayi, requireKurumsalPaket };
