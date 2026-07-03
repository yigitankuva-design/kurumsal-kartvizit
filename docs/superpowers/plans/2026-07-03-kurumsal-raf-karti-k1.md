# Kurumsal Raf Kartı — Faz K1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurumsal firmaların (paket='kurumsal') eczane raf kartları için public katalog sayfası (`/raf/<kod>`), okutma/tıklama kaydı ve panelde İçerik + Raf Kartları sekmeleri.

**Architecture:** Yeni tablolar (`eczaneler`, `raf_okutmalar`, `raf_tiklamalar`) + `firmalar`a içerik alanları. Public raf route'ları `routes/public.js`'in EN ÜSTÜNE eklenir (dosyadaki `/:firmaSlug/:calisanSlug` catch-all'ından ÖNCE gelmeli, yoksa `/raf/x` yanlış eşleşir). Panel işlemleri yeni `routes/kurumsal.js`'te, `requireFirma` + `requireKurumsalPaket` ile korunur. PDF yükleme, mevcut foto upload altyapısının sharp'sız PDF varyantıyla yapılır.

**Tech Stack:** Express 5, EJS, pg, multer + Railway Storage (mevcut), jest + supertest.

**Spec:** `docs/superpowers/specs/2026-07-03-kurumsal-raf-karti-k1-design.md`

---

## Dosya Yapısı

- Modify: `scripts/migrate.js` — yeni tablolar + firmalar kolonları
- Create: `utils/eczaneKod.js` — rastgele kod üretimi
- Modify: `middleware/authMiddleware.js` — `requireKurumsalPaket`
- Modify: `middleware/upload.js` — `pdfUploadMiddleware`
- Modify: `routes/public.js` — `/raf/:kod` + `/raf/:kod/tikla/:tip` (dosyanın en üstüne)
- Create: `views/public/raf.ejs` — müşteri katalog sayfası
- Create: `routes/kurumsal.js` — içerik/logo/katalog/eczane uçları
- Modify: `app.js` — `/kurumsal` mount + dashboard'a eczaneler verisi
- Modify: `views/public/dashboard.ejs` — İçerik + Raf Kartları sekmeleri
- Test: `tests/eczaneKod.test.js`, `tests/raf.test.js`, `tests/kurumsal.test.js`

---

### Task 1: DB migration

**Files:**
- Modify: `scripts/migrate.js`

- [ ] **Step 1: `scripts/migrate.js`'teki `migrations` dizisinin sonuna ekle**

`` `ALTER TABLE bayiler ADD COLUMN IF NOT EXISTS abonelik_bitis_tarihi DATE`, `` satırından sonra:

```js
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
```

Not: `firmalar.logo_url` ZATEN VAR (`routes/public.js` `profilGetir` kullanıyor), eklenmez.

- [ ] **Step 2: Migration'ı çalıştır**

Run: `node scripts/migrate.js`
Expected: Her satır için `OK: ...`, sonda `Migration tamamlandı.` (DB local+prod paylaşımlı — tek çalıştırma yeter.)

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate.js
git commit -m "K1: eczane/raf tabloları ve firmalar içerik alanları migration'ı"
```

---

### Task 2: Eczane kod üretimi

**Files:**
- Create: `utils/eczaneKod.js`
- Test: `tests/eczaneKod.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/eczaneKod.test.js`:

```js
const { eczaneKodUret } = require('../utils/eczaneKod');

describe('eczaneKodUret', () => {
  test('8 karakterlik, izinli alfabede kod üretir', () => {
    const kod = eczaneKodUret();
    expect(kod).toHaveLength(8);
    expect(kod).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
  });

  test('ardışık çağrılar farklı kod üretir', () => {
    const kodlar = new Set(Array.from({ length: 50 }, () => eczaneKodUret()));
    expect(kodlar.size).toBe(50);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npx jest tests/eczaneKod.test.js`
Expected: FAIL — `Cannot find module '../utils/eczaneKod'`

- [ ] **Step 3: `utils/eczaneKod.js`'i yaz**

```js
const crypto = require('crypto');

// l/1, o/0 gibi karışan karakterler alfabede yok
const KARAKTERLER = 'abcdefghjkmnpqrstuvwxyz23456789';

function eczaneKodUret(uzunluk = 8) {
  const bayt = crypto.randomBytes(uzunluk);
  let kod = '';
  for (let i = 0; i < uzunluk; i++) {
    kod += KARAKTERLER[bayt[i] % KARAKTERLER.length];
  }
  return kod;
}

async function benzersizEczaneKoduUret() {
  const { pool } = require('../db');
  while (true) {
    const kod = eczaneKodUret();
    const sonuc = await pool.query('SELECT id FROM eczaneler WHERE kod = $1', [kod]);
    if (!sonuc.rows.length) return kod;
  }
}

module.exports = { eczaneKodUret, benzersizEczaneKoduUret };
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npx jest tests/eczaneKod.test.js`
Expected: PASS — 2 passed

- [ ] **Step 5: Commit**

```bash
git add utils/eczaneKod.js tests/eczaneKod.test.js
git commit -m "K1: eczane kod üretimi yardımcıları"
```

---

### Task 3: Raf public sayfası + tıklama takibi

**Files:**
- Modify: `routes/public.js` (raf route'ları DOSYANIN EN ÜSTÜNE — `router` tanımından hemen sonra, mevcut tüm route'lardan önce)
- Create: `views/public/raf.ejs`
- Test: `tests/raf.test.js`

- [ ] **Step 1: Başarısız testleri yaz**

`tests/raf.test.js`:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Raf kartı public sayfası', () => {
  let firmaId;
  let eczaneId;
  const kod = 'raftest1';

  beforeAll(async () => {
    const hash = await bcrypt.hash('x', 4);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket, katalog_url, website)
       VALUES ('Raf Test Firma', 'raf-test-firma', 'raftest@example.com', $1, 'kurumsal',
               'https://ornek.com/katalog.pdf', 'https://ornek.com') RETURNING id`,
      [hash]
    );
    firmaId = f.rows[0].id;
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, adres, kod)
       VALUES ($1, 'Test Eczanesi', 'Test Mah.', $2) RETURNING id`,
      [firmaId, kod]
    );
    eczaneId = e.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('geçerli kod 200 döner, okutma kaydedilir', async () => {
    const onceki = (await pool.query('SELECT COUNT(*) FROM raf_okutmalar WHERE eczane_id = $1', [eczaneId])).rows[0].count;
    const res = await request(app).get(`/raf/${kod}`);
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Raf Test Firma');
    expect(res.text).toContain('Ürün Kataloğu');
    const sonraki = (await pool.query('SELECT COUNT(*) FROM raf_okutmalar WHERE eczane_id = $1', [eczaneId])).rows[0].count;
    expect(Number(sonraki)).toBe(Number(onceki) + 1);
  });

  test('geçersiz kod 404 döner', async () => {
    const res = await request(app).get('/raf/yokboylekod');
    expect(res.statusCode).toBe(404);
  });

  test('katalog tıklaması kaydedilir ve redirect eder', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/katalog`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://ornek.com/katalog.pdf');
    const sayi = (await pool.query(
      "SELECT COUNT(*) FROM raf_tiklamalar WHERE eczane_id = $1 AND tip = 'katalog'", [eczaneId]
    )).rows[0].count;
    expect(Number(sayi)).toBeGreaterThan(0);
  });

  test('beyaz liste dışı tip kaydedilmez, sayfaya redirect eder', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/zararli`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/raf/${kod}`);
    const sayi = (await pool.query(
      "SELECT COUNT(*) FROM raf_tiklamalar WHERE eczane_id = $1 AND tip = 'zararli'", [eczaneId]
    )).rows[0].count;
    expect(Number(sayi)).toBe(0);
  });

  test('boş alanın tıklaması sayfaya geri döner', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/instagram`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/raf/${kod}`);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npx jest tests/raf.test.js`
Expected: FAIL — `/raf/raftest1` mevcut catch-all'a düşer, 404/yanlış sayfa döner.

- [ ] **Step 3: `routes/public.js`'e raf route'larını ekle**

`const { cevirmenOlustur } = require('../utils/i18n');` satırından hemen sonra
(yani TÜM mevcut route tanımlarından ÖNCE) ekle:

```js
const RAF_TIKLAMA_TIPLERI = ['katalog', 'website', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok', 'whatsapp'];

async function eczaneGetir(kod) {
  const result = await pool.query(
    `SELECT e.id as eczane_id, e.ad as eczane_ad, e.kod,
            f.ad as firma_ad, f.logo_url, f.marka_rengi, f.katalog_url,
            f.website, f.instagram, f.linkedin, f.twitter, f.youtube, f.tiktok, f.whatsapp
     FROM eczaneler e JOIN firmalar f ON f.id = e.firma_id
     WHERE e.kod = $1`,
    [kod]
  );
  return result.rows[0] || null;
}

// Raf kartı sayfası — müşteri okutması
router.get('/raf/:kod', async (req, res) => {
  try {
    const veri = await eczaneGetir(req.params.kod);
    if (!veri) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Sayfa bulunamadı.', layout: false });
    }
    try {
      await pool.query('INSERT INTO raf_okutmalar (eczane_id) VALUES ($1)', [veri.eczane_id]);
    } catch (kayitHatasi) {
      console.error('raf okutma kaydı başarısız:', kayitHatasi);
    }
    res.render('public/raf', { title: veri.firma_ad, veri, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

// Raf kartı tıklama takibi
router.get('/raf/:kod/tikla/:tip', async (req, res) => {
  const { kod, tip } = req.params;
  try {
    const veri = await eczaneGetir(kod);
    if (!veri) return res.status(404).send('Bulunamadı.');

    if (!RAF_TIKLAMA_TIPLERI.includes(tip)) return res.redirect(`/raf/${kod}`);

    await pool.query('INSERT INTO raf_tiklamalar (eczane_id, tip) VALUES ($1, $2)', [veri.eczane_id, tip]);

    const hedefler = {
      katalog: veri.katalog_url,
      website: veri.website,
      instagram: veri.instagram,
      linkedin: veri.linkedin,
      twitter: veri.twitter,
      youtube: veri.youtube,
      tiktok: veri.tiktok,
      whatsapp: veri.whatsapp ? `https://wa.me/${veri.whatsapp.replace(/\D/g, '')}` : null,
    };
    const hedef = hedefler[tip];
    if (hedef) return res.redirect(hedef);
    res.redirect(`/raf/${kod}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/raf/${kod}`);
  }
});
```

- [ ] **Step 4: `views/public/raf.ejs`'i yaz**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= veri.firma_ad %></title>
  <style>
    :root { --renk: <%= veri.marka_rengi || '#1a73e8' %>; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; justify-content: center; padding: 24px 16px; }
    .kart { width: 100%; max-width: 420px; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08); height: fit-content; }
    .ust { background: var(--renk); padding: 36px 24px 28px; text-align: center; color: #fff; }
    .logo { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; background: #fff; margin-bottom: 14px; }
    .firma-ad { font-size: 24px; font-weight: 700; }
    .eczane-ad { font-size: 13px; opacity: 0.85; margin-top: 6px; }
    .govde { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
    .btn { display: block; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: 600; }
    .btn-katalog { background: var(--renk); color: #fff; font-size: 17px; }
    .btn-dis { background: #f0f2f5; color: #1a1a2e; }
  </style>
</head>
<body>
  <div class="kart">
    <div class="ust">
      <% if (veri.logo_url) { %><img class="logo" src="<%= veri.logo_url %>" alt=""><% } %>
      <div class="firma-ad"><%= veri.firma_ad %></div>
      <div class="eczane-ad"><%= veri.eczane_ad %></div>
    </div>
    <div class="govde">
      <% if (veri.katalog_url) { %>
        <a class="btn btn-katalog" href="/raf/<%= veri.kod %>/tikla/katalog">📄 Ürün Kataloğu</a>
      <% } %>
      <% if (veri.website) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/website">🌐 Web Sitemiz</a>
      <% } %>
      <% if (veri.instagram) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/instagram">📷 Instagram</a>
      <% } %>
      <% if (veri.linkedin) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/linkedin">💼 LinkedIn</a>
      <% } %>
      <% if (veri.twitter) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/twitter">𝕏 Twitter / X</a>
      <% } %>
      <% if (veri.youtube) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/youtube">▶️ YouTube</a>
      <% } %>
      <% if (veri.tiktok) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/tiktok">🎵 TikTok</a>
      <% } %>
      <% if (veri.whatsapp) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/whatsapp">💬 WhatsApp</a>
      <% } %>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 5: Testi çalıştır, geçtiğini doğrula**

Run: `npx jest tests/raf.test.js`
Expected: PASS — 5 passed

- [ ] **Step 6: Commit**

```bash
git add routes/public.js views/public/raf.ejs tests/raf.test.js
git commit -m "K1: /raf/:kod public sayfası + okutma ve tıklama takibi"
```

---

### Task 4: requireKurumsalPaket + eczane/içerik uçları

**Files:**
- Modify: `middleware/authMiddleware.js`
- Create: `routes/kurumsal.js`
- Modify: `app.js`
- Test: `tests/kurumsal.test.js`

- [ ] **Step 1: Başarısız testleri yaz**

`tests/kurumsal.test.js`:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

async function firmaOlustur(paket, email) {
  const hash = await bcrypt.hash('test1234', 8);
  const r = await pool.query(
    `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [`Firma ${email}`, `firma-${email.split('@')[0]}`, email, hash, paket]
  );
  return r.rows[0].id;
}

async function girisYap(email) {
  const agent = request.agent(app);
  await agent.post('/giris').send({ giris_bilgisi: email, sifre: 'test1234' });
  return agent;
}

describe('Kurumsal panel uçları', () => {
  let kurumsalId, basicId;

  beforeAll(async () => {
    kurumsalId = await firmaOlustur('kurumsal', 'k1kurumsal@example.com');
    basicId = await firmaOlustur('basic', 'k1basic@example.com');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = ANY($1)', [[kurumsalId, basicId]]);
    await pool.end();
  });

  test('kurumsal firma eczane ekleyebilir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Deneme Eczanesi', adres: 'Merkez' });
    expect(res.statusCode).toBe(302);
    const e = await pool.query('SELECT * FROM eczaneler WHERE firma_id = $1', [kurumsalId]);
    expect(e.rows.length).toBe(1);
    expect(e.rows[0].kod).toHaveLength(8);
  });

  test('basic firma /kurumsal uçlarından redirect ile döner, kayıt oluşmaz', async () => {
    const agent = await girisYap('k1basic@example.com');
    const res = await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Yetkisiz Eczane' });
    expect(res.statusCode).toBe(302);
    const e = await pool.query('SELECT * FROM eczaneler WHERE firma_id = $1', [basicId]);
    expect(e.rows.length).toBe(0);
  });

  test('başka firmanın eczanesi düzenlenemez', async () => {
    const eczane = (await pool.query('SELECT id FROM eczaneler WHERE firma_id = $1', [kurumsalId])).rows[0];
    const digerKurumsalId = await firmaOlustur('kurumsal', 'k1diger@example.com');
    const agent = await girisYap('k1diger@example.com');
    await agent.post(`/kurumsal/eczane/${eczane.id}/duzenle`).send({ ad: 'HACKLENDI' });
    const kontrol = await pool.query('SELECT ad FROM eczaneler WHERE id = $1', [eczane.id]);
    expect(kontrol.rows[0].ad).toBe('Deneme Eczanesi');
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerKurumsalId]);
  });

  test('içerik linkleri güncellenir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent.post('/kurumsal/icerik').send({
      website: 'https://ornek.com', instagram: 'https://instagram.com/ornek',
    });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT website, instagram FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].website).toBe('https://ornek.com');
    expect(f.rows[0].instagram).toBe('https://instagram.com/ornek');
  });

  test('eczane silinir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const eczane = (await pool.query('SELECT id FROM eczaneler WHERE firma_id = $1', [kurumsalId])).rows[0];
    await agent.post(`/kurumsal/eczane/${eczane.id}/sil`);
    const e = await pool.query('SELECT * FROM eczaneler WHERE id = $1', [eczane.id]);
    expect(e.rows.length).toBe(0);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js`
Expected: FAIL — `/kurumsal/*` uçları 404

- [ ] **Step 3: `middleware/authMiddleware.js`'e `requireKurumsalPaket` ekle**

`requireBayi` fonksiyonundan sonra ekle, `module.exports`'a dahil et:

```js
async function requireKurumsalPaket(req, res, next) {
  try {
    const { pool } = require('../db');
    const r = await pool.query('SELECT paket FROM firmalar WHERE id = $1', [req.session.firmaId]);
    if (!r.rows.length || r.rows[0].paket !== 'kurumsal') return res.redirect('/');
    next();
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
}

module.exports = { requireFirma, requireSuperadmin, requireBayi, requireKurumsalPaket };
```

- [ ] **Step 4: `routes/kurumsal.js`'i yaz (upload uçları Task 5'te eklenecek)**

```js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { benzersizEczaneKoduUret } = require('../utils/eczaneKod');

// İçerik linklerini güncelle
router.post('/icerik', async (req, res) => {
  const { website, instagram, linkedin, twitter, youtube, tiktok, whatsapp } = req.body;
  try {
    await pool.query(
      `UPDATE firmalar SET website=$1, instagram=$2, linkedin=$3, twitter=$4,
        youtube=$5, tiktok=$6, whatsapp=$7 WHERE id=$8`,
      [website || null, instagram || null, linkedin || null, twitter || null,
       youtube || null, tiktok || null, whatsapp || null, req.session.firmaId]
    );
    req.flash('success', 'İçerik güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=icerik');
});

// Eczane ekle
router.post('/eczane-ekle', async (req, res) => {
  const { ad, adres } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Eczane adı zorunlu.');
    return res.redirect('/?tab=raf');
  }
  try {
    const kod = await benzersizEczaneKoduUret();
    await pool.query(
      'INSERT INTO eczaneler (firma_id, ad, adres, kod) VALUES ($1, $2, $3, $4)',
      [req.session.firmaId, ad.trim(), adres || null, kod]
    );
    req.flash('success', `${ad} eklendi.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Eklenemedi.');
  }
  res.redirect('/?tab=raf');
});

// Eczane düzenle (kod değişmez — fiziksel karta yazılmış olabilir)
router.post('/eczane/:id/duzenle', async (req, res) => {
  const { ad, adres } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Eczane adı zorunlu.');
    return res.redirect('/?tab=raf');
  }
  try {
    await pool.query(
      'UPDATE eczaneler SET ad=$1, adres=$2 WHERE id=$3 AND firma_id=$4',
      [ad.trim(), adres || null, req.params.id, req.session.firmaId]
    );
    req.flash('success', 'Eczane güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=raf');
});

// Eczane sil
router.post('/eczane/:id/sil', async (req, res) => {
  try {
    await pool.query('DELETE FROM eczaneler WHERE id=$1 AND firma_id=$2', [req.params.id, req.session.firmaId]);
    req.flash('success', 'Eczane silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/?tab=raf');
});

module.exports = router;
```

- [ ] **Step 5: `app.js`'e mount et**

`app.use('/api/mobil', mobilApiRoutes);` satırından sonra ekle (import'ları da dosya başındaki require bloğuna):

```js
const kurumsalRoutes = require('./routes/kurumsal');
```

```js
const { requireFirma, requireKurumsalPaket } = require('./middleware/authMiddleware');
```
(mevcut `const { requireFirma } = ...` satırını bu şekilde genişlet)

```js
app.use('/kurumsal', requireFirma, requireKurumsalPaket, kurumsalRoutes);
```

- [ ] **Step 6: Testi çalıştır, geçtiğini doğrula**

Run: `npx jest tests/kurumsal.test.js`
Expected: PASS — 5 passed

- [ ] **Step 7: Commit**

```bash
git add middleware/authMiddleware.js routes/kurumsal.js app.js tests/kurumsal.test.js
git commit -m "K1: kurumsal paket middleware'i + içerik/eczane yönetim uçları"
```

---

### Task 5: PDF (katalog) ve logo yükleme

**Files:**
- Modify: `middleware/upload.js`
- Modify: `routes/kurumsal.js`
- Modify: `tests/kurumsal.test.js`

- [ ] **Step 1: Başarısız testleri ekle**

`tests/kurumsal.test.js`'in içine (mevcut describe bloğuna) ekle:

```js
  test('katalog PDF yüklenir (dev ortamında location null olsa da 302 döner)', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent
      .post('/kurumsal/katalog')
      .attach('katalog', Buffer.from('%PDF-1.4 test'), { filename: 'katalog.pdf', contentType: 'application/pdf' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?tab=icerik');
  });

  test('PDF olmayan dosya reddedilir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent
      .post('/kurumsal/katalog')
      .attach('katalog', Buffer.from('degil'), { filename: 'resim.jpg', contentType: 'image/jpeg' });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT katalog_url FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].katalog_url).toBeNull();
  });
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js`
Expected: FAIL — `/kurumsal/katalog` 404

- [ ] **Step 3: `middleware/upload.js`'e `pdfUploadMiddleware` ekle**

`module.exports` satırından önce ekle ve export'a dahil et:

```js
const MAX_PDF_BOYUTU = 20 * 1024 * 1024;

function pdfUploadMiddleware(klasor) {
  const multerUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PDF_BOYUTU },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true);
      else cb(new Error('Sadece PDF yüklenebilir.'));
    },
  });

  function single(alanAdi) {
    return [
      multerUpload.single(alanAdi),
      async (req, res, next) => {
        if (!req.file) return next();
        try {
          if (!process.env.RAILWAY_STORAGE_BUCKET) {
            req.file.location = null;
            return next();
          }
          const anahtar = `${klasor}/${Date.now()}.pdf`;
          const s3 = buildS3Client();
          const yukleme = new Upload({
            client: s3,
            params: {
              Bucket: process.env.RAILWAY_STORAGE_BUCKET,
              Key: anahtar,
              Body: req.file.buffer,
              ContentType: 'application/pdf',
              ACL: 'public-read',
            },
          });
          await yukleme.done();
          req.file.location = `${process.env.RAILWAY_STORAGE_ENDPOINT}/${process.env.RAILWAY_STORAGE_BUCKET}/${anahtar}`;
          next();
        } catch (err) {
          next(err);
        }
      },
    ];
  }

  return { single };
}

module.exports = { uploadMiddleware, pdfUploadMiddleware, fotoIsle, MAX_FOTO_BOYUTU };
```

- [ ] **Step 4: `routes/kurumsal.js`'e upload uçlarını ekle**

Dosyanın üstündeki require'lara ekle:

```js
const { uploadMiddleware, pdfUploadMiddleware } = require('../middleware/upload');

const logoUpload = uploadMiddleware('firma-logolar');
const katalogUpload = pdfUploadMiddleware('kataloglar');

// upload middleware dizisini hata yakalayarak çalıştırır (bayi.js'teki desenle aynı)
function guvenliUpload(uploadCifti, alanAdi, geriDon) {
  return (req, res, next) => {
    const [ilkMw, ikinciMw] = uploadCifti.single(alanAdi);
    const hataYakala = (err) => {
      console.error(err);
      req.flash('error', err.message || 'Dosya yüklenemedi.');
      res.redirect(geriDon);
    };
    ilkMw(req, res, (err) => {
      if (err) return hataYakala(err);
      ikinciMw(req, res, (err2) => {
        if (err2) return hataYakala(err2);
        next();
      });
    });
  };
}
```

`module.exports = router;` satırından önce ekle:

```js
// Logo yükle
router.post('/logo', guvenliUpload(logoUpload, 'logo', '/?tab=icerik'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE firmalar SET logo_url=$1 WHERE id=$2', [req.file.location, req.session.firmaId]);
      req.flash('success', 'Logo güncellendi.');
    } else {
      req.flash('error', 'Dosya alınamadı.');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Logo yüklenemedi.');
  }
  res.redirect('/?tab=icerik');
});

// Katalog PDF yükle
router.post('/katalog', guvenliUpload(katalogUpload, 'katalog', '/?tab=icerik'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE firmalar SET katalog_url=$1 WHERE id=$2', [req.file.location, req.session.firmaId]);
      req.flash('success', 'Katalog güncellendi.');
    } else {
      // dev ortamında storage yok — location null; kullanıcıya yine bilgi ver
      req.flash('error', 'Dosya kaydedilemedi (depolama yapılandırılmamış).');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Katalog yüklenemedi.');
  }
  res.redirect('/?tab=icerik');
});
```

- [ ] **Step 5: Testi çalıştır, geçtiğini doğrula**

Run: `npx jest tests/kurumsal.test.js`
Expected: PASS — 7 passed

- [ ] **Step 6: Commit**

```bash
git add middleware/upload.js routes/kurumsal.js tests/kurumsal.test.js
git commit -m "K1: katalog PDF ve logo yükleme uçları"
```

---

### Task 6: Dashboard'a İçerik + Raf Kartları sekmeleri

**Files:**
- Modify: `app.js` (firma dashboard dalı)
- Modify: `views/public/dashboard.ejs`
- Modify: `tests/kurumsal.test.js`

- [ ] **Step 1: Başarısız testi ekle**

`tests/kurumsal.test.js`'e ekle:

```js
  test('kurumsal firma dashboardında Raf Kartları sekmesi ve eczane listesi görünür', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Sekme Test Eczanesi' });
    const res = await agent.get('/?tab=raf');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Raf Kartları');
    expect(res.text).toContain('Sekme Test Eczanesi');
    expect(res.text).toContain('/raf/');
  });

  test('basic firma dashboardında Raf Kartları sekmesi görünmez', async () => {
    const agent = await girisYap('k1basic@example.com');
    const res = await agent.get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Raf Kartları');
  });
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js`
Expected: FAIL — sekme yok

- [ ] **Step 3: `app.js` firma dashboard dalına eczaneler verisini ekle**

Firma dashboard dalında (`let linkAnalytics = [];` bloğundan sonra) ekle:

```js
    let eczaneler = [];
    if (tab === 'raf' && firma.paket === 'kurumsal') {
      const eczanelerResult = await pool.query(
        `SELECT e.*, (SELECT COUNT(*) FROM raf_okutmalar r WHERE r.eczane_id = e.id) as okutma_sayisi
         FROM eczaneler e WHERE e.firma_id = $1 ORDER BY e.created_at DESC`,
        [req.session.firmaId]
      );
      eczaneler = eczanelerResult.rows;
    }
```

`res.render('public/dashboard', {...})` çağrısına `eczaneler` ekle:

```js
    res.render('public/dashboard', {
      layout: false, firma, calisanlar, aktifSayisi, pasifSayisi,
      toplamGoruntulenme, tab, linkAnalytics, eczaneler
    });
```

- [ ] **Step 4: `views/public/dashboard.ejs`'e sekmeleri ve bölümleri ekle**

`.dash-tabs` içindeki Excel sekmesi satırından sonra ekle:

```ejs
    <% if (firma.paket === 'kurumsal') { %>
    <a href="/?tab=icerik" class="dash-tab <%= tab === 'icerik' ? 'active' : '' %>">İçerik</a>
    <a href="/?tab=raf"    class="dash-tab <%= tab === 'raf'    ? 'active' : '' %>">Raf Kartları</a>
    <% } %>
```

`<% } else if (tab === 'excel') { %>` bloğunun bittiği yere (son `<% } %>` kapanışından önce) iki yeni dal ekle:

```ejs
  <% } else if (tab === 'icerik' && firma.paket === 'kurumsal') { %>
    <div class="table-wrap" style="padding:20px;max-width:560px">
      <h3 style="margin-bottom:12px">Logo</h3>
      <% if (firma.logo_url) { %><img src="<%= firma.logo_url %>" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin-bottom:8px"><% } %>
      <form method="POST" action="/kurumsal/logo" enctype="multipart/form-data" style="margin-bottom:24px">
        <input type="file" name="logo" accept="image/*" required>
        <button type="submit">Logoyu Yükle</button>
      </form>

      <h3 style="margin-bottom:12px">Ürün Kataloğu (PDF)</h3>
      <% if (firma.katalog_url) { %><p style="margin-bottom:8px"><a href="<%= firma.katalog_url %>" target="_blank">Mevcut kataloğu görüntüle</a></p><% } %>
      <form method="POST" action="/kurumsal/katalog" enctype="multipart/form-data" style="margin-bottom:24px">
        <input type="file" name="katalog" accept="application/pdf" required>
        <button type="submit">Kataloğu Yükle</button>
      </form>

      <h3 style="margin-bottom:12px">Linkler</h3>
      <form method="POST" action="/kurumsal/icerik" style="display:flex;flex-direction:column;gap:8px">
        <input name="website"   placeholder="Web sitesi"  value="<%= firma.website   || '' %>">
        <input name="instagram" placeholder="Instagram"   value="<%= firma.instagram || '' %>">
        <input name="linkedin"  placeholder="LinkedIn"    value="<%= firma.linkedin  || '' %>">
        <input name="twitter"   placeholder="Twitter / X" value="<%= firma.twitter   || '' %>">
        <input name="youtube"   placeholder="YouTube"     value="<%= firma.youtube   || '' %>">
        <input name="tiktok"    placeholder="TikTok"      value="<%= firma.tiktok    || '' %>">
        <input name="whatsapp"  placeholder="WhatsApp numarası" value="<%= firma.whatsapp || '' %>">
        <button type="submit">Kaydet</button>
      </form>
    </div>

  <% } else if (tab === 'raf' && firma.paket === 'kurumsal') { %>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px;max-width:560px">
      <h3 style="margin-bottom:12px">Yeni Eczane Ekle</h3>
      <form method="POST" action="/kurumsal/eczane-ekle" style="display:flex;gap:8px;flex-wrap:wrap">
        <input name="ad" placeholder="Eczane adı *" required>
        <input name="adres" placeholder="Adres">
        <button type="submit">Ekle</button>
      </form>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Eczane</th><th>Adres</th><th>Kart Linki</th><th>Okutma</th><th></th></tr></thead>
        <tbody>
          <% eczaneler.forEach(e => { %>
          <tr>
            <td><%= e.ad %></td>
            <td><%= e.adres || '-' %></td>
            <td><a href="/raf/<%= e.kod %>" target="_blank">/raf/<%= e.kod %></a></td>
            <td><%= e.okutma_sayisi %></td>
            <td>
              <form method="POST" action="/kurumsal/eczane/<%= e.id %>/sil" style="display:inline"
                    onsubmit="return confirm('<%= e.ad %> silinsin mi? Okutma geçmişi de silinir.')">
                <button type="submit">Sil</button>
              </form>
            </td>
          </tr>
          <% }) %>
          <% if (!eczaneler.length) { %><tr><td colspan="5">Henüz eczane eklenmemiş.</td></tr><% } %>
        </tbody>
      </table>
    </div>
  <% } %>
```

Not: dashboard.ejs'teki mevcut kapanış yapısına dikkat et — yeni dallar mevcut
`<% } %>` zincirinin İÇİNE, excel dalından sonra eklenir.

- [ ] **Step 5: Testi çalıştır, geçtiğini doğrula**

Run: `npx jest tests/kurumsal.test.js`
Expected: PASS — 9 passed

- [ ] **Step 6: Commit**

```bash
git add app.js views/public/dashboard.ejs tests/kurumsal.test.js
git commit -m "K1: dashboard'a İçerik ve Raf Kartları sekmeleri"
```

---

### Task 7: Tam test + deploy + production doğrulama

**Files:** Yok (doğrulama adımı)

- [ ] **Step 1: Tam test paketi**

Run: `npx jest`
Expected: Tüm suite'ler PASS (önceki 61 + yeni ~16 test)

- [ ] **Step 2: Deploy**

Run:
```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Production doğrulaması**

`node -e` ile production DB'de geçici kurumsal test firması + eczane oluştur, sonra:

```bash
curl -s -o /dev/null -w "%{http_code}" https://www.nfckartify.com.tr/raf/<test-kod>   # 200 beklenir
curl -s https://www.nfckartify.com.tr/raf/<test-kod> | grep "Ürün Kataloğu"
curl -s -o /dev/null -w "%{http_code}" https://www.nfckartify.com.tr/raf/olmayan1     # 404 beklenir
```

Okutma kaydının düştüğünü DB'den doğrula, sonra test verisini sil.

- [ ] **Step 4: Kalan değişiklik kontrolü**

Run: `git status --short`
Expected: temiz.
