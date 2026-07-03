# Kurumsal Raf Kartı — K5 (Eczacıya Özel Kart ve Sayfa) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eczaneye ayrı bir "eczacı kartı" NFC kodu eklemek; bu kart okutulunca firmanın kampanya başlığı/metni, eğitim videosu ve PDF dokümanını gösteren `/eczaci/:kod` sayfasını açmak; kurumsal panelde bu içeriği yönetmek; K4'ün Android kart yazma akışına ikinci bir "Eczacı Kartı" seçeneği eklemek.

**Architecture:** `eczaneler` tablosuna ikinci bir benzersiz kod (`eczaci_kod`), `firmalar` tablosuna firma geneli içerik alanları eklenir. Yeni bir herkese açık route (`/eczaci/:kod`) ve view (`eczaci.ejs`) müşteri raf sayfasıyla aynı görsel desende ama farklı içerikle çalışır. Kurumsal panelin İçerik ve Raf Kartları sekmelerine yeni form/sütunlar eklenir. K4'ün Android "Raf Kartı Yaz" ekranı, eczane başına iki buton (Müşteri Kartı / Eczacı Kartı) gösterecek şekilde genişletilir — ikisi de K4'te zaten parametreleştirilmiş `KartaYazEkrani`'nı kullanır.

**Tech Stack:** Node.js/Express + Jest/Supertest (backend), Kotlin/Jetpack Compose (Android, sadece küçük ekran/model değişiklikleri).

---

### Task 1: Backend — Veri modeli (`eczaci_kod` + firma alanları) ve kod üretimi

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\scripts\migrate.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\utils\eczaneKod.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\kurumsal.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\kurumsal.test.js`

- [ ] **Step 1: Başarısız testi güncelle**

`tests/kurumsal.test.js`'deki `'kurumsal firma eczane ekleyebilir'` testini şu hale getir:

```js
  test('kurumsal firma eczane ekleyebilir', async () => {
    const agent = kurumsalAgent;
    const res = await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Deneme Eczanesi', adres: 'Merkez' });
    expect(res.statusCode).toBe(302);
    const e = await pool.query('SELECT * FROM eczaneler WHERE firma_id = $1', [kurumsalId]);
    expect(e.rows.length).toBe(1);
    expect(e.rows[0].kod).toHaveLength(8);
    expect(e.rows[0].eczaci_kod).toHaveLength(8);
    expect(e.rows[0].eczaci_kod).not.toBe(e.rows[0].kod);
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/kurumsal.test.js --verbose -t "kurumsal firma eczane ekleyebilir"`
Expected: FAIL — `eczaci_kod` sütunu yok / `toHaveLength(8)` `undefined` üzerinde başarısız

- [ ] **Step 3: `scripts/migrate.js`'e migration ekle**

Migrations dizisinin son elemanından (K3'te eklenen `ziyaretler` tablosundan) sonra ekle:

```js
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS eczaci_kod TEXT UNIQUE`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS eczaci_baslik TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS eczaci_metin TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS eczaci_pdf_url TEXT`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS eczaci_video_url TEXT`,
    `CREATE TABLE IF NOT EXISTS eczaci_okutmalar (
      id          SERIAL PRIMARY KEY,
      eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
```

Run: `node scripts/migrate.js`
Expected: Yeni satırlar için `OK:` çıktısı, `HATA` yok

- [ ] **Step 4: `utils/eczaneKod.js`'e ikinci üretim fonksiyonu ekle**

Tüm dosyayı şu hale getir:

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

async function benzersizEczaciKoduUret() {
  const { pool } = require('../db');
  while (true) {
    const kod = eczaneKodUret();
    const sonuc = await pool.query('SELECT id FROM eczaneler WHERE eczaci_kod = $1', [kod]);
    if (!sonuc.rows.length) return kod;
  }
}

module.exports = { eczaneKodUret, benzersizEczaneKoduUret, benzersizEczaciKoduUret };
```

- [ ] **Step 5: `routes/kurumsal.js`'de eczane-ekle'yi güncelle**

Import satırını güncelle:

```js
const { benzersizEczaneKoduUret, benzersizEczaciKoduUret } = require('../utils/eczaneKod');
```

`router.post('/eczane-ekle', ...)` handler'ını şu hale getir:

```js
router.post('/eczane-ekle', async (req, res) => {
  const { ad, adres } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Eczane adı zorunlu.');
    return res.redirect('/?tab=raf');
  }
  try {
    const kod = await benzersizEczaneKoduUret();
    const eczaciKod = await benzersizEczaciKoduUret();
    await pool.query(
      'INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod) VALUES ($1, $2, $3, $4, $5)',
      [req.session.firmaId, ad.trim(), adres || null, kod, eczaciKod]
    );
    req.flash('success', `${ad} eklendi.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Eklenemedi.');
  }
  res.redirect('/?tab=raf');
});
```

- [ ] **Step 6: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js --verbose`
Expected: PASS (tüm testler)

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate.js utils/eczaneKod.js routes/kurumsal.js tests/kurumsal.test.js
git commit -m "K5: eczaci_kod veri modeli + otomatik uretim"
```

---

### Task 2: Backend — YouTube video id çıkarma yardımcı fonksiyonu

**Files:**
- Create: `C:\Users\muham\kurumsal-kartvizit\utils\youtube.js`
- Create: `C:\Users\muham\kurumsal-kartvizit\tests\youtube.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/youtube.test.js`'i oluştur:

```js
const { youtubeIdCikar } = require('../utils/youtube');

