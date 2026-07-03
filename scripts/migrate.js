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
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS whatsapp TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS tiktok TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS sahibinden TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS hurriyet_emlak TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS adres TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS google_yorum_link TEXT`,
    `ALTER TABLE bayiler ADD COLUMN IF NOT EXISTS kredi_bakiyesi INTEGER DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS odemeler (
      id                  SERIAL PRIMARY KEY,
      bayi_id             INTEGER REFERENCES bayiler(id) ON DELETE CASCADE,
      paytr_merchant_oid  TEXT UNIQUE NOT NULL,
      kredi_miktari       INTEGER NOT NULL,
      tutar               NUMERIC(10,2) NOT NULL,
      durum               TEXT DEFAULT 'beklemede',
      created_at          TIMESTAMP DEFAULT NOW(),
      onaylanma_tarihi    TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS kredi_hareketleri (
      id           SERIAL PRIMARY KEY,
      bayi_id      INTEGER REFERENCES bayiler(id) ON DELETE CASCADE,
      tip          TEXT NOT NULL,
      miktar       INTEGER NOT NULL,
      aciklama     TEXT,
      firma_id     INTEGER REFERENCES firmalar(id) ON DELETE SET NULL,
      odeme_id     INTEGER REFERENCES odemeler(id) ON DELETE SET NULL,
      created_at   TIMESTAMP DEFAULT NOW()
    )`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS kullanici_adi TEXT UNIQUE`,
    `ALTER TABLE bayiler ADD COLUMN IF NOT EXISTS kullanici_adi TEXT UNIQUE`,
    `ALTER TABLE bayiler ADD COLUMN IF NOT EXISTS abonelik_bitis_tarihi DATE`,
    `CREATE TABLE IF NOT EXISTS eczaneler (
      id          SERIAL PRIMARY KEY,
      firma_id    INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
      ad          TEXT NOT NULL,
      adres       TEXT,
      kod         TEXT UNIQUE NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS raf_okutmalar (
      id          SERIAL PRIMARY KEY,
      eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS raf_tiklamalar (
      id          SERIAL PRIMARY KEY,
      eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
      tip         TEXT NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS katalog_url TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS website TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS instagram TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS linkedin TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS twitter TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS youtube TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS tiktok TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS whatsapp TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS giris_email TEXT UNIQUE`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS giris_sifre_hash TEXT`,
    `CREATE TABLE IF NOT EXISTS ziyaretler (
      id          SERIAL PRIMARY KEY,
      calisan_id  INTEGER REFERENCES calisanlar(id) ON DELETE CASCADE,
      eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
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
