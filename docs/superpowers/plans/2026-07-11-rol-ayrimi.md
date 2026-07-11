# Rol Ayrımı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Not:** Bu oturumda Agent tool kullanımı kullanıcı tarafından yasaklanmıştır — subagent-driven-development KULLANILMAYACAK, tüm görevler doğrudan (inline) yürütülecek.

**Goal:** Firma sahibinin panelden ek kullanıcı davet edebilmesini, her kullanıcıya bir rol (`tam_yetkili` / `sadece_calisan` / `sadece_saha`) atanabilmesini ve rol bazlı erişim kısıtlaması uygulanmasını sağlamak.

**Architecture:** Yeni `firma_kullanicilari` tablosu (email + şifre hash + rol, `firma_id`'ye bağlı). Mevcut tek giriş noktası (`POST /giris`) bu tabloyu da kontrol edecek şekilde genişletilir; başarılı girişte `req.session.firmaId` (mevcut davranışla birebir aynı) + yeni `req.session.rol` set edilir. **Kritik geriye-dönük-uyumluluk kararı:** firma sahibinin mevcut `firmalar` tablosu üzerinden girişinde `req.session.rol` **hiç set edilmez** (undefined kalır) — mevcut/aktif oturumlar ve firma sahibi girişleri hiçbir kısıtlamaya uğramaz. Kısıtlama SADECE `req.session.rol` gerçekten `'sadece_calisan'` veya `'sadece_saha'` olduğunda devreye girer. Yeni `requireRolIzni(...izinliRoller)` middleware'i router seviyesinde (`/firma/panel`, `/kurumsal`, yeni `/firma/kullanicilar`) ve `app.js`'in tek parça `GET /` dashboard route'unda tab bazlı erişim kısıtlaması için kullanılır.

**Tech Stack:** Express router-level middleware, PostgreSQL (`pg`), bcrypt (12 rounds — mevcut kod tabanı standardı), EJS.

---

## Mevcut Kod Tabanı — Kritik Referans Noktaları

- `app.js:79` — `app.use('/kurumsal', requireFirma, requireKurumsalPaket, kurumsalRoutes);`
- `app.js:73` — `app.use('/firma/panel', requireFirma, panelRoutes);`
- `app.js:83-129` — `POST /giris`: `firmalar` tablosunu `yetkili_email`/`kullanici_adi` ile kontrol eder, `bcrypt.compare` sonrası `req.session.firmaId = firma.id` set eder.
- `app.js:132+` — `GET /`: `req.session.superadmin` / `req.session.bayiId` / `req.session.firmaId` durumlarını inline kontrol eder (router-level middleware yok, tek handler).
- `middleware/authMiddleware.js` — `requireFirma`, `requireKurumsalPaket` burada tanımlı, `module.exports` ile dışa açılıyor.
- `routes/panel.js` — SADECE çalışan CRUD uçları (`/ekle`, `/toplu-yukle`, `/:id/duzenle`, `/:id/durum` vb.) — hepsi `firma_id` bazlı, rol kısıtlaması router seviyesinde uygulanabilir.
- `routes/kurumsal.js` — eczane/içerik/ürün/indirim/rapor uçları — hepsi `req.session.firmaId` kullanıyor, rol kısıtlaması router seviyesinde uygulanabilir.
- `routes/auth.js:21` — `bcrypt.hash(sifre, 12)` — proje standardı 12 round.
- `scripts/migrate.js:174` — migration dizisi `];` ile bitiyor, yeni tablo bu dizinin sonuna eklenir.

---

## Task 1: DB Migration — `firma_kullanicilari` Tablosu

**Files:**
- Modify: `scripts/migrate.js`

- [ ] **Step 1: Migration SQL'ini ekle**

`scripts/migrate.js` içinde `migrations` dizisinin son elemanı (`islem_gecmisi` CREATE TABLE) ile kapanış `];` arasına ekle:

```js
    `CREATE TABLE IF NOT EXISTS firma_kullanicilari (
      id          SERIAL PRIMARY KEY,
      firma_id    INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
      ad          TEXT NOT NULL,
      email       TEXT NOT NULL,
      sifre_hash  TEXT NOT NULL,
      rol         TEXT NOT NULL CHECK (rol IN ('tam_yetkili', 'sadece_calisan', 'sadece_saha')),
      created_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE (firma_id, email)
    )`,
```

- [ ] **Step 2: Migration'ı çalıştır**

Run: `node scripts/migrate.js`
Expected: Çıktıda `OK: CREATE TABLE IF NOT EXISTS firma_kullanicilari (...` satırı görünür, hata yok.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate.js
git commit -m "Rol Ayrımı: firma_kullanicilari tablosu migration"
```

---

## Task 2: `requireRolIzni` Middleware

**Files:**
- Modify: `middleware/authMiddleware.js`
- Test: `tests/authMiddleware.test.js` (yeni dosya)

- [ ] **Step 1: Testi yaz (RED)**

`tests/authMiddleware.test.js` oluştur:

```js
const { requireRolIzni } = require('../middleware/authMiddleware');

function sahteRes() {
  const res = {};
  res.flash = jest.fn();
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/authMiddleware — requireRolIzni', () => {
  test('req.session.rol atanmamışsa (firma sahibi) her zaman next() çağrılır', () => {
    const req = { session: {}, flash: jest.fn() };
    const res = sahteRes();
    const next = jest.fn();

    requireRolIzni('tam_yetkili')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('rol izinli listede varsa next() çağrılır', () => {
    const req = { session: { rol: 'sadece_calisan' }, flash: jest.fn() };
    const res = sahteRes();
    const next = jest.fn();

    requireRolIzni('tam_yetkili', 'sadece_calisan')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('rol izinli listede yoksa / yönlendirilir ve next() çağrılmaz', () => {
    const req = { session: { rol: 'sadece_saha' }, flash: jest.fn() };
    const res = sahteRes();
    const next = jest.fn();

    requireRolIzni('tam_yetkili', 'sadece_calisan')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(req.flash).toHaveBeenCalledWith('error', 'Bu bölüme erişim yetkiniz yok.');
  });
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `npx jest tests/authMiddleware.test.js`
Expected: FAIL — `requireRolIzni is not a function` (henüz export edilmedi).

- [ ] **Step 3: Middleware'i implemente et**

`middleware/authMiddleware.js` sonuna (`module.exports` satırından önce) ekle:

```js
function requireRolIzni(...izinliRoller) {
  return (req, res, next) => {
    const rol = req.session.rol;
    if (!rol) return next(); // rol atanmamışsa (firma sahibi girişi) tam yetki
    if (izinliRoller.includes(rol)) return next();
    req.flash('error', 'Bu bölüme erişim yetkiniz yok.');
    res.redirect('/');
  };
}
```

`module.exports` satırını güncelle:

```js
module.exports = { requireFirma, requireSuperadmin, requireBayi, requireKurumsalPaket, requireRolIzni };
```

- [ ] **Step 4: GREEN'i doğrula**

Run: `npx jest tests/authMiddleware.test.js`
Expected: PASS — 3/3 test.

- [ ] **Step 5: Commit**

```bash
git add middleware/authMiddleware.js tests/authMiddleware.test.js
git commit -m "Rol Ayrımı: requireRolIzni middleware"
```

---

## Task 3: Login Akışını `firma_kullanicilari` Kontrol Edecek Şekilde Genişlet

**Files:**
- Modify: `app.js`
- Test: `tests/rolGirisi.test.js` (yeni dosya)

- [ ] **Step 1: Testi yaz (RED)**

`tests/rolGirisi.test.js` oluştur:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Rol bazlı giriş — firma_kullanicilari', () => {
  let firmaId, kullaniciId;
  const sahibiEmail = 'rolgirisi-sahibi@example.com';
  const altKullaniciEmail = 'rolgirisi-alt@example.com';

  beforeAll(async () => {
    const sahibiHash = await bcrypt.hash('sahibi1234', 12);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Rol Girisi Firma', 'rol-girisi-firma', $1, $2, 'kurumsal') RETURNING id`,
      [sahibiEmail, sahibiHash]
    );
    firmaId = f.rows[0].id;

    const altHash = await bcrypt.hash('alt1234', 12);
    const k = await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol)
       VALUES ($1, 'Alt Kullanici', $2, $3, 'sadece_calisan') RETURNING id`,
      [firmaId, altKullaniciEmail, altHash]
    );
    kullaniciId = k.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firma_kullanicilari WHERE id = $1', [kullaniciId]);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('firma sahibi girişinde session.rol set edilmez (tam yetki)', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: sahibiEmail, sifre: 'sahibi1234' });
    const res = await agent.get('/kurumsal/rapor-excel');
    expect(res.statusCode).not.toBe(302); // requireRolIzni tarafından engellenmedi (200 veya farklı bir akış)
  });

  test('firma_kullanicilari üzerinden doğru şifreyle giriş yapılabilir', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/giris').send({ giris_bilgisi: altKullaniciEmail, sifre: 'alt1234' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('sadece_calisan rolü /kurumsal altına erişemez, ana sayfaya yönlendirilir', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: altKullaniciEmail, sifre: 'alt1234' });
    const res = await agent.get('/kurumsal/rapor-excel');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('sadece_calisan rolü /firma/panel altına erişebilir', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: altKullaniciEmail, sifre: 'alt1234' });
    const res = await agent.get('/firma/panel/excel-sablon');
    expect(res.statusCode).toBe(200);
  });

  test('yanlış şifreyle firma_kullanicilari girişi reddedilir', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/giris').send({ giris_bilgisi: altKullaniciEmail, sifre: 'yanlis-sifre' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const dashRes = await agent.get('/');
    expect(dashRes.text).not.toContain('Rol Girisi Firma');
  });
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `npx jest tests/rolGirisi.test.js`
Expected: FAIL — en az "firma_kullanicilari üzerinden doğru şifreyle giriş yapılabilir" testi 302 yerine `/`'e redirect olmayan bir hata mesajıyla başarısız olur (henüz kontrol edilmiyor).

- [ ] **Step 3: `POST /giris` akışını genişlet**

`app.js`'te mevcut `firmaSonuc` bloğundan hemen sonra (bayi kontrolünden ÖNCE, satır ~107 civarı, `firmaSonuc.rows.length` bloğu kapandıktan sonra) ekle:

```js
    const kullaniciSonuc = await pool.query(
      'SELECT * FROM firma_kullanicilari WHERE LOWER(email) = LOWER($1)',
      [giris_bilgisi]
    );
    if (kullaniciSonuc.rows.length) {
      const kullanici = kullaniciSonuc.rows[0];
      if (await bcrypt.compare(sifre, kullanici.sifre_hash)) {
        req.session.firmaId = kullanici.firma_id;
        req.session.rol = kullanici.rol;
        return res.redirect('/');
      }
    }
```

Tam bağlam (mevcut `firmaSonuc` bloğu ile `bayiSonuc` bloğu arasına eklenmiş hali):

```js
    const firmaSonuc = await pool.query(
      'SELECT * FROM firmalar WHERE LOWER(yetkili_email) = LOWER($1) OR LOWER(kullanici_adi) = LOWER($1)',
      [giris_bilgisi]
    );
    if (firmaSonuc.rows.length) {
      const firma = firmaSonuc.rows[0];
      if (await bcrypt.compare(sifre, firma.yetkili_sifre_hash)) {
        req.session.firmaId = firma.id;
        return res.redirect('/');
      }
    }

    const kullaniciSonuc = await pool.query(
      'SELECT * FROM firma_kullanicilari WHERE LOWER(email) = LOWER($1)',
      [giris_bilgisi]
    );
    if (kullaniciSonuc.rows.length) {
      const kullanici = kullaniciSonuc.rows[0];
      if (await bcrypt.compare(sifre, kullanici.sifre_hash)) {
        req.session.firmaId = kullanici.firma_id;
        req.session.rol = kullanici.rol;
        return res.redirect('/');
      }
    }

    const bayiSonuc = await pool.query(
      'SELECT * FROM bayiler WHERE (LOWER(email) = LOWER($1) OR LOWER(kullanici_adi) = LOWER($1)) AND aktif = true',
      [giris_bilgisi]
    );
```

**Not:** `firma_kullanicilari.email` firmalar arası unique değildir (sadece `firma_id + email` unique) — teorik olarak iki farklı firmada aynı email'e sahip alt kullanıcı olabilir. Bu edge-case mevcut `firmalar.yetkili_email` alanı için de global-unique garantisi yok (kontrol edilmedi), bu yüzden mevcut davranışla tutarlı bırakılıyor — YAGNI, kapsam dışı.

- [ ] **Step 4: GREEN'i doğrula**

Run: `npx jest tests/rolGirisi.test.js`
Expected: PASS — henüz `/kurumsal` ve `/firma/panel` router'larına `requireRolIzni` bağlanmadığı için "sadece_calisan rolü /kurumsal altına erişemez" testi hâlâ FAIL olabilir — bu normal, Task 4'te düzelecek. Diğer 4 test GREEN olmalı.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/rolGirisi.test.js
git commit -m "Rol Ayrımı: giris akisi firma_kullanicilarini kontrol eder"
```

---

## Task 4: Router Seviyesinde Rol Kapılarını Bağla

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Import'u genişlet**

`app.js` satır 23'ü güncelle:

```js
const { requireFirma, requireKurumsalPaket, requireRolIzni } = require('./middleware/authMiddleware');
```

- [ ] **Step 2: `/firma/panel` ve `/kurumsal` mount satırlarını güncelle**

`app.js` satır 73 ve 79'u güncelle:

```js
app.use('/firma/panel', requireFirma, requireRolIzni('tam_yetkili', 'sadece_calisan'), panelRoutes);
```

```js
app.use('/kurumsal', requireFirma, requireKurumsalPaket, requireRolIzni('tam_yetkili', 'sadece_saha'), kurumsalRoutes);
```

- [ ] **Step 3: Task 3'teki testi tekrar çalıştır (artık tam GREEN olmalı)**

Run: `npx jest tests/rolGirisi.test.js`
Expected: PASS — 5/5 test.

- [ ] **Step 4: Tüm mevcut test paketini çalıştır (regresyon kontrolü)**

Run: `npx jest`
Expected: Tüm testler PASS (mevcut hiçbir testte `req.session.rol` set edilmediği için `requireRolIzni` her zaman `next()` çağırır — regresyon riski yok).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Rol Ayrımı: router seviyesinde requireRolIzni baglandi"
```

---

## Task 5: `routes/kullanicilar.js` — Kullanıcı Ekleme/Silme Uçları

**Files:**
- Create: `routes/kullanicilar.js`
- Modify: `app.js`
- Test: `tests/kullanicilar.test.js` (yeni dosya)

- [ ] **Step 1: Testi yaz (RED)**

`tests/kullanicilar.test.js` oluştur:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('routes/kullanicilar', () => {
  let firmaId, sahibiAgent;
  const sahibiEmail = 'kullanicilar-sahibi@example.com';

  beforeAll(async () => {
    const hash = await bcrypt.hash('sahibi1234', 12);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Kullanicilar Firma', 'kullanicilar-firma', $1, $2, 'kurumsal') RETURNING id`,
      [sahibiEmail, hash]
    );
    firmaId = f.rows[0].id;
    sahibiAgent = request.agent(app);
    await sahibiAgent.post('/giris').send({ giris_bilgisi: sahibiEmail, sifre: 'sahibi1234' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('firma sahibi yeni kullanıcı ekleyebilir, şifre hash olarak saklanır', async () => {
    const res = await sahibiAgent.post('/firma/kullanicilar/ekle').send({
      ad: 'Test Calisani', email: 'yeni-kullanici@example.com', sifre: 'gizli1234', rol: 'sadece_calisan'
    });
    expect(res.statusCode).toBe(302);
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE firma_id = $1 AND email = $2', [firmaId, 'yeni-kullanici@example.com']);
    expect(kayit.rows.length).toBe(1);
    expect(kayit.rows[0].sifre_hash).not.toBe('gizli1234');
    expect(await bcrypt.compare('gizli1234', kayit.rows[0].sifre_hash)).toBe(true);
    expect(kayit.rows[0].rol).toBe('sadece_calisan');
  });

  test('geçersiz rol değeri reddedilir', async () => {
    const res = await sahibiAgent.post('/firma/kullanicilar/ekle').send({
      ad: 'Gecersiz Rol', email: 'gecersiz-rol@example.com', sifre: 'gizli1234', rol: 'olmayan_rol'
    });
    expect(res.statusCode).toBe(302);
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE email = $1', ['gecersiz-rol@example.com']);
    expect(kayit.rows.length).toBe(0);
  });

  test('sadece_calisan rolü kullanıcı ekleme uçlarına erişemez', async () => {
    const altHash = await bcrypt.hash('alt1234', 12);
    await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Alt', $2, $3, 'sadece_calisan')`,
      [firmaId, 'kullanicilar-alt@example.com', altHash]
    );
    const altAgent = request.agent(app);
    await altAgent.post('/giris').send({ giris_bilgisi: 'kullanicilar-alt@example.com', sifre: 'alt1234' });
    const res = await altAgent.post('/firma/kullanicilar/ekle').send({
      ad: 'Yetkisiz Ekleme', email: 'yetkisiz@example.com', sifre: 'gizli1234', rol: 'sadece_calisan'
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE email = $1', ['yetkisiz@example.com']);
    expect(kayit.rows.length).toBe(0);
  });

  test('firma sahibi kullanıcıyı silebilir', async () => {
    const hash = await bcrypt.hash('silinecek1234', 12);
    const k = await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Silinecek', $2, $3, 'sadece_saha') RETURNING id`,
      [firmaId, 'silinecek@example.com', hash]
    );
    const res = await sahibiAgent.post(`/firma/kullanicilar/${k.rows[0].id}/sil`);
    expect(res.statusCode).toBe(302);
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE id = $1', [k.rows[0].id]);
    expect(kayit.rows.length).toBe(0);
  });

  test('başka firmanın kullanıcısı silinemez', async () => {
    const digerHash = await bcrypt.hash('x', 12);
    const digerFirma = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash) VALUES ('Diger Firma KA', 'diger-firma-ka', 'diger-ka@example.com', $1) RETURNING id`,
      [digerHash]
    );
    const digerKullanici = await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Diger Kullanici', 'diger-kullanici-ka@example.com', $2, 'sadece_saha') RETURNING id`,
      [digerFirma.rows[0].id, digerHash]
    );
    const res = await sahibiAgent.post(`/firma/kullanicilar/${digerKullanici.rows[0].id}/sil`);
    expect(res.statusCode).toBe(302);
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE id = $1', [digerKullanici.rows[0].id]);
    expect(kayit.rows.length).toBe(1); // silinmedi
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirma.rows[0].id]);
  });
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `npx jest tests/kullanicilar.test.js`
Expected: FAIL — `404` (route henüz yok).

- [ ] **Step 3: `routes/kullanicilar.js` oluştur**

```js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');

const GECERLI_ROLLER = ['tam_yetkili', 'sadece_calisan', 'sadece_saha'];

router.post('/ekle', async (req, res) => {
  const { ad, email, sifre, rol } = req.body;
  if (!ad || !email || !sifre || !GECERLI_ROLLER.includes(rol)) {
    req.flash('error', 'Tüm alanları doğru şekilde doldurun.');
    return res.redirect('/?tab=kullanicilar');
  }
  try {
    const hash = await bcrypt.hash(sifre, 12);
    await pool.query(
      'INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, $2, $3, $4, $5)',
      [req.session.firmaId, ad.trim(), email.trim(), hash, rol]
    );
    req.flash('success', 'Kullanıcı eklendi.');
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      req.flash('error', 'Bu e-posta zaten kayıtlı.');
    } else {
      req.flash('error', 'Kullanıcı eklenemedi.');
    }
  }
  res.redirect('/?tab=kullanicilar');
});

router.post('/:id/sil', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM firma_kullanicilari WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.session.firmaId]
    );
    req.flash('success', 'Kullanıcı kaldırıldı.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Kullanıcı kaldırılamadı.');
  }
  res.redirect('/?tab=kullanicilar');
});

module.exports = router;
```

- [ ] **Step 4: `app.js`'e bağla**

Import ekle (satır ~19 civarı, `kurumsalRoutes` satırından sonra):

```js
const kullaniciRoutes = require('./routes/kullanicilar');
```

Mount ekle (`/kurumsal` mount satırından sonra):

```js
app.use('/firma/kullanicilar', requireFirma, requireRolIzni('tam_yetkili'), kullaniciRoutes);
```

- [ ] **Step 5: GREEN'i doğrula**

Run: `npx jest tests/kullanicilar.test.js`
Expected: PASS — 5/5 test.

- [ ] **Step 6: Commit**

```bash
git add routes/kullanicilar.js app.js tests/kullanicilar.test.js
git commit -m "Rol Ayrımı: kullanici ekleme/silme uclari"
```

---

## Task 6: `app.js` `GET /` — Kullanıcı Listesi + Tab Erişim Kısıtlaması

**Files:**
- Modify: `app.js`
- Test: `tests/rolTabKisitlama.test.js` (yeni dosya)

- [ ] **Step 1: Testi yaz (RED)**

`tests/rolTabKisitlama.test.js` oluştur:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Rol bazlı tab erişim kısıtlaması', () => {
  let firmaId;
  const sahibiEmail = 'tabkisitlama-sahibi@example.com';

  beforeAll(async () => {
    const hash = await bcrypt.hash('sahibi1234', 12);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Tab Kisitlama Firma', 'tab-kisitlama-firma', $1, $2, 'kurumsal') RETURNING id`,
      [sahibiEmail, hash]
    );
    firmaId = f.rows[0].id;
    const altHash = await bcrypt.hash('alt1234', 12);
    await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Calisan Rolu', 'tabkisitlama-calisan@example.com', $2, 'sadece_calisan')`,
      [firmaId, altHash]
    );
    await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Saha Rolu', 'tabkisitlama-saha@example.com', $2, 'sadece_saha')`,
      [firmaId, altHash]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('sadece_calisan rolü ?tab=raf isteğinde calisanlar tabına düşürülür', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: 'tabkisitlama-calisan@example.com', sifre: 'alt1234' });
    const res = await agent.get('/?tab=raf');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Yeni Eczane Ekle');
  });

  test('sadece_saha rolü ?tab=calisanlar isteğinde genel bakışa düşürülür', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: 'tabkisitlama-saha@example.com', sifre: 'alt1234' });
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('td-actions');
  });

  test('firma sahibi Kullanıcılar sekmesinde eklenen kullanıcıları görür', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: sahibiEmail, sifre: 'sahibi1234' });
    const res = await agent.get('/?tab=kullanicilar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Calisan Rolu');
    expect(res.text).toContain('Saha Rolu');
  });

  test('sadece_calisan rolü Kullanıcılar sekmesine erişemez', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: 'tabkisitlama-calisan@example.com', sifre: 'alt1234' });
    const res = await agent.get('/?tab=kullanicilar');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Calisan Rolu');
  });
});
```

- [ ] **Step 2: RED'i doğrula**

Run: `npx jest tests/rolTabKisitlama.test.js`
Expected: FAIL — henüz tab kısıtlaması yok, `kullanicilar` tab'ı render edilmiyor.

- [ ] **Step 3: `app.js` `GET /` handler'ını güncelle**

`const tab = req.query.tab || 'calisanlar';` satırının hemen altına ekle (mevcut `let islemGecmisi = [];` bloğundan önce):

```js
    let tab = req.query.tab || 'calisanlar';
    const CALISAN_ROLU_TABLARI = ['calisanlar', 'istatistik', 'excel', 'genel', 'analytics', 'gecmis'];
    const SAHA_ROLU_TABLARI = ['icerik', 'urunler', 'indirim', 'raf', 'saha', 'genel', 'analytics', 'gecmis'];
    if (req.session.rol === 'sadece_calisan' && !CALISAN_ROLU_TABLARI.includes(tab)) tab = 'calisanlar';
    if (req.session.rol === 'sadece_saha' && !SAHA_ROLU_TABLARI.includes(tab)) tab = 'genel';
    if (tab === 'kullanicilar' && req.session.rol && req.session.rol !== 'tam_yetkili') tab = 'genel';
