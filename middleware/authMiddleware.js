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
    return res.redirect('/bayi/giris');
  }
  next();
}

module.exports = { requireFirma, requireSuperadmin, requireBayi };
