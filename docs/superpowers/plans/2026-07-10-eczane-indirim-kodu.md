# Eczane İndirim Kodu Sistemi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raf kartını okutan müşteriye, kasada eczacı tarafından sistem üzerinden doğrulanan tek kullanımlık indirim kodu verme sistemi kurmak.

**Architecture:** Müşteri raf sayfasında "İndirim Kodu Al" butonuyla `indirim_kodlari` tablosuna kaydedilen 6 haneli bir kod alır (günde/eczane başına tek kod, cookie ile tekilleştirilir). Kasada eczacı kendi eczacı sayfasına (`/eczaci/:kod`) NFC kartıyla girip kodu bir forma yazar; sunucu kodu atomik bir `UPDATE ... WHERE kullanildi=false` ile doğrular/işaretler ve eczacıya "%X indirim uygulayabilirsiniz" onayı döner. Firma paneline yeni bir "İndirim" sekmesi eklenir: kampanyayı aç/kapa, yüzdeyi ayarla, eczane bazlı kullanım raporunu gör.

**Tech Stack:** Express + PostgreSQL (mevcut `pool.query` deseni), EJS (`layout:false` public sayfalar), vanilla `fetch()` (framework yok), Jest + Supertest.

**Referans:** `docs/superpowers/specs/2026-07-10-eczane-indirim-kodu-design.md`

---

### Task 1: DB migration — indirim_kodlari tablosu + firma ayarları

**Files:**
- Modify: `scripts/migrate.js`

- [ ] **Step 1: Migration satırlarını ekle**

`scripts/migrate.js` içindeki `migrations` dizisinin en sonuna (mevcut son satır olan `ALTER TABLE ziyaretler ADD COLUMN IF NOT EXISTS lng ...` satırından hemen sonra, dizi kapanmadan önce) ekle:

```javascript
    `CREATE TABLE IF NOT EXISTS indirim_kodlari (
      id                  SERIAL PRIMARY KEY,
      firma_id            INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
      eczane_id           INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
      kod                 TEXT UNIQUE NOT NULL,
      yuzde               INTEGER NOT NULL,
      cerez_id            TEXT NOT NULL,
      kullanildi          BOOLEAN DEFAULT false,
      olusturulma_tarihi  TIMESTAMP DEFAULT NOW(),
      kullanilma_tarihi   TIMESTAMP
    )`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS indirim_aktif BOOLEAN DEFAULT false`,
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS indirim_yuzdesi INTEGER DEFAULT 5`,
```

- [ ] **Step 2: Yerelde migration'ı çalıştır**

Run: `node scripts/migrate.js`
Expected: Her satır için `OK: ...` yazdırır, yeni 3 satır dahil hata olmadan biter.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate.js
git commit -m "$(cat <<'EOF'
İndirim kodu tablosu ve firma ayar kolonlarını ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: cookie-parser bağımlılığı ekle + app.js'e bağla

Müşteri cookie'sini (`indirim_cerez_id`) okumak için `req.cookies` gerekiyor; Express bunu varsayılan olarak parse etmez, `express-session` de sadece kendi oturum çerezini işler.

**Files:**
- Modify: `package.json`
- Modify: `app.js`

- [ ] **Step 1: Paketi yükle**

Run: `npm install cookie-parser`
Expected: `package.json`'a `cookie-parser` dependency olarak eklenir.

- [ ] **Step 2: app.js'e ekle**

`app.js` üstünde diğer require'ların yanına ekle:

```javascript
const cookieParser = require('cookie-parser');
```

`app.use(express.json());` satırından hemen sonra ekle:

```javascript
app.use(cookieParser());
```

- [ ] **Step 3: Sunucunun hâlâ ayağa kalktığını doğrula**

