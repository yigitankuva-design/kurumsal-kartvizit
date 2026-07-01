# Bayi Kredi Sistemi & PayTR Ödeme Entegrasyonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Matbaa bayilerinin kredi/jeton satın alarak (PayTR üzerinden gerçek online ödeme) müşteri firma ekleyebildiği bir kredi sistemi kurmak. 1 kredi = 1 firma kaydı. Kredi tükenince bayi ekleyemez; `/bayi/panel/kredi-yukle`'den paket satın alabilir.

**Architecture:** `bayiler.kredi_bakiyesi` sayaç alanı + `kredi_hareketleri` ledger tablosu (her yükleme/harcama kaydı tutulur) + `odemeler` tablosu (PayTR sipariş kayıtları). Kredi harcama ve yükleme işlemleri PostgreSQL transaction (`BEGIN`/`COMMIT`/`ROLLBACK`, `SELECT ... FOR UPDATE` ile satır kilidi) içinde yapılır — yarım kalmış "firma eklendi ama kredi düşmedi" gibi tutarsız durumlar oluşmaz. PayTR entegrasyonu ayrı bir `routes/odeme.js` router'ında, `utils/paytr.js`'teki saf (test edilebilir) hash fonksiyonlarıyla yapılır.

**Ön Koşul:** Gerçek ortamda test için bir **PayTR mağaza hesabı** (`PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`) gerekir. Bu plandaki `utils/paytr.js` hash algoritması ve `routes/odeme.js`'teki PayTR API alan adları (`merchant_id`, `user_ip`, `merchant_oid` vb.) PayTR'nin genel bilinen iFrame API akışına göre yazıldı — **implementasyon sırasında PayTR'nin güncel resmi dokümantasyonuyla (test modu, alan adları, callback formatı) karşılaştırılıp doğrulanmalı**, hesap yoksa `test_mode=1` ile PayTR'nin sağladığı test kartlarıyla doğrulanabilir.

**Tech Stack:** PostgreSQL (transaction), Node.js `crypto` (HMAC-SHA256), Node.js yerleşik `fetch` (Node 20+), Jest, Supertest

---

## Task 1: Veritabanı Migration — Kredi Tabloları

**Files:**
- Modify: `scripts/migrate.js`
- Modify: `db/schema.sql`

- [x] **Step 1: scripts/migrate.js'e yeni migration satırlarını ekle**

`scripts/migrate.js` dosyasındaki `migrations` dizisinin sonuna ekle (dizi kapanışından önce):

```javascript
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
```

- [x] **Step 2: db/schema.sql'i güncelle (referans şema — yeni kurulumlar için)**

`db/schema.sql` içindeki `bayiler` tablosu tanımında `aktif BOOLEAN DEFAULT true,` satırından hemen sonra ekle:

```sql
  kredi_bakiyesi INTEGER DEFAULT 0,
```

Dosyanın en sonuna (`link_tiklama` tablosu tanımından sonra) ekle:

```sql

CREATE TABLE IF NOT EXISTS odemeler (
  id                  SERIAL PRIMARY KEY,
  bayi_id             INTEGER REFERENCES bayiler(id) ON DELETE CASCADE,
  paytr_merchant_oid  TEXT UNIQUE NOT NULL,
  kredi_miktari       INTEGER NOT NULL,
  tutar               NUMERIC(10,2) NOT NULL,
  durum               TEXT DEFAULT 'beklemede',
  created_at          TIMESTAMP DEFAULT NOW(),
  onaylanma_tarihi    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kredi_hareketleri (
  id           SERIAL PRIMARY KEY,
  bayi_id      INTEGER REFERENCES bayiler(id) ON DELETE CASCADE,
  tip          TEXT NOT NULL,
  miktar       INTEGER NOT NULL,
  aciklama     TEXT,
  firma_id     INTEGER REFERENCES firmalar(id) ON DELETE SET NULL,
  odeme_id     INTEGER REFERENCES odemeler(id) ON DELETE SET NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);
```

- [x] **Step 3: Migration'ı çalıştır**

```bash
node scripts/migrate.js
```

Expected: `OK: ALTER TABLE bayiler ADD COLUMN...`, `OK: CREATE TABLE IF NOT EXISTS odemeler...`, `OK: CREATE TABLE IF NOT EXISTS kredi_hareketleri...`, sonunda `Migration tamamlandı.`

