const crypto = require('crypto');

function indirimKoduUret() {
  const bayt = crypto.randomBytes(3);
  let kod = '';
  for (let i = 0; i < 3; i++) {
    kod += String(bayt[i] % 100).padStart(2, '0');
  }
  return kod;
}

async function benzersizIndirimKoduUret() {
  const { pool } = require('../db');
  while (true) {
    const kod = indirimKoduUret();
    const sonuc = await pool.query('SELECT id FROM indirim_kodlari WHERE kod = $1', [kod]);
    if (!sonuc.rows.length) return kod;
  }
}

module.exports = { indirimKoduUret, benzersizIndirimKoduUret };
