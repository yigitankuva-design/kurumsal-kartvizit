# Bayi Mobil API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut `kurumsal-kartvizit` Express backend'ine, geliştirilecek native Android bayi uygulamasının konuşacağı JSON REST API uçlarını eklemek (JWT ile giriş, müşteri listesi/detay, profil oluşturma, abonelik durumu).

**Architecture:** Yeni `routes/mobilApi.js` router'ı `/api/mobil` altında mount edilir. Kimlik doğrulama `Authorization: Bearer <JWT>` header'ı ile yapılır (session/cookie değil — native app için token daha uygun). Web tarafındaki (`routes/bayi.js`) "profil oluştur" iş mantığı `services/musteriService.js`'e taşınıp hem web hem mobil API tarafından paylaşılır (aynı kural iki yerde ayrı ayrı bakım gerektirmesin diye).

**Tech Stack:** Express 5, `jsonwebtoken` (yeni bağımlılık), pg, mevcut `multer`/`sharp` foto işleme, `sanitize-html`, jest + supertest.

---

## Dosya Yapısı

- Oluşturulacak: `utils/jwt.js` — JWT üretme/doğrulama
- Oluşturulacak: `middleware/tokenAuth.js` — `requireBayiToken` middleware
- Oluşturulacak: `services/musteriService.js` — `profilOlustur()` (web + mobil ortak iş mantığı)
- Oluşturulacak: `routes/mobilApi.js` — `/api/mobil` altındaki tüm uçlar
- Değiştirilecek: `middleware/rateLimiter.js` — JSON cevap döndüren limiter eklenir
- Değiştirilecek: `routes/bayi.js` — `POST /panel/firma-ekle` artık `musteriService.profilOlustur()`'u çağırır
- Değiştirilecek: `app.js` — `/api/mobil` router'ı mount edilir
- Değiştirilecek: `package.json` — `jsonwebtoken` eklenir
- Değiştirilecek: `.env` — `JWT_SECRET`, `SITE_URL` eklenir
- Test: `tests/jwt.test.js`, `tests/musteriService.test.js`, `tests/mobilApi.test.js`

---

### Task 1: JWT yardımcı fonksiyonları

**Files:**
- Create: `utils/jwt.js`
- Test: `tests/jwt.test.js`
- Modify: `.env` (proje kökünde, gitignored — elle eklenecek)

- [ ] **Step 1: `.env` dosyasına `JWT_SECRET` ekle**

`.env` dosyasını aç, aşağıdaki satırı ekle (rastgele, en az 32 karakterlik bir değer — örnek):

```
JWT_SECRET=nfckartify-mobil-api-2026-degistir-bunu-gercek-degerle-uzun-rastgele
```

- [ ] **Step 2: `jsonwebtoken` bağımlılığını ekle**

Run: `npm install jsonwebtoken`
Expected: `package.json`'da `"jsonwebtoken": "^9.x.x"` görünür.

- [ ] **Step 3: Başarısız testi yaz**

`tests/jwt.test.js`:

```js
require('dotenv').config();
const { bayiTokenUret, bayiTokenDogrula } = require('../utils/jwt');

describe('utils/jwt', () => {
  test('üretilen token doğrulanınca doğru bayiId döner', () => {
    const token = bayiTokenUret(42);
    const payload = bayiTokenDogrula(token);
    expect(payload.bayiId).toBe(42);
  });

  test('bozuk token doğrulanamaz', () => {
    expect(() => bayiTokenDogrula('gecersiz.token.deger')).toThrow();
  });
});
```

- [ ] **Step 4: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/jwt.test.js`
Expected: FAIL — `Cannot find module '../utils/jwt'`

- [ ] **Step 5: `utils/jwt.js`'i yaz**

```js
const jwt = require('jsonwebtoken');

function secretAl() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET tanımlı değil.');
  return secret;
}

function bayiTokenUret(bayiId) {
  return jwt.sign({ bayiId }, secretAl(), { expiresIn: '30d' });
}

