# Kurumsal NFC Kartvizit Sistemi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Büyük firmaların çalışanlarına NFC dijital kartvizit sağlayan, firma yetkilisinin çalışanlarını yönettiği kurumsal bir web sistemi.

**Architecture:** Domain-bazlı modüler Express uygulaması. Her alan kendi router'ında (auth, panel, superadmin, public). PostgreSQL için `pg` pool, dosya depolama için Railway Object Storage (S3-uyumlu), şablon için EJS.

**Tech Stack:** Node.js, Express, EJS, PostgreSQL (`pg`), bcrypt, express-session, nanoid@3, multer, @aws-sdk/client-s3, xlsx, Jest, Supertest

---

## Dosya Yapısı

```
kurumsal-kartvizit/
├── app.js
├── package.json
├── .env.example
├── .gitignore
├── db/
│   ├── index.js           → pg pool
│   └── schema.sql         → CREATE TABLE ifadeleri
├── routes/
│   ├── auth.js            → /firma/giris, /firma/kayit, /firma/cikis
│   ├── panel.js           → /firma/panel/**
│   ├── superadmin.js      → /superadmin/**
│   └── public.js          → /:firma-slug/:calisan-slug
├── middleware/
│   ├── authMiddleware.js  → session kontrolü
│   └── upload.js          → Railway Object Storage (multer-s3)
├── views/
│   ├── layout.ejs         → base template (head, nav, flash)
│   ├── auth/
│   │   ├── giris.ejs
│   │   └── kayit.ejs
│   ├── panel/
│   │   ├── panel.ejs      → tab'lı ana panel
│   │   ├── ekle.ejs
│   │   └── duzenle.ejs
│   ├── superadmin/
│   │   ├── giris.ejs
│   │   └── index.ejs
│   └── public/
│       ├── profil.ejs
│       └── 404.ejs
├── public/
│   ├── css/style.css
│   └── js/panel.js        → tab switching
└── utils/
    ├── slug.js             → nanoid + Türkçe normalize
    ├── vcf.js              → vCard 3.0 üretimi
    └── excel.js            → xlsx parsing
```

---

## Task 1: Proje Kurulumu

**Files:**
- Create: `package.json`
- Create: `app.js`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `public/css/style.css` (boş)
- Create: `public/js/panel.js` (boş)

- [ ] **Step 1: package.json oluştur**

```bash
cd kurumsal-kartvizit
npm init -y
```

- [ ] **Step 2: Bağımlılıkları yükle**

```bash
npm install express ejs pg bcrypt express-session connect-pg-simple \
  nanoid@3 multer @aws-sdk/client-s3 @aws-sdk/lib-storage \
  multer-s3 xlsx connect-flash method-override
npm install --save-dev jest supertest dotenv nodemon
```

- [ ] **Step 3: package.json'a scripts ekle**

`package.json` içindeki `"scripts"` bölümünü şu şekilde güncelle:

```json
"scripts": {
  "start": "node app.js",
  "dev": "nodemon app.js",
  "test": "jest --testEnvironment node --forceExit"
}
```

- [ ] **Step 4: .gitignore oluştur**

```
node_modules/
.env
*.xlsx
```

- [ ] **Step 5: .env.example oluştur**

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
SESSION_SECRET=degistir_bunu_guclu_bir_sifre
SUPERADMIN_PASSWORD=superadmin_sifresi
RAILWAY_STORAGE_BUCKET=bucket-adi
RAILWAY_STORAGE_ENDPOINT=https://...railway.app
RAILWAY_STORAGE_ACCESS_KEY=xxx
RAILWAY_STORAGE_SECRET_KEY=xxx
PORT=3000
```

- [ ] **Step 6: app.js oluştur**

```javascript
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const { pool } = require('./db');