Run: `node -e "require('./app.js'); console.log('OK')"`
Expected: `OK` yazdırır, hata fırlatmaz. (Not: bu komut sunucuyu dinlemeye almaz, sadece modülün hatasız yüklendiğini doğrular — `app.js` `app.listen` çağırıyorsa Ctrl+C ile kapat.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.js
git commit -m "$(cat <<'EOF'
cookie-parser bağımlılığını ekle

İndirim kodu sisteminin günlük tekil-kod tekilleştirmesi için
gelen isteklerden çerez okunması gerekiyor.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: utils/indirimKod.js — kod üretimi

**Files:**
- Create: `utils/indirimKod.js`
- Test: `tests/indirimKod.test.js`

- [ ] **Step 1: Testi yaz**

```javascript
const { indirimKoduUret } = require('../utils/indirimKod');

describe('indirimKoduUret', () => {
  test('6 haneli sayısal kod üretir', () => {
    const kod = indirimKoduUret();
    expect(kod).toHaveLength(6);
    expect(kod).toMatch(/^[0-9]{6}$/);
  });

  test('ardışık çağrılar farklı kod üretir', () => {
    const kodlar = new Set(Array.from({ length: 30 }, () => indirimKoduUret()));
    expect(kodlar.size).toBeGreaterThan(25);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx jest tests/indirimKod.test.js`
Expected: FAIL — `Cannot find module '../utils/indirimKod'`

- [ ] **Step 3: Implementasyonu yaz**

`utils/eczaneKod.js`'teki desenle aynı — rastgele bayt üretip karakter kümesine indirger, benzersizlik için DB'ye retry ile sorar.

```javascript
const crypto = require('crypto');

function indirimKoduUret() {
  const bayt = crypto.randomBytes(3);
  let kod = '';
  for (let i = 0; i < 3; i++) {
    kod += String(bayt[i] % 100).padStart(2, '0');
  }
  return kod;
}

async function benzersizIndirimKoduUret() {
  const { pool } = require('../db');
  while (true) {
    const kod = indirimKoduUret();
    const sonuc = await pool.query('SELECT id FROM indirim_kodlari WHERE kod = $1', [kod]);
    if (!sonuc.rows.length) return kod;
  }
}

module.exports = { indirimKoduUret, benzersizIndirimKoduUret };
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npx jest tests/indirimKod.test.js`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add utils/indirimKod.js tests/indirimKod.test.js
git commit -m "$(cat <<'EOF'
İndirim kodu üretim yardımcı fonksiyonunu ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: POST /raf/:kod/indirim-kodu-al ucu

**Files:**
- Modify: `routes/public.js`
- Test: `tests/raf.test.js`

- [ ] **Step 1: Testleri yaz**

`tests/raf.test.js`'in `beforeAll` bloğunda oluşturulan `firmaId`/`kod`'u kullanarak, dosyanın sonuna yeni testler ekle (dosyanın en altına, `});` kapanışından hemen önce):

```javascript
  describe('İndirim kodu alma', () => {
    test('kampanya kapalıyken 403 döner', async () => {
      const res = await request(app).post(`/raf/${kod}/indirim-kodu-al`);
      expect(res.statusCode).toBe(403);
      expect(res.body.ok).toBe(false);
    });

    test('kampanya açıkken 6 haneli kod üretir', async () => {
      await pool.query('UPDATE firmalar SET indirim_aktif = true, indirim_yuzdesi = 5 WHERE id = $1', [firmaId]);
      const res = await request(app).post(`/raf/${kod}/indirim-kodu-al`);
      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.kod).toMatch(/^[0-9]{6}$/);
      expect(res.body.yuzde).toBe(5);
    });

    test('aynı tarayıcı (cookie) tekrar istek attığında aynı kod döner', async () => {
      const agent = request.agent(app);
      const ilk = await agent.post(`/raf/${kod}/indirim-kodu-al`);
      const ikinci = await agent.post(`/raf/${kod}/indirim-kodu-al`);
      expect(ikinci.body.kod).toBe(ilk.body.kod);
    });

    test('farklı tarayıcılar (cookie yok) farklı kod alır', async () => {
      const birinci = await request(app).post(`/raf/${kod}/indirim-kodu-al`);
      const ikinci = await request(app).post(`/raf/${kod}/indirim-kodu-al`);
      expect(birinci.body.kod).not.toBe(ikinci.body.kod);
    });
  });
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx jest tests/raf.test.js -t "İndirim kodu alma"`
Expected: FAIL — route mevcut olmadığı için 404 döner, `res.body.ok` testleri başarısız olur.

- [ ] **Step 3: Route'u implemente et**

`routes/public.js` üstüne ekle:

```javascript
const { benzersizIndirimKoduUret } = require('../utils/indirimKod');
const { createJsonLimiter } = require('../middleware/rateLimiter');
```

`eczaneGetir` fonksiyonundaki SELECT'e `f.indirim_aktif, f.indirim_yuzdesi` ekle:

```javascript
async function eczaneGetir(kod) {
  const result = await pool.query(
    `SELECT e.id as eczane_id, e.ad as eczane_ad, e.kod,
            f.ad as firma_ad, f.logo_url, f.marka_rengi, f.katalog_url,
            f.website, f.instagram, f.linkedin, f.twitter, f.youtube, f.tiktok, f.whatsapp,
            f.indirim_aktif, f.indirim_yuzdesi
     FROM eczaneler e JOIN firmalar f ON f.id = e.firma_id
     WHERE e.kod = $1`,
    [kod]
  );
  return result.rows[0] || null;
}
```

`/raf/:kod/urun/:urunId/tikla` route'undan hemen sonra, `eczaciGetir` fonksiyonundan önce ekle:

```javascript
// İndirim kodu al — günde/eczane başına cookie ile tekilleştirilir
router.post('/raf/:kod/indirim-kodu-al', createJsonLimiter('Çok fazla istek. Lütfen biraz sonra tekrar deneyin.'), async (req, res) => {
  try {
    const veri = await eczaneGetir(req.params.kod);
    if (!veri) return res.status(404).json({ ok: false, error: 'Bulunamadı.' });
    if (!veri.indirim_aktif) return res.status(403).json({ ok: false, error: 'İndirim kampanyası aktif değil.' });

    let cerezId = req.cookies?.indirim_cerez_id;
    if (!cerezId) {
      cerezId = require('crypto').randomBytes(16).toString('hex');
      res.cookie('indirim_cerez_id', cerezId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    }

    const mevcut = await pool.query(
      `SELECT kod, yuzde FROM indirim_kodlari
       WHERE eczane_id = $1 AND cerez_id = $2 AND olusturulma_tarihi::date = CURRENT_DATE
       ORDER BY id DESC LIMIT 1`,
      [veri.eczane_id, cerezId]
    );
    if (mevcut.rows.length) {
      return res.json({ ok: true, kod: mevcut.rows[0].kod, yuzde: mevcut.rows[0].yuzde });
    }

    const firmaIdSonuc = await pool.query('SELECT firma_id FROM eczaneler WHERE id = $1', [veri.eczane_id]);
    const yeniKod = await benzersizIndirimKoduUret();
    await pool.query(
      'INSERT INTO indirim_kodlari (firma_id, eczane_id, kod, yuzde, cerez_id) VALUES ($1, $2, $3, $4, $5)',
      [firmaIdSonuc.rows[0].firma_id, veri.eczane_id, yeniKod, veri.indirim_yuzdesi, cerezId]
    );
    res.json({ ok: true, kod: yeniKod, yuzde: veri.indirim_yuzdesi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Bir hata oluştu.' });
  }
});
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx jest tests/raf.test.js`
Expected: PASS (tüm testler, yeni 4 dahil)

- [ ] **Step 5: Commit**

```bash
git add routes/public.js tests/raf.test.js
git commit -m "$(cat <<'EOF'
Raf sayfasına indirim kodu alma ucunu ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: views/public/raf.ejs — İndirim Kodu Al UI

**Files:**
- Modify: `views/public/raf.ejs`

- [ ] **Step 1: Buton ve sonuç alanını ekle**

`.govde` içindeki QR butonundan (`<button class="btn-qr" ...>`) hemen önce ekle:

```html
      <% if (veri.indirim_aktif) { %>
      <button class="btn btn-katalog" type="button" onclick="indirimKoduAl()">🎁 İndirim Kodu Al</button>
      <div id="indirim-sonuc" style="display:none;text-align:center;padding:10px;background:#f9fafb;border-radius:10px"></div>
      <% } %>
```

Dosyanın sonundaki mevcut `<script>` bloğunun içine (urunDetayAc fonksiyonunun yanına), `innerHTML` yerine güvenli DOM API'leriyle (XSS riski olmadan) aşağıdaki fonksiyonu ekle:

```html
    function indirimKoduAl() {
      const sonucDiv = document.getElementById('indirim-sonuc');
      sonucDiv.style.display = 'block';
      sonucDiv.textContent = 'Yükleniyor...';
      fetch('/raf/<%= veri.kod %>/indirim-kodu-al', { method: 'POST' })
        .then(res => res.json())
        .then(govde => {
          sonucDiv.textContent = '';
          if (govde.ok) {
            const kodDiv = document.createElement('div');
            kodDiv.style.cssText = 'font-size:28px;font-weight:800;letter-spacing:3px;color:#1a1a2e';
            kodDiv.textContent = govde.kod;
            const aciklamaDiv = document.createElement('div');
            aciklamaDiv.style.cssText = 'font-size:12px;color:#6b7280;margin-top:6px';
            aciklamaDiv.textContent = 'Bu kodu kasada eczacınıza gösterin. %' + govde.yuzde + ' indirim, bugün gece yarısına kadar geçerli.';
            sonucDiv.appendChild(kodDiv);
            sonucDiv.appendChild(aciklamaDiv);
          } else {
            sonucDiv.style.color = '#dc2626';
            sonucDiv.style.fontSize = '13px';
            sonucDiv.textContent = govde.error;
          }
        })
        .catch(() => {
          sonucDiv.style.color = '#dc2626';
          sonucDiv.textContent = 'Bağlantı hatası.';
        });
    }
```

- [ ] **Step 2: Tarayıcıda doğrula**

Yerel sunucuyu başlat (`npm run dev`), `indirim_aktif=true` olan bir test firmasının raf sayfasını aç, butona tıkla, 6 haneli kodun ekranda göründüğünü doğrula. `indirim_aktif=false` olan bir firmanın raf sayfasında butonun hiç görünmediğini doğrula.

- [ ] **Step 3: Commit**

```bash
git add views/public/raf.ejs
git commit -m "$(cat <<'EOF'
Raf sayfasına indirim kodu al butonunu ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: POST /eczaci/:kod/indirim-dogrula ucu

**Files:**
- Modify: `routes/public.js`
- Test: `tests/eczaci.test.js`

- [ ] **Step 1: Testleri yaz**

`tests/eczaci.test.js` dosyasının sonuna, mevcut `describe` bloğunun içine (son test olan "İçerik alanları boşken..." testinden sonra, `});` kapanışından önce) ekle:

```javascript
  describe('İndirim kodu doğrulama', () => {
    async function kodOlustur(eId, fId, yuzde = 5) {
      const r = await pool.query(
        `INSERT INTO indirim_kodlari (firma_id, eczane_id, kod, yuzde, cerez_id)
         VALUES ($1, $2, $3, $4, 'test-cerez') RETURNING kod`,
        [fId, eId, String(Math.floor(100000 + Math.random() * 900000)), yuzde]
      );
      return r.rows[0].kod;
    }

    test('geçerli kod onaylanır ve kullanıldı işaretlenir', async () => {
      const kod = await kodOlustur(eczaneId, firmaId, 5);
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.yuzde).toBe(5);
      const satir = await pool.query('SELECT kullanildi FROM indirim_kodlari WHERE kod = $1', [kod]);
      expect(satir.rows[0].kullanildi).toBe(true);
    });

    test('zaten kullanılmış kod reddedilir', async () => {
      const kod = await kodOlustur(eczaneId, firmaId, 5);
      await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      expect(res.statusCode).toBe(409);
      expect(res.body.ok).toBe(false);
    });

    test('başka eczanenin kodu reddedilir', async () => {
      const basHash = await bcrypt.hash('x', 4);
      const basFirma = await pool.query(
        `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
         VALUES ('Baska Firma Indirim', 'baska-firma-indirim', 'baskaindirim@example.com', $1, 'kurumsal') RETURNING id`,
        [basHash]
      );
      const basEczane = await pool.query(
        `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Baska Eczane', 'baskaraf1', 'baskaeczaci1') RETURNING id`,
        [basFirma.rows[0].id]
      );
      const kod = await kodOlustur(basEczane.rows[0].id, basFirma.rows[0].id, 5);
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      expect(res.statusCode).toBe(403);
      await pool.query('DELETE FROM firmalar WHERE id = $1', [basFirma.rows[0].id]);
    });

    test('süresi dolmuş (dünkü) kod reddedilir', async () => {
      const kod = await kodOlustur(eczaneId, firmaId, 5);
      await pool.query(
        "UPDATE indirim_kodlari SET olusturulma_tarihi = NOW() - INTERVAL '1 day' WHERE kod = $1",
        [kod]
      );
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      expect(res.statusCode).toBe(410);
    });

    test('olmayan kod reddedilir', async () => {
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod: '000000' });
      expect(res.statusCode).toBe(404);
    });
  });
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx jest tests/eczaci.test.js -t "İndirim kodu doğrulama"`
Expected: FAIL — route mevcut olmadığı için tüm istekler 404 döner (ama "olmayan kod reddedilir" testi tesadüfen 404 beklediği için o testin PASS olması, diğerlerinin FAIL olması normaldir; önemli olan route implemente edilmeden en az bir testin anlamlı şekilde başarısız olmasıdır — burada "geçerli kod onaylanır" testi 404 alıp `res.body.ok` `undefined` olacağından FAIL verir).

- [ ] **Step 3: Route'u implemente et**

`routes/public.js`'te `/eczaci/:kod` GET route'undan hemen sonra (dosyanın sonunda `eczaciGetir`'i kullanan diğer route'ların yanına) ekle:

```javascript
// İndirim kodu doğrula — eczacı kendi eczacı sayfasında kodu girer
router.post('/eczaci/:kod/indirim-dogrula', createJsonLimiter('Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.'), async (req, res) => {
  const kod = (req.body.kod || '').trim();
  try {
    const eczaneSonuc = await pool.query('SELECT id AS eczane_id FROM eczaneler WHERE eczaci_kod = $1', [req.params.kod]);
    if (!eczaneSonuc.rows.length) return res.status(404).json({ ok: false, error: 'Eczane bulunamadı.' });
    const eczaneId = eczaneSonuc.rows[0].eczane_id;

    if (!kod) return res.status(400).json({ ok: false, error: 'Kod girilmedi.' });

    const guncelleme = await pool.query(
      `UPDATE indirim_kodlari
       SET kullanildi = true, kullanilma_tarihi = NOW()
       WHERE kod = $1 AND eczane_id = $2 AND kullanildi = false AND olusturulma_tarihi::date = CURRENT_DATE
       RETURNING yuzde`,
      [kod, eczaneId]
    );
    if (guncelleme.rows.length) {
      return res.json({ ok: true, yuzde: guncelleme.rows[0].yuzde });
    }

    const mevcut = await pool.query(
      `SELECT eczane_id, kullanildi, (olusturulma_tarihi::date = CURRENT_DATE) AS bugun
       FROM indirim_kodlari WHERE kod = $1`,
      [kod]
    );
    if (!mevcut.rows.length) return res.status(404).json({ ok: false, error: 'Kod geçersiz.' });
    const satir = mevcut.rows[0];
    if (satir.eczane_id !== eczaneId) return res.status(403).json({ ok: false, error: 'Bu kod bu eczaneye ait değil.' });
    if (!satir.bugun) return res.status(410).json({ ok: false, error: 'Bu kodun süresi dolmuş.' });
    return res.status(409).json({ ok: false, error: 'Bu kod zaten kullanılmış.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Bir hata oluştu.' });
  }
});
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx jest tests/eczaci.test.js`
Expected: PASS (tüm testler)

- [ ] **Step 5: Commit**

```bash
git add routes/public.js tests/eczaci.test.js
git commit -m "$(cat <<'EOF'
Eczacı sayfasına indirim kodu doğrulama ucunu ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: views/public/eczaci.ejs — İndirim Kodu Doğrula UI

