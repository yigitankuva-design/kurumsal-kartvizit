const crypto = require('crypto');

function ipHashOlustur(ip) {
  return crypto.createHash('sha256').update(ip + (process.env.IP_HASH_SALT || 'dev-salt')).digest('hex');
}

module.exports = { ipHashOlustur };