const authRoutes = require('./routes/auth');
const panelRoutes = require('./routes/panel');
const superadminRoutes = require('./routes/superadmin');
const publicRoutes = require('./routes/public');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use(session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(flash());
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

app.use('/firma', authRoutes);
app.use('/firma/panel', panelRoutes);
app.use('/superadmin', superadminRoutes);
app.use('/', publicRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu çalışıyor: http://localhost:${PORT}`));

module.exports = app;
```

- [ ] **Step 7: Klasörleri oluştur**

```bash
mkdir -p db routes middleware views/auth views/panel views/superadmin views/public public/css public/js utils
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: proje iskeleti ve bagimliliklar"
```

---

## Task 2: Veritabanı Şeması ve Bağlantısı

**Files:**
- Create: `db/schema.sql`
- Create: `db/index.js`

- [ ] **Step 1: db/schema.sql oluştur**

```sql
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON    NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

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
  created_at          TIMESTAMP DEFAULT NOW(),
  UNIQUE(firma_id, slug)
);
```

- [ ] **Step 2: db/index.js oluştur**

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

module.exports = { pool };
```

- [ ] **Step 3: Şemayı Railway PostgreSQL'e uygula**

Railway dashboard'dan PostgreSQL servisine bağlan veya `DATABASE_URL`'yi `.env` dosyasına kopyala, sonra:

```bash
psql $DATABASE_URL -f db/schema.sql
```

- [ ] **Step 4: Bağlantı testi**

```bash
node -e "const {pool} = require('./db'); pool.query('SELECT NOW()').then(r => { console.log('DB OK:', r.rows[0]); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```

Beklenen çıktı: `DB OK: { now: <timestamp> }`

- [ ] **Step 5: Commit**

```bash
git add db/
git commit -m "feat: veritabani semasi ve baglantisi"
```

---

## Task 3: Yardımcı Utils

**Files:**
- Create: `utils/slug.js`
- Create: `utils/vcf.js`
- Create: `utils/excel.js`
- Create: `tests/utils.test.js`

- [ ] **Step 1: Failing testleri yaz**

`tests/utils.test.js`:

```javascript
const { firmaSlugOlustur, calisanSlugOlustur } = require('../utils/slug');
const { vcfOlustur } = require('../utils/vcf');
const { excelParse } = require('../utils/excel');
const path = require('path');

describe('slug utils', () => {
  test('firmaSlugOlustur Türkçe karakterleri normalize eder', () => {
    expect(firmaSlugOlustur('Pfizer Türkiye')).toBe('pfizer-turkiye');
  });

  test('firmaSlugOlustur özel karakterleri kaldırır', () => {
    expect(firmaSlugOlustur('ABC & Co.')).toBe('abc-co');
  });

  test('calisanSlugOlustur 8 karakter üretir', () => {
    const slug = calisanSlugOlustur();
    expect(slug).toHaveLength(8);
    expect(typeof slug).toBe('string');
  });
});

describe('vcf utils', () => {
  test('vcfOlustur geçerli vCard string döner', () => {
    const calisan = {
      ad: 'Ali', soyad: 'Yılmaz', telefon: '+905321112233',
      email: 'ali@firma.com', unvan: 'Müdür', firma_ad: 'Pfizer'
    };
    const vcf = vcfOlustur(calisan);
    expect(vcf).toContain('BEGIN:VCARD');
    expect(vcf).toContain('Ali');
    expect(vcf).toContain('END:VCARD');
  });
});
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

```bash
npx jest tests/utils.test.js
```

Beklenen: FAIL (modüller yok)

- [ ] **Step 3: utils/slug.js oluştur**

```javascript
const { nanoid } = require('nanoid');

function firmaSlugOlustur(ad) {
  return ad
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function calisanSlugOlustur() {
  return nanoid(8);
}

module.exports = { firmaSlugOlustur, calisanSlugOlustur };
```

- [ ] **Step 4: utils/vcf.js oluştur**

```javascript
function vcfOlustur(calisan) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${calisan.soyad};${calisan.ad};;;`,
    `FN:${calisan.ad} ${calisan.soyad}`,
  ];
  if (calisan.unvan) lines.push(`TITLE:${calisan.unvan}`);
  if (calisan.firma_ad) lines.push(`ORG:${calisan.firma_ad}`);
  if (calisan.telefon) lines.push(`TEL;TYPE=WORK,VOICE:${calisan.telefon}`);
  if (calisan.email) lines.push(`EMAIL;TYPE=WORK:${calisan.email}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

module.exports = { vcfOlustur };
```

- [ ] **Step 5: utils/excel.js oluştur**

```javascript
const XLSX = require('xlsx');

function excelParse(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const calisanlar = [];
  const hatalar = [];

  rows.forEach((row, i) => {
    const ad = String(row['ad'] || '').trim();
    const soyad = String(row['soyad'] || '').trim();

    if (!ad || !soyad) {
      hatalar.push(`Satır ${i + 2}: ad ve soyad zorunlu`);
      return;
    }

    const email = String(row['email'] || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      hatalar.push(`Satır ${i + 2}: geçersiz email (${email})`);
      return;
    }

    calisanlar.push({
      ad,
      soyad,
      unvan: String(row['unvan'] || '').trim() || null,
      departman: String(row['departman'] || '').trim() || null,
      telefon: String(row['telefon'] || '').trim() || null,
      email: email || null,
      linkedin: String(row['linkedin'] || '').trim() || null,
      biyografi: String(row['biyografi'] || '').trim() || null,
    });
  });

  return { calisanlar, hatalar };
}

module.exports = { excelParse };
```

- [ ] **Step 6: Testleri çalıştır ve geçtiğini doğrula**

```bash
npx jest tests/utils.test.js
```

Beklenen: PASS (3 test)

- [ ] **Step 7: Commit**

```bash
git add utils/ tests/
git commit -m "feat: slug, vcf ve excel utils"
```

---

## Task 4: Auth Routes ve Views

**Files:**
- Create: `routes/auth.js`
- Create: `views/layout.ejs`
- Create: `views/auth/giris.ejs`
- Create: `views/auth/kayit.ejs`
- Create: `tests/auth.test.js`

- [ ] **Step 1: Failing route testleri yaz**

`tests/auth.test.js`:

```javascript
require('dotenv').config();
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db');

afterAll(async () => {
  await pool.end();
});

describe('GET /firma/kayit', () => {
  test('200 döner ve form içerir', async () => {
    const res = await request(app).get('/firma/kayit');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('form');
  });
});

describe('GET /firma/giris', () => {
  test('200 döner', async () => {
    const res = await request(app).get('/firma/giris');
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /firma/kayit', () => {
  test('eksik alan ile 400 veya redirect döner', async () => {
    const res = await request(app)
      .post('/firma/kayit')
      .send({ ad: '', yetkili_email: '', sifre: '' });
    expect([302, 400]).toContain(res.statusCode);
  });
});
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

```bash
npx jest tests/auth.test.js
```

Beklenen: FAIL

- [ ] **Step 3: views/layout.ejs oluştur**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= typeof title !== 'undefined' ? title : 'Kurumsal Kartvizit' %></title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <% if (success && success.length) { %>
    <div class="flash flash-success"><%= success[0] %></div>
  <% } %>
  <% if (error && error.length) { %>
    <div class="flash flash-error"><%= error[0] %></div>
  <% } %>
  <%- body %>
  <script src="/js/panel.js"></script>
</body>
</html>
```

- [ ] **Step 4: views/auth/giris.ejs oluştur**

```html
<%- include('../layout', { body: `
<div class="auth-container">
  <h1>Firma Girişi</h1>
  <form method="POST" action="/firma/giris">
    <label>Email</label>
    <input type="email" name="yetkili_email" required>
    <label>Şifre</label>
    <input type="password" name="sifre" required>
    <button type="submit">Giriş Yap</button>
  </form>
  <p><a href="/firma/kayit">Firma kaydı yok mu?</a></p>
</div>
` }) %>
```

- [ ] **Step 5: views/auth/kayit.ejs oluştur**

```html
<%- include('../layout', { body: `
<div class="auth-container">
  <h1>Firma Kaydı</h1>
  <form method="POST" action="/firma/kayit">
    <label>Firma Adı</label>
    <input type="text" name="ad" required>
    <label>Sektör</label>
    <select name="sektor">
      <option value="diger">Diğer</option>
      <option value="ilac">İlaç</option>
      <option value="banka">Banka</option>
      <option value="sigorta">Sigorta</option>
    </select>
    <label>Marka Rengi</label>
    <input type="color" name="marka_rengi" value="#1a73e8">
    <label>Yetkili Email</label>
    <input type="email" name="yetkili_email" required>
    <label>Şifre</label>
    <input type="password" name="sifre" required minlength="8">
    <button type="submit">Kayıt Ol</button>
  </form>
  <p><a href="/firma/giris">Zaten hesabın var mı?</a></p>
</div>
` }) %>
```

- [ ] **Step 6: routes/auth.js oluştur**

```javascript
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { pool } = require('../db');
const { firmaSlugOlustur } = require('../utils/slug');

router.get('/kayit', (req, res) => {
  res.render('auth/kayit', { title: 'Firma Kaydı' });
});

router.post('/kayit', async (req, res) => {
  const { ad, sektor, marka_rengi, yetkili_email, sifre } = req.body;

  if (!ad || !yetkili_email || !sifre) {
    req.flash('error', 'Tüm alanları doldurun.');
    return res.redirect('/firma/kayit');
  }

  try {
    const hash = await bcrypt.hash(sifre, 12);
    let slug = firmaSlugOlustur(ad);

    // Çakışma kontrolü
    const existing = await pool.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const result = await pool.query(
      `INSERT INTO firmalar (ad, slug, sektor, marka_rengi, yetkili_email, yetkili_sifre_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [ad, slug, sektor || 'diger', marka_rengi || '#1a73e8', yetkili_email, hash]
    );

    req.session.firmaId = result.rows[0].id;
    req.flash('success', 'Firma kaydı başarılı!');
    res.redirect('/firma/panel');
  } catch (err) {
    if (err.code === '23505') {
      req.flash('error', 'Bu email zaten kayıtlı.');
      return res.redirect('/firma/kayit');
    }
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/firma/kayit');
  }
});

router.get('/giris', (req, res) => {
  res.render('auth/giris', { title: 'Firma Girişi' });
});

router.post('/giris', async (req, res) => {
  const { yetkili_email, sifre } = req.body;

  if (!yetkili_email || !sifre) {
    req.flash('error', 'Email ve şifre gerekli.');
    return res.redirect('/firma/giris');
  }

  try {
    const result = await pool.query(
      'SELECT * FROM firmalar WHERE yetkili_email = $1',
      [yetkili_email]
    );

    if (!result.rows.length) {
      req.flash('error', 'Email veya şifre hatalı.');
      return res.redirect('/firma/giris');
    }

    const firma = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, firma.yetkili_sifre_hash);

    if (!eslesme) {
      req.flash('error', 'Email veya şifre hatalı.');
      return res.redirect('/firma/giris');
    }

    req.session.firmaId = firma.id;
    res.redirect('/firma/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/firma/giris');
  }
});

router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/firma/giris'));
});

module.exports = router;
```

- [ ] **Step 7: Testleri çalıştır**

```bash
npx jest tests/auth.test.js
```

Beklenen: PASS

- [ ] **Step 8: Commit**

```bash
git add routes/auth.js views/layout.ejs views/auth/ tests/auth.test.js
git commit -m "feat: firma kayit ve giris auth routes"
```

---

## Task 5: Auth Middleware

**Files:**
- Create: `middleware/authMiddleware.js`

- [ ] **Step 1: middleware/authMiddleware.js oluştur**

```javascript
function requireFirma(req, res, next) {
  if (!req.session.firmaId) {
    req.flash('error', 'Lütfen giriş yapın.');
    return res.redirect('/firma/giris');
  }
  next();
}

function requireSuperadmin(req, res, next) {
  if (!req.session.superadmin) {
    return res.redirect('/superadmin/giris');
  }
  next();
}

module.exports = { requireFirma, requireSuperadmin };
```

- [ ] **Step 2: app.js'de panel route'una middleware ekle**

`app.js` içindeki panel route satırını bul ve güncelle:

```javascript
const { requireFirma } = require('./middleware/authMiddleware');
// ...
app.use('/firma/panel', requireFirma, panelRoutes);
```

- [ ] **Step 3: Manuel test**

```bash
npm run dev
```

Tarayıcıda `http://localhost:3000/firma/panel` aç — `/firma/giris`'e yönlendirmeli.

- [ ] **Step 4: Commit**

```bash
git add middleware/authMiddleware.js app.js
git commit -m "feat: auth middleware firma ve superadmin icin"
```

---

## Task 6: Firma Paneli — Çalışan Listesi

**Files:**
- Create: `routes/panel.js` (başlangıç)
- Create: `views/panel/panel.ejs`

- [ ] **Step 1: routes/panel.js oluştur**

```javascript
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Ana panel — tab'lı
router.get('/', async (req, res) => {
  try {
    const firma = await pool.query(
      'SELECT * FROM firmalar WHERE id = $1',
      [req.session.firmaId]
    );

    const calisanlar = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
      [req.session.firmaId]
    );

    const aktifSayisi = calisanlar.rows.filter(c => c.durum === 'aktif').length;
    const pasifSayisi = calisanlar.rows.filter(c => c.durum === 'pasif').length;
    const toplamGoruntulenme = calisanlar.rows.reduce((sum, c) => sum + (c.goruntuleme_sayisi || 0), 0);

    const tab = req.query.tab || 'calisanlar';

    res.render('panel/panel', {
      title: 'Panel',
      firma: firma.rows[0],
      calisanlar: calisanlar.rows,
      aktifSayisi,
      pasifSayisi,
      toplamGoruntulenme,
      tab,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/firma/panel');
  }
});

module.exports = router;
```

- [ ] **Step 2: views/panel/panel.ejs oluştur**

```html
<%- include('../layout', { body: `
<div class="panel-container">
  <header class="panel-header">
    <div class="panel-firma-adi">${firma.ad}</div>
    <form method="POST" action="/firma/cikis">
      <button type="submit" class="btn-link">Çıkış</button>
    </form>
  </header>

  <nav class="panel-tabs">
    <a href="/firma/panel?tab=calisanlar" class="${tab === 'calisanlar' ? 'active' : ''}">Çalışanlar</a>
    <a href="/firma/panel?tab=istatistik" class="${tab === 'istatistik' ? 'active' : ''}">İstatistik</a>
    <a href="/firma/panel?tab=excel" class="${tab === 'excel' ? 'active' : ''}">Excel Yükle</a>
  </nav>

  <% if (tab === 'calisanlar') { %>
    <div class="tab-content">
      <div class="panel-actions">
        <div class="sayaclar">
          <span class="chip aktif">Aktif: ${aktifSayisi}</span>
          <span class="chip pasif">Pasif: ${pasifSayisi}</span>
        </div>
        <div>
          <a href="/firma/panel/ekle" class="btn">+ Yeni Çalışan</a>
          <a href="/firma/panel?tab=excel" class="btn btn-secondary">Excel Yükle</a>
        </div>
      </div>
      <table class="tablo">
        <thead>
          <tr><th>Ad Soyad</th><th>Unvan</th><th>Durum</th><th>Profil URL</th><th>İşlemler</th></tr>
        </thead>
        <tbody>
          <% calisanlar.forEach(c => { %>
          <tr class="${c.durum === 'pasif' ? 'row-pasif' : ''}">
            <td>${c.ad} ${c.soyad}</td>
            <td>${c.unvan || '-'}</td>
            <td><span class="durum-badge durum-${c.durum}">${c.durum}</span></td>
            <td><a href="/${firma.slug}/${c.slug}" target="_blank" class="url-link">/${firma.slug}/${c.slug}</a></td>
            <td>
              <a href="/firma/panel/${c.id}/duzenle" class="btn-sm">Düzenle</a>
              <form method="POST" action="/firma/panel/${c.id}/durum" style="display:inline">
                <input type="hidden" name="_method" value="PATCH">
                <input type="hidden" name="durum" value="${c.durum === 'aktif' ? 'pasif' : 'aktif'}">
                <button type="submit" class="btn-sm btn-danger">${c.durum === 'aktif' ? 'Pasife Al' : 'Aktif Et'}</button>
              </form>
            </td>
          </tr>
          <% }); %>
        </tbody>
      </table>
      <% if (!calisanlar.length) { %>
        <p class="bos-mesaj">Henüz çalışan eklenmemiş. <a href="/firma/panel/ekle">İlk çalışanı ekle</a></p>
      <% } %>
    </div>

  <% } else if (tab === 'istatistik') { %>
    <div class="tab-content">
      <div class="stat-kartlar">
        <div class="stat-kart"><div class="stat-sayi">${aktifSayisi + pasifSayisi}</div><div>Toplam Çalışan</div></div>
        <div class="stat-kart"><div class="stat-sayi aktif-renk">${aktifSayisi}</div><div>Aktif</div></div>
        <div class="stat-kart"><div class="stat-sayi pasif-renk">${pasifSayisi}</div><div>Pasif</div></div>
        <div class="stat-kart"><div class="stat-sayi">${toplamGoruntulenme}</div><div>Toplam Görüntülenme</div></div>
      </div>
      <table class="tablo">
        <thead><tr><th>Ad Soyad</th><th>Görüntülenme</th><th>Durum</th></tr></thead>
        <tbody>
          <% calisanlar.sort((a,b) => b.goruntuleme_sayisi - a.goruntuleme_sayisi).forEach(c => { %>
          <tr>
            <td>${c.ad} ${c.soyad}</td>
            <td>${c.goruntuleme_sayisi}</td>
            <td><span class="durum-badge durum-${c.durum}">${c.durum}</span></td>
          </tr>
          <% }); %>
        </tbody>
      </table>
    </div>

  <% } else if (tab === 'excel') { %>
    <div class="tab-content">
      <h3>Excel ile Toplu Çalışan Yükleme</h3>
      <p>Önce şablonu indir, doldur, yükle.</p>
      <a href="/firma/panel/excel-sablon" class="btn btn-secondary" download>Şablonu İndir (.xlsx)</a>
      <form method="POST" action="/firma/panel/toplu-yukle" enctype="multipart/form-data" style="margin-top:16px">
        <input type="file" name="excel" accept=".xlsx,.xls" required>
        <button type="submit" class="btn">Yükle</button>
      </form>
    </div>
  <% } %>
</div>
` }) %>
```

- [ ] **Step 3: Sunucuyu başlat ve görsel test yap**

```bash
npm run dev
```

Tarayıcıda `http://localhost:3000/firma/kayit` ile firma kaydı yap, ardından `/firma/panel`'i kontrol et.

- [ ] **Step 4: Commit**

```bash
git add routes/panel.js views/panel/panel.ejs
git commit -m "feat: firma panel calisanlar ve istatistik tablari"
```

---

## Task 7: Çalışan Ekleme ve Düzenleme

**Files:**
- Modify: `routes/panel.js`
- Create: `views/panel/ekle.ejs`
- Create: `views/panel/duzenle.ejs`

- [ ] **Step 1: routes/panel.js'e çalışan CRUD ekle**

`routes/panel.js` dosyasına `module.exports`'tan önce şu route'ları ekle:

```javascript
const { calisanSlugOlustur } = require('../utils/slug');

// Çalışan ekleme formu
router.get('/ekle', (req, res) => {
  res.render('panel/ekle', { title: 'Yeni Çalışan' });
});

// Çalışan ekleme POST
router.post('/ekle', async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, ilaclar } = req.body;

  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect('/firma/panel/ekle');
  }

  try {
    let slug = calisanSlugOlustur();
    // Unique kontrolü (çok nadir çakışma ama garanti et)
    let deneme = 0;
    while (deneme < 5) {
      const check = await pool.query(
        'SELECT id FROM calisanlar WHERE firma_id = $1 AND slug = $2',
        [req.session.firmaId, slug]
      );
      if (!check.rows.length) break;
      slug = calisanSlugOlustur();
      deneme++;
    }

    const ilaclarArray = ilaclar
      ? ilaclar.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    await pool.query(
      `INSERT INTO calisanlar
       (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, ilaclar, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [req.session.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null, biyografi || null,
       ilaclarArray, slug]
    );

    req.flash('success', `${ad} ${soyad} eklendi.`);
    res.redirect('/firma/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Çalışan eklenemedi.');
    res.redirect('/firma/panel/ekle');
  }
});

// Çalışan düzenleme formu
router.get('/:id/duzenle', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM calisanlar WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.session.firmaId]
    );

    if (!result.rows.length) {
      req.flash('error', 'Çalışan bulunamadı.');
      return res.redirect('/firma/panel');
    }

    res.render('panel/duzenle', { title: 'Çalışan Düzenle', calisan: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.redirect('/firma/panel');
  }
});

// Çalışan düzenleme POST
router.post('/:id/duzenle', async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, ilaclar } = req.body;

  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(`/firma/panel/${req.params.id}/duzenle`);
  }

  try {
    const ilaclarArray = ilaclar
      ? ilaclar.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    await pool.query(
      `UPDATE calisanlar SET
       ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
       email=$6, linkedin=$7, biyografi=$8, ilaclar=$9
       WHERE id=$10 AND firma_id=$11`,
      [ad, soyad, unvan || null, departman || null, telefon || null,
       email || null, linkedin || null, biyografi || null,
       ilaclarArray, req.params.id, req.session.firmaId]
    );

    req.flash('success', 'Çalışan güncellendi.');
    res.redirect('/firma/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncelleme başarısız.');
    res.redirect(`/firma/panel/${req.params.id}/duzenle`);
  }
});

