# Kurumsal Raf Kartı — K2 (Temsilci Ziyaret + Saha İstatistikleri) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurumsal firmaların çalışanlarına (temsilci) mobil giriş bilgisi verilebilmesini, temsilcinin eczane ziyaretini bir API çağrısıyla kaydedebilmesini ve yöneticinin bunu grafiklerle görebilmesini sağlamak.

**Architecture:** Mevcut `calisanlar` tablosuna opsiyonel giriş alanları eklenir. Yeni bir `ziyaretler` tablosu temsilci↔eczane ziyaretlerini tutar. Mobil API'ye JWT korumalı iki uç eklenir (`/api/mobil/temsilci-giris`, `/api/mobil/ziyaret-kaydet`) — gerçek NFC okuma K3'te (Android) bu uçlara bağlanacak, K2'de curl ile test edilir. Kurumsal firma paneline yeni "Saha İstatistikleri" sekmesi eklenir (Chart.js CDN ile gerçek grafikler + Excel export).

**Not (spesifikasyondan sapma):** Spec'in 2. bölümünde "web `/giris` temsilci girişini de dener, `req.session.calisanId` yazılır" maddesi vardı. Bu maddeyi uygulamıyoruz çünkü temsilciye ait bir web dashboard'u/görünümü yok — sadece mobil uygulama (K3) kullanacak. Session'a `calisanId` yazıp hiçbir view'ın onu okumaması ölü kod olurdu. Mobil JWT ucu (`/api/mobil/temsilci-giris`, Task 6) asıl ihtiyacı tam karşılıyor.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), `bcrypt`, `jsonwebtoken`, `xlsx`, Chart.js (CDN), Jest + Supertest.

---

### Task 1: DB Migration — giriş alanları + ziyaretler tablosu

**Files:**
- Modify: `scripts/migrate.js:89-90` (migrations dizisinin sonuna ekle)

- [ ] **Step 1: Migration satırlarını ekle**

`scripts/migrate.js` içinde migrations dizisinin son elemanından (`ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS whatsapp TEXT`,) hemen sonra şunları ekle:

