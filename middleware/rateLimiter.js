const rateLimit = require('express-rate-limit');

function createLoginLimiter(redirectPath) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      req.flash('error', 'Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');
      res.redirect(redirectPath);
    },
  });
}

const firmaEkleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Çok fazla işlem yaptınız. Lütfen biraz sonra tekrar deneyin.');
    res.redirect('/bayi/panel/firma-ekle');
  },
});

module.exports = { createLoginLimiter, firmaEkleLimiter };