// Durum değiştirme (aktif <-> pasif)
router.patch('/:id/durum', async (req, res) => {
  const { durum } = req.body;
  if (!['aktif', 'pasif'].includes(durum)) {
    return res.redirect('/firma/panel');
  }

  try {
    await pool.query(
      'UPDATE calisanlar SET durum=$1 WHERE id=$2 AND firma_id=$3',
      [durum, req.params.id, req.session.firmaId]
    );
    res.redirect('/firma/panel');
  } catch (err) {
    console.error(err);
    res.redirect('/firma/panel');
  }
});
```

- [ ] **Step 2: views/panel/ekle.ejs oluştur**

```html
<%- include('../layout', { body: `
<div class="form-container">
  <h2>Yeni Çalışan Ekle</h2>
  <a href="/firma/panel" class="btn-link">← Panele Dön</a>
  <form method="POST" action="/firma/panel/ekle">
    <div class="form-group"><label>Ad *</label><input type="text" name="ad" required></div>
    <div class="form-group"><label>Soyad *</label><input type="text" name="soyad" required></div>
    <div class="form-group"><label>Unvan</label><input type="text" name="unvan"></div>
    <div class="form-group"><label>Departman</label><input type="text" name="departman"></div>
    <div class="form-group"><label>Telefon</label><input type="tel" name="telefon"></div>
    <div class="form-group"><label>Email</label><input type="email" name="email"></div>
    <div class="form-group"><label>LinkedIn URL</label><input type="url" name="linkedin"></div>
    <div class="form-group"><label>Biyografi</label><textarea name="biyografi" rows="3"></textarea></div>
    <div class="form-group"><label>Çalışılan İlaçlar (virgülle ayır)</label><input type="text" name="ilaclar" placeholder="Cardura, Norvasc, Beloc"></div>
    <button type="submit" class="btn">Ekle</button>
  </form>
</div>
` }) %>
```

- [ ] **Step 3: views/panel/duzenle.ejs oluştur**

```html
<%- include('../layout', { body: `
<div class="form-container">
  <h2>Çalışan Düzenle</h2>
  <a href="/firma/panel" class="btn-link">← Panele Dön</a>
  <form method="POST" action="/firma/panel/${calisan.id}/duzenle">
    <div class="form-group"><label>Ad *</label><input type="text" name="ad" value="${calisan.ad}" required></div>
    <div class="form-group"><label>Soyad *</label><input type="text" name="soyad" value="${calisan.soyad}" required></div>
    <div class="form-group"><label>Unvan</label><input type="text" name="unvan" value="${calisan.unvan || ''}"></div>
    <div class="form-group"><label>Departman</label><input type="text" name="departman" value="${calisan.departman || ''}"></div>
    <div class="form-group"><label>Telefon</label><input type="tel" name="telefon" value="${calisan.telefon || ''}"></div>
    <div class="form-group"><label>Email</label><input type="email" name="email" value="${calisan.email || ''}"></div>
    <div class="form-group"><label>LinkedIn URL</label><input type="url" name="linkedin" value="${calisan.linkedin || ''}"></div>
    <div class="form-group"><label>Biyografi</label><textarea name="biyografi" rows="3">${calisan.biyografi || ''}</textarea></div>
    <div class="form-group"><label>Çalışılan İlaçlar (virgülle ayır)</label><input type="text" name="ilaclar" value="${(calisan.ilaclar || []).join(', ')}"></div>
    <button type="submit" class="btn">Kaydet</button>
  </form>
  <p class="slug-bilgi">Profil URL'si: <code>/${firma_slug}/${calisan.slug}</code> (değişmez)</p>
</div>
` }) %>
```

**Not:** `duzenle.ejs`'te `firma_slug` kullanılıyor — route'da `firma_slug`'ı da gönder:

`routes/panel.js` içindeki `/:id/duzenle GET` route'unu güncelle:

```javascript
const firma = await pool.query('SELECT slug FROM firmalar WHERE id = $1', [req.session.firmaId]);
res.render('panel/duzenle', {
  title: 'Çalışan Düzenle',
  calisan: result.rows[0],
  firma_slug: firma.rows[0].slug
});
```

- [ ] **Step 4: Manuel test**

```bash
npm run dev
```

Panel'den çalışan ekle, düzenle, pasife al — her işlemi dene.

- [ ] **Step 5: Commit**

```bash
git add routes/panel.js views/panel/
git commit -m "feat: calisan ekleme duzenleme ve durum degistirme"
```

---

## Task 8: Excel Toplu Yükleme

**Files:**
- Modify: `routes/panel.js`

- [ ] **Step 1: Excel şablonu endpoint'i ekle**

`routes/panel.js` dosyasının en üstüne (diğer `require`'ların yanına) ekle:

```javascript
const XLSX = require('xlsx');
const multer = require('multer');
const { excelParse } = require('../utils/excel');
const { calisanSlugOlustur } = require('../utils/slug'); // Task 7'deki satırı sil, buraya taşı

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Excel şablon indir
router.get('/excel-sablon', (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['ad', 'soyad', 'unvan', 'departman', 'telefon', 'email', 'linkedin', 'biyografi'],
    ['Örnek', 'Kişi', 'Satış Müdürü', 'Satış', '+905001112233', 'ornek@firma.com', '', '']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Çalışanlar');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="calisanlar-sablon.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// Excel yükleme
router.post('/toplu-yukle', upload.single('excel'), async (req, res) => {
  if (!req.file) {
    req.flash('error', 'Dosya seçilmedi.');
    return res.redirect('/firma/panel?tab=excel');
  }

  const { calisanlar, hatalar } = excelParse(req.file.buffer);

  let eklenen = 0;
  for (const c of calisanlar) {
    try {
      const slug = calisanSlugOlustur(); // dosya başında require edilmiş
      await pool.query(
        `INSERT INTO calisanlar
         (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, slug)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.session.firmaId, c.ad, c.soyad, c.unvan, c.departman,
         c.telefon, c.email, c.linkedin, c.biyografi, slug]
      );
      eklenen++;
    } catch (err) {
      hatalar.push(`${c.ad} ${c.soyad}: eklenemedi`);
    }
  }

  const mesaj = `${eklenen} çalışan eklendi.${hatalar.length ? ' Hatalar: ' + hatalar.join('; ') : ''}`;
  req.flash(hatalar.length ? 'error' : 'success', mesaj);
  res.redirect('/firma/panel?tab=excel');
});
```

- [ ] **Step 2: Manuel test**

Şablon indir, birkaç satır doldur, yükle. Panel'de çalışanların geldiğini doğrula.

- [ ] **Step 3: Commit**

```bash
git add routes/panel.js utils/excel.js
git commit -m "feat: excel toplu calisanlar yukleme"
```

---

## Task 9: Public Profil Sayfası

**Files:**
- Create: `routes/public.js`
- Create: `views/public/profil.ejs`
- Create: `views/public/404.ejs`
- Create: `tests/public.test.js`

- [ ] **Step 1: Failing test yaz**

`tests/public.test.js`:

```javascript
require('dotenv').config();
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db');

afterAll(async () => { await pool.end(); });

describe('GET /:firma-slug/:calisan-slug', () => {
  test('geçersiz slug için 404 döner', async () => {
    const res = await request(app).get('/olmayan-firma/olmayan-calisan');
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Test başarısız olduğunu doğrula**

```bash
npx jest tests/public.test.js
```

- [ ] **Step 3: routes/public.js oluştur**

```javascript
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/:firmaSlug/:calisanSlug', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, f.ad as firma_ad, f.slug as firma_slug,
              f.logo_url, f.marka_rengi, f.sektor
       FROM calisanlar c
       JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );

    if (!result.rows.length) {
      return res.status(404).render('public/404', { title: '404' });
    }

    const calisan = result.rows[0];

    if (calisan.durum === 'pasif') {
      return res.status(404).render('public/404', {
        title: 'Profil Aktif Değil',
        mesaj: 'Bu profil artık aktif değil.'
      });
    }

    // Görüntülenme sayacı artır
    await pool.query(
      'UPDATE calisanlar SET goruntuleme_sayisi = goruntuleme_sayisi + 1 WHERE id = $1',
      [calisan.id]
    );

    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.' });
  }
});

module.exports = router;
```

- [ ] **Step 4: views/public/profil.ejs oluştur**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= calisan.ad %> <%= calisan.soyad %></title>
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .profil-header { background: <%= calisan.marka_rengi %>; }
  </style>
</head>
<body class="profil-body">
  <div class="profil-kart">
    <div class="profil-header">
      <% if (calisan.logo_url) { %>
        <img src="<%= calisan.logo_url %>" class="firma-logo" alt="<%= calisan.firma_ad %>">
      <% } else { %>
        <div class="firma-ad-text"><%= calisan.firma_ad %></div>
      <% } %>
      <div class="profil-foto-wrap">
        <% if (calisan.foto_url) { %>
          <img src="<%= calisan.foto_url %>" class="profil-foto" alt="<%= calisan.ad %>">
        <% } else { %>
          <div class="profil-initials"><%= calisan.ad[0] %><%= calisan.soyad[0] %></div>
        <% } %>
      </div>
    </div>

    <div class="profil-icerik">
      <h1 class="profil-isim"><%= calisan.ad %> <%= calisan.soyad %></h1>
      <% if (calisan.unvan) { %>
        <p class="profil-unvan"><%= calisan.unvan %></p>
      <% } %>
      <% if (calisan.departman) { %>
        <p class="profil-departman"><%= calisan.departman %></p>
      <% } %>

      <% if (calisan.biyografi) { %>
        <p class="profil-bio"><%= calisan.biyografi %></p>
      <% } %>

      <% if (calisan.sektor === 'ilac' && calisan.ilaclar && calisan.ilaclar.length) { %>
        <div class="ilac-etiketler">
          <% calisan.ilaclar.forEach(ilac => { %>
            <span class="ilac-etiket"><%= ilac %></span>
          <% }); %>
        </div>
      <% } %>

      <div class="iletisim-butonlar">
        <% if (calisan.telefon) { %>
          <a href="tel:<%= calisan.telefon %>" class="btn-iletisim">📞 <%= calisan.telefon %></a>
        <% } %>
        <% if (calisan.email) { %>
          <a href="mailto:<%= calisan.email %>" class="btn-iletisim">✉️ <%= calisan.email %></a>
        <% } %>
        <% if (calisan.linkedin) { %>
          <a href="<%= calisan.linkedin %>" target="_blank" class="btn-iletisim">💼 LinkedIn</a>
        <% } %>
      </div>

      <a href="/<%= calisan.firma_slug %>/<%= calisan.slug %>/vcf"
         class="btn-vcf" download>
        + Rehbere Kaydet
      </a>

      <footer class="profil-footer"><%= calisan.firma_ad %></footer>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 5: views/public/404.ejs oluştur**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title><%= typeof title !== 'undefined' ? title : '404' %></title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body class="profil-body">
  <div class="hata-kart">
    <h1>404</h1>
    <p><%= typeof mesaj !== 'undefined' ? mesaj : 'Sayfa bulunamadı.' %></p>
  </div>
</body>
</html>
```

- [ ] **Step 6: Testleri çalıştır**

```bash
npx jest tests/public.test.js
```

Beklenen: PASS

- [ ] **Step 7: Commit**

```bash
git add routes/public.js views/public/ tests/public.test.js
git commit -m "feat: public profil sayfasi ve 404"
```

---

## Task 10: vCard Download Endpoint

**Files:**
- Modify: `routes/public.js`

- [ ] **Step 1: vCard route ekle**

`routes/public.js` içinde `module.exports`'tan önce ekle:

```javascript
const { vcfOlustur } = require('../utils/vcf');

router.get('/:firmaSlug/:calisanSlug/vcf', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.ad, c.soyad, c.telefon, c.email, c.unvan, f.ad as firma_ad
       FROM calisanlar c
       JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2 AND c.durum = 'aktif'`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );

    if (!result.rows.length) {
      return res.status(404).send('Profil bulunamadı.');
    }

    const calisan = result.rows[0];
    const vcfContent = vcfOlustur({
      ad: calisan.ad,
      soyad: calisan.soyad,
      telefon: calisan.telefon,
      email: calisan.email,
      unvan: calisan.unvan,
      firma_ad: calisan.firma_ad
    });

    const dosyaAdi = `${calisan.ad}-${calisan.soyad}.vcf`
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
    res.send(vcfContent);
  } catch (err) {
    console.error(err);
    res.status(500).send('Hata.');
  }
});
```

- [ ] **Step 2: Manuel test**

Profil sayfasında "Rehbere Kaydet" butonuna tıkla — `.vcf` dosyası indirilmeli, telefona eklenebilmeli.

- [ ] **Step 3: Commit**

```bash
git add routes/public.js
git commit -m "feat: vcard vcf download endpoint"
```

---

## Task 11: Dosya Yükleme (Railway Object Storage)

**Files:**
- Create: `middleware/upload.js`
- Modify: `routes/panel.js`

- [ ] **Step 1: middleware/upload.js oluştur**

```javascript
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  endpoint: process.env.RAILWAY_STORAGE_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.RAILWAY_STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.RAILWAY_STORAGE_SECRET_KEY,
  },
  forcePathStyle: true,
});

