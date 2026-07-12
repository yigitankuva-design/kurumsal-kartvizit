const { bayiTokenDogrula, calisanTokenDogrula, firmaTokenDogrula } = require('../utils/jwt');
const { pool } = require('../db');

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

async function requireCalisanToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [tip, token] = header.split(' ');
  if (tip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  try {
    const payload = calisanTokenDogrula(token);
    const kontrol = await pool.query("SELECT id FROM calisanlar WHERE id = $1 AND durum != 'silindi'", [payload.calisanId]);
    if (!kontrol.rows.length) {
      return res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
    }
    req.calisanId = payload.calisanId;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
}

function requireFirmaToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [tip, token] = header.split(' ');
  if (tip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  try {
    const payload = firmaTokenDogrula(token);
    req.firmaId = payload.firmaId;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
}

module.exports = { requireBayiToken, requireCalisanToken, requireFirmaToken };
