require('dotenv').config();
const { pool } = require('../db');
pool.query("SELECT yetkili_email, created_at FROM firmalar ORDER BY created_at").then(r => {
  r.rows.forEach(f => console.log(f));
  pool.end();
});