function uploadMiddleware(klasor) {
  return multer({
    storage: multerS3({
      s3,
      bucket: process.env.RAILWAY_STORAGE_BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const ext = file.originalname.split('.').pop();
        cb(null, `${klasor}/${Date.now()}.${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const izinli = ['image/jpeg', 'image/png', 'image/webp'];
      if (izinli.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Sadece JPEG, PNG veya WebP yüklenebilir.'));
      }
    },
  });
}

module.exports = { uploadMiddleware };
```

- [ ] **Step 2: Panel'e foto upload ekle**

`routes/panel.js` içindeki `/:id/duzenle POST` route'una foto upload desteği ekle:

```javascript
const { uploadMiddleware } = require('../middleware/upload');
const fotoUpload = uploadMiddleware('calisanlar');

// Mevcut router.post('/:id/duzenle') satırını şununla değiştir:
router.post('/:id/duzenle', fotoUpload.single('foto'), async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, ilaclar } = req.body;

  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(`/firma/panel/${req.params.id}/duzenle`);
  }

  try {
    const ilaclarArray = ilaclar
      ? ilaclar.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    let updateQuery, updateParams;

    if (req.file) {
      const fotoUrl = req.file.location; // multer-s3 location
      updateQuery = `UPDATE calisanlar SET
        ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
        email=$6, linkedin=$7, biyografi=$8, ilaclar=$9, foto_url=$10
        WHERE id=$11 AND firma_id=$12`;
      updateParams = [ad, soyad, unvan || null, departman || null, telefon || null,
        email || null, linkedin || null, biyografi || null,
        ilaclarArray, fotoUrl, req.params.id, req.session.firmaId];
    } else {
      updateQuery = `UPDATE calisanlar SET
        ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
        email=$6, linkedin=$7, biyografi=$8, ilaclar=$9
        WHERE id=$10 AND firma_id=$11`;
      updateParams = [ad, soyad, unvan || null, departman || null, telefon || null,
        email || null, linkedin || null, biyografi || null,
        ilaclarArray, req.params.id, req.session.firmaId];
    }

    await pool.query(updateQuery, updateParams);
    req.flash('success', 'Çalışan güncellendi.');
    res.redirect('/firma/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncelleme başarısız.');
    res.redirect(`/firma/panel/${req.params.id}/duzenle`);
  }
});
```

- [ ] **Step 3: duzenle.ejs formuna foto alanı ekle**

`views/panel/duzenle.ejs` içindeki `<form>` açılış etiketini güncelle:

```html
<form method="POST" action="/firma/panel/${calisan.id}/duzenle" enctype="multipart/form-data">
```

Ve `biyografi` alanından önce ekle:

```html
<div class="form-group">
  <label>Fotoğraf</label>
  <% if (calisan.foto_url) { %>
    <img src="${calisan.foto_url}" class="foto-onizleme" alt="Mevcut foto">
  <% } %>
  <input type="file" name="foto" accept="image/jpeg,image/png,image/webp">
  <small>Mevcut: ${calisan.foto_url ? 'var' : 'yok'} — Yeni yüklemezsen mevcut kalır.</small>
</div>
```

- [ ] **Step 4: Railway Object Storage ayarları**

Railway dashboard'da:
1. **Storage** servisine git → bucket oluştur
2. Endpoint, access key, secret key bilgilerini kopyala
3. `.env` dosyasına `RAILWAY_STORAGE_*` değişkenlerini ekle

- [ ] **Step 5: Manuel test**

Çalışan düzenle sayfasından foto yükle, profil sayfasında görüntüle.

- [ ] **Step 6: Commit**

```bash
git add middleware/upload.js routes/panel.js views/panel/duzenle.ejs
git commit -m "feat: railway object storage ile foto yukleme"
```

---

## Task 12: Süper Admin Paneli

**Files:**
- Create: `routes/superadmin.js`
- Create: `views/superadmin/giris.ejs`
- Create: `views/superadmin/index.ejs`

- [ ] **Step 1: routes/superadmin.js oluştur**

```javascript
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { requireSuperadmin } = require('../middleware/authMiddleware');

router.get('/giris', (req, res) => {
  res.render('superadmin/giris', { title: 'Süper Admin Girişi' });
});

router.post('/giris', (req, res) => {
  const { sifre } = req.body;
  if (sifre === process.env.SUPERADMIN_PASSWORD) {
    req.session.superadmin = true;
    res.redirect('/superadmin');
  } else {
    req.flash('error', 'Şifre hatalı.');
    res.redirect('/superadmin/giris');
  }
});

router.post('/cikis', (req, res) => {
  req.session.superadmin = false;
  req.session.destroy(() => res.redirect('/superadmin/giris'));
});

router.get('/', requireSuperadmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, COUNT(c.id) as calisan_sayisi
      FROM firmalar f
      LEFT JOIN calisanlar c ON c.firma_id = f.id
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `);
    res.render('superadmin/index', { title: 'Süper Admin', firmalar: result.rows });
  } catch (err) {
    console.error(err);
    res.send('Hata.');
  }
});

router.post('/firma-sil/:id', requireSuperadmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [req.params.id]);
    req.flash('success', 'Firma silindi.');
    res.redirect('/superadmin');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
    res.redirect('/superadmin');
  }
});

