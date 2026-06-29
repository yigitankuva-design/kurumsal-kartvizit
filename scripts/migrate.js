const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS bayiler (
        id            SERIAL PRIMARY KEY,
        ad            TEXT NOT NULL,
        slug          TEXT UNIQUE NOT NULL,
        logo_url      TEXT,
        marka_rengi   TEXT DEFAULT '#1a73e8',
        email         TEXT UNIQUE NOT NULL,
        sifre_hash    TEXT NOT NULL,
        aktif         BOOLEAN DEFAULT true,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ bayiler tablosu oluşturuldu');

    await client.query(`
      ALTER TABLE firmalar
        ADD COLUMN IF NOT EXISTS bayi_id INTEGER REFERENCES bayiler(id) ON DELETE SET NULL;
    `);
    console.log('✓ firmalar.bayi_id kolonu eklendi');

    console.log('\nMigration tamamlandı.');
  } catch (err) {
    console.error('Migration hatası:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
