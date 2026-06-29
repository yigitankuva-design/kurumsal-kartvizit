CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON    NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

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

CREATE TABLE IF NOT EXISTS firmalar (
  id                 SERIAL PRIMARY KEY,
  ad                 TEXT NOT NULL,
  slug               TEXT UNIQUE NOT NULL,
  logo_url           TEXT,
  marka_rengi        TEXT DEFAULT '#1a73e8',
  sektor             TEXT DEFAULT 'diger',
  yetkili_email      TEXT UNIQUE NOT NULL,
  yetkili_sifre_hash TEXT NOT NULL,
  paket              TEXT DEFAULT 'basic',
  bayi_id            INTEGER REFERENCES bayiler(id) ON DELETE SET NULL,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calisanlar (
  id                  SERIAL PRIMARY KEY,
  firma_id            INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
  ad                  TEXT NOT NULL,
  soyad               TEXT NOT NULL,
  unvan               TEXT,
  departman           TEXT,
  telefon             TEXT,
  email               TEXT,
  linkedin            TEXT,
  foto_url            TEXT,
  biyografi           TEXT,
  ilaclar             TEXT[],
  slug                TEXT NOT NULL,
  durum               TEXT DEFAULT 'aktif',
  goruntuleme_sayisi  INTEGER DEFAULT 0,
  instagram           TEXT,
  twitter             TEXT,
  youtube             TEXT,
  website             TEXT,
  created_at          TIMESTAMP DEFAULT NOW(),
  UNIQUE(firma_id, slug)
);

CREATE TABLE IF NOT EXISTS link_tiklama (
  id          SERIAL PRIMARY KEY,
  calisan_id  INTEGER REFERENCES calisanlar(id) ON DELETE CASCADE,
  tip         TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);
