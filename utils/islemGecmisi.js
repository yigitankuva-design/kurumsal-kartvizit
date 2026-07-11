const { pool } = require('../db');

async function islemKaydet(firmaId, islem, hedefTip = null, hedefId = null, aciklama = null) {
  await pool.query(
    'INSERT INTO islem_gecmisi (firma_id, islem, hedef_tip, hedef_id, aciklama) VALUES ($1, $2, $3, $4, $5)',
    [firmaId, islem, hedefTip, hedefId, aciklama]
  );
}

module.exports = { islemKaydet };