- [x] **Step 4: Commit**

```bash
git add scripts/migrate.js db/schema.sql
git commit -m "feat: bayi kredi bakiyesi, odemeler ve kredi_hareketleri tablolari"
```

---

## Task 2: `utils/paytr.js` — Hash Yardımcıları

**Files:**
- Create: `utils/paytr.js`
- Test: `tests/paytr.test.js`

- [x] **Step 1: Failing testleri yaz**

`tests/paytr.test.js`:

```javascript
const crypto = require('crypto');
const { tokenHashOlustur, callbackHashDogrula } = require('../utils/paytr');

describe('tokenHashOlustur', () => {
  const temelGirdi = {
    merchantId: '12345', userIp: '1.2.3.4', email: 'test@test.com',
    paymentAmount: 1000, userBasket: 'W10=', noInstallment: 0,
    maxInstallment: 0, currency: 'TL', testMode: 1,
    merchantSalt: 'salt123', merchantKey: 'key123',
  };

  test('aynı girdiler için aynı hash üretir (deterministik)', () => {
    const girdi = { ...temelGirdi, merchantOid: 'ORD1' };
    expect(tokenHashOlustur(girdi)).toBe(tokenHashOlustur(girdi));
  });

  test('farklı merchantOid farklı hash üretir', () => {
    const h1 = tokenHashOlustur({ ...temelGirdi, merchantOid: 'ORD1' });
    const h2 = tokenHashOlustur({ ...temelGirdi, merchantOid: 'ORD2' });
    expect(h1).not.toBe(h2);
  });

  test('base64 formatında string döner', () => {
    const h = tokenHashOlustur({ ...temelGirdi, merchantOid: 'ORD1' });
    expect(typeof h).toBe('string');
    expect(() => Buffer.from(h, 'base64')).not.toThrow();
  });
});

describe('callbackHashDogrula', () => {
  test('doğru hash için true döner', () => {
    const merchantOid = 'ORD1', status = 'success', totalAmount = '1000';
    const merchantSalt = 'salt123', merchantKey = 'key123';
    const dogruHash = crypto
      .createHmac('sha256', merchantKey)
      .update(`${merchantOid}${merchantSalt}${status}${totalAmount}`)
      .digest('base64');

    expect(callbackHashDogrula({ merchantOid, status, totalAmount, merchantSalt, merchantKey, gelenHash: dogruHash })).toBe(true);
  });

  test('yanlış hash için false döner', () => {
    expect(callbackHashDogrula({
      merchantOid: 'ORD1', status: 'success', totalAmount: '1000',
      merchantSalt: 'salt123', merchantKey: 'key123', gelenHash: 'yanlis-hash',
    })).toBe(false);
  });

  test('farklı tutar için hash uyuşmaz', () => {
    const merchantOid = 'ORD1', status = 'success';
    const merchantSalt = 'salt123', merchantKey = 'key123';
    const hash1000Icin = crypto
      .createHmac('sha256', merchantKey)
      .update(`${merchantOid}${merchantSalt}${status}1000`)
      .digest('base64');

    expect(callbackHashDogrula({
      merchantOid, status, totalAmount: '2000',
      merchantSalt, merchantKey, gelenHash: hash1000Icin,
    })).toBe(false);
  });
});
```

- [x] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx jest tests/paytr.test.js`
Expected: FAIL (`utils/paytr.js` henüz yok)

- [x] **Step 3: utils/paytr.js oluştur**

```javascript
const crypto = require('crypto');