```

**Not:** Mevcut `const tab = req.query.tab || 'calisanlar';` satırı `let` olacak şekilde değiştirildi (yukarıdaki kod bloğu bunu zaten içeriyor) çünkü artık yeniden atanabilmesi gerekiyor.

- [ ] **Step 4: Kullanıcı listesi sorgusunu ekle**

`islemGecmisi` bloğundan hemen sonra ekle:

```js
    let kullanicilarListesi = [];
    if (tab === 'kullanicilar' && (!req.session.rol || req.session.rol === 'tam_yetkili')) {
      const kullanicilarSonuc = await pool.query(
        'SELECT id, ad, email, rol, created_at FROM firma_kullanicilari WHERE firma_id = $1 ORDER BY created_at DESC',
        [req.session.firmaId]
      );
      kullanicilarListesi = kullanicilarSonuc.rows;
    }
```

- [ ] **Step 5: `res.render` çağrısına yeni değişkenleri ekle**

`res.render('public/dashboard', { ... })` çağrısındaki nesneye ekle:

```js
      indirimIstatistik, ara, sayfa, islemGecmisi, genelBakis, kullanicilarListesi, rol: req.session.rol
```

(Mevcut satırın tam hali: `indirimIstatistik, ara, sayfa, islemGecmisi, genelBakis` idi — sonuna `, kullanicilarListesi, rol: req.session.rol` eklenir.)

- [ ] **Step 6: GREEN'i kısmen doğrula**

Run: `npx jest tests/rolTabKisitlama.test.js`
Expected: İlk 2 test (tab düşürme) PASS olmalı. Son 2 test (Kullanıcılar sekmesi içeriği) dashboard.ejs'te henüz `kullanicilar` tab bloğu olmadığı için FAIL kalır — Task 7'de düzelecek.

- [ ] **Step 7: Commit**

```bash
git add app.js tests/rolTabKisitlama.test.js
git commit -m "Rol Ayrımı: tab erisim kisitlamasi + kullanici listesi sorgusu"
```

---

## Task 7: `dashboard.ejs` — Kullanıcılar Sekmesi UI + Rol Bazlı Nav Gizleme

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] **Step 1: Ana grup navını rol bazlı gizle**

`dashboard.ejs`'te `<!-- TAB GROUPS -->` bloğunu bul (yaklaşık satır 340). Mevcut hali:

```html
  <div class="dash-tabs-main">
    <a href="/?tab=genel" class="dash-tab-main <%= aktifGrup === 'genel' ? 'active' : '' %>">Genel Bakış</a>
    <a href="/?tab=calisanlar" class="dash-tab-main <%= aktifGrup === 'calisanlar' ? 'active' : '' %>">Çalışanlar</a>
    <% if (firma.paket === 'kurumsal') { %>
    <a href="/?tab=raf"    class="dash-tab-main <%= aktifGrup === 'eczane' ? 'active' : '' %>">Eczane Ağı</a>
    <a href="/?tab=icerik" class="dash-tab-main <%= aktifGrup === 'icerik' ? 'active' : '' %>">İçerik</a>
    <% } %>
    <a href="/?tab=<%= firma.paket === 'kurumsal' ? 'saha' : 'analytics' %>" class="dash-tab-main <%= aktifGrup === 'saha' ? 'active' : '' %>">Saha Raporları</a>
  </div>