```js
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS giris_email TEXT UNIQUE`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS giris_sifre_hash TEXT`,
    `CREATE TABLE IF NOT EXISTS ziyaretler (
      id          SERIAL PRIMARY KEY,
      calisan_id  INTEGER REFERENCES calisanlar(id) ON DELETE CASCADE,
      eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
```

- [ ] **Step 2: Migration'ı çalıştır**

Run: `node scripts/migrate.js`
Expected: Her satır için `OK: ...` çıktısı, `HATA` yok, sonda `Migration tamamlandı.`

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate.js
git commit -m "K2: calisanlar giris alanlari + ziyaretler tablosu migration"
```

---

### Task 2: `utils/jwt.js` — temsilci token fonksiyonları

**Files:**
- Modify: `utils/jwt.js`
- Test: `tests/jwt.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/jwt.test.js` dosyasının import satırını ve içeriğini şu hale getir (tüm dosya):

```js
require('dotenv').config();
const { bayiTokenUret, bayiTokenDogrula, calisanTokenUret, calisanTokenDogrula } = require('../utils/jwt');

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

describe('utils/jwt — temsilci', () => {
  test('üretilen calisan token doğrulanınca doğru calisanId döner', () => {
    const token = calisanTokenUret(99);
    const payload = calisanTokenDogrula(token);
    expect(payload.calisanId).toBe(99);
  });

  test('bozuk calisan token doğrulanamaz', () => {
    expect(() => calisanTokenDogrula('gecersiz.token.deger')).toThrow();
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/jwt.test.js -v`
Expected: FAIL — `calisanTokenUret is not a function`

- [ ] **Step 3: `utils/jwt.js`'i güncelle**

Tüm dosyayı şu hale getir:

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

function calisanTokenUret(calisanId) {
  return jwt.sign({ calisanId }, secretAl(), { expiresIn: '30d' });
}

function calisanTokenDogrula(token) {
  return jwt.verify(token, secretAl());
}

module.exports = { bayiTokenUret, bayiTokenDogrula, calisanTokenUret, calisanTokenDogrula };
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/jwt.test.js -v`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add utils/jwt.js tests/jwt.test.js
git commit -m "K2: temsilci JWT token uretimi (calisanTokenUret/Dogrula)"
```

---

### Task 3: `middleware/tokenAuth.js` — `requireCalisanToken`

**Files:**
- Modify: `middleware/tokenAuth.js`
- Test: `tests/tokenAuth.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/tokenAuth.test.js` dosyasının tamamını şu hale getir:

```js
require('dotenv').config();
const { requireBayiToken, requireCalisanToken } = require('../middleware/tokenAuth');
const { bayiTokenUret, calisanTokenUret } = require('../utils/jwt');

function sahteResCevap() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/tokenAuth — bayi', () => {
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

describe('middleware/tokenAuth — temsilci', () => {
  test('geçerli Bearer token ile req.calisanId set edilir, next çağrılır', () => {
    const token = calisanTokenUret(15);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = sahteResCevap();
    const next = jest.fn();

    requireCalisanToken(req, res, next);

    expect(req.calisanId).toBe(15);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('header yoksa 401 döner', () => {
    const req = { headers: {} };
    const res = sahteResCevap();
    const next = jest.fn();

    requireCalisanToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('bozuk token ile 401 döner', () => {
    const req = { headers: { authorization: 'Bearer gecersiz.token.deger' } };
    const res = sahteResCevap();
    const next = jest.fn();

    requireCalisanToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/tokenAuth.test.js -v`
Expected: FAIL — `requireCalisanToken is not a function`

- [ ] **Step 3: `middleware/tokenAuth.js`'i güncelle**

Tüm dosyayı şu hale getir:

```js
const { bayiTokenDogrula, calisanTokenDogrula } = require('../utils/jwt');

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

function requireCalisanToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [tip, token] = header.split(' ');
  if (tip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  try {
    const payload = calisanTokenDogrula(token);
    req.calisanId = payload.calisanId;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
}

module.exports = { requireBayiToken, requireCalisanToken };
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/tokenAuth.test.js -v`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add middleware/tokenAuth.js tests/tokenAuth.test.js
git commit -m "K2: requireCalisanToken middleware"
```

---

### Task 4: `routes/panel.js` — giriş bilgisi ekle/düzenle (backend)

**Files:**
- Modify: `routes/panel.js`
- Create: `tests/panel.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/panel.test.js` dosyasını oluştur:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

async function firmaOlustur(email) {
  const hash = await bcrypt.hash('test1234', 8);
  const r = await pool.query(
    `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
     VALUES ($1, $2, $3, $4, 'kurumsal') RETURNING id`,
    [`Firma ${email}`, `firma-${email.split('@')[0]}`, email, hash]
  );
  return r.rows[0].id;
}

async function girisYap(email) {
  const agent = request.agent(app);
  await agent.post('/giris').send({ giris_bilgisi: email, sifre: 'test1234' });
  return agent;
}

describe('routes/panel — temsilci giriş bilgisi', () => {
  let firmaId;
  const firmaEmail = 'panelk2@example.com';

  beforeAll(async () => {
    firmaId = await firmaOlustur(firmaEmail);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('giris_email + giris_sifre ile çalışan eklenince hash DB\'de saklanır', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Ali', soyad: 'Veli', kvkk: 'on',
      giris_email: 'ali.veli@example.com', giris_sifre: 'gizli123',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com']);
    expect(c.rows.length).toBe(1);
    expect(await bcrypt.compare('gizli123', c.rows[0].giris_sifre_hash)).toBe(true);
  });

  test('giris_email verilip giris_sifre verilmezse çalışan eklenmez', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Şifresiz', soyad: 'Kişi', kvkk: 'on',
      giris_email: 'sifresiz@example.com',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['sifresiz@example.com']);
    expect(c.rows.length).toBe(0);
  });

  test('aynı giriş e-postasıyla ikinci çalışan eklenemez', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Ikinci', soyad: 'Kisi', kvkk: 'on',
      giris_email: 'ali.veli@example.com', giris_sifre: 'baskasifre',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com']);
    expect(c.rows.length).toBe(1); // hala sadece ilk çalışan
  });

  test('çalışan düzenlenirken giriş e-postası boşa çekilirse giriş devre dışı kalır', async () => {
    const agent = await girisYap(firmaEmail);
    const mevcut = (await pool.query('SELECT id FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com'])).rows[0];
    const res = await agent.post(`/firma/panel/${mevcut.id}/duzenle`).send({
      ad: 'Ali', soyad: 'Veli', giris_email: '',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT giris_email, giris_sifre_hash FROM calisanlar WHERE id = $1', [mevcut.id]);
    expect(c.rows[0].giris_email).toBeNull();
    expect(c.rows[0].giris_sifre_hash).toBeNull();
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/panel.test.js -v`
Expected: FAIL — ilk test başarısız olur çünkü `giris_email` sütunu INSERT'te kullanılmıyor, `bcrypt.compare` `null` hash ile karşılaştırınca hata verir.

- [ ] **Step 3: `routes/panel.js`'i güncelle**

Dosyanın en üstüne `bcrypt` import'u ekle (satır 1-2 arası):

```js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
```

`router.post('/ekle', ...)` handler'ının tamamını (satır 44-76) şu hale getir:

```js
router.post('/ekle', fotoUploadGuvenli('/firma/panel/ekle'), async (req, res) => {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, kvkk, giris_email, giris_sifre } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect('/');
  }
  if (!kvkk) {
    req.flash('error', 'Devam etmek için KVKK onayı gerekiyor.');
    return res.redirect('/');
  }
  const girisEmailDeger = giris_email && giris_email.trim() ? giris_email.trim() : null;
  if (girisEmailDeger && !(giris_sifre && giris_sifre.trim())) {
    req.flash('error', 'Giriş e-postası girildiyse şifre de zorunludur.');
    return res.redirect('/');
  }
  try {
    const slug = await benzersizCalisanSlugOlustur(req.session.firmaId, ad, soyad);
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    const biyografiTemiz = biyografiTemizle(biyografi);
    const fotoUrl = req.file?.location || null;
    const girisSifreHashDeger = girisEmailDeger ? await bcrypt.hash(giris_sifre.trim(), 12) : null;
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, foto_url, slug, giris_email, giris_sifre_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [req.session.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null,
       instagram || null, twitter || null, youtube || null, website || null,
       whatsapp || null, tiktok || null, sahibinden || null, hurriyet_emlak || null,
       adres || null, google_yorum_link || null,
       biyografiTemiz, ilaclarArray, fotoUrl, slug, girisEmailDeger, girisSifreHashDeger]
    );
    req.flash('success', `${ad} ${soyad} eklendi.`);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', err.code === '23505' ? 'Bu giriş e-postası zaten kullanılıyor.' : 'Çalışan eklenemedi.');
    res.redirect('/');
  }
});
```

`duzenleHandler` fonksiyonunun tamamını (satır 142-184) şu hale getir:

```js
async function duzenleHandler(req, res) {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, giris_email, giris_sifre } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect('/');
  }
  try {
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    const biyografiTemiz = biyografiTemizle(biyografi);
    const fotoUrl = req.file ? (req.file.location || null) : undefined;

    const baseFields = [ad, soyad, unvan || null, departman || null, telefon || null,
      email || null, linkedin || null, instagram || null, twitter || null,
      youtube || null, website || null, whatsapp || null, tiktok || null,
      sahibinden || null, hurriyet_emlak || null, adres || null, google_yorum_link || null,
      biyografiTemiz, ilaclarArray];

    if (fotoUrl !== undefined) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
         email=$6, linkedin=$7, instagram=$8, twitter=$9, youtube=$10, website=$11,
         whatsapp=$12, tiktok=$13, sahibinden=$14, hurriyet_emlak=$15, adres=$16, google_yorum_link=$17,
         biyografi=$18, ilaclar=$19, foto_url=$20 WHERE id=$21 AND firma_id=$22`,
        [...baseFields, fotoUrl, req.params.id, req.session.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
         email=$6, linkedin=$7, instagram=$8, twitter=$9, youtube=$10, website=$11,
         whatsapp=$12, tiktok=$13, sahibinden=$14, hurriyet_emlak=$15, adres=$16, google_yorum_link=$17,
         biyografi=$18, ilaclar=$19 WHERE id=$20 AND firma_id=$21`,
        [...baseFields, req.params.id, req.session.firmaId]
      );
    }

    const girisEmailDeger = giris_email && giris_email.trim() ? giris_email.trim() : null;
    if (!girisEmailDeger) {
      await pool.query(
        'UPDATE calisanlar SET giris_email=NULL, giris_sifre_hash=NULL WHERE id=$1 AND firma_id=$2',
        [req.params.id, req.session.firmaId]
      );
    } else if (giris_sifre && giris_sifre.trim()) {
      const girisSifreHashDeger = await bcrypt.hash(giris_sifre.trim(), 12);
      await pool.query(
        'UPDATE calisanlar SET giris_email=$1, giris_sifre_hash=$2 WHERE id=$3 AND firma_id=$4',
        [girisEmailDeger, girisSifreHashDeger, req.params.id, req.session.firmaId]
      );
    } else {
      await pool.query(
        'UPDATE calisanlar SET giris_email=$1 WHERE id=$2 AND firma_id=$3',
        [girisEmailDeger, req.params.id, req.session.firmaId]
      );
    }

    req.flash('success', 'Çalışan güncellendi.');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', err.code === '23505' ? 'Bu giriş e-postası zaten kullanılıyor.' : 'Güncelleme başarısız.');
    res.redirect('/');
  }
}
router.post('/:id/duzenle', fotoUploadGuvenli((req) => `/firma/panel/${req.params.id}/duzenle`), duzenleHandler);
router.put('/:id/duzenle', fotoUploadGuvenli((req) => `/firma/panel/${req.params.id}/duzenle`), duzenleHandler);
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/panel.test.js -v`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add routes/panel.js tests/panel.test.js
git commit -m "K2: calisan ekle/duzenle - temsilci giris bilgisi (backend)"
```

---

### Task 5: `views/public/dashboard.ejs` — giriş bilgisi form alanları

**Files:**
- Modify: `views/public/dashboard.ejs`
- Modify: `tests/panel.test.js` (yeni bir görünüm testi ekle)

- [ ] **Step 1: Başarısız testi ekle**

`tests/panel.test.js`'in sonuna (son `});`'den önce, describe bloğu içine) şu testi ekle:

```js

  test('kurumsal firma çalışan panelinde giriş e-postası alanı görünür', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Giriş E-postası');
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/panel.test.js -v`
Expected: FAIL — `expect(res.text).toContain('Giriş E-postası')` başarısız

- [ ] **Step 3: `views/public/dashboard.ejs`'i güncelle**

`E-posta` alanının bittiği yerden (`<input type="email" name="email" id="f_email" placeholder="murat@firma.com">` satırının kapanış `</div>`'i) hemen sonra, `<hr class="field-sep">` + `Sosyal Medya` bölümünden önce şunu ekle:

```html
          <div class="field">
            <label>E-posta</label>
            <input type="email" name="email" id="f_email" placeholder="murat@firma.com">
          </div>

          <% if (firma.paket === 'kurumsal') { %>
          <hr class="field-sep">
          <div class="field-section">Mobil Giriş (Temsilci)</div>

          <div class="field">
            <label>Giriş E-postası</label>
            <input type="email" name="giris_email" id="f_giris_email" placeholder="temsilci@firma.com">
          </div>
          <div class="field">
            <label>Giriş Şifresi</label>
            <input type="password" name="giris_sifre" id="f_giris_sifre" placeholder="Boş bırakılırsa değişmez">
          </div>
          <% } %>

          <hr class="field-sep">
          <div class="field-section">Sosyal Medya</div>
```

`clearForm()` fonksiyonundaki alan listesini güncelle:

```js
  function clearForm() {
    ['ad','soyad','unvan','departman','telefon','email','linkedin','instagram','twitter','website','biyografi','foto','giris_email','giris_sifre'].forEach(f => {
      const el = document.getElementById('f_' + f);
      if (el) el.value = '';
    });
    document.getElementById('f_kvkk').checked = false;
  }
```

`fillForm()` fonksiyonundaki map'i güncelle (şifre alanı doldurulmaz, kasıtlı):

```js
  function fillForm(c) {
    const map = { ad:'ad', soyad:'soyad', unvan:'unvan', departman:'departman', telefon:'telefon', email:'email', linkedin:'linkedin', instagram:'instagram', twitter:'twitter', website:'website', biyografi:'biyografi', giris_email:'giris_email' };
    Object.entries(map).forEach(([field, key]) => {
      const el = document.getElementById('f_' + field);
      if (el) el.value = c[key] || '';
    });
  }
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/panel.test.js -v`
Expected: PASS (5 test)

- [ ] **Step 5: Commit**

```bash
git add views/public/dashboard.ejs tests/panel.test.js
git commit -m "K2: dashboard - temsilci giris bilgisi form alanlari"
```

---

### Task 6: `POST /api/mobil/temsilci-giris`

**Files:**
- Modify: `routes/mobilApi.js`
- Modify: `tests/mobilApi.test.js`

- [ ] **Step 1: Başarısız testi ekle**

`tests/mobilApi.test.js`'in sonuna şu describe bloğunu ekle:

```js

describe('Mobil API — /api/mobil/temsilci-giris', () => {
  let firmaId, calisanId;
  const email = 'temsilci-giris-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Temsilci Test Firma', 'temsilci-test-firma', 'x2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;
    const hash = await bcrypt.hash(sifre, 12);
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, giris_email, giris_sifre_hash)
       VALUES ($1, 'Test', 'Temsilci', 'test-temsilci', $2, $3) RETURNING id`,
      [firmaId, email, hash]
    );
    calisanId = calisanSonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('doğru bilgilerle token döner', async () => {
    const res = await request(app)
      .post('/api/mobil/temsilci-giris')
      .send({ giris_email: email, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
  });

  test('yanlış şifreyle 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/temsilci-giris')
      .send({ giris_email: email, sifre: 'yanlis' });
    expect(res.statusCode).toBe(401);
  });

  test('eksik alanla 400 döner', async () => {
    const res = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: email });
    expect(res.statusCode).toBe(400);
  });

  test('kayıtlı olmayan e-posta ile 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/temsilci-giris')
      .send({ giris_email: 'yok@example.com', sifre: 'herhangi' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -v`
Expected: FAIL — `404 Not Found` (uç henüz yok)

- [ ] **Step 3: `routes/mobilApi.js`'e uç ekle**

Import satırını güncelle (dosyanın en üstü):

```js
const { bayiTokenUret, calisanTokenUret } = require('../utils/jwt');
```

`router.post('/giris', ...)` bloğundan hemen sonra (satır 61'den sonra) ekle:

```js

const temsilciGirisLimiter = createJsonLimiter('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');

router.post('/temsilci-giris', temsilciGirisLimiter, async (req, res) => {
  const { giris_email, sifre } = req.body;
  if (!giris_email || !sifre) {
    return res.status(400).json({ ok: false, error: 'Giriş e-postası ve şifre zorunlu.' });
  }
  try {
    const result = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', [giris_email]);
    if (!result.rows.length || !result.rows[0].giris_sifre_hash) {
      return res.status(401).json({ ok: false, error: 'Giriş e-postası veya şifre hatalı.' });
    }
    const calisan = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, calisan.giris_sifre_hash);
    if (!eslesme) {
      return res.status(401).json({ ok: false, error: 'Giriş e-postası veya şifre hatalı.' });
    }
    const token = calisanTokenUret(calisan.id);
    res.json({ ok: true, token, calisan: { id: calisan.id, ad: calisan.ad, soyad: calisan.soyad, firmaId: calisan.firma_id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -v`
Expected: PASS (tüm testler)

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "K2: POST /api/mobil/temsilci-giris ucu"
```

---

### Task 7: `POST /api/mobil/ziyaret-kaydet`

**Files:**
- Modify: `routes/mobilApi.js`
- Modify: `tests/mobilApi.test.js`

- [ ] **Step 1: Başarısız testi ekle**

`tests/mobilApi.test.js`'in sonuna şu describe bloğunu ekle:

```js

describe('Mobil API — /api/mobil/ziyaret-kaydet', () => {
  let firmaId, digerFirmaId, calisanId, eczaneId, digerEczaneId, token;
  const email = 'ziyaret-test-temsilci@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Ziyaret Test Firma', 'ziyaret-test-firma', 'z1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;

    const digerFirmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Diğer Firma', 'ziyaret-diger-firma', 'z2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    digerFirmaId = digerFirmaSonuc.rows[0].id;

    const hash = await bcrypt.hash(sifre, 12);
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, giris_email, giris_sifre_hash)
       VALUES ($1, 'Ziyaret', 'Temsilci', 'ziyaret-temsilci', $2, $3) RETURNING id`,
      [firmaId, email, hash]
    );
    calisanId = calisanSonuc.rows[0].id;

    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Ziyaret Eczanesi', 'ziyarkod') RETURNING id`,
      [firmaId]
    );
    eczaneId = eczaneSonuc.rows[0].id;

    const digerEczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Diğer Eczane', 'digerkod') RETURNING id`,
      [digerFirmaId]
    );
    digerEczaneId = digerEczaneSonuc.rows[0].id;

    const girisRes = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = ANY($1)', [[firmaId, digerFirmaId]]);
  });

  test('geçerli eczane_kod ile 201 döner ve ziyaretler tablosuna kayıt düşer', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'ziyarkod' });
    expect(res.statusCode).toBe(201);
    const z = await pool.query('SELECT * FROM ziyaretler WHERE calisan_id = $1 AND eczane_id = $2', [calisanId, eczaneId]);
    expect(z.rows.length).toBe(1);
  });

  test('başka firmanın eczanesiyle 403 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'digerkod' });
    expect(res.statusCode).toBe(403);
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).post('/api/mobil/ziyaret-kaydet').send({ eczane_kod: 'ziyarkod' });
    expect(res.statusCode).toBe(401);
  });

  test('geçersiz eczane_kod ile 404 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'yokkod12' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -v`
Expected: FAIL — `404 Not Found` (uç henüz yok)

- [ ] **Step 3: `routes/mobilApi.js`'e uç ekle**

Import satırını güncelle:

```js
const { requireBayiToken, requireCalisanToken } = require('../middleware/tokenAuth');
```

Dosyanın sonuna, `module.exports = router;` satırından hemen önce ekle:

```js

router.post('/ziyaret-kaydet', requireCalisanToken, mobilProfilLimiter, async (req, res) => {
  const { eczane_kod } = req.body;
  if (!eczane_kod) {
    return res.status(400).json({ ok: false, error: 'Eczane kodu zorunlu.' });
  }
  try {
    const calisanResult = await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [req.calisanId]);
    if (!calisanResult.rows.length) {
      return res.status(401).json({ ok: false, error: 'Çalışan bulunamadı.' });
    }
    const eczaneResult = await pool.query('SELECT id, firma_id FROM eczaneler WHERE kod = $1', [eczane_kod]);
    if (!eczaneResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Eczane bulunamadı.' });
    }
    const eczane = eczaneResult.rows[0];
    if (eczane.firma_id !== calisanResult.rows[0].firma_id) {
      return res.status(403).json({ ok: false, error: 'Bu eczaneye ziyaret kaydedemezsiniz.' });
    }
    await pool.query('INSERT INTO ziyaretler (calisan_id, eczane_id) VALUES ($1, $2)', [req.calisanId, eczane.id]);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -v`
Expected: PASS (tüm testler)

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "K2: POST /api/mobil/ziyaret-kaydet ucu"
```

---

### Task 8: Saha İstatistikleri sekmesi (veri + grafikler)

**Files:**
- Modify: `app.js`
- Modify: `views/public/dashboard.ejs`
- Modify: `tests/kurumsal.test.js`

- [ ] **Step 1: Başarısız testi ekle**

`tests/kurumsal.test.js`'in son `});`'sinden önce (describe bloğu içine) şu testleri ekle:

```js

  test('veri yokken saha istatistikleri sekmesi boş durum mesajı gösterir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent.get('/?tab=saha');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Henüz veri yok');
  });

  test('ziyaret/okutma verisi varken saha istatistikleri grafikleri gösterir', async () => {
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Saha', 'Temsilci', 'saha-temsilci-test') RETURNING id`,
      [kurumsalId]
    );
    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Saha Eczanesi', 'sahakod1') RETURNING id`,
      [kurumsalId]
    );
    await pool.query('INSERT INTO ziyaretler (calisan_id, eczane_id) VALUES ($1, $2)', [calisanSonuc.rows[0].id, eczaneSonuc.rows[0].id]);

    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent.get('/?tab=saha');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('chartGunluk');
    expect(res.text).not.toContain('Henüz veri yok');
  });

  test('basic firma dashboardında Saha İstatistikleri sekmesi görünmez', async () => {
    const agent = await girisYap('k1basic@example.com');
    const res = await agent.get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Saha İstatistikleri');
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js -v`
Expected: FAIL — sekme içeriği/`sahaIstatistik` tanımsız olduğu için render hatası veya boş içerik

- [ ] **Step 3: `app.js`'i güncelle**

`GET /` handler'ı içinde, `let eczaneler = [];` satırının hemen altına (K1'de eklenen `if (tab === 'raf' ...)` bloğundan sonra) ekle:

```js
    let sahaIstatistik = { gunlukZiyaret: [], temsilciZiyaret: [], eczaneOkutma: [], tiklamaDagilimi: [] };
    if (tab === 'saha' && firma.paket === 'kurumsal') {
      const gunlukResult = await pool.query(
        `SELECT TO_CHAR(z.created_at, 'YYYY-MM-DD') AS gun, COUNT(*) AS sayi
         FROM ziyaretler z JOIN calisanlar c ON c.id = z.calisan_id
         WHERE c.firma_id = $1 AND z.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY gun ORDER BY gun`,
        [req.session.firmaId]
      );
      const temsilciResult = await pool.query(
        `SELECT c.ad, c.soyad, COUNT(*) AS sayi
         FROM ziyaretler z JOIN calisanlar c ON c.id = z.calisan_id
         WHERE c.firma_id = $1
         GROUP BY c.id, c.ad, c.soyad ORDER BY sayi DESC LIMIT 10`,
        [req.session.firmaId]
      );
      const eczaneIstatistikResult = await pool.query(
        `SELECT e.ad, COUNT(*) AS sayi
         FROM raf_okutmalar r JOIN eczaneler e ON e.id = r.eczane_id
         WHERE e.firma_id = $1
         GROUP BY e.id, e.ad ORDER BY sayi DESC LIMIT 10`,
        [req.session.firmaId]
      );
      const tiklamaResult = await pool.query(
        `SELECT t.tip, COUNT(*) AS sayi
         FROM raf_tiklamalar t JOIN eczaneler e ON e.id = t.eczane_id
         WHERE e.firma_id = $1
         GROUP BY t.tip ORDER BY sayi DESC`,
        [req.session.firmaId]
      );
      sahaIstatistik = {
        gunlukZiyaret: gunlukResult.rows.map(r => ({ gun: r.gun, sayi: Number(r.sayi) })),
        temsilciZiyaret: temsilciResult.rows.map(r => ({ ad: r.ad, soyad: r.soyad, sayi: Number(r.sayi) })),
        eczaneOkutma: eczaneIstatistikResult.rows.map(r => ({ ad: r.ad, sayi: Number(r.sayi) })),
        tiklamaDagilimi: tiklamaResult.rows.map(r => ({ tip: r.tip, sayi: Number(r.sayi) })),
      };
    }
```

`res.render('public/dashboard', {...})` çağrısını güncelle (yeni değişkeni ekle):

```js
    res.render('public/dashboard', {
      layout: false, firma, calisanlar, aktifSayisi, pasifSayisi,
      toplamGoruntulenme, tab, linkAnalytics, eczaneler, sahaIstatistik
    });
```

- [ ] **Step 4: `views/public/dashboard.ejs`'i güncelle**

`.dash-tabs` içindeki kurumsal sekme linklerine (K1'de eklenen `İçerik`/`Raf Kartları` linklerinin yanına) ekle:

```html
    <% if (firma.paket === 'kurumsal') { %>
    <a href="/?tab=icerik" class="dash-tab <%= tab === 'icerik' ? 'active' : '' %>">İçerik</a>
    <a href="/?tab=raf"    class="dash-tab <%= tab === 'raf'    ? 'active' : '' %>">Raf Kartları</a>
    <a href="/?tab=saha"   class="dash-tab <%= tab === 'saha'   ? 'active' : '' %>">Saha İstatistikleri</a>
```

"TAB: RAF KARTLARI" bloğunun kapanışından (`<% } %>` — dash-main'den önceki son satır) hemen önce yeni tab bloğunu ekle:

```html
  <!-- TAB: SAHA İSTATİSTİKLERİ -->
  <% } else if (tab === 'saha' && firma.paket === 'kurumsal') { %>
    <% if (!sahaIstatistik.gunlukZiyaret.length && !sahaIstatistik.eczaneOkutma.length && !sahaIstatistik.tiklamaDagilimi.length) { %>
    <div class="table-wrap">
      <div class="empty-state">
        <div class="empty-state-icon">📍</div>
        <div class="empty-state-title">Henüz veri yok</div>
        <div class="empty-state-sub">Temsilciler ziyaret kaydettikçe burada görünür</div>
      </div>
    </div>
    <% } else { %>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px">
      <a href="/kurumsal/ziyaretler-excel" class="btn btn-border" style="height:36px;">⬇ Ziyaretleri Excel'e Aktar</a>
    </div>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px">
      <h3 style="margin-bottom:12px">Son 30 Gün — Günlük Ziyaret</h3>
      <canvas id="chartGunluk" height="80"></canvas>
    </div>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px">
      <h3 style="margin-bottom:12px">Temsilci Başına Ziyaret</h3>
      <canvas id="chartTemsilci" height="80"></canvas>
    </div>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px">
      <h3 style="margin-bottom:12px">Eczane Başına Okutma</h3>
      <canvas id="chartEczane" height="80"></canvas>
    </div>
    <div class="table-wrap" style="padding:20px">
      <h3 style="margin-bottom:12px">İçerik Tıklama Dağılımı</h3>
      <canvas id="chartTiklama" height="80"></canvas>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      const sahaVeri = <%- JSON.stringify(sahaIstatistik) %>;
      new Chart(document.getElementById('chartGunluk'), {
        type: 'line',
        data: { labels: sahaVeri.gunlukZiyaret.map(r => r.gun), datasets: [{ label: 'Ziyaret', data: sahaVeri.gunlukZiyaret.map(r => r.sayi), borderColor: '#c9a15a', tension: 0.2 }] }
      });
      new Chart(document.getElementById('chartTemsilci'), {
        type: 'bar',
        data: { labels: sahaVeri.temsilciZiyaret.map(r => r.ad + ' ' + r.soyad), datasets: [{ label: 'Ziyaret', data: sahaVeri.temsilciZiyaret.map(r => r.sayi), backgroundColor: '#c9a15a' }] }
      });
      new Chart(document.getElementById('chartEczane'), {
        type: 'bar',
        data: { labels: sahaVeri.eczaneOkutma.map(r => r.ad), datasets: [{ label: 'Okutma', data: sahaVeri.eczaneOkutma.map(r => r.sayi), backgroundColor: '#3a7ca5' }] }
      });
      new Chart(document.getElementById('chartTiklama'), {
        type: 'bar',
        data: { labels: sahaVeri.tiklamaDagilimi.map(r => r.tip), datasets: [{ label: 'Tıklama', data: sahaVeri.tiklamaDagilimi.map(r => r.sayi), backgroundColor: '#7a9e7e' }] }
      });
    </script>
    <% } %>
  <% } %>
```

- [ ] **Step 5: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js -v`
Expected: PASS (tüm testler)

- [ ] **Step 6: Commit**

```bash
git add app.js views/public/dashboard.ejs tests/kurumsal.test.js
git commit -m "K2: Saha Istatistikleri sekmesi (Chart.js grafikleri)"
```

---

### Task 9: Ziyaretleri Excel'e aktar

**Files:**
- Modify: `routes/kurumsal.js`
- Modify: `tests/kurumsal.test.js`

- [ ] **Step 1: Başarısız testi ekle**

`tests/kurumsal.test.js`'in en üstüne `XLSX` import'unu ekle:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const app = require('../app');
const { pool } = require('../db');
```

Son `});`'den önce şu testi ekle:

```js

  test('ziyaretler excel export doğru içerik-tipiyle ve satırlarla döner', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent.get('/kurumsal/ziyaretler-excel');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    expect(rows[0]).toEqual(['Temsilci', 'Eczane', 'Tarih']);
    expect(rows.length).toBeGreaterThan(1); // Task 8'de eklenen ziyaret satırı dahil
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js -v`
Expected: FAIL — `404 Not Found`

- [ ] **Step 3: `routes/kurumsal.js`'e uç ekle**

Dosyanın en üstüne `XLSX` import'u ekle:

```js
const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { pool } = require('../db');
```

Dosyanın sonuna, `module.exports = router;` satırından hemen önce ekle:

```js

// Ziyaret kayıtlarını Excel'e aktar
router.get('/ziyaretler-excel', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.ad AS temsilci_ad, c.soyad AS temsilci_soyad, e.ad AS eczane_ad, z.created_at
       FROM ziyaretler z
       JOIN calisanlar c ON c.id = z.calisan_id
       JOIN eczaneler e ON e.id = z.eczane_id
       WHERE c.firma_id = $1
       ORDER BY z.created_at DESC`,
      [req.session.firmaId]
    );
    const ws = XLSX.utils.aoa_to_sheet([
      ['Temsilci', 'Eczane', 'Tarih'],
      ...result.rows.map(r => [`${r.temsilci_ad} ${r.temsilci_soyad}`, r.eczane_ad, r.created_at.toISOString()]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ziyaretler');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="ziyaretler.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Excel oluşturulamadı.');
    res.redirect('/?tab=saha');
  }
});
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js -v`
Expected: PASS (tüm testler)

- [ ] **Step 5: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "K2: ziyaretleri Excel'e aktarma ucu"
```

---

### Task 10: Tam test + deploy + production doğrulama

**Files:** Yok (sadece komutlar)

- [ ] **Step 1: Tam test paketini çalıştır**

Run: `npx jest`
Expected: Tüm test suite'leri PASS (önceki 77 teste K2'nin ~20 yeni testi eklenmiş olmalı)

- [ ] **Step 2: `git status` ile bekleyen değişiklik kalmadığını doğrula**

Run: `git status --short`
Expected: Boş çıktı (her şey commitlendi)

- [ ] **Step 3: Push ve deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 4: Yeni deploy'un canlıya çıktığını doğrula**

Production'da K2'ye özgü bir davranışı poll et (örn. `/api/mobil/temsilci-giris` eksik alanla 400 dönmeli — bu uç K2 öncesi yoktu, 404 yerine 400 dönmesi yeni deploy'un canlı olduğunu kanıtlar):

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://www.nfckartify.com.tr/api/mobil/temsilci-giris -H "Content-Type: application/json" -d '{}'
```

Expected: `400` (deploy tamamlanana kadar birkaç kez tekrar dene, `404` görürsen deploy henüz bitmemiştir)

- [ ] **Step 5: Uçtan uca production doğrulaması**

Gerçek test verisiyle (kurumsal firma + temsilci giriş bilgisi + eczane) `node -e` scripti kullanarak:
- `/api/mobil/temsilci-giris` ile token al
- `/api/mobil/ziyaret-kaydet` ile ziyaret kaydet, DB'de satırın oluştuğunu doğrula
- Dashboard'da `?tab=saha` grafiklerinin gerçek veriyle göründüğünü curl ile doğrula
- Test verisini temizle (`DELETE FROM firmalar WHERE ...` — CASCADE ile calisanlar/eczaneler/ziyaretler de silinir)

- [ ] **Step 6: `git status` son kontrol**

Run: `git status --short`
Expected: Boş çıktı