function tokenHashOlustur({
  merchantId, userIp, merchantOid, email, paymentAmount, userBasket,
  noInstallment, maxInstallment, currency, testMode, merchantSalt, merchantKey,
}) {
  const hashStr = `${merchantId}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
  return crypto
    .createHmac('sha256', merchantKey)
    .update(hashStr + merchantSalt)
    .digest('base64');
}

function callbackHashDogrula({ merchantOid, status, totalAmount, merchantSalt, merchantKey, gelenHash }) {
  const hashStr = `${merchantOid}${merchantSalt}${status}${totalAmount}`;
  const hesaplanan = crypto
    .createHmac('sha256', merchantKey)
    .update(hashStr)
    .digest('base64');
  return hesaplanan === gelenHash;
}

module.exports = { tokenHashOlustur, callbackHashDogrula };
```

- [x] **Step 4: Testi çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/paytr.test.js`
Expected: PASS (6 test)

- [x] **Step 5: Commit**

```bash
git add utils/paytr.js tests/paytr.test.js
git commit -m "feat: paytr token ve callback hash yardimcilari"
```

---

## Task 3: `routes/bayi.js` — Firma Eklerken Kredi Kontrolü ve Düşürme

**Files:**
- Modify: `routes/bayi.js`
- Test: `tests/kredi.test.js`

- [x] **Step 1: Failing entegrasyon testleri yaz**

`tests/kredi.test.js`:

```javascript
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Bayi kredi kontrolü — firma ekleme', () => {
  let bayiId;
  const email = 'kredi-test-bayi@test.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, kredi_bakiyesi)
       VALUES ('Kredi Test Bayi', 'kredi-test-bayi', $1, $2, 0) RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  test('kredi 0 iken firma eklenemez', async () => {
    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ email, sifre });

    const oncekiFirmaSayisi = (await pool.query('SELECT COUNT(*) FROM firmalar WHERE bayi_id = $1', [bayiId])).rows[0].count;

    const res = await agent.post('/bayi/panel/firma-ekle').send({ ad: 'Kredi Test Firma' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/bayi/panel/kredi-yukle');

    const sonrakiFirmaSayisi = (await pool.query('SELECT COUNT(*) FROM firmalar WHERE bayi_id = $1', [bayiId])).rows[0].count;
    expect(sonrakiFirmaSayisi).toBe(oncekiFirmaSayisi);
  });

  test('kredi varsa firma eklenir ve kredi 1 düşer', async () => {
    await pool.query('UPDATE bayiler SET kredi_bakiyesi = 3 WHERE id = $1', [bayiId]);

    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ email, sifre });

    const res = await agent.post('/bayi/panel/firma-ekle').send({ ad: 'Kredi Test Firma 2' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/bayi/panel');

    const bayiSonuc = await pool.query('SELECT kredi_bakiyesi FROM bayiler WHERE id = $1', [bayiId]);
    expect(bayiSonuc.rows[0].kredi_bakiyesi).toBe(2);

    const hareketSonuc = await pool.query(
      `SELECT * FROM kredi_hareketleri WHERE bayi_id = $1 AND tip = 'harcama' ORDER BY created_at DESC LIMIT 1`,
      [bayiId]
    );
    expect(hareketSonuc.rows.length).toBe(1);
    expect(hareketSonuc.rows[0].miktar).toBe(-1);

    await pool.query('DELETE FROM firmalar WHERE bayi_id = $1', [bayiId]);
  });
});
```

- [x] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx jest tests/kredi.test.js`
Expected: FAIL (kredi kontrolü henüz yok, ilk test büyük ihtimalle firma eklenmesine izin verdiği için başarısız olur)

- [x] **Step 3: `/panel/firma-ekle` POST route'unun gövdesini güncelle**

Mevcut (route kayıt satırına — `router.post('/panel/firma-ekle', requireBayi, ...)` — dokunma, sadece handler gövdesini hedefle):

```javascript
  const { ad, sektor, marka_rengi } = req.body;
  if (!ad) {
    req.flash('error', 'Müşteri adı zorunlu.');
    return res.redirect('/bayi/panel/firma-ekle');
  }
  try {
    let slug = firmaSlugOlustur(ad);
    const check = await pool.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    // Firma girişi olmayacak — dummy email/sifre
    const dummyEmail = `${slug}-${Date.now()}@bayi.local`;
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 8);

    await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor, marka_rengi, bayi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ad, slug, dummyEmail, dummyHash, sektor || 'diger', marka_rengi || '#1a73e8', req.session.bayiId]
    );
    req.flash('success', `${ad} eklendi.`);
    res.redirect('/bayi/panel');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Eklenemedi.');
    res.redirect('/bayi/panel/firma-ekle');
  }
```

şu şekilde değiştir:

