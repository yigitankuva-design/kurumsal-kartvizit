require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');

async function run() {
  const email = process.argv[2] || 'admin@abdiibrahim.com.tr';
  const newPass = process.argv[3] || 'Test1234!';
  const hash = await bcrypt.hash(newPass, 12);
  const r = await pool.query(
    'UPDATE firmalar SET yetkili_sifre_hash=$1 WHERE yetkili_email=$2 RETURNING yetkili_email',
    [hash, email]
  );
  console.log(r.rows.length ? `Sifre guncellendi: ${r.rows[0].yetkili_email}` : 'Firma bulunamadi');
  await pool.end();
}
run();
