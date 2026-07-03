const crypto = require('crypto');

// l/1, o/0 gibi karışan karakterler alfabede yok
const KARAKTERLER = 'abcdefghjkmnpqrstuvwxyz23456789';

function eczaneKodUret(uzunluk = 8) {
  const bayt = crypto.randomBytes(uzunluk);
  let kod = '';
  for (let i = 0; i < uzunluk; i++) {
    kod += KARAKTERLER[bayt[i] % KARAKTERLER.length];
  }
  return kod;
}

async function benzersizEczaneKoduUret() {
  const { pool } = require('../db');
  while (true) {
    const kod = eczaneKodUret();
    const sonuc = await pool.query('SELECT id FROM eczaneler WHERE kod = $1', [kod]);
    if (!sonuc.rows.length) return kod;
  }
}

module.exports = { eczaneKodUret, benzersizEczaneKoduUret };