```javascript
  const { ad, sektor, marka_rengi } = req.body;
  if (!ad) {
    req.flash('error', 'Müşteri adı zorunlu.');
    return res.redirect('/bayi/panel/firma-ekle');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bayiSonuc = await client.query(
      'SELECT kredi_bakiyesi FROM bayiler WHERE id = $1 FOR UPDATE',
      [req.session.bayiId]
    );
    if (!bayiSonuc.rows.length || bayiSonuc.rows[0].kredi_bakiyesi < 1) {
      await client.query('ROLLBACK');
      req.flash('error', 'Krediniz kalmadı, lütfen kredi yükleyin.');
      return res.redirect('/bayi/panel/kredi-yukle');
    }

    let slug = firmaSlugOlustur(ad);
    const check = await client.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    // Firma girişi olmayacak — dummy email/sifre
    const dummyEmail = `${slug}-${Date.now()}@bayi.local`;
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 8);

    const firmaSonuc = await client.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor, marka_rengi, bayi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ad, slug, dummyEmail, dummyHash, sektor || 'diger', marka_rengi || '#1a73e8', req.session.bayiId]
    );

    await client.query('UPDATE bayiler SET kredi_bakiyesi = kredi_bakiyesi - 1 WHERE id = $1', [req.session.bayiId]);

    await client.query(
      `INSERT INTO kredi_hareketleri (bayi_id, tip, miktar, aciklama, firma_id)
       VALUES ($1, 'harcama', -1, $2, $3)`,
      [req.session.bayiId, `Firma eklendi: ${ad}`, firmaSonuc.rows[0].id]
    );

    await client.query('COMMIT');
    req.flash('success', `${ad} eklendi.`);
    res.redirect('/bayi/panel');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    req.flash('error', 'Eklenemedi.');
    res.redirect('/bayi/panel/firma-ekle');
  } finally {
    client.release();
  }
```

- [x] **Step 4: Testleri çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/kredi.test.js`
Expected: PASS (2 test)

- [x] **Step 5: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add routes/bayi.js tests/kredi.test.js
git commit -m "feat: firma eklerken bayi kredi kontrolu ve transactional dusurme"
```

---

## Task 4: `routes/odeme.js` — Kredi Paketleri ve PayTR Ödeme Başlatma

**Files:**
- Create: `routes/odeme.js`
- Create: `views/bayi/kredi-yukle.ejs`
- Create: `views/bayi/odeme-iframe.ejs`
- Modify: `app.js`
- Modify: `.env.example`

- [x] **Step 1: .env.example'a PayTR değişkenlerini ekle**

`.env.example` dosyasının sonuna ekle:

```
PAYTR_MERCHANT_ID=xxx
PAYTR_MERCHANT_KEY=xxx
PAYTR_MERCHANT_SALT=xxx
GOOGLE_MAPS_API_KEY=xxx
```

- [x] **Step 2: routes/odeme.js oluştur**

