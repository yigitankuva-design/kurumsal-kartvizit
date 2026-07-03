const jwt = require('jsonwebtoken');

function secretAl() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET tanımlı değil.');
  return secret;
}

function bayiTokenUret(bayiId) {
  return jwt.sign({ bayiId }, secretAl(), { expiresIn: '30d' });
}

function bayiTokenDogrula(token) {
  return jwt.verify(token, secretAl());
}

function calisanTokenUret(calisanId) {
  return jwt.sign({ calisanId }, secretAl(), { expiresIn: '30d' });
}

function calisanTokenDogrula(token) {
  return jwt.verify(token, secretAl());
}

module.exports = { bayiTokenUret, bayiTokenDogrula, calisanTokenUret, calisanTokenDogrula };
