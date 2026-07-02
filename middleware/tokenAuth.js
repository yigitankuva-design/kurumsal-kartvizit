const { bayiTokenDogrula } = require('../utils/jwt');

function requireBayiToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [tip, token] = header.split(' ');
  if (tip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  try {
    const payload = bayiTokenDogrula(token);
    req.bayiId = payload.bayiId;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
}

module.exports = { requireBayiToken };