```javascript
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireBayi } = require('../middleware/authMiddleware');
const { tokenHashOlustur, callbackHashDogrula } = require('../utils/paytr');

const KREDI_PAKETLERI = [
  { kredi: 10, tutar: 500 },
  { kredi: 25, tutar: 1000 },
  { kredi: 50, tutar: 1750 },
  { kredi: 100, tutar: 3000 },
];

// Kredi yükleme sayfası
router.get('/panel/kredi-yukle', requireBayi, async (req, res) => {
  try {
    const bayiSonuc = await pool.query('SELECT kredi_bakiyesi FROM bayiler WHERE id = $1', [req.session.bayiId]);
    res.render('bayi/kredi-yukle', {
      title: 'Kredi Yükle',
      krediBakiyesi: bayiSonuc.rows[0].kredi_bakiyesi,
      paketler: KREDI_PAKETLERI,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Bir hata oluştu.');
    res.redirect('/bayi/panel');
  }
});

// Paket seçimi -> PayTR token isteği -> iframe sayfası
router.post('/panel/kredi-yukle', requireBayi, async (req, res) => {
  const kredi = parseInt(req.body.kredi, 10);
  const paket = KREDI_PAKETLERI.find((p) => p.kredi === kredi);
  if (!paket) {
    req.flash('error', 'Geçersiz paket seçimi.');
    return res.redirect('/bayi/panel/kredi-yukle');
  }

  try {
    const bayiSonuc = await pool.query('SELECT * FROM bayiler WHERE id = $1', [req.session.bayiId]);
    const bayi = bayiSonuc.rows[0];
    const merchantOid = `KRD${req.session.bayiId}${Date.now()}`;

    await pool.query(
      `INSERT INTO odemeler (bayi_id, paytr_merchant_oid, kredi_miktari, tutar, durum)
       VALUES ($1, $2, $3, $4, 'beklemede')`,
      [req.session.bayiId, merchantOid, paket.kredi, paket.tutar]
    );

    const paymentAmount = Math.round(paket.tutar * 100); // kuruş cinsinden
    const userBasket = Buffer.from(
      JSON.stringify([[`${paket.kredi} Kredi Paketi`, paket.tutar.toFixed(2), 1]])
    ).toString('base64');
    const userIp = req.ip;
    const noInstallment = 1;
    const maxInstallment = 1;
    const currency = 'TL';
    const testMode = process.env.NODE_ENV === 'production' ? 0 : 1;

    const paytrToken = tokenHashOlustur({
      merchantId: process.env.PAYTR_MERCHANT_ID,
      userIp,
      merchantOid,
      email: bayi.email,
      paymentAmount,
      userBasket,
      noInstallment,
      maxInstallment,
      currency,
      testMode,
      merchantSalt: process.env.PAYTR_MERCHANT_SALT,
      merchantKey: process.env.PAYTR_MERCHANT_KEY,
    });

    const govde = new URLSearchParams({
      merchant_id: process.env.PAYTR_MERCHANT_ID,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email: bayi.email,
      payment_amount: String(paymentAmount),
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: '1',
      no_installment: String(noInstallment),
      max_installment: String(maxInstallment),
      user_name: bayi.ad,
      user_address: 'Belirtilmedi',
      user_phone: '05000000000',
      merchant_ok_url: `${req.protocol}://${req.get('host')}/bayi/odeme/basarili`,
      merchant_fail_url: `${req.protocol}://${req.get('host')}/bayi/panel/kredi-yukle`,
      timeout_limit: '30',
      currency,
      test_mode: String(testMode),
    });

    const paytrYaniti = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: govde,
    });
    const sonuc = await paytrYaniti.json();

    if (sonuc.status !== 'success') {
      console.error('PayTR token hatasi:', sonuc.reason);
      req.flash('error', 'Ödeme başlatılamadı: ' + (sonuc.reason || 'bilinmeyen hata'));
      return res.redirect('/bayi/panel/kredi-yukle');
    }

    res.render('bayi/odeme-iframe', { title: 'Ödeme', iframeToken: sonuc.token });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Ödeme başlatılamadı.');
    res.redirect('/bayi/panel/kredi-yukle');
  }
});

module.exports = { router, KREDI_PAKETLERI };
```

**Not:** `module.exports` hem router'ı hem `KREDI_PAKETLERI`'yi export ediyor (paket listesi Task 5'te eklenecek başarılı sayfasında da referans olarak kullanılabilir ve testlerde paket fiyatlarına erişim sağlar).

- [x] **Step 3: app.js'i güncelle**

`app.js` dosyasının başındaki require'ların yanına ekle:

```javascript
const { router: odemeRoutes } = require('./routes/odeme');
```

`app.use('/bayi', bayiRoutes);` satırından hemen sonra ekle:

```javascript
app.use('/bayi', odemeRoutes);
```

- [x] **Step 4: views/bayi/kredi-yukle.ejs oluştur**

```html
<div class="panel-container">
  <header class="panel-header">
    <h2>Kredi Yükle</h2>
    <a href="/bayi/panel" class="btn-link">← Panele Dön</a>
  </header>

  <div class="stat-kart" style="max-width:260px;margin-bottom:24px">
    <div class="stat-sayi"><%= krediBakiyesi %></div>
    <div class="stat-label">Mevcut Kredi</div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px">
    <% paketler.forEach(paket => { %>
      <form method="POST" action="/bayi/panel/kredi-yukle" style="border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:20px;display:flex;flex-direction:column;gap:8px">
        <input type="hidden" name="kredi" value="<%= paket.kredi %>">
        <div style="font-size:28px;font-weight:800"><%= paket.kredi %> <span style="font-size:14px;font-weight:600;color:var(--text-secondary)">Kredi</span></div>
        <div style="font-size:15px;color:var(--text-secondary)"><%= paket.tutar.toLocaleString('tr-TR') %> ₺</div>
        <button type="submit" class="btn" style="width:100%;justify-content:center;margin-top:8px">Satın Al</button>
      </form>
    <% }); %>
  </div>