**Files:**
- Modify: `views/public/eczaci.ejs`

- [ ] **Step 1: Form ve sonuç alanını ekle**

`.govde` içindeki QR butonundan hemen önce ekle:

```html
      <div class="baslik" style="margin-top:4px">İndirim Kodu Doğrula</div>
      <div style="display:flex;gap:8px">
        <input id="indirimKoduInput" type="text" maxlength="6" placeholder="6 haneli kod"
               style="flex:1;padding:12px;border-radius:10px;border:1px solid #e5e7eb;font-size:16px;letter-spacing:2px;text-align:center">
        <button class="btn" type="button" onclick="indirimDogrula()" style="width:auto;padding:12px 18px">Doğrula</button>
      </div>
      <div id="indirim-dogrula-sonuc" style="display:none;font-size:13px;text-align:center;font-weight:600"></div>
```

`</div>` (QR modal kapanışı) ile `</body>` arasına, bu dosyada henüz `<script>` bloğu olmadığı için yeni bir tane ekle. Sonuç metni her koşulda `textContent` ile yazılır (XSS riski yok):

```html
  <script>
    function indirimDogrula() {
      const kod = document.getElementById('indirimKoduInput').value.trim();
      const sonucDiv = document.getElementById('indirim-dogrula-sonuc');
      sonucDiv.style.display = 'block';
      sonucDiv.style.color = '#374151';
      sonucDiv.textContent = 'Kontrol ediliyor...';
      fetch('/eczaci/<%= eczaciKod %>/indirim-dogrula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kod })
      })
        .then(res => res.json())
        .then(govde => {
          if (govde.ok) {
            sonucDiv.style.color = '#16a34a';
            sonucDiv.textContent = '✓ Onaylandı — %' + govde.yuzde + ' indirim uygulayabilirsiniz.';
          } else {
            sonucDiv.style.color = '#dc2626';
            sonucDiv.textContent = govde.error;
          }
        })
        .catch(() => {
          sonucDiv.style.color = '#dc2626';
          sonucDiv.textContent = 'Bağlantı hatası.';
        });
    }
  </script>
```