module.exports = router;
```

- [ ] **Step 2: views/superadmin/giris.ejs oluştur**

```html
<%- include('../layout', { body: `
<div class="auth-container">
  <h1>Süper Admin</h1>
  <form method="POST" action="/superadmin/giris">
    <label>Şifre</label>
    <input type="password" name="sifre" required>
    <button type="submit" class="btn">Giriş</button>
  </form>
</div>
` }) %>
```

- [ ] **Step 3: views/superadmin/index.ejs oluştur**

```html
<%- include('../layout', { body: `
<div class="panel-container">
  <header class="panel-header">
    <h2>Tüm Firmalar (${firmalar.length})</h2>
    <form method="POST" action="/superadmin/cikis">
      <button type="submit" class="btn-link">Çıkış</button>
    </form>
  </header>
  <table class="tablo">
    <thead>
      <tr><th>Firma Adı</th><th>Slug</th><th>Sektör</th><th>Çalışan</th><th>Kayıt</th><th>İşlem</th></tr>
    </thead>
    <tbody>
      <% firmalar.forEach(f => { %>
      <tr>
        <td>${f.ad}</td>
        <td><code>${f.slug}</code></td>
        <td>${f.sektor}</td>
        <td>${f.calisan_sayisi}</td>
        <td>${new Date(f.created_at).toLocaleDateString('tr-TR')}</td>
        <td>
          <form method="POST" action="/superadmin/firma-sil/${f.id}"
                onsubmit="return confirm('Firma ve tüm çalışanları silinecek. Emin misin?')">
            <button type="submit" class="btn-sm btn-danger">Sil</button>
          </form>
        </td>
      </tr>
      <% }); %>
    </tbody>
  </table>
</div>
` }) %>
```

- [ ] **Step 4: Manuel test**

`http://localhost:3000/superadmin/giris` — `.env`'deki `SUPERADMIN_PASSWORD` ile giriş yap.