</div>
```

- [x] **Step 5: views/bayi/odeme-iframe.ejs oluştur**

```html
<div class="panel-container">
  <header class="panel-header">
    <h2>Ödeme</h2>
    <a href="/bayi/panel/kredi-yukle" class="btn-link">← Vazgeç</a>
  </header>
  <iframe src="https://www.paytr.com/odeme/guvenli/<%= iframeToken %>" id="paytr-iframe" frameborder="0" scrolling="no" style="width:100%;min-height:600px"></iframe>
  <script src="https://www.paytr.com/js/iframeResizer.min.js"></script>
  <script>iFrameResize({}, '#paytr-iframe');</script>
</div>
```

- [x] **Step 6: Manuel test — kredi paketleri sayfası**

```bash
npm run dev
```

Bir bayi hesabıyla giriş yap, `/bayi/panel/kredi-yukle` sayfasını aç, 4 paketin (10/25/50/100 kredi) göründüğünü doğrula. `.env`'de `PAYTR_MERCHANT_ID` vb. tanımlı değilse "Satın Al" butonuna basınca PayTR API'sinden hata dönmesi beklenir (flash mesajıyla aynı sayfaya geri döner) — bu, kimlik bilgileri olmadan beklenen davranıştır; gerçek test için PayTR mağaza hesabı gerekir (bkz. plan başındaki Ön Koşul notu).

- [x] **Step 7: Commit**

```bash
git add routes/odeme.js views/bayi/kredi-yukle.ejs views/bayi/odeme-iframe.ejs app.js .env.example
git commit -m "feat: paytr ile kredi paketi satin alma akisi"
```

---

## Task 5: PayTR Callback ve Ödeme Onayı

**Files:**
- Modify: `routes/odeme.js`
- Create: `views/bayi/odeme-basarili.ejs`
- Test: `tests/odeme.test.js`

- [x] **Step 1: Failing entegrasyon testlerini yaz**

`tests/odeme.test.js`:

```javascript
require('dotenv').config();
const request = require('supertest');
const crypto = require('crypto');
const app = require('../app');
const { pool } = require('../db');

function paytrCallbackHashUret(merchantOid, status, totalAmount) {
  const salt = process.env.PAYTR_MERCHANT_SALT || 'test-salt';
  const key = process.env.PAYTR_MERCHANT_KEY || 'test-key';
  return crypto
    .createHmac('sha256', key)
    .update(`${merchantOid}${salt}${status}${totalAmount}`)
    .digest('base64');
}