describe('youtubeIdCikar', () => {
  test('watch?v= formatından id çıkarır', () => {
    expect(youtubeIdCikar('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('youtu.be kısa linkinden id çıkarır', () => {
    expect(youtubeIdCikar('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('embed linkinden id çıkarır', () => {
    expect(youtubeIdCikar('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('YouTube olmayan url için null döner', () => {
    expect(youtubeIdCikar('https://ornek.com/video.mp4')).toBeNull();
  });

  test('boş/null girdi için null döner', () => {
    expect(youtubeIdCikar(null)).toBeNull();
    expect(youtubeIdCikar('')).toBeNull();
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/youtube.test.js --verbose`
Expected: FAIL — `Cannot find module '../utils/youtube'`

- [ ] **Step 3: `utils/youtube.js`'i oluştur**

```js
function youtubeIdCikar(url) {
  if (!url) return null;
  const eslesme = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return eslesme ? eslesme[1] : null;
}

module.exports = { youtubeIdCikar };
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/youtube.test.js --verbose`
Expected: PASS (5 test)

- [ ] **Step 5: Commit**

```bash
git add utils/youtube.js tests/youtube.test.js
git commit -m "K5: YouTube video id cikarma yardimcisi"
```

---

### Task 3: Backend — Eczacı public sayfası (`GET /eczaci/:kod`)

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\public.js`
- Create: `C:\Users\muham\kurumsal-kartvizit\views\public\eczaci.ejs`
- Create: `C:\Users\muham\kurumsal-kartvizit\tests\eczaci.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/eczaci.test.js`'i oluştur:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Eczacı kartı public sayfası', () => {
  let firmaId;
  let eczaneId;
  const eczaciKod = 'eczacitest1';

  beforeAll(async () => {
    const hash = await bcrypt.hash('x', 4);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket, eczaci_baslik, eczaci_metin, eczaci_video_url, eczaci_pdf_url)
       VALUES ('Eczacı Test Firma', 'eczaci-test-firma', 'eczacitest@example.com', $1, 'kurumsal',
               'Temmuz Kampanyası', '3 al 2 öde fırsatı.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
               'https://ornek.com/egitim.pdf') RETURNING id`,
      [hash]
    );
    firmaId = f.rows[0].id;
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod)
       VALUES ($1, 'Test Eczanesi', 'Test Mah.', 'musteritest1', $2) RETURNING id`,
      [firmaId, eczaciKod]
    );
    eczaneId = e.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('geçerli kod 200 döner, içerik gösterilir, okutma kaydedilir', async () => {
    const onceki = (await pool.query('SELECT COUNT(*) FROM eczaci_okutmalar WHERE eczane_id = $1', [eczaneId])).rows[0].count;
    const res = await request(app).get(`/eczaci/${eczaciKod}`);
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Eczacı Test Firma');
    expect(res.text).toContain('Temmuz Kampanyası');
    expect(res.text).toContain('3 al 2 öde fırsatı.');
    expect(res.text).toContain('dQw4w9WgXcQ');
    expect(res.text).toContain('https://ornek.com/egitim.pdf');
    const sonraki = (await pool.query('SELECT COUNT(*) FROM eczaci_okutmalar WHERE eczane_id = $1', [eczaneId])).rows[0].count;
    expect(Number(sonraki)).toBe(Number(onceki) + 1);
  });

  test('geçersiz kod 404 döner', async () => {
    const res = await request(app).get('/eczaci/yokboylekod');
    expect(res.statusCode).toBe(404);
  });

  test('içerik alanları boşken "İçerik henüz eklenmedi." gösterilir', async () => {
    const bosHash = await bcrypt.hash('x', 4);
    const bosFirma = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Boş İçerik Firma', 'bos-icerik-firma', 'bosicerik@example.com', $1, 'kurumsal') RETURNING id`,
      [bosHash]
    );
    const bosEczane = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Boş Eczane', 'musteribos1', 'eczacibos1') RETURNING id`,
      [bosFirma.rows[0].id]
    );
    const res = await request(app).get('/eczaci/eczacibos1');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('İçerik henüz eklenmedi.');
    await pool.query('DELETE FROM firmalar WHERE id = $1', [bosFirma.rows[0].id]);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/eczaci.test.js --verbose`
Expected: FAIL — `GET /eczaci/:kod` 404 döner (route yok)

- [ ] **Step 3: `routes/public.js`'e route ekle**

Import satırını güncelle (dosyanın en üstü):

```js
const { youtubeIdCikar } = require('../utils/youtube');
```

`router.get('/raf/:kod/tikla/:tip', ...)` bloğundan hemen sonra ekle:

```js

async function eczaciGetir(kod) {
  const result = await pool.query(
    `SELECT e.id as eczane_id, e.ad as eczane_ad,
            f.ad as firma_ad, f.logo_url, f.marka_rengi,
            f.eczaci_baslik, f.eczaci_metin, f.eczaci_pdf_url, f.eczaci_video_url
     FROM eczaneler e JOIN firmalar f ON f.id = e.firma_id
     WHERE e.eczaci_kod = $1`,
    [kod]
  );
  return result.rows[0] || null;
}

// Eczacı kartı sayfası — eczacının kendi okutması
router.get('/eczaci/:kod', async (req, res) => {
  try {
    const veri = await eczaciGetir(req.params.kod);
    if (!veri) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Sayfa bulunamadı.', layout: false });
    }
    try {
      await pool.query('INSERT INTO eczaci_okutmalar (eczane_id) VALUES ($1)', [veri.eczane_id]);
    } catch (kayitHatasi) {
      console.error('eczacı okutma kaydı başarısız:', kayitHatasi);
    }
    veri.eczaci_video_id = youtubeIdCikar(veri.eczaci_video_url);
    res.render('public/eczaci', { title: veri.firma_ad, veri, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});
```

- [ ] **Step 4: `views/public/eczaci.ejs`'i oluştur**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= veri.firma_ad %> — Eczacılara Özel</title>
  <style>
    :root { --renk: <%= veri.marka_rengi || '#1a73e8' %>; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; justify-content: center; padding: 24px 16px; }
    .kart { width: 100%; max-width: 420px; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08); height: fit-content; }
    .ust { background: var(--renk); padding: 36px 24px 28px; text-align: center; color: #fff; }
    .logo { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; background: #fff; margin-bottom: 14px; }
    .firma-ad { font-size: 24px; font-weight: 700; }
    .eczane-ad { font-size: 13px; opacity: 0.85; margin-top: 6px; }
    .govde { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .baslik { font-size: 19px; font-weight: 700; color: #1a1a2e; }
    .metin { font-size: 15px; color: #444; line-height: 1.5; white-space: pre-wrap; }
    .video-wrap { position: relative; width: 100%; padding-top: 56.25%; border-radius: 12px; overflow: hidden; }
    .video-wrap iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .btn { display: block; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: 600; background: var(--renk); color: #fff; }
    .bos { text-align: center; color: #888; padding: 24px 0; }
  </style>
</head>
<body>
  <div class="kart">
    <div class="ust">
      <% if (veri.logo_url) { %><img class="logo" src="<%= veri.logo_url %>" alt=""><% } %>
      <div class="firma-ad"><%= veri.firma_ad %></div>
      <div class="eczane-ad"><%= veri.eczane_ad %> — Eczacılara Özel</div>
    </div>
    <div class="govde">
      <% if (!veri.eczaci_baslik && !veri.eczaci_metin && !veri.eczaci_video_id && !veri.eczaci_pdf_url) { %>
        <div class="bos">İçerik henüz eklenmedi.</div>
      <% } else { %>
        <% if (veri.eczaci_baslik) { %><div class="baslik"><%= veri.eczaci_baslik %></div><% } %>
        <% if (veri.eczaci_metin) { %><div class="metin"><%= veri.eczaci_metin %></div><% } %>
        <% if (veri.eczaci_video_id) { %>
          <div class="video-wrap">
            <iframe src="https://www.youtube.com/embed/<%= veri.eczaci_video_id %>" allowfullscreen></iframe>
          </div>
        <% } else if (veri.eczaci_video_url) { %>
          <a class="btn" href="<%= veri.eczaci_video_url %>" target="_blank">▶️ Eğitim Videosu</a>
        <% } %>
        <% if (veri.eczaci_pdf_url) { %>
          <a class="btn" href="<%= veri.eczaci_pdf_url %>" target="_blank">📄 Eğitim Dokümanını Aç (PDF)</a>
        <% } %>
      <% } %>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 5: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/eczaci.test.js --verbose`
Expected: PASS (3 test)

- [ ] **Step 6: Commit**

```bash
git add routes/public.js views/public/eczaci.ejs tests/eczaci.test.js
git commit -m "K5: eczaci karti public sayfasi (GET /eczaci/:kod)"
```

---

### Task 4: Backend — Kurumsal panel uçları (içerik + PDF + kod üret)

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\kurumsal.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\kurumsal.test.js`

- [ ] **Step 1: Başarısız testleri ekle**

`tests/kurumsal.test.js`'in son `});`'sinden önce ekle:

```js

  test('eczacı içeriği güncellenir', async () => {
    const agent = kurumsalAgent;
    const res = await agent.post('/kurumsal/eczaci-icerik').send({
      eczaci_baslik: 'Ağustos Kampanyası',
      eczaci_metin: 'Detaylar eczacımızda.',
      eczaci_video_url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT eczaci_baslik, eczaci_metin, eczaci_video_url FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].eczaci_baslik).toBe('Ağustos Kampanyası');
    expect(f.rows[0].eczaci_metin).toBe('Detaylar eczacımızda.');
    expect(f.rows[0].eczaci_video_url).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  test('eczacı eğitim PDF\'i yüklenir (dev ortamında location null olsa da 302 döner)', async () => {
    const agent = kurumsalAgent;
    const res = await agent
      .post('/kurumsal/eczaci-pdf')
      .attach('eczaci_pdf', Buffer.from('%PDF-1.4 test'), { filename: 'egitim.pdf', contentType: 'application/pdf' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?tab=icerik');
  });

  test('eczacı kartı kodu olmayan eczane için kod üretilir, ikinci çağrıda değişmez', async () => {
    const agent = kurumsalAgent;
    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Kod Uret Test Eczanesi', 'koduret01') RETURNING id`,
      [kurumsalId]
    );
    const eczaneId = eczaneSonuc.rows[0].id;
    const res = await agent.post(`/kurumsal/eczane/${eczaneId}/eczaci-kod-uret`);
    expect(res.statusCode).toBe(302);
    const e = await pool.query('SELECT eczaci_kod FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(e.rows[0].eczaci_kod).toHaveLength(8);

    // idempotent: ikinci çağrı mevcut kodu değiştirmez (kart fiziksel olarak yazılmış olabilir)
    await agent.post(`/kurumsal/eczane/${eczaneId}/eczaci-kod-uret`);
    const e2 = await pool.query('SELECT eczaci_kod FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(e2.rows[0].eczaci_kod).toBe(e.rows[0].eczaci_kod);
  });

  test('eczaci-kod-uret başka firmanın eczanesi için çalışmaz', async () => {
    const digerHash = await bcrypt.hash('test1234', 8);
    const digerFirma = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('K5 Diğer Firma', 'k5-diger-firma', 'k5diger@example.com', $1, 'kurumsal') RETURNING id`,
      [digerHash]
    );
    const digerEczane = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Diğer Firma Eczanesi', 'digerecz1') RETURNING id`,
      [digerFirma.rows[0].id]
    );
    const agent = kurumsalAgent;
    await agent.post(`/kurumsal/eczane/${digerEczane.rows[0].id}/eczaci-kod-uret`);
    const e = await pool.query('SELECT eczaci_kod FROM eczaneler WHERE id = $1', [digerEczane.rows[0].id]);
    expect(e.rows[0].eczaci_kod).toBeNull();
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirma.rows[0].id]);
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js --verbose`
Expected: FAIL — üç uç da 404 döner (henüz yok)

- [ ] **Step 3: `routes/kurumsal.js`'e uçları ekle**

`const katalogUpload = pdfUploadMiddleware('kataloglar');` satırından sonra ekle:

```js
const eczaciPdfUpload = pdfUploadMiddleware('eczaci-dokumanlar');
```

`router.post('/icerik', ...)` bloğundan hemen sonra ekle:

```js

// Eczacı sayfası içeriğini güncelle (başlık + metin + video linki)
router.post('/eczaci-icerik', async (req, res) => {
  const { eczaci_baslik, eczaci_metin, eczaci_video_url } = req.body;
  try {
    await pool.query(
      `UPDATE firmalar SET eczaci_baslik=$1, eczaci_metin=$2, eczaci_video_url=$3 WHERE id=$4`,
      [eczaci_baslik || null, eczaci_metin || null, eczaci_video_url || null, req.session.firmaId]
    );
    req.flash('success', 'Eczacı sayfası güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=icerik');
});
```

`router.post('/katalog', ...)` bloğundan hemen sonra ekle:

```js

// Eczacı eğitim PDF'i yükle
router.post('/eczaci-pdf', guvenliUpload(eczaciPdfUpload, 'eczaci_pdf', '/?tab=icerik'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE firmalar SET eczaci_pdf_url=$1 WHERE id=$2', [req.file.location, req.session.firmaId]);
      req.flash('success', 'Eğitim dokümanı güncellendi.');
    } else {
      req.flash('error', 'Dosya kaydedilemedi (depolama yapılandırılmamış).');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Doküman yüklenemedi.');
  }
  res.redirect('/?tab=icerik');
});
```

Dosyanın sonuna, `router.get('/ziyaretler-excel', ...)` bloğundan sonra, `module.exports = router;` satırından önce ekle:

```js

// Mevcut eczaneye eczacı kartı kodu üret (eczane oluşturulduğunda otomatik üretilir,
// bu uç migration öncesi oluşturulmuş eczaneler için)
router.post('/eczane/:id/eczaci-kod-uret', async (req, res) => {
  try {
    const mevcut = await pool.query(
      'SELECT eczaci_kod FROM eczaneler WHERE id=$1 AND firma_id=$2',
      [req.params.id, req.session.firmaId]
    );
    if (!mevcut.rows.length) {
      req.flash('error', 'Eczane bulunamadı.');
      return res.redirect('/?tab=raf');
    }
    if (!mevcut.rows[0].eczaci_kod) {
      const kod = await benzersizEczaciKoduUret();
      await pool.query(
        'UPDATE eczaneler SET eczaci_kod=$1 WHERE id=$2 AND firma_id=$3',
        [kod, req.params.id, req.session.firmaId]
      );
      req.flash('success', 'Eczacı kartı kodu üretildi.');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Kod üretilemedi.');
  }
  res.redirect('/?tab=raf');
});
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js --verbose`
Expected: PASS (tüm testler)

- [ ] **Step 5: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "K5: kurumsal panel eczaci icerik/pdf/kod-uret uclari"
```

---

### Task 5: Backend — Dashboard İçerik ve Raf Kartları sekmeleri

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\app.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\views\public\dashboard.ejs`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\kurumsal.test.js`

- [ ] **Step 1: Başarısız testleri ekle**

`tests/kurumsal.test.js`'in son `});`'sinden önce ekle:

```js

  test('İçerik sekmesinde eczacı sayfası formu görünür', async () => {
    const agent = kurumsalAgent;
    const res = await agent.get('/?tab=icerik');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Eczacı Sayfası');
    expect(res.text).toContain('eczaci_baslik');
  });

  test('Raf Kartları sekmesinde eczacı kartı sütunu ve linki görünür', async () => {
    const agent = kurumsalAgent;
    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Sütun Test Eczanesi', 'sutuntest1', 'sutuneczaci1') RETURNING id`,
      [kurumsalId]
    );
    await pool.query('INSERT INTO eczaci_okutmalar (eczane_id) VALUES ($1)', [eczaneSonuc.rows[0].id]);
    const res = await agent.get('/?tab=raf');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Eczacı Kartı');
    expect(res.text).toContain('/eczaci/sutuneczaci1');
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js --verbose`
Expected: FAIL — sekmelerde "Eczacı Sayfası"/"Eczacı Kartı" metinleri yok

- [ ] **Step 3: `app.js`'de eczaneler sorgusunu güncelle**

`GET /` handler'ı içindeki eczaneler sorgusunu şu hale getir:

```js
      const eczanelerResult = await pool.query(
        `SELECT e.*, (SELECT COUNT(*) FROM raf_okutmalar r WHERE r.eczane_id = e.id) as okutma_sayisi,
           (SELECT COUNT(*) FROM eczaci_okutmalar eo WHERE eo.eczane_id = e.id) as eczaci_okutma_sayisi
         FROM eczaneler e WHERE e.firma_id = $1 ORDER BY e.created_at DESC`,
        [req.session.firmaId]
      );
```

- [ ] **Step 4: `views/public/dashboard.ejs`'de İçerik sekmesine eczacı formu ekle**

"Linkler" formunun kapanış `</form>` satırından sonra, sekme kapanış `</div>` satırından önce ekle:

```html

      <h3 style="margin-bottom:12px">Eczacı Sayfası</h3>
      <form method="POST" action="/kurumsal/eczaci-icerik" style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
        <input name="eczaci_baslik" placeholder="Kampanya başlığı" value="<%= firma.eczaci_baslik || '' %>">
        <textarea name="eczaci_metin" placeholder="Kampanya / eğitim metni" rows="4"><%= firma.eczaci_metin || '' %></textarea>
        <input name="eczaci_video_url" placeholder="YouTube video linki" value="<%= firma.eczaci_video_url || '' %>">
        <button type="submit">Kaydet</button>
      </form>

      <h3 style="margin-bottom:12px">Eğitim Dokümanı (PDF)</h3>
      <% if (firma.eczaci_pdf_url) { %><p style="margin-bottom:8px"><a href="<%= firma.eczaci_pdf_url %>" target="_blank">Mevcut dokümanı görüntüle</a></p><% } %>
      <form method="POST" action="/kurumsal/eczaci-pdf" enctype="multipart/form-data">
        <input type="file" name="eczaci_pdf" accept="application/pdf" required>
        <button type="submit">Dokümanı Yükle</button>
      </form>
```

- [ ] **Step 5: Raf Kartları tablosuna eczacı kartı sütunu ekle**

Tablo başlığını güncelle:

```html
        <thead><tr><th>Eczane</th><th>Adres</th><th>Kart Linki</th><th>Okutma</th><th>Eczacı Kartı</th><th></th></tr></thead>
```

Tablo satırını güncelle (mevcut `<tr>...</tr>` bloğunun tamamı):

```html
          <% eczaneler.forEach(e => { %>
          <tr>
            <td><%= e.ad %></td>
            <td><%= e.adres || '-' %></td>
            <td><a href="/raf/<%= e.kod %>" target="_blank">/raf/<%= e.kod %></a></td>
            <td><%= e.okutma_sayisi %></td>
            <td>
              <% if (e.eczaci_kod) { %>
                <a href="/eczaci/<%= e.eczaci_kod %>" target="_blank">/eczaci/<%= e.eczaci_kod %></a> (<%= e.eczaci_okutma_sayisi %>)
              <% } else { %>
                <form method="POST" action="/kurumsal/eczane/<%= e.id %>/eczaci-kod-uret" style="display:inline">
                  <button type="submit">Kod Üret</button>
                </form>
              <% } %>
            </td>
            <td>
              <form method="POST" action="/kurumsal/eczane/<%= e.id %>/sil" style="display:inline"
                    onsubmit="return confirm('<%= e.ad %> silinsin mi? Okutma geçmişi de silinir.')">
                <button type="submit">Sil</button>
              </form>
            </td>
          </tr>
          <% }) %>
          <% if (!eczaneler.length) { %><tr><td colspan="6">Henüz eczane eklenmemiş.</td></tr><% } %>
```

- [ ] **Step 6: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js --verbose`
Expected: PASS (tüm testler)

- [ ] **Step 7: Commit**

```bash
git add app.js views/public/dashboard.ejs tests/kurumsal.test.js
git commit -m "K5: dashboard - eczaci sayfasi icerik formu + raf kartlari eczaci sutunu"
```

---

### Task 6: Backend — Mobil API `eczanelerim` yanıtına `eczaci_kod`

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\mobilApi.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\mobilApi.test.js`

- [ ] **Step 1: Başarısız testi güncelle**

`tests/mobilApi.test.js`'deki `describe('Mobil API — /api/mobil/eczanelerim', ...)` bloğunda eczane oluşturma satırını ve testi güncelle:

```js
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod) VALUES ($1, 'Kendi Eczanem', 'Merkez Mah.', 'eczkend1', 'eczcaci01')`,
      [firmaId]
    );
```

`'sadece kendi firmasının eczanelerini döner'` testinin içine ekle:

```js
    expect(res.body.eczaneler[0].eczaci_kod).toBe('eczcaci01');
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js --verbose -t "sadece kendi firmasının eczanelerini döner"`
Expected: FAIL — `res.body.eczaneler[0].eczaci_kod` `undefined`

- [ ] **Step 3: `routes/mobilApi.js`'i güncelle**

`router.get('/eczanelerim', ...)` içindeki sorguyu güncelle:

```js
    const result = await pool.query(
      `SELECT id, ad, adres, kod, eczaci_kod FROM eczaneler WHERE firma_id = $1 ORDER BY created_at DESC`,
      [calisanResult.rows[0].firma_id]
    );
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js --verbose`
Expected: PASS (tüm testler)

- [ ] **Step 5: Tam test, commit, push, deploy, production doğrulaması**

```bash
npx jest
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "K5: eczanelerim yanitina eczaci_kod eklendi"
git push origin master
railway up --service app --detach
```

Yeni deploy markeri — DİKKAT: geçersiz bir `/eczaci/:kod` isteği K5 ÖNCESİNDE de
`/:firmaSlug/:calisanSlug` catch-all route'una düşüp aynı "Sayfa bulunamadı."
mesajını render eder, bu yüzden geçersiz kod marker OLAMAZ. Bunun yerine geçerli
bir eczacı koduyla, sadece yeni `eczaci.ejs`'te var olan "Eczacılara Özel" metnini
poll et:

```bash
# 1) Geçici marker verisi oluştur (id'leri not et):
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const f = await pool.query(\"INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket) VALUES ('K5 Marker Firma', 'k5-marker-firma', 'k5marker@example.com', 'x', 'kurumsal') RETURNING id\");
  await pool.query(\"INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES (\$1, 'Marker Eczane', 'k5markr1', 'k5markr2')\", [f.rows[0].id]);
  console.log('markerFirmaId:', f.rows[0].id);
  await pool.end();
})();
"

# 2) Poll (birkaç kez tekrar et, boş çıktı = deploy bitmemiş):
curl -s https://www.nfckartify.com.tr/eczaci/k5markr2 | grep -o "Eczacılara Özel"

# 3) "Eczacılara Özel" görülünce marker verisini sil:
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  await pool.query(\"DELETE FROM firmalar WHERE slug = 'k5-marker-firma'\");
  await pool.end();
})();
"
```

Expected: 2. adımda `Eczacılara Özel` çıktısı görülür, 3. adım marker verisini temizler.

---

### Task 7: Android — `EczaneOzet` modeline `eczaci_kod` eklenmesi

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\Models.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\test\java\com\nfckartify\bayi\data\ApiServiceTest.kt`

- [ ] **Step 1: Başarısız testi güncelle**

`ApiServiceTest.kt`'deki `eczanelerim listeyi doner` testini şu hale getir:

```kotlin
    @Test
    fun `eczanelerim listeyi doner`() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"ok":true,"eczaneler":[{"id":4,"ad":"Merkez Eczane","adres":"Ana Cad. 5","kod":"abc12345","eczaci_kod":"xyz98765"}]}"""
            ).setResponseCode(200)
        )

        val cevap = servis.eczanelerim("Bearer test-token")

        assertTrue(cevap.isSuccessful)
        assertEquals(1, cevap.body()?.eczaneler?.size)
        assertEquals("abc12345", cevap.body()?.eczaneler?.first()?.kod)
        assertEquals("xyz98765", cevap.body()?.eczaneler?.first()?.eczaci_kod)
    }
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run (PowerShell, JAVA_HOME set):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"
```

Expected: FAIL — derleme hatası, `eczaci_kod` `EczaneOzet`'te tanımlı değil

- [ ] **Step 3: `Models.kt`'i güncelle**

`EczaneOzet` data class'ını şu hale getir:

```kotlin
@Serializable
data class EczaneOzet(
    val id: Int,
    val ad: String,
    val adres: String? = null,
    val kod: String,
    val eczaci_kod: String? = null,
)
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/data/Models.kt app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt
git commit -m "K5: EczaneOzet modeline eczaci_kod eklendi"
```

---

### Task 8: Android — Eczanelerim ekranında iki kart butonu

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\EczanelerimEkrani.kt`

- [ ] **Step 1: `EczanelerimEkrani.kt`'i güncelle**

Tüm dosyayı şu hale getir:

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nfckartify.bayi.data.EczaneOzet

@Composable
fun EczanelerimEkrani(
    viewModel: EczanelerimViewModel,
    musteriKartiTiklandi: (EczaneOzet) -> Unit,
    eczaciKartiTiklandi: (EczaneOzet) -> Unit,
    girisEkraninaDon: () -> Unit,
) {
    LaunchedEffect(Unit) { viewModel.yukle() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Raf Kartı Yaz", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(4.dp))
        Text("Kart yazılacak eczaneyi ve kart türünü seçin.", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.padding(8.dp))

        if (viewModel.yukleniyor) {
            CircularProgressIndicator()
        } else if (viewModel.oturumSuresiDoldu) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.padding(8.dp))
            Button(onClick = girisEkraninaDon, modifier = Modifier.fillMaxWidth()) {
                Text("Giriş Ekranına Dön")
            }
        } else if (viewModel.hataMesaji != null) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
        } else if (viewModel.eczaneler.isEmpty()) {
            Text("Henüz eczane eklenmemiş. Eczaneler web panelden eklenir.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(viewModel.eczaneler) { eczane: EczaneOzet ->
                    Card(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
                        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                            Text(eczane.ad, style = MaterialTheme.typography.titleMedium)
                            if (eczane.adres != null) {
                                Text(eczane.adres, style = MaterialTheme.typography.bodySmall)
                            }
                            Spacer(modifier = Modifier.padding(6.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = { musteriKartiTiklandi(eczane) },
                                    modifier = Modifier.weight(1f),
                                ) { Text("Müşteri Kartı") }
                                if (eczane.eczaci_kod != null) {
                                    Button(
                                        onClick = { eczaciKartiTiklandi(eczane) },
                                        modifier = Modifier.weight(1f),
                                    ) { Text("Eczacı Kartı") }
                                } else {
                                    OutlinedButton(
                                        onClick = {},
                                        enabled = false,
                                        modifier = Modifier.weight(1f),
                                    ) { Text("Web panelden kod üretin") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Ara derleme kontrolü (commit YOK)**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat assembleDebug`
Expected: BUILD FAILED — `NfcKartifyApp.kt` hâlâ eski `eczaneSecildi` parametresini geçiyor (Task 9'da düzeltilecek). Bu adımda sadece hata mesajının `NfcKartifyApp.kt`'yi işaret ettiğini (yani `EczanelerimEkrani.kt`'nin kendi söz dizimi hatası olmadığını) doğrula. Derlenemeyen durumda COMMIT YAPMA — bu dosya Task 9'daki commit'e dahil edilecek (bisect edilebilirlik bozulmasın).

---

### Task 9: Android — Navigasyon (iki kart türü için `kartaYaz` çağrıları)

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\NfcKartifyApp.kt`

- [ ] **Step 1: `eczanelerim` composable'ını güncelle**

Tüm composable'ı şu hale getir:

```kotlin
        composable("eczanelerim") {
            val vm: EczanelerimViewModel = viewModel { EczanelerimViewModel(tokenDeposu) }
            EczanelerimEkrani(
                viewModel = vm,
                musteriKartiTiklandi = { eczane ->
                    val url = "https://www.nfckartify.com.tr/raf/${eczane.kod}"
                    val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                    val kodlanmisAd = java.net.URLEncoder.encode(eczane.ad, "UTF-8")
                    navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl?tip=raf")
                },
                eczaciKartiTiklandi = { eczane ->
                    val url = "https://www.nfckartify.com.tr/eczaci/${eczane.eczaci_kod}"
                    val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                    val kodlanmisAd = java.net.URLEncoder.encode("${eczane.ad} (Eczacı)", "UTF-8")
                    navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl?tip=raf")
                },
                girisEkraninaDon = {
                    tokenDeposu.cikisYap()
                    navController.navigate("giris") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
```

- [ ] **Step 2: Derlemeyi doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit (Task 8'in dosyasıyla birlikte tek commit)**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/EczanelerimEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt
git commit -m "K5: Eczanelerim ekraninda musteri/eczaci karti butonlari + navigasyon"
```

---

### Task 10: Tam test + cihazda gerçek kartla uçtan uca doğrulama

**Files:** Yok (komutlar + ADB/fiziksel doğrulama)

- [ ] **Step 1: Tüm Android unit testleri çalıştır**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Cihaza kur**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat installDebug`
Expected: `Installed on 1 device.`

- [ ] **Step 3: Test verisi oluştur**

`kurumsal-kartvizit`'te `node -e` ile: kurumsal firma (eczaci_baslik/eczaci_metin/eczaci_video_url/eczaci_pdf_url dolu) + giriş bilgili temsilci + `benzersizEczaneKoduUret`/`benzersizEczaciKoduUret` ile bir eczane oluştur (K4 T10'daki desenle, iki kod da eklenerek).

- [ ] **Step 4: ADB ile temsilci girişi → Raf Kartı Yaz → eczane satırında iki buton**

`adb shell uiautomator dump` + tap/text deseniyle: temsilci girişi yap, "Raf Kartı Yaz"a dokun, oluşturulan eczanenin satırında hem "Müşteri Kartı" hem "Eczacı Kartı" butonlarının göründüğünü doğrula.

- [ ] **Step 5: Eczacı kartını gerçek bir NFC karta yaz**

"Eczacı Kartı"na dokun — `KartaYazEkrani`'nin doğru URL'yi (`/eczaci/<eczaci_kod>`) ve raf metinlerini gösterdiğini doğrula. Kullanıcıdan boş bir NFC kartı okutmasını iste, "Kart başarıyla yazıldı." mesajını doğrula.

- [ ] **Step 6: Yazılan eczacı kartını doğrula**

Uygulamadan çıkıp kartı telefona okut — tarayıcıda `https://www.nfckartify.com.tr/eczaci/<eczaci_kod>` sayfasının açıldığını, kampanya başlığı/metni/video/PDF butonlarının göründüğünü doğrula. DB'de `eczaci_okutmalar`'a satır düştüğünü `node -e` ile kontrol et.

- [ ] **Step 7: Kod üretilmemiş eczane senaryosu**

Panelden (curl ile oturum çerezi kullanarak veya tarayıcıdan) `eczaci_kod` NULL olan yeni bir eczane oluştur, uygulamada Raf Kartı Yaz listesinde bu eczanenin "Eczacı Kartı" butonunun devre dışı ve "Web panelden kod üretin" yazdığını doğrula.

- [ ] **Step 8: Test verisini temizle**

`DELETE FROM firmalar WHERE id = <testFirmaId>` (CASCADE ile eczane/okutma kayıtları da silinir).

- [ ] **Step 9: Son durum kontrolü**

Her iki repoda `git status --short` boş olmalı.
