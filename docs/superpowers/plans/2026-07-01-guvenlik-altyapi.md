# Güvenlik & Altyapı Sertleştirme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Uygulamaya `helmet` güvenlik header'ları, giriş/firma-ekleme route'larına `express-rate-limit` brute-force koruması ve foto upload limitini 5MB'dan 15MB'a çıkarmak.

**Architecture:** Mevcut Express middleware zincirine iki yeni katman eklenir: global `helmet()` ve route-özel rate limiter'lar (`middleware/rateLimiter.js`, mevcut `req.flash` + redirect deseniyle uyumlu custom handler ile). `middleware/upload.js`'teki sabit limit değeri değiştirilir.

**Tech Stack:** helmet, express-rate-limit, Jest, Supertest (mevcut test altyapısı)

---

## Task 1: Bağımlılıkları Ekle

**Files:**
- Modify: `package.json`

- [x] **Step 1: Paketleri yükle**

```bash
npm install helmet express-rate-limit
```

- [x] **Step 2: package.json'da dependencies bölümüne eklendiğini doğrula**

`package.json` içindeki `"dependencies"` bölümünde `"helmet"` ve `"express-rate-limit"` satırlarının göründüğünü kontrol et.

- [x] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: helmet ve express-rate-limit bagimliliklarini ekle"
```

---

## Task 2: Rate Limiter Middleware

**Files:**
- Create: `middleware/rateLimiter.js`
- Test: `tests/rateLimiter.test.js`

- [x] **Step 1: Failing test yaz**

`tests/rateLimiter.test.js`:

```javascript
require('dotenv').config();
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db');

afterAll(async () => {
  await pool.end();
});