describe('POST /bayi/odeme/paytr-callback', () => {
  let bayiId;
  const merchantOid = `TESTOID${Date.now()}`;

  beforeAll(async () => {
    const bayiSonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, kredi_bakiyesi)
       VALUES ('Odeme Test Bayi', 'odeme-test-bayi-${Date.now()}', 'odeme-test-${Date.now()}@test.com', 'x', 0)
       RETURNING id`
    );
    bayiId = bayiSonuc.rows[0].id;
    await pool.query(
      `INSERT INTO odemeler (bayi_id, paytr_merchant_oid, kredi_miktari, tutar, durum)
       VALUES ($1, $2, 25, 1000, 'beklemede')`,
      [bayiId, merchantOid]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  test('geçersiz hash için 400 döner ve hiçbir şey güncellenmez', async () => {
    const res = await request(app)
      .post('/bayi/odeme/paytr-callback')
      .send({ merchant_oid: merchantOid, status: 'success', total_amount: '1000', hash: 'gecersiz-hash' });

    expect(res.statusCode).toBe(400);

    const odemeSonuc = await pool.query('SELECT durum FROM odemeler WHERE paytr_merchant_oid = $1', [merchantOid]);
    expect(odemeSonuc.rows[0].durum).toBe('beklemede');
  });

  test('geçerli hash ve success durumu için kredi eklenir', async () => {
    const hash = paytrCallbackHashUret(merchantOid, 'success', '1000');
    const res = await request(app)
      .post('/bayi/odeme/paytr-callback')
      .send({ merchant_oid: merchantOid, status: 'success', total_amount: '1000', hash });

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('OK');

    const odemeSonuc = await pool.query('SELECT durum FROM odemeler WHERE paytr_merchant_oid = $1', [merchantOid]);
    expect(odemeSonuc.rows[0].durum).toBe('basarili');

    const bayiSonuc = await pool.query('SELECT kredi_bakiyesi FROM bayiler WHERE id = $1', [bayiId]);
    expect(bayiSonuc.rows[0].kredi_bakiyesi).toBe(25);

    const hareketSonuc = await pool.query(
      `SELECT * FROM kredi_hareketleri WHERE bayi_id = $1 AND tip = 'yukleme'`,
      [bayiId]
    );
    expect(hareketSonuc.rows.length).toBe(1);
    expect(hareketSonuc.rows[0].miktar).toBe(25);
  });

  test('aynı ödeme için ikinci kez callback gelirse kredi tekrar eklenmez (idempotency)', async () => {
    const hash = paytrCallbackHashUret(merchantOid, 'success', '1000');
    await request(app)
      .post('/bayi/odeme/paytr-callback')
      .send({ merchant_oid: merchantOid, status: 'success', total_amount: '1000', hash });

    const bayiSonuc = await pool.query('SELECT kredi_bakiyesi FROM bayiler WHERE id = $1', [bayiId]);
    expect(bayiSonuc.rows[0].kredi_bakiyesi).toBe(25); // hâlâ 25, tekrar eklenmedi
  });
});
```

**Not:** Bu testler `.env`'de `PAYTR_MERCHANT_SALT`/`PAYTR_MERCHANT_KEY` tanımlı değilse `'test-salt'`/`'test-key'` varsayılan değerlerini kullanır (route tarafında da aynı `process.env.PAYTR_MERCHANT_SALT`/`KEY` okunuyor, tanımlı değilse `undefined` olur ve `crypto.createHmac` bununla da çalışır ama tutarlı olması için test ortamında `.env`'e bu değerleri eklemeniz önerilir — gerçek PayTR hesabı olmasa bile rastgele bir test değeri yeterli).

- [x] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx jest tests/odeme.test.js`
Expected: FAIL (`/bayi/odeme/paytr-callback` route'u henüz yok, 404 döner)

- [x] **Step 3: routes/odeme.js'e callback ve başarılı route'larını ekle**

`routes/odeme.js` dosyasındaki `module.exports = { router, KREDI_PAKETLERI };` satırından HEMEN ÖNCE ekle:

```javascript
// PayTR bildirim (callback) — PayTR sunucusu tarafından çağrılır, oturum gerektirmez
router.post('/odeme/paytr-callback', async (req, res) => {
  const { merchant_oid, status, total_amount, hash } = req.body;

  const gecerli = callbackHashDogrula({
    merchantOid: merchant_oid,
    status,
    totalAmount: total_amount,
    merchantSalt: process.env.PAYTR_MERCHANT_SALT,
    merchantKey: process.env.PAYTR_MERCHANT_KEY,
    gelenHash: hash,
  });

  if (!gecerli) {
    console.error('PayTR callback hash dogrulanamadi:', merchant_oid);
    return res.status(400).send('PAYTR notification failed: bad hash');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const odemeSonuc = await client.query(
      'SELECT * FROM odemeler WHERE paytr_merchant_oid = $1 FOR UPDATE',
      [merchant_oid]
    );
    if (!odemeSonuc.rows.length || odemeSonuc.rows[0].durum === 'basarili') {
      await client.query('ROLLBACK');
      return res.send('OK');
    }
    const odeme = odemeSonuc.rows[0];

    if (status === 'success') {
      await client.query(
        `UPDATE odemeler SET durum = 'basarili', onaylanma_tarihi = NOW() WHERE id = $1`,
        [odeme.id]
      );
      await client.query(
        'UPDATE bayiler SET kredi_bakiyesi = kredi_bakiyesi + $1 WHERE id = $2',
        [odeme.kredi_miktari, odeme.bayi_id]
      );
      await client.query(
        `INSERT INTO kredi_hareketleri (bayi_id, tip, miktar, aciklama, odeme_id)
         VALUES ($1, 'yukleme', $2, $3, $4)`,
        [odeme.bayi_id, odeme.kredi_miktari, `PayTR ödeme: ${odeme.kredi_miktari} kredi paketi`, odeme.id]
      );
    } else {
      await client.query(`UPDATE odemeler SET durum = 'basarisiz' WHERE id = $1`, [odeme.id]);
    }

    await client.query('COMMIT');
    res.send('OK');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    // "OK" DONDURULMEZ — PayTR bu durumda bildirimi tekrar gonderir
    res.status(500).send('Hata');
  } finally {
    client.release();
  }
});

// Ödeme sonrası bilgilendirme sayfası
router.get('/odeme/basarili', requireBayi, (req, res) => {
  res.render('bayi/odeme-basarili', { title: 'Ödeme Alındı' });
});

```

- [x] **Step 4: views/bayi/odeme-basarili.ejs oluştur**

```html
<div class="panel-container">
  <div class="form-container" style="text-align:center">
    <h2>Ödeme Alındı</h2>
    <p style="color:var(--text-secondary);margin-bottom:24px">Ödemeniz işleniyor, kredi bakiyeniz birkaç dakika içinde güncellenecek.</p>
    <a href="/bayi/panel" class="btn">Panele Dön</a>
  </div>
</div>
```

- [x] **Step 5: Testleri çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/odeme.test.js`
Expected: PASS (3 test)

- [x] **Step 6: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add routes/odeme.js views/bayi/odeme-basarili.ejs tests/odeme.test.js
git commit -m "feat: paytr callback ile kredi onaylama (idempotent, transactional)"
```

---

## Task 6: `views/bayi/panel.ejs` — Kredi Bakiyesi Gösterimi

**Files:**
- Modify: `views/bayi/panel.ejs`

- [x] **Step 1: Stat kartlarına kredi bakiyesini ekle**

Mevcut:

```html
  <div style="display:flex;gap:16px;margin-bottom:24px">
    <div class="stat-kart"><div class="stat-sayi"><%= firmalar.length %></div><div class="stat-label">Müşteri</div></div>
    <div class="stat-kart"><div class="stat-sayi"><%= firmalar.reduce((s,f)=>s+parseInt(f.calisan_sayisi||0),0) %></div><div class="stat-label">Toplam Kart</div></div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3>Müşteriler</h3>
    <a href="/bayi/panel/firma-ekle" class="btn">+ Müşteri Ekle</a>
  </div>
```

şu şekilde değiştir:

```html
  <div style="display:flex;gap:16px;margin-bottom:24px">
    <div class="stat-kart"><div class="stat-sayi"><%= firmalar.length %></div><div class="stat-label">Müşteri</div></div>
    <div class="stat-kart"><div class="stat-sayi"><%= firmalar.reduce((s,f)=>s+parseInt(f.calisan_sayisi||0),0) %></div><div class="stat-label">Toplam Kart</div></div>
    <div class="stat-kart"><div class="stat-sayi"><%= bayi.kredi_bakiyesi %></div><div class="stat-label">Kalan Kredi</div></div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3>Müşteriler</h3>
    <div style="display:flex;gap:8px">
      <a href="/bayi/panel/kredi-yukle" class="btn btn-secondary">+ Kredi Yükle</a>
      <a href="/bayi/panel/firma-ekle" class="btn">+ Müşteri Ekle</a>
    </div>
  </div>
```

- [x] **Step 2: Manuel test**

```bash
npm run dev
```

Bir bayi hesabıyla giriş yap, `/bayi/panel` sayfasında "Kalan Kredi" kartının ve "+ Kredi Yükle" butonunun göründüğünü doğrula.

- [x] **Step 3: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add views/bayi/panel.ejs
git commit -m "feat: bayi panelinde kredi bakiyesi gosterimi"
```

---

## Task 7: Uçtan Uca Manuel Doğrulama

**Files:** (yok — sadece doğrulama)

- [x] **Step 1: Tam akışı gözden geçir**

```bash
npm run dev
```

1. Süperadmin panelinden (`/superadmin`) yeni bir bayi ekle (veya `scripts/reset-password.js` gibi mevcut script'lerden birini inceleyip elle bir bayiye `UPDATE bayiler SET kredi_bakiyesi = 5 WHERE id = ...` ile test kredisi ver).
2. O bayi hesabıyla giriş yap, panelde kredi bakiyesinin göründüğünü doğrula.
3. Birkaç firma ekle, her eklemede kredinin 1 azaldığını doğrula.
4. Kredi 0'a inince "Krediniz kalmadı" mesajıyla `/bayi/panel/kredi-yukle`'ye yönlendirildiğini doğrula.
5. PayTR mağaza hesabı varsa test modunda bir paket satın al, iframe'in açıldığını, test kartıyla ödeme sonrası kredi bakiyesinin arttığını doğrula. Hesap yoksa bu adımı atla, bir sonraki fazda gerçek hesap tanımlandığında tekrar doğrulanmalı.

- [x] **Step 2: Tüm test paketini son kez çalıştır**

Run: `npx jest`
Expected: Tüm testler PASS
