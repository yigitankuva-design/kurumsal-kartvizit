require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const migrations = [
    `CREATE TABLE IF NOT EXISTS bayiler (
      id            SERIAL PRIMARY KEY,
      ad            TEXT NOT NULL,
      slug          TEXT UNIQUE NOT NULL,
      logo_url      TEXT,
      marka_rengi   TEXT DEFAULT '#1a73e8',
      email         TEXT UNIQUE NOT NULL,
      sifre_hash    TEXT NOT NULL,
      aktif         BOOLEAN DEFAULT true,
      created_at    TIMESTAMP DEFAULT NOW()
    )`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS bayi_id INTEGER REFERENCES bayiler(id) ON DELETE SET NULL`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS instagram TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS twitter TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS youtube TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS website TEXT`,
    `CREATE TABLE IF NOT EXISTS link_tiklama (
      id          SERIAL PRIMARY KEY,
      calisan_id  INTEGER REFERENCES calisanlar(id) ON DELETE CASCADE,
      tip         TEXT NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log('OK:', sql.trim().slice(0, 60));
    } catch (err) {
      console.error('HATA:', err.message);
    }
  }
  await pool.end();
  console.log('\nMigration tamamlandı.');
}

migrate();