- [ ] **Step 5: Commit**

```bash
git add routes/superadmin.js views/superadmin/
git commit -m "feat: superadmin panel firma listesi ve silme"
```

---

## Task 13: CSS Stillendirme

**Files:**
- Modify: `public/css/style.css`
- Modify: `public/js/panel.js`

- [ ] **Step 1: public/css/style.css oluştur**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fa; color: #333; }

/* Flash messages */
.flash { padding: 12px 16px; margin: 8px; border-radius: 6px; font-size: 14px; }
.flash-success { background: #e6f4ea; color: #1e7e34; }
.flash-error { background: #fce8e6; color: #c62828; }

/* Auth */
.auth-container { max-width: 400px; margin: 80px auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.auth-container h1 { margin-bottom: 24px; font-size: 24px; }
.auth-container label { display: block; margin-bottom: 4px; font-size: 13px; color: #555; font-weight: 500; }
.auth-container input, .auth-container select { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 16px; }
.auth-container input:focus { outline: none; border-color: #1a73e8; }

/* Buttons */
.btn { display: inline-block; padding: 10px 20px; background: #1a73e8; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; text-decoration: none; }
.btn:hover { background: #1557b0; }
.btn-secondary { background: #f0f2f5; color: #333; }
.btn-secondary:hover { background: #e0e3e8; }
.btn-sm { padding: 5px 10px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer; background: #f0f2f5; color: #333; text-decoration: none; }
.btn-danger { background: #fce8e6; color: #c62828; }
.btn-danger:hover { background: #f5c6c3; }
.btn-link { background: none; border: none; cursor: pointer; color: #1a73e8; text-decoration: underline; font-size: 14px; }

/* Panel */
.panel-container { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.panel-firma-adi { font-size: 20px; font-weight: 700; }
.panel-tabs { display: flex; gap: 0; border-bottom: 2px solid #e0e3e8; margin-bottom: 24px; }
.panel-tabs a { padding: 10px 20px; text-decoration: none; color: #666; font-size: 14px; font-weight: 500; }
.panel-tabs a.active { color: #1a73e8; border-bottom: 2px solid #1a73e8; margin-bottom: -2px; }
.panel-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 8px; }
.sayaclar { display: flex; gap: 8px; }
.chip { padding: 4px 12px; border-radius: 16px; font-size: 13px; font-weight: 500; }
.chip.aktif { background: #e6f4ea; color: #1e7e34; }
.chip.pasif { background: #fce8e6; color: #c62828; }

/* Table */
.tablo { width: 100%; border-collapse: collapse; font-size: 14px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.tablo th { text-align: left; padding: 12px 16px; background: #f8f9fa; font-weight: 600; color: #555; font-size: 12px; text-transform: uppercase; }
.tablo td { padding: 12px 16px; border-top: 1px solid #f0f0f0; }
.row-pasif td { opacity: 0.55; }
.durum-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.durum-aktif { background: #e6f4ea; color: #1e7e34; }
.durum-pasif { background: #fce8e6; color: #c62828; }
.url-link { font-size: 12px; color: #1a73e8; text-decoration: none; font-family: monospace; }
.bos-mesaj { text-align: center; padding: 32px; color: #888; }

/* Stats */
.stat-kartlar { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.stat-kart { background: #fff; padding: 16px 24px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); min-width: 120px; text-align: center; }
.stat-sayi { font-size: 28px; font-weight: 700; color: #333; }
.aktif-renk { color: #1e7e34; }
.pasif-renk { color: #c62828; }

/* Form */
.form-container { max-width: 560px; margin: 32px auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.form-container h2 { margin-bottom: 24px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 4px; font-size: 13px; color: #555; font-weight: 500; }
.form-group input, .form-group textarea, .form-group select {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: inherit;
}
.slug-bilgi { margin-top: 16px; font-size: 12px; color: #888; }
.foto-onizleme { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; display: block; margin-bottom: 8px; }

/* Public profil */
.profil-body { background: #f5f7fa; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; }
.profil-kart { width: 100%; max-width: 400px; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
.profil-header { padding: 32px 24px 48px; display: flex; flex-direction: column; align-items: center; position: relative; }
.firma-logo { max-height: 40px; max-width: 120px; object-fit: contain; filter: brightness(0) invert(1); margin-bottom: 12px; }
.firma-ad-text { color: rgba(255,255,255,0.9); font-weight: 700; font-size: 18px; margin-bottom: 12px; }
.profil-foto-wrap { position: absolute; bottom: -40px; }
.profil-foto { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #fff; object-fit: cover; }
.profil-initials { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #fff; background: #e0e3e8; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #555; }
.profil-icerik { padding: 52px 24px 24px; text-align: center; }
.profil-isim { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.profil-unvan { color: #555; font-size: 14px; margin-bottom: 2px; }
.profil-departman { color: #888; font-size: 13px; margin-bottom: 16px; }
.profil-bio { font-size: 13px; color: #666; line-height: 1.5; margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; text-align: left; }
.ilac-etiketler { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 16px; }
.ilac-etiket { background: #e8f0fe; color: #1a73e8; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
.iletisim-butonlar { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.btn-iletisim { display: block; padding: 12px; border: 1px solid #e0e3e8; border-radius: 8px; text-decoration: none; color: #333; font-size: 14px; text-align: left; }
.btn-iletisim:hover { background: #f5f7fa; }
.btn-vcf { display: block; padding: 14px; background: #1a73e8; color: #fff; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 16px; }
.btn-vcf:hover { background: #1557b0; }
.profil-footer { font-size: 12px; color: #aaa; }

/* 404 */
.hata-kart { text-align: center; padding: 64px 32px; background: #fff; border-radius: 16px; max-width: 400px; width: 100%; }
.hata-kart h1 { font-size: 48px; color: #ccc; margin-bottom: 8px; }
```

- [ ] **Step 2: public/js/panel.js oluştur**

Tab switching JavaScript'e gerek yok — URL parametresi ile yönetiliyor. Dosyayı boş bırak:

```javascript
// Tab yönetimi URL parametresi ile yapılıyor: /firma/panel?tab=istatistik
```

- [ ] **Step 3: Görsel kontrol**

```bash
npm run dev
```

Kayıt, giriş, panel, çalışan ekleme ve profil sayfalarını gör.

- [ ] **Step 4: Commit**

```bash
git add public/
git commit -m "feat: css stillendirme panel ve profil sayfasi"
```

---

## Task 14: Railway Deploy

**Files:**
- Create: `railway.json`
- Create: `Procfile`

- [ ] **Step 1: Procfile oluştur**

```
web: node app.js
```

- [ ] **Step 2: railway.json oluştur**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node app.js",
    "healthcheckPath": "/firma/giris",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 3: GitHub repo oluştur ve push et**

```bash
git remote add origin https://github.com/KULLANICI_ADI/kurumsal-kartvizit.git
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Railway'de yeni proje oluştur**

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Repo'yu seç
3. PostgreSQL servisi ekle (Add Service → Database → PostgreSQL)
4. `DATABASE_URL` otomatik bağlanır
5. Variables sekmesinden diğer env değişkenlerini ekle:
   - `SESSION_SECRET`
   - `SUPERADMIN_PASSWORD`
   - `RAILWAY_STORAGE_BUCKET`
   - `RAILWAY_STORAGE_ENDPOINT`
   - `RAILWAY_STORAGE_ACCESS_KEY`
   - `RAILWAY_STORAGE_SECRET_KEY`
   - `NODE_ENV=production`
6. Deploy başlar

- [ ] **Step 5: Schema'yı production DB'ye uygula**

Railway dashboard → PostgreSQL → Connect → shell açıp:

```bash
psql $DATABASE_URL -f db/schema.sql
```

Veya Railway'in Query arayüzünden `schema.sql` içeriğini çalıştır.

- [ ] **Step 6: Deploy test**

Verilen Railway URL'sinde `/firma/kayit` aç, firma kaydı yap, çalışan ekle, profil URL'sini test et.

- [ ] **Step 7: Final commit**

```bash
git add Procfile railway.json
git commit -m "feat: railway deploy konfigurasyonu"
git push
```

---

## Tüm Testleri Çalıştır

```bash
npx jest --forceExit
```

Beklenen: Tüm testler PASS.