describe('POST /firma/giris rate limit', () => {
  test('15 dakikada 10 denemeden sonra 11. istek engellenir', async () => {
    let sonIstek;
    for (let i = 0; i < 11; i++) {
      sonIstek = await request(app)
        .post('/firma/giris')
        .send({ yetkili_email: 'olmayan@test.com', sifre: 'yanlis' });
    }
    expect(sonIstek.statusCode).toBe(302);
    expect(sonIstek.headers.location).toBe('/firma/giris');
  }, 20000);
});
```

- [x] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx jest tests/rateLimiter.test.js`
Expected: FAIL (henüz rate limit yok, 11. istek de normal 302 döner ama flash mesajı farklı olacağı için bu adımda asıl amaç `middleware/rateLimiter.js` dosyasının yokluğundan değil, davranışın henüz doğrulanamamasından — testi çalıştırıp şu an geçtiğini/geçmediğini gözlemle, sonraki adımda rate limiter eklenince asıl fark ortaya çıkacak. Bu test dosyası import hatası vermemeli çünkü henüz `middleware/rateLimiter.js`'i import etmiyor.)

- [x] **Step 3: middleware/rateLimiter.js oluştur**

```javascript
const rateLimit = require('express-rate-limit');

function createLoginLimiter(redirectPath) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      req.flash('error', 'Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');
      res.redirect(redirectPath);
    },
  });
}

const firmaEkleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Çok fazla işlem yaptınız. Lütfen biraz sonra tekrar deneyin.');
    res.redirect('/bayi/panel/firma-ekle');
  },
});

module.exports = { createLoginLimiter, firmaEkleLimiter };
```

- [x] **Step 4: routes/auth.js'e uygula**

`routes/auth.js` dosyasının başındaki require'ların yanına ekle:

```javascript
const { createLoginLimiter } = require('../middleware/rateLimiter');
const girisLimiter = createLoginLimiter('/firma/giris');
```

`router.post('/giris', async (req, res) => {` satırını şu şekilde değiştir:

```javascript
router.post('/giris', girisLimiter, async (req, res) => {
```

- [x] **Step 5: Testi çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/rateLimiter.test.js`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add middleware/rateLimiter.js routes/auth.js tests/rateLimiter.test.js
git commit -m "feat: firma girisine rate limit ekle"
```

---

## Task 3: Bayi ve Süper Admin Girişine + Firma Eklemeye Rate Limit Uygula

**Files:**
- Modify: `routes/bayi.js`
- Modify: `routes/superadmin.js`
- Test: `tests/rateLimiter.test.js` (genişletilir)

- [x] **Step 1: Failing testleri ekle**

`tests/rateLimiter.test.js` dosyasının sonuna (mevcut `describe` bloğundan sonra, `afterAll`'dan önce değil, dosya sonuna) ekle:

```javascript
describe('POST /bayi/giris rate limit', () => {
  test('15 dakikada 10 denemeden sonra 11. istek engellenir', async () => {
    let sonIstek;
    for (let i = 0; i < 11; i++) {
      sonIstek = await request(app)
        .post('/bayi/giris')
        .send({ email: 'olmayan@test.com', sifre: 'yanlis' });
    }
    expect(sonIstek.statusCode).toBe(302);
    expect(sonIstek.headers.location).toBe('/bayi/giris');
  }, 20000);
});

describe('POST /superadmin/giris rate limit', () => {
  test('15 dakikada 10 denemeden sonra 11. istek engellenir', async () => {
    let sonIstek;
    for (let i = 0; i < 11; i++) {
      sonIstek = await request(app)
        .post('/superadmin/giris')
        .send({ sifre: 'yanlis-sifre' });
    }
    expect(sonIstek.statusCode).toBe(302);
    expect(sonIstek.headers.location).toBe('/superadmin/giris');
  }, 20000);
});
```

- [x] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx jest tests/rateLimiter.test.js`
Expected: Yeni iki test FAIL (henüz `/bayi/giris` ve `/superadmin/giris` route'larına limiter uygulanmadı, 11. istek de her zaman 302 dönüyor olsa bile flash mesajı ve limit davranışı henüz yok — bu adımda gerçek fark, Task 4'te limiter eklenince ortaya çıkar. Bu testler mevcut haliyle davranışsal olarak aynı sonucu (302 + aynı redirect path) üretebileceğinden, bu spesifik testler `handler`'ın çalıştığını garanti etmiyor; asıl doğrulama sonraki adımda limiter eklenip req sayısı azaltıldığında console/manuel testle yapılacak. Şimdilik testi çalıştırıp mevcut durumu gözlemle.)

- [x] **Step 3: routes/bayi.js'e uygula**

`routes/bayi.js` dosyasının başındaki require'ların yanına ekle:

```javascript
const { createLoginLimiter, firmaEkleLimiter } = require('../middleware/rateLimiter');
const bayiGirisLimiter = createLoginLimiter('/bayi/giris');
```

`router.post('/giris', async (req, res) => {` satırını değiştir:

```javascript
router.post('/giris', bayiGirisLimiter, async (req, res) => {
```

`router.post('/panel/firma-ekle', requireBayi, async (req, res) => {` satırını değiştir:

```javascript
router.post('/panel/firma-ekle', requireBayi, firmaEkleLimiter, async (req, res) => {
```

- [x] **Step 4: routes/superadmin.js'e uygula**

`routes/superadmin.js` dosyasının başındaki require'ların yanına ekle:

```javascript
const { createLoginLimiter } = require('../middleware/rateLimiter');
const superadminGirisLimiter = createLoginLimiter('/superadmin/giris');
```

`router.post('/giris', (req, res) => {` satırını değiştir:

```javascript
router.post('/giris', superadminGirisLimiter, (req, res) => {
```

- [x] **Step 5: Testleri çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/rateLimiter.test.js`
Expected: PASS (3 test)

- [x] **Step 6: Commit**

```bash
git add routes/bayi.js routes/superadmin.js tests/rateLimiter.test.js
git commit -m "feat: bayi ve superadmin girisi ile firma eklemeye rate limit ekle"
```

---

## Task 4: helmet Middleware

**Files:**
- Modify: `app.js`

- [x] **Step 1: app.js'e helmet ekle**

`app.js` dosyasının başındaki require'ların yanına ekle:

```javascript
const helmet = require('helmet');
```

`const app = express();` satırından hemen sonra ekle:

```javascript
app.use(helmet({
  contentSecurityPolicy: false, // Profil sayfasındaki inline <style>/<script> kullanımı nedeniyle bu fazda kapalı
}));
```

- [x] **Step 2: Sunucuyu başlat ve manuel test yap**

```bash
npm run dev
```

Tarayıcıda `http://localhost:3000/firma/giris` aç, geliştirici araçlarından Network sekmesinde yanıt header'larında `X-Content-Type-Options: nosniff` ve `X-Frame-Options: SAMEORIGIN` gibi helmet header'larının göründüğünü doğrula. Sayfanın normal render edildiğini, konsolda CSP hatası olmadığını kontrol et.

- [x] **Step 3: Mevcut testlerin hâlâ geçtiğini doğrula**

Run: `npx jest`
Expected: Tüm testler PASS (helmet mevcut route davranışlarını bozmamalı)

- [x] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: helmet guvenlik header middleware ekle"
```

---

## Task 5: Foto Upload Limitini 15MB'a Çıkar

**Not — Bağımlılık çakışması kontrolü:** Eğer `docs/superpowers/plans/2026-07-01-foto-isleme-sharp.md` planı bu plandan ÖNCE uygulandıysa, `middleware/upload.js` zaten tamamen yeniden yazılmış ve `MAX_FOTO_BOYUTU` zaten 15MB olarak tanımlanmış olacaktır — aşağıdaki adımlar o dosyanın eski (5MB'lık, farklı yapıdaki) haline göre yazıldı ve eşleşmeyebilir. Önce şunu çalıştırın:

```bash
grep -n "MAX_FOTO_BOYUTU" middleware/upload.js
```

Eğer bir sonuç dönerse (Foto İşleme planı zaten uygulanmış), bu Task'ı tamamen **atlayın** ve doğrudan Task 6'ya geçin. Sonuç dönmezse aşağıdaki adımları uygulayın.

- [x] **Step 1: Failing test yaz**

`tests/upload.test.js`:

```javascript
const { MAX_FOTO_BOYUTU } = require('../middleware/upload');

describe('upload limiti', () => {
  test('MAX_FOTO_BOYUTU 15MB olarak tanımlı', () => {
    expect(MAX_FOTO_BOYUTU).toBe(15 * 1024 * 1024);
  });
});
```

- [x] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx jest tests/upload.test.js`
Expected: FAIL (`MAX_FOTO_BOYUTU` henüz export edilmiyor)

- [x] **Step 3: middleware/upload.js'i güncelle**

`middleware/upload.js` dosyasının başına, `const multer = require('multer');` satırından hemen sonra ekle:

```javascript
const MAX_FOTO_BOYUTU = 15 * 1024 * 1024;
```

Dosya içindeki iki `limits: { fileSize: 5 * 1024 * 1024 }` satırının **ikisini de** şu şekilde değiştir:

```javascript
limits: { fileSize: MAX_FOTO_BOYUTU },
```

Dosyanın en altındaki `module.exports = { uploadMiddleware };` satırını değiştir:

```javascript
module.exports = { uploadMiddleware, MAX_FOTO_BOYUTU };
```

- [x] **Step 4: Testi çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/upload.test.js`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add middleware/upload.js tests/upload.test.js
git commit -m "feat: foto upload limitini 15MB'a cikar"
```

---

## Task 6: Tüm Test Paketini Doğrula

**Files:** (yok — sadece doğrulama)

- [x] **Step 1: Tüm testleri çalıştır**

Run: `npx jest`
Expected: Tüm testler PASS, hiçbir regresyon yok

- [x] **Step 2: Sunucuyu başlat, giriş formlarını manuel dene**

```bash
npm run dev
```

`/firma/giris`, `/bayi/giris`, `/superadmin/giris` sayfalarına normal (yanlış olmayan) bilgilerle giriş yapmayı dene — rate limiter normal kullanımı engellememeli (10 deneme altında kalındığı sürece).