```

Yeni hali (`sadece_saha` rolünde Çalışanlar grubu, `sadece_calisan` rolünde Eczane Ağı/İçerik grupları gizlenir):

```html
  <div class="dash-tabs-main">
    <a href="/?tab=genel" class="dash-tab-main <%= aktifGrup === 'genel' ? 'active' : '' %>">Genel Bakış</a>
    <% if (rol !== 'sadece_saha') { %>
    <a href="/?tab=calisanlar" class="dash-tab-main <%= aktifGrup === 'calisanlar' ? 'active' : '' %>">Çalışanlar</a>
    <% } %>
    <% if (firma.paket === 'kurumsal' && rol !== 'sadece_calisan') { %>
    <a href="/?tab=raf"    class="dash-tab-main <%= aktifGrup === 'eczane' ? 'active' : '' %>">Eczane Ağı</a>
    <a href="/?tab=icerik" class="dash-tab-main <%= aktifGrup === 'icerik' ? 'active' : '' %>">İçerik</a>
    <% } %>
    <a href="/?tab=<%= firma.paket === 'kurumsal' ? 'saha' : 'analytics' %>" class="dash-tab-main <%= aktifGrup === 'saha' ? 'active' : '' %>">Saha Raporları</a>
  </div>
```

- [ ] **Step 2: Çalışanlar grubu alt-sekmesine "Kullanıcılar" ekle (sadece tam yetkili)**

`<!-- SUB TABS -->` bloğunda `aktifGrup === 'calisanlar'` dalını bul:

```html
    <% if (aktifGrup === 'calisanlar') { %>
    <a href="/?tab=calisanlar" class="dash-tab <%= tab === 'calisanlar' ? 'active' : '' %>">Çalışanlar</a>
    <a href="/?tab=istatistik" class="dash-tab <%= tab === 'istatistik' ? 'active' : '' %>">İstatistik</a>
    <a href="/?tab=excel"      class="dash-tab <%= tab === 'excel'      ? 'active' : '' %>">Excel Yükle</a>
    <% } else if (aktifGrup === 'eczane') { %>
```

Yeni hali:

```html
    <% if (aktifGrup === 'calisanlar') { %>
    <a href="/?tab=calisanlar" class="dash-tab <%= tab === 'calisanlar' ? 'active' : '' %>">Çalışanlar</a>
    <a href="/?tab=istatistik" class="dash-tab <%= tab === 'istatistik' ? 'active' : '' %>">İstatistik</a>
    <a href="/?tab=excel"      class="dash-tab <%= tab === 'excel'      ? 'active' : '' %>">Excel Yükle</a>
    <% if (!rol || rol === 'tam_yetkili') { %>
    <a href="/?tab=kullanicilar" class="dash-tab <%= tab === 'kullanicilar' ? 'active' : '' %>">Kullanıcılar</a>
    <% } %>
    <% } else if (aktifGrup === 'eczane') { %>
```

- [ ] **Step 3: `tabGruplari` haritasına `kullanicilar`'ı ekle**

`ikon()` fonksiyonunun altındaki `tabGruplari` nesnesini bul:

```js
var tabGruplari = {
  genel: ['genel'],
  calisanlar: ['calisanlar', 'istatistik', 'excel'],
```

Yeni hali:

```js
var tabGruplari = {
  genel: ['genel'],
  calisanlar: ['calisanlar', 'istatistik', 'excel', 'kullanicilar'],
```

- [ ] **Step 4: Kullanıcılar sekmesi içerik bloğunu ekle**

`<!-- TAB: ÇALIŞANLAR -->` bloğundan hemen önce (`<!-- TAB: GENEL BAKIŞ -->` bloğunun kapanışından sonra) yeni bir tab bloğu ekle:

```html
  <!-- TAB: KULLANICILAR -->
  <% } else if (tab === 'kullanicilar') { %>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px">
      <h3 style="margin-bottom:12px">Yeni Kullanıcı Davet Et</h3>
      <form method="POST" action="/firma/kullanicilar/ekle" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="min-width:160px">
          <label>Ad Soyad</label>
          <input name="ad" required>
        </div>
        <div class="field" style="min-width:200px">
          <label>E-posta</label>
          <input type="email" name="email" required>
        </div>
        <div class="field" style="min-width:160px">
          <label>Şifre</label>
          <input type="text" name="sifre" required minlength="6">
        </div>
        <div class="field" style="min-width:160px">
          <label>Rol</label>
          <select name="rol" required>
            <option value="tam_yetkili">Tam Yetkili</option>
            <option value="sadece_calisan">Sadece Çalışan Yönetimi</option>
            <option value="sadece_saha">Sadece Saha/Eczane</option>
          </select>
        </div>
        <button type="submit" class="btn btn-gold" style="height:36px">Ekle</button>
      </form>
    </div>
    <% if (!kullanicilarListesi.length) { %>
    <div class="table-wrap">
      <div class="empty-state">
        <div class="empty-state-icon"><%- ikon('kullanici', 32, '') %></div>
        <div class="empty-state-title">Henüz ek kullanıcı yok</div>
        <div class="empty-state-sub">Yukarıdan davet ederek başlayın</div>
      </div>
    </div>
    <% } else { %>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Rol</th><th>İşlem</th></tr></thead>
        <tbody>
          <% kullanicilarListesi.forEach(k => { %>
          <tr>
            <td class="td-name"><%= k.ad %></td>
            <td><%= k.email %></td>
            <td><%= k.rol === 'tam_yetkili' ? 'Tam Yetkili' : k.rol === 'sadece_calisan' ? 'Sadece Çalışan' : 'Sadece Saha' %></td>
            <td>
              <form method="POST" action="/firma/kullanicilar/<%= k.id %>/sil" style="display:inline" onsubmit="return confirm('<%= k.ad %> kaldırılsın mı?')">
                <button type="submit" class="btn-link">Kaldır</button>
              </form>
            </td>
          </tr>
          <% }) %>
        </tbody>
      </table>
    </div>
    <% } %>

  <!-- TAB: ÇALIŞANLAR -->
```

**Not:** Bu blok, mevcut `<% if (tab === 'genel') { %> ... <% } %>` bloğunun kapanış `<% } %>`'ından hemen sonra, `<% } else if (tab === 'calisanlar') { %>` satırından ÖNCE eklenir. Mevcut zincir `<% if (tab === 'genel') { %> ... <% } else if (tab === 'calisanlar') { %>` şeklindeydi; yeni zincir `<% if (tab === 'genel') { %> ... <% } else if (tab === 'kullanicilar') { %> ... <% } else if (tab === 'calisanlar') { %>` olur — yukarıdaki kod bloğundaki `<% } else if (tab === 'kullanicilar') { %>` satırı bu geçişi sağlar.

- [ ] **Step 5: Test paketini çalıştır**

Run: `npx jest tests/rolTabKisitlama.test.js`
Expected: PASS — 4/4 test.

Run: `npx jest`
Expected: Tüm testler PASS (regresyon yok).

- [ ] **Step 6: Tarayıcıda doğrula**

Yerel sunucuyu başlat (`node app.js`), bir kurumsal firma + bir `sadece_calisan` + bir `sadece_saha` kullanıcısı DB'ye ekleyip üç farklı oturumla giriş yap:
- Firma sahibi: tüm sekmeler + Kullanıcılar sekmesi görünür, yeni kullanıcı eklenip silinebilir.
- `sadece_calisan`: sadece Genel Bakış + Çalışanlar grubu (Kullanıcılar sekmesi YOK) görünür, `/kurumsal/*` URL'lerine doğrudan gidildiğinde `/`'e yönlendirilir.
- `sadece_saha`: sadece Genel Bakış + Eczane Ağı + İçerik + Saha Raporları görünür, `/firma/panel/*` URL'lerine doğrudan gidildiğinde `/`'e yönlendirilir.

- [ ] **Step 7: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "Rol Ayrımı: Kullanicilar sekmesi UI + rol bazli nav gizleme"
```

---

## Task 8: Tam Test + Deploy + Prod Doğrulama

- [ ] **Step 1: Tüm test paketini çalıştır**

Run: `npx jest`
Expected: Tüm testler PASS, 0 fail.

- [ ] **Step 2: `git status` ile değişiklikleri gözden geçir, push et**

```bash
git push origin master
```

- [ ] **Step 3: Railway'e deploy et**

```bash
railway up --service app --detach
```

Deploy tamamlanana kadar bekle (`railway status` ile `● Online` durumunu doğrula), rollover-timing için birkaç kez retry ile doğrula (bu oturumda daha önce gözlemlenen bilinen bir gecikme paterni).

- [ ] **Step 4: Production'da uçtan uca doğrulama**

Doğrudan production DB'sine (yerel `.env` = production, bu oturumda zaten doğrulanmış) marker bir firma + üç farklı rollü kullanıcı ekle, gerçek HTTP istekleriyle:
1. Firma sahibi girişi → Kullanıcılar sekmesi görünür + yeni kullanıcı eklenebilir.
2. `sadece_calisan` girişi → `/kurumsal/rapor-excel` isteği 302 ile `/`'e döner.
3. `sadece_saha` girişi → `/firma/panel/excel-sablon` isteği 302 ile `/`'e döner.

Doğrulama sonrası marker verileri temizle.

- [ ] **Step 5: `finishing-a-development-branch` akışını uygula**

Bu proje `master` üzerinde doğrudan çalışıyor (ayrı feature branch/worktree kullanılmıyor, tüm oturum boyunca bu şekilde ilerlendi) — ek bir merge/PR adımı gerekmez, Step 2-4 zaten tamamlanmış "finish" adımlarıdır.
