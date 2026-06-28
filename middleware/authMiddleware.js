function requireFirma(req, res, next) {
  if (!req.session.firmaId) {
    req.flash('error', 'Lütfen giriş yapın.');
    return res.redirect('/firma/giris');
  }
  next();
}

function requireSuperadmin(req, res, next) {
  if (!req.session.superadmin) {
    return res.redirect('/superadmin/giris');
  }
  next();
}

module.exports = { requireFirma, requireSuperadmin };