- [ ] **Step 2: Tarayıcıda doğrula**

Yerel sunucuda bir eczacı sayfasını aç, geçerli bir test koduyla doğrula butonuna bas, "✓ Onaylandı" mesajını gör; aynı kodu tekrar dene, "Bu kod zaten kullanılmış." mesajını gör.

- [ ] **Step 3: Commit**

```bash
git add views/public/eczaci.ejs
git commit -m "$(cat <<'EOF'
Eczacı sayfasına indirim kodu doğrulama formunu ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: routes/kurumsal.js — indirim ayarları ucu

**Files:**
- Modify: `routes/kurumsal.js`
- Test: `tests/kurumsal.test.js`

- [ ] **Step 1: Testi yaz**

`tests/kurumsal.test.js` dosyasının sonuna, `describe('Kurumsal panel uçları', ...)` bloğu içine (kapanıştan önce) ekle:

```javascript
  test('kurumsal firma indirim ayarlarını günceller', async () => {
    const agent = kurumsalAgent;
    const res = await agent.post('/kurumsal/indirim-ayar').send({ indirim_aktif: 'true', indirim_yuzdesi: '10' });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT indirim_aktif, indirim_yuzdesi FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].indirim_aktif).toBe(true);
    expect(f.rows[0].indirim_yuzdesi).toBe(10);
  });

  test('geçersiz yüzde (0 veya 101) reddedilir', async () => {
    const agent = kurumsalAgent;
    await agent.post('/kurumsal/indirim-ayar').send({ indirim_aktif: 'true', indirim_yuzdesi: '5' });
    const res = await agent.post('/kurumsal/indirim-ayar').send({ indirim_aktif: 'true', indirim_yuzdesi: '101' });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT indirim_yuzdesi FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].indirim_yuzdesi).toBe(5); // değişmedi
  });
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js -t "indirim ayarlarını"`
Expected: FAIL — route mevcut değil, `indirim_aktif`/`indirim_yuzdesi` kolonu güncellenmez, `f.rows[0].indirim_aktif` `false` kalır.

- [ ] **Step 3: Route'u implemente et**

`routes/kurumsal.js`'te `router.get('/eczane/:id/detay', ...)` bloğundan hemen sonra, ürün route'larından önce ekle:

```javascript
// İndirim kampanyası ayarları
router.post('/indirim-ayar', async (req, res) => {
  const { indirim_aktif, indirim_yuzdesi } = req.body;
  const yuzde = parseInt(indirim_yuzdesi, 10);
  if (!Number.isInteger(yuzde) || yuzde < 1 || yuzde > 100) {
    req.flash('error', 'Yüzde 1-100 arasında olmalı.');
    return res.redirect('/?tab=indirim');
  }
  try {
    await pool.query(
      'UPDATE firmalar SET indirim_aktif=$1, indirim_yuzdesi=$2 WHERE id=$3',
      [indirim_aktif === 'true', yuzde, req.session.firmaId]
    );
    req.flash('success', 'İndirim ayarları güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=indirim');
});
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx jest tests/kurumsal.test.js`
Expected: PASS (tüm testler)

- [ ] **Step 5: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "$(cat <<'EOF'
Kurumsal panele indirim kampanyası ayar ucunu ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: app.js — indirim raporlama sorgusu

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Sorguyu ve render değişkenini ekle**

`app.js`'te `const urunlerSonuc = ...` satırından hemen sonra ekle:

```javascript
    let indirimIstatistik = { toplamUretilen: 0, toplamKullanilan: 0, eczaneBazli: [] };
    if (tab === 'indirim' && firma.paket === 'kurumsal') {
      const toplamResult = await pool.query(
        `SELECT COUNT(*) AS uretilen, COUNT(*) FILTER (WHERE kullanildi) AS kullanilan
         FROM indirim_kodlari WHERE firma_id = $1`,
        [req.session.firmaId]
      );
      const eczaneBazliResult = await pool.query(
        `SELECT e.ad, COUNT(*) FILTER (WHERE i.kullanildi) AS kullanilan_sayi
         FROM indirim_kodlari i JOIN eczaneler e ON e.id = i.eczane_id
         WHERE i.firma_id = $1
         GROUP BY e.id, e.ad
         HAVING COUNT(*) FILTER (WHERE i.kullanildi) > 0
         ORDER BY kullanilan_sayi DESC`,
        [req.session.firmaId]
      );
      indirimIstatistik = {
        toplamUretilen: Number(toplamResult.rows[0].uretilen),
        toplamKullanilan: Number(toplamResult.rows[0].kullanilan),
        eczaneBazli: eczaneBazliResult.rows.map(r => ({ ad: r.ad, kullanilanSayi: Number(r.kullanilan_sayi) })),
      };
    }
```

`res.render('public/dashboard', {...})` çağrısındaki değişken listesine `indirimIstatistik` ekle:

```javascript
    res.render('public/dashboard', {
      layout: false, firma, calisanlar, aktifSayisi, pasifSayisi,
      toplamGoruntulenme, tab, linkAnalytics, eczaneler, sahaIstatistik, urunler: urunlerSonuc.rows,
      indirimIstatistik
    });
```

- [ ] **Step 2: Sunucunun hâlâ ayağa kalktığını doğrula**

Run: `node -e "require('./app.js'); console.log('OK')"`
Expected: `OK` yazdırır, hata yok.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
İndirim kodu raporlama sorgusunu dashboard'a bağla

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: views/public/dashboard.ejs — "İndirim" sekmesi

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] **Step 1: Sekme linkini ekle**

`<a href="/?tab=urunler" ...>Ürünler</a>` satırından hemen sonra ekle:

```html
    <a href="/?tab=indirim" class="dash-tab <%= tab === 'indirim' ? 'active' : '' %>">İndirim</a>
```

- [ ] **Step 2: Sekme içeriğini ekle**

`<!-- TAB: RAF KARTLARI -->` bloğundan hemen önce (yani Ürünler sekmesinin `<% } else if (tab === 'raf' ...` satırından önce), yeni bir `else if` bloğu olarak ekle:

```html
  <!-- TAB: İNDİRİM -->
  <% } else if (tab === 'indirim' && firma.paket === 'kurumsal') { %>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px;max-width:420px">
      <h3 style="margin-bottom:12px">İndirim Kampanyası</h3>
      <form method="POST" action="/kurumsal/indirim-ayar" style="display:flex;flex-direction:column;gap:10px">
        <label style="display:flex;align-items:center;gap:6px;font-size:14px">
          <input type="checkbox" name="indirim_aktif" value="true" <%= firma.indirim_aktif ? 'checked' : '' %>>
          Kampanya aktif — raf sayfasında "İndirim Kodu Al" butonu görünsün
        </label>
        <label style="font-size:13px;color:#6b7280">
          İndirim yüzdesi
          <input type="number" name="indirim_yuzdesi" min="1" max="100" value="<%= firma.indirim_yuzdesi %>" style="width:100%;margin-top:4px">
        </label>
        <button type="submit">Kaydet</button>
      </form>
    </div>

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-card-n"><%= indirimIstatistik.toplamUretilen %></div>
        <div class="stat-card-l">Üretilen kod</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-n"><%= indirimIstatistik.toplamKullanilan %></div>
        <div class="stat-card-l">Kullanılan kod</div>
      </div>
    </div>

    <% if (indirimIstatistik.eczaneBazli.length) { %>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Eczane</th><th>Kullanılan indirim</th></tr></thead>
        <tbody>
          <% indirimIstatistik.eczaneBazli.forEach(e => { %>
          <tr>
            <td class="td-name"><%= e.ad %></td>
            <td><%= e.kullanilanSayi %></td>
          </tr>
          <% }); %>
        </tbody>
      </table>
    </div>
    <% } else { %>
    <div class="table-wrap">
      <div class="empty-state">
        <div class="empty-state-icon">🎁</div>
        <div class="empty-state-title">Henüz kullanılan indirim yok</div>
      </div>
    </div>
    <% } %>

  <!-- TAB: RAF KARTLARI -->
```

- [ ] **Step 3: Tarayıcıda doğrula**

Yerel sunucuda kurumsal panelde "İndirim" sekmesine git, kampanyayı aç, yüzdeyi 10 yap, kaydet, sayfanın "İndirim ayarları güncellendi." flash mesajıyla döndüğünü ve checkbox'ın işaretli kaldığını doğrula.

- [ ] **Step 4: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "$(cat <<'EOF'
Kurumsal panele İndirim sekmesi UI'ını ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Tam test + deploy + production doğrulama

**Files:** Yok (sadece komutlar)

- [ ] **Step 1: Tüm test paketini çalıştır**

Run: `npx jest`
Expected: Tüm testler PASS, hiç FAIL yok.

- [ ] **Step 2: Değişiklikleri push et**

```bash
git push origin master
```

- [ ] **Step 3: Railway'e deploy et**

```bash
railway up --service app --detach
```

`railway status` ile "Online" durumuna geçtiğini doğrula (birkaç kez tekrar deneyerek poll et).

- [ ] **Step 4: Production migration'ı çalıştır**

Railway Postgres servisinin public proxy bağlantı adresini al:

```bash
railway variables --service Postgres --kv
```

`DATABASE_PUBLIC_URL` değerini kullanarak migration'ı doğrudan çalıştır:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL değeri>" node scripts/migrate.js
```

Expected: `indirim_kodlari` tablosu ve `firmalar` kolonları için `OK: ...` satırları.

- [ ] **Step 5: Production'da marker firma ile uçtan uca doğrula**

`DATABASE_PUBLIC_URL` ile doğrudan bağlanan bir `node -e` script'iyle test amaçlı bir marker firma + eczane oluştur (`indirim_aktif=true, indirim_yuzdesi=5`), ardından:
- `curl -X POST https://www.nfckartify.com.tr/raf/<marker-kod>/indirim-kodu-al` çağır, 6 haneli kod döndüğünü doğrula.
- `curl -X POST https://www.nfckartify.com.tr/eczaci/<marker-eczaci-kod>/indirim-dogrula -H "Content-Type: application/json" -d '{"kod":"<alınan kod>"}'` çağır, `{"ok":true,"yuzde":5}` döndüğünü doğrula.
- Aynı kodu tekrar gönder, `409` ve "zaten kullanılmış" hatası döndüğünü doğrula.

- [ ] **Step 6: Marker verisini temizle**

Oluşturulan test firmasını (ve cascade ile eczane/indirim_kodlari kayıtlarını) production DB'den sil:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL değeri>" node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  await pool.query('DELETE FROM firmalar WHERE id = \$1', [MARKER_FIRMA_ID]);
  console.log('marker verisi temizlendi');
  await pool.end();
})();
"
```

- [ ] **Step 7: git status temiz olduğunu doğrula**

Run: `git status --short`
Expected: Boş çıktı.
