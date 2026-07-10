const { pool } = require('../db');

// Bir müdürün (calisanId) altındaki TÜM zinciri (çok seviyeli, çocuk-çocuk dahil) döner.
// calisanId'nin kendisi listeye dahil edilmez.
async function calisanAltZinciriIdleri(calisanId) {
  const result = await pool.query(
    `WITH RECURSIVE zincir AS (
       SELECT id FROM calisanlar WHERE amiri_id = $1
       UNION ALL
       SELECT c.id FROM calisanlar c JOIN zincir z ON c.amiri_id = z.id
     )
     SELECT id FROM zincir`,
    [calisanId]
  );
  return result.rows.map(r => r.id);
}

// adayAmiriId, hedefCalisanId'nin DOĞRUDAN amiri mi? (dolaylı üst müdürler dahil değil)
async function amiriGecerliMi(adayAmiriId, hedefCalisanId) {
  const result = await pool.query('SELECT amiri_id FROM calisanlar WHERE id = $1', [hedefCalisanId]);
  if (!result.rows.length) return false;
  return result.rows[0].amiri_id === adayAmiriId;
}

module.exports = { calisanAltZinciriIdleri, amiriGecerliMi };