function bayiTokenDogrula(token) {
  return jwt.verify(token, secretAl());
}

module.exports = { bayiTokenUret, bayiTokenDogrula };
```

- [ ] **Step 6: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/jwt.test.js`
Expected: PASS — 2 passed

- [ ] **Step 7: Commit**

```bash
git add utils/jwt.js tests/jwt.test.js package.json package-lock.json
git commit -m "Mobil API için JWT üretme/doğrulama yardımcıları ekle"
```

---

### Task 2: Token doğrulama middleware'i

**Files:**
- Create: `middleware/tokenAuth.js`
- Test: `tests/tokenAuth.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/tokenAuth.test.js`:

```js
require('dotenv').config();
const { requireBayiToken } = require('../middleware/tokenAuth');
const { bayiTokenUret } = require('../utils/jwt');

function sahteResCevap() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/tokenAuth', () => {
  test('geçerli Bearer token ile req.bayiId set edilir, next çağrılır', () => {
    const token = bayiTokenUret(7);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = sahteResCevap();
    const next = jest.fn();

    requireBayiToken(req, res, next);

    expect(req.bayiId).toBe(7);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('header yoksa 401 döner', () => {
    const req = { headers: {} };
    const res = sahteResCevap();
    const next = jest.fn();

    requireBayiToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('bozuk token ile 401 döner', () => {
    const req = { headers: { authorization: 'Bearer gecersiz.token.deger' } };
    const res = sahteResCevap();
    const next = jest.fn();

    requireBayiToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/tokenAuth.test.js`
Expected: FAIL — `Cannot find module '../middleware/tokenAuth'`

- [ ] **Step 3: `middleware/tokenAuth.js`'i yaz**

```js
const { bayiTokenDogrula } = require('../utils/jwt');

function requireBayiToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [tip, token] = header.split(' ');
  if (tip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  try {
    const payload = bayiTokenDogrula(token);
    req.bayiId = payload.bayiId;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
}

module.exports = { requireBayiToken };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/tokenAuth.test.js`
Expected: PASS — 3 passed

- [ ] **Step 5: Commit**

```bash
git add middleware/tokenAuth.js tests/tokenAuth.test.js
git commit -m "Mobil API için Bearer token doğrulama middleware'i ekle"
```

---

### Task 3: JSON cevap döndüren rate limiter

**Files:**
- Modify: `middleware/rateLimiter.js`
- Test: `tests/rateLimiterJson.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/rateLimiterJson.test.js`:

```js
const { createJsonLimiter } = require('../middleware/rateLimiter');

describe('createJsonLimiter', () => {
  test('bir express-rate-limit middleware fonksiyonu döner', () => {
    const limiter = createJsonLimiter('test mesajı');
    expect(typeof limiter).toBe('function');
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/rateLimiterJson.test.js`
Expected: FAIL — `createJsonLimiter is not a function`

- [ ] **Step 3: `middleware/rateLimiter.js`'e `createJsonLimiter` ekle**

Dosyanın tamamı (mevcut fonksiyonlar korunur, yenisi eklenir):

```js
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

function createJsonLimiter(mesaj) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ ok: false, error: mesaj });
    },
  });
}

module.exports = { createLoginLimiter, firmaEkleLimiter, createJsonLimiter };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/rateLimiterJson.test.js`
Expected: PASS — 1 passed

- [ ] **Step 5: Commit**

```bash
git add middleware/rateLimiter.js tests/rateLimiterJson.test.js
git commit -m "JSON cevap döndüren rate limiter fabrika fonksiyonu ekle"
```

---

### Task 4: Ortak "profil oluştur" servis fonksiyonu

**Bağlam:** `routes/bayi.js`'deki `POST /panel/firma-ekle` içinde firma+çalışan oluşturma
mantığı var (abonelik kontrolü, slug üretimi, transaction). Bu mantık aynen mobil API'de
de gerekecek — iki yerde ayrı ayrı yazıp zamanla birbirinden sapmasınlar diye ortak bir
servise taşınıyor.

**Files:**
- Create: `services/musteriService.js`
- Test: `tests/musteriService.test.js`

- [ ] **Step 1: Başarısız testleri yaz**

`tests/musteriService.test.js`:

```js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const {
  profilOlustur,
  GecersizProfilHatasi,
  AbonelikSuresiDolmusHatasi,
} = require('../services/musteriService');

describe('services/musteriService.profilOlustur', () => {
  let bayiId;

  beforeAll(async () => {
    const hash = await bcrypt.hash('test1234', 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash)
       VALUES ('Musteri Servis Test Bayi', 'musteri-servis-test-bayi', 'musteriservistest@example.com', $1)
       RETURNING id`,
      [hash]
    );
    bayiId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM firmalar WHERE bayi_id = $1', [bayiId]);
  });

  test('geçerli veriyle firma+çalışan oluşturur, slug döner', async () => {
    const sonuc = await profilOlustur(bayiId, { ad_soyad: 'Ahmet Yılmaz', kvkk: 'on' }, null);
    expect(sonuc.firmaId).toBeDefined();
    expect(sonuc.ad).toBe('Ahmet');
    expect(sonuc.soyad).toBe('Yılmaz');
    expect(sonuc.firmaSlug).toBeTruthy();
    expect(sonuc.calisanSlug).toBeTruthy();
  });

  test('ad_soyad boşsa GecersizProfilHatasi fırlatır', async () => {
    await expect(profilOlustur(bayiId, { kvkk: 'on' }, null)).rejects.toThrow(GecersizProfilHatasi);
  });

  test('kvkk onayı yoksa GecersizProfilHatasi fırlatır', async () => {
    await expect(profilOlustur(bayiId, { ad_soyad: 'Ahmet Yılmaz' }, null)).rejects.toThrow(GecersizProfilHatasi);
  });

  test('sadece tek kelimelik ad_soyad ile GecersizProfilHatasi fırlatır', async () => {
    await expect(profilOlustur(bayiId, { ad_soyad: 'Ahmet', kvkk: 'on' }, null)).rejects.toThrow(GecersizProfilHatasi);
  });

  test('abonelik süresi dolmuşsa AbonelikSuresiDolmusHatasi fırlatır', async () => {
    await pool.query("UPDATE bayiler SET abonelik_bitis_tarihi = '2020-01-01' WHERE id = $1", [bayiId]);
    await expect(profilOlustur(bayiId, { ad_soyad: 'Ahmet Yılmaz', kvkk: 'on' }, null))
      .rejects.toThrow(AbonelikSuresiDolmusHatasi);
    await pool.query('UPDATE bayiler SET abonelik_bitis_tarihi = NULL WHERE id = $1', [bayiId]);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/musteriService.test.js`
Expected: FAIL — `Cannot find module '../services/musteriService'`

- [ ] **Step 3: `services/musteriService.js`'i yaz**

```js
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { firmaSlugOlustur, benzersizCalisanSlugOlustur } = require('../utils/slug');
const { biyografiTemizle } = require('../utils/sanitize');

class GecersizProfilHatasi extends Error {}
class AbonelikSuresiDolmusHatasi extends Error {}

function adSoyadAyir(adSoyad) {
  const parcalar = adSoyad.trim().split(/\s+/);
  if (parcalar.length === 1) return { ad: parcalar[0], soyad: '' };
  return { ad: parcalar.slice(0, -1).join(' '), soyad: parcalar[parcalar.length - 1] };
}

async function profilOlustur(bayiId, alanlar, fotoUrl) {
  const {
    isletme_adi, sektor, marka_rengi,
    ad_soyad, unvan, departman, telefon, email, adres, biyografi,
    linkedin, instagram, twitter, youtube, website, whatsapp, tiktok,
    sahibinden, hurriyet_emlak, google_yorum_link, kvkk,
  } = alanlar;

  if (!ad_soyad || !ad_soyad.trim()) {
    throw new GecersizProfilHatasi('Ad soyad zorunlu.');
  }
  if (!kvkk) {
    throw new GecersizProfilHatasi('Devam etmek için KVKK onayı gerekiyor.');
  }
  const { ad, soyad } = adSoyadAyir(ad_soyad);
  if (!soyad) {
    throw new GecersizProfilHatasi('Lütfen ad ve soyadı birlikte yazın.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bayiSonuc = await client.query(
      'SELECT abonelik_bitis_tarihi FROM bayiler WHERE id = $1 FOR UPDATE',
      [bayiId]
    );
    if (!bayiSonuc.rows.length) {
      throw new GecersizProfilHatasi('Bayi bulunamadı.');
    }
    const bitisTarihi = bayiSonuc.rows[0].abonelik_bitis_tarihi;
    if (bitisTarihi && new Date(bitisTarihi) < new Date()) {
      throw new AbonelikSuresiDolmusHatasi('Aboneliğinizin süresi dolmuş. Lütfen bizimle iletişime geçin.');
    }

    const firmaAd = (isletme_adi && isletme_adi.trim()) || `${ad} ${soyad}`;
    let slug = firmaSlugOlustur(firmaAd);
    const check = await client.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    const dummyEmail = `${slug}-${Date.now()}@bayi.local`;
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 8);

    const firmaSonuc = await client.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor, marka_rengi, bayi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [firmaAd, slug, dummyEmail, dummyHash, sektor || 'diger', marka_rengi || '#1a73e8', bayiId]
    );
    const firmaId = firmaSonuc.rows[0].id;

    const calisanSlug = await benzersizCalisanSlugOlustur(firmaId, ad, soyad);
    const biyografiTemiz = biyografiTemizle(biyografi);

    await client.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, adres,
        linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden,
        hurriyet_emlak, google_yorum_link, biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [firmaId, ad, soyad, unvan || null, departman || null, telefon || null, email || null, adres || null,
       linkedin || null, instagram || null, twitter || null, youtube || null, website || null,
       whatsapp || null, tiktok || null, sahibinden || null, hurriyet_emlak || null, google_yorum_link || null,
       biyografiTemiz, fotoUrl || null, calisanSlug]
    );

    await client.query('COMMIT');
    return { firmaId, firmaSlug: slug, calisanSlug, ad, soyad };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { profilOlustur, adSoyadAyir, GecersizProfilHatasi, AbonelikSuresiDolmusHatasi };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/musteriService.test.js`
Expected: PASS — 5 passed

- [ ] **Step 5: Commit**

```bash
git add services/musteriService.js tests/musteriService.test.js
git commit -m "Firma+çalışan oluşturma mantığını ortak musteriService'e taşı"
```

---

### Task 5: `routes/bayi.js`'i ortak servisi kullanacak şekilde güncelle

**Bağlam:** Mevcut web akışının davranışı **birebir aynı kalmalı** — sadece SQL/transaction
kodu servise taşınıyor, route sadece servisi çağırıp flash+redirect yapıyor. Mevcut
`tests/abonelik.test.js` bu davranışı zaten test ediyor, refactor sonrası da geçmeli.

**Files:**
- Modify: `routes/bayi.js`

- [ ] **Step 1: `routes/bayi.js`'in üst kısmındaki import'lara servis fonksiyonlarını ekle**

Dosyanın en üstündeki require bloğuna ekle:

```js
const {
  profilOlustur,
  GecersizProfilHatasi,
  AbonelikSuresiDolmusHatasi,
} = require('../services/musteriService');
```

- [ ] **Step 2: `POST /panel/firma-ekle` route'unu değiştir**

Mevcut route'un tamamını (body destructuring + validasyon + transaction bloğu) şununla
değiştir — `adSoyadAyir` fonksiyonu artık kullanılmadığı için dosyanın en üstündeki
tanımı da silinebilir (başka yerde kullanılmıyorsa):

```js
router.post('/panel/firma-ekle', requireBayi, firmaEkleLimiter,
  fotoUploadGuvenli(() => '/'),
  async (req, res) => {
  try {
    const sonuc = await profilOlustur(req.session.bayiId, req.body, req.file?.location || null);
    req.flash('success', `${sonuc.ad} ${sonuc.soyad} eklendi.`);
    res.redirect(`/?firma=${sonuc.firmaId}`);
  } catch (err) {
    if (err instanceof GecersizProfilHatasi || err instanceof AbonelikSuresiDolmusHatasi) {
      req.flash('error', err.message);
      return res.redirect('/');
    }
    console.error(err);
    req.flash('error', 'Eklenemedi.');
    res.redirect('/');
  }
});
```

- [ ] **Step 3: Kullanılmayan yardımcı fonksiyon/import'ları temizle**

Refactor sonrası `routes/bayi.js`'in en üstündeki `adSoyadAyir` fonksiyon tanımı ve
`firmaSlugOlustur` import'u artık kullanılmıyor olabilir (mantık `musteriService.js`'e
taşındığı için). Kontrol et:

Run: `grep -n "adSoyadAyir\|firmaSlugOlustur" routes/bayi.js`

Expected: Her biri için sadece tanım/import satırı görünüyorsa (başka çağrı yoksa) o
satırı dosyadan sil. `benzersizCalisanSlugOlustur` ve `biyografiTemizle` hâlâ
`calisan-ekle`/`calisan-duzenle` route'larında kullanıldığı için onlara dokunma.

- [ ] **Step 4: Mevcut testlerin hâlâ geçtiğini doğrula**

Run: `npx jest tests/abonelik.test.js`
Expected: PASS — 3 passed (davranış birebir aynı kaldığı için)

- [ ] **Step 5: Tüm test paketini çalıştır**

Run: `npx jest`
Expected: Tüm suite'ler PASS (yeni testler dahil toplam artmış sayıda test)

- [ ] **Step 6: Commit**

```bash
git add routes/bayi.js
git commit -m "routes/bayi.js firma-ekle'yi ortak musteriService'i kullanacak şekilde sadeleştir"
```

---

### Task 6: Mobil API — giriş ucu

**Files:**
- Create: `routes/mobilApi.js`
- Test: `tests/mobilApi.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/mobilApi.test.js`:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');
const { bayiTokenDogrula } = require('../utils/jwt');

describe('Mobil API — /api/mobil/giris', () => {
  let bayiId;
  const email = 'mobilapi-test-bayi@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, kullanici_adi, sifre_hash, aktif)
       VALUES ('Mobil Api Test Bayi', 'mobilapi-test-bayi', $1, 'mobilapitestbayi', $2, true)
       RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  test('doğru bilgilerle token döner', async () => {
    const res = await request(app)
      .post('/api/mobil/giris')
      .send({ giris_bilgisi: email, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    const payload = bayiTokenDogrula(res.body.token);
    expect(payload.bayiId).toBe(bayiId);
  });

  test('yanlış şifreyle 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/giris')
      .send({ giris_bilgisi: email, sifre: 'yanlis-sifre' });
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('eksik alanla 400 döner', async () => {
    const res = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: FAIL — `/api/mobil/giris` uçu henüz yok, 404 döner

- [ ] **Step 3: `routes/mobilApi.js`'i oluştur (giriş ucuyla)**

```js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { bayiTokenUret } = require('../utils/jwt');
const { createJsonLimiter } = require('../middleware/rateLimiter');

const mobilGirisLimiter = createJsonLimiter('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');

router.post('/giris', mobilGirisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    return res.status(400).json({ ok: false, error: 'E-posta/kullanıcı adı ve şifre zorunlu.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM bayiler WHERE (email = $1 OR kullanici_adi = $1) AND aktif = true',
      [giris_bilgisi]
    );
    if (!result.rows.length) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const bayi = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, bayi.sifre_hash);
    if (!eslesme) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const token = bayiTokenUret(bayi.id);
    res.json({ ok: true, token, bayi: { id: bayi.id, ad: bayi.ad } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

module.exports = router;
```

- [ ] **Step 4: `app.js`'e router'ı mount et**

`app.js` içinde `const bayiRoutes = require('./routes/bayi.js');` satırının altına ekle:

```js
const mobilApiRoutes = require('./routes/mobilApi');
```

`app.use('/bayi', bayiRoutes);` satırının altına ekle:

```js
app.use('/api/mobil', mobilApiRoutes);
```

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: PASS — 3 passed

- [ ] **Step 6: Commit**

```bash
git add routes/mobilApi.js app.js tests/mobilApi.test.js
git commit -m "Mobil API: /api/mobil/giris ucunu ekle"
```

---

### Task 7: Mobil API — müşteri listesi ucu

**Files:**
- Modify: `routes/mobilApi.js`
- Modify: `tests/mobilApi.test.js`

- [ ] **Step 1: Başarısız testi ekle**

`tests/mobilApi.test.js`'e yeni bir `describe` bloğu ekle (dosyanın sonuna):

```js
describe('Mobil API — /api/mobil/musteriler', () => {
  let bayiId;
  let token;
  let firmaId;
  const email = 'mobilapi-musteri-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const bayiSonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, aktif)
       VALUES ('Mobil Musteri Test Bayi', 'mobil-musteri-test-bayi', $1, $2, true) RETURNING id`,
      [email, hash]
    );
    bayiId = bayiSonuc.rows[0].id;

    const girisRes = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email, sifre });
    token = girisRes.body.token;

    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, bayi_id)
       VALUES ('Test Musteri Firma', 'test-musteri-firma-mobil', 'x@x.com', 'x', $1) RETURNING id`,
      [bayiId]
    );
    firmaId = firmaSonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('token olmadan 401 döner', async () => {
    const res = await request(app).get('/api/mobil/musteriler');
    expect(res.statusCode).toBe(401);
  });

  test('geçerli token ile sadece kendi müşterilerini listeler', async () => {
    const res = await request(app)
      .get('/api/mobil/musteriler')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.musteriler.some(m => m.id === firmaId)).toBe(true);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: FAIL — `/api/mobil/musteriler` 404 döner

- [ ] **Step 3: `routes/mobilApi.js`'e ucu ekle**

Dosyanın üstündeki require'lara ekle:

```js
const { requireBayiToken } = require('../middleware/tokenAuth');
```

`module.exports = router;` satırından hemen önce ekle:

```js
router.get('/musteriler', requireBayiToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.ad, f.slug, COUNT(c.id) as calisan_sayisi
       FROM firmalar f LEFT JOIN calisanlar c ON c.firma_id = f.id
       WHERE f.bayi_id = $1 GROUP BY f.id ORDER BY f.created_at DESC`,
      [req.bayiId]
    );
    res.json({ ok: true, musteriler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: PASS — 5 passed

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Mobil API: /api/mobil/musteriler ucunu ekle"
```

---

### Task 8: Mobil API — müşteri detay (çalışanlar) ucu

**Files:**
- Modify: `routes/mobilApi.js`
- Modify: `tests/mobilApi.test.js`

- [ ] **Step 1: Başarısız testi ekle**

Bir önceki `describe` bloğunun içine (aynı `firmaId`/`token` kullanılarak) ekle:

```js
  test('başka bayinin müşterisine erişilemez (404)', async () => {
    const res = await request(app)
      .get('/api/mobil/musteriler/999999/calisanlar')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  test('kendi müşterisinin çalışanlarını listeler', async () => {
    const res = await request(app)
      .get(`/api/mobil/musteriler/${firmaId}/calisanlar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.calisanlar)).toBe(true);
    expect(res.body.firma.id).toBe(firmaId);
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: FAIL — 404 route yok

- [ ] **Step 3: `routes/mobilApi.js`'e ucu ekle**

```js
router.get('/musteriler/:firmaId/calisanlar', requireBayiToken, async (req, res) => {
  try {
    const firmaResult = await pool.query(
      'SELECT id, ad, slug FROM firmalar WHERE id = $1 AND bayi_id = $2',
      [req.params.firmaId, req.bayiId]
    );
    if (!firmaResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı.' });
    }
    const calisanlarResult = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
      [req.params.firmaId]
    );
    res.json({ ok: true, firma: firmaResult.rows[0], calisanlar: calisanlarResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: PASS — 7 passed

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Mobil API: /api/mobil/musteriler/:firmaId/calisanlar ucunu ekle"
```

---

### Task 9: Mobil API — abonelik durumu ucu

**Files:**
- Modify: `routes/mobilApi.js`
- Modify: `tests/mobilApi.test.js`

- [ ] **Step 1: Başarısız testi ekle**

Dosyanın sonuna yeni `describe`:

```js
describe('Mobil API — /api/mobil/abonelik', () => {
  let bayiId;
  let token;
  const email = 'mobilapi-abonelik-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, aktif, abonelik_bitis_tarihi)
       VALUES ('Mobil Abonelik Test Bayi', 'mobil-abonelik-test-bayi', $1, $2, true, '2099-01-01') RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
    const girisRes = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('abonelik bitiş tarihini ve aktif durumunu döner', async () => {
    const res = await request(app)
      .get('/api/mobil/abonelik')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.aktif).toBe(true);
    expect(res.body.abonelikBitisTarihi).toBeTruthy();
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: FAIL — 404 route yok

- [ ] **Step 3: `routes/mobilApi.js`'e ucu ekle**

```js
router.get('/abonelik', requireBayiToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT abonelik_bitis_tarihi FROM bayiler WHERE id = $1', [req.bayiId]);
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Bayi bulunamadı.' });
    }
    const bitis = result.rows[0].abonelik_bitis_tarihi;
    const aktif = !bitis || new Date(bitis) >= new Date();
    res.json({ ok: true, abonelikBitisTarihi: bitis, aktif });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: PASS — 8 passed

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Mobil API: /api/mobil/abonelik ucunu ekle"
```

---

### Task 10: Mobil API — profil oluşturma ucu (fotoğraflı)

**Files:**
- Modify: `routes/mobilApi.js`
- Modify: `tests/mobilApi.test.js`
- Modify: `.env` (SITE_URL ekle)

- [ ] **Step 1: `.env`'e `SITE_URL` ekle**

```
SITE_URL=https://www.nfckartify.com.tr
```

- [ ] **Step 2: Başarısız testi ekle**

Dosyanın sonuna yeni `describe`:

```js
describe('Mobil API — /api/mobil/profil-olustur', () => {
  let bayiId;
  let token;
  let olusturulanFirmaId;
  const email = 'mobilapi-profil-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, aktif)
       VALUES ('Mobil Profil Test Bayi', 'mobil-profil-test-bayi', $1, $2, true) RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
    const girisRes = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    if (olusturulanFirmaId) await pool.query('DELETE FROM firmalar WHERE id = $1', [olusturulanFirmaId]);
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('fotoğrafsız, geçerli veriyle profil oluşturur ve url döner', async () => {
    const res = await request(app)
      .post('/api/mobil/profil-olustur')
      .set('Authorization', `Bearer ${token}`)
      .field('ad_soyad', 'Mehmet Demir')
      .field('kvkk', 'on');
    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toContain('/mehmet-demir');
    olusturulanFirmaId = res.body.firmaId;
  });

  test('ad_soyad eksikse 400 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/profil-olustur')
      .set('Authorization', `Bearer ${token}`)
      .field('kvkk', 'on');
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('token olmadan 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/profil-olustur')
      .field('ad_soyad', 'Test Test')
      .field('kvkk', 'on');
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: FAIL — 404 route yok

- [ ] **Step 4: `routes/mobilApi.js`'e ucu ekle**

Dosyanın üstündeki require'lara ekle:

```js
const { uploadMiddleware } = require('../middleware/upload');
const {
  profilOlustur,
  GecersizProfilHatasi,
  AbonelikSuresiDolmusHatasi,
} = require('../services/musteriService');

const fotoUpload = uploadMiddleware('calisanlar');
const mobilProfilLimiter = createJsonLimiter('Çok fazla işlem yaptınız. Lütfen biraz sonra tekrar deneyin.');

function fotoUploadGuvenliJson() {
  return (req, res, next) => {
    const [multerMw, isleMw] = fotoUpload.single('foto');
    const hataYakala = (err) => {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message || 'Fotoğraf yüklenemedi.' });
    };
    multerMw(req, res, (err) => {
      if (err) return hataYakala(err);
      isleMw(req, res, (err2) => {
        if (err2) return hataYakala(err2);
        next();
      });
    });
  };
}
```

`module.exports = router;` satırından hemen önce ekle:

```js
router.post('/profil-olustur', requireBayiToken, mobilProfilLimiter, fotoUploadGuvenliJson(), async (req, res) => {
  try {
    const sonuc = await profilOlustur(req.bayiId, req.body, req.file?.location || null);
    const siteUrl = process.env.SITE_URL || 'https://www.nfckartify.com.tr';
    res.status(201).json({
      ok: true,
      firmaId: sonuc.firmaId,
      url: `${siteUrl}/${sonuc.firmaSlug}/${sonuc.calisanSlug}`,
    });
  } catch (err) {
    if (err instanceof GecersizProfilHatasi) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err instanceof AbonelikSuresiDolmusHatasi) {
      return res.status(403).json({ ok: false, error: err.message });
    }
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js`
Expected: PASS — 11 passed

- [ ] **Step 6: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js .env
git commit -m "Mobil API: /api/mobil/profil-olustur ucunu ekle"
```

(Not: `.env` gitignored ise bu dosya commit'e girmez, sorun değil — sadece yerelde
tanımlı olması yeterli. Railway tarafında ayrıca env değişkeni set edilecek, bkz. Task 11.)

---

### Task 11: Tam test paketi + Railway'e env değişkenleri + deploy

**Files:** Yok (doğrulama + deploy adımı)

- [ ] **Step 1: Tüm test paketini çalıştır**

Run: `npx jest`
Expected: Tüm suite'ler PASS (önceki 39 test + bu planda eklenen ~20 yeni test)

- [ ] **Step 2: Railway'e `JWT_SECRET` ve `SITE_URL` env değişkenlerini ekle**

Run:
```bash
railway variables --service app --set "JWT_SECRET=<yerelde .env'e yazdığın uzun rastgele değerin AYNISI>"
railway variables --service app --set "SITE_URL=https://www.nfckartify.com.tr"
```

- [ ] **Step 3: Deploy et**

Run: `railway up --service app --detach`

- [ ] **Step 4: Production'da giriş ucunu curl ile doğrula**

Gerçek bir test bayi hesabı oluşturup (yerelde `node -e` ile, önceki oturumlarda
kullanılan yöntemle), production'da:

```bash
curl -s -X POST https://www.nfckartify.com.tr/api/mobil/giris \
  -d "giris_bilgisi=<test-email>&sifre=<test-sifre>"
```

Expected: `{"ok":true,"token":"...","bayi":{...}}` — JSON cevap, token alanı dolu.
Test verisini işin sonunda temizle.

- [ ] **Step 5: Commit (varsa kalan değişiklik)**

```bash
git status --short
```

Değişiklik yoksa bu adım atlanır (önceki task'larda zaten commit edildi).

---

## Sonraki Adım

Bu plan bitince backend API hazır olacak. Sıradaki plan: **Android Uygulaması**
(Kotlin, bu API'yi tüketen, NFC yaz/kilitle özellikli) — ayrı bir plan dokümanı olarak
yazılacak, bu plan bittikten sonra.
