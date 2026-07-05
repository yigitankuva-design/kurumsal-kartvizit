# İP-3 — Toplu Excel İçe Aktarım & Onay Akışı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eczane için toplu Excel yükleme eklemek ve toplu içe aktarılan (çalışan + eczane) kayıtları onaylanana kadar mobilde gizli tutan bir onay akışı kurmak.

**Architecture:** `calisanlar`/`eczaneler` tablolarına `onayli BOOLEAN DEFAULT true` kolonu eklenir; sadece toplu Excel eklemeleri `onayli=false` yazar. Mobil liste uçları `onayli=true` filtreler; web panel hepsini gösterip onaysızlar için "Onayla" butonu sunar. Çalışan toplu yükleme zaten mevcut (`routes/panel.js`), eczane karşılığı yeni eklenir.

**Tech Stack:** Node/Express, PostgreSQL, xlsx, multer, Jest+supertest. (Bu iş paketi TAMAMEN backend — Android değişmez; onaysız kayıtlar API yanıtından zaten hiç dönmez.)

**Repo:** `C:\Users\muham\kurumsal-kartvizit` (git + GitHub, Railway deploy). Komutlar Git Bash'ten `cd /c/Users/muham/kurumsal-kartvizit`.

---

### Task 1: DB migration (`onayli` kolonu)

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\scripts\migrate.js`

- [ ] **Step 1: `scripts/migrate.js`'e migration ekle** — `migrations` dizisinin son elemanından (`eczaci_kart_yazma_tarihi` ALTER'ı, İP-2'de eklendi) sonra, dizinin kapanış `];`'inden önce ekle:

```javascript
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS onayli BOOLEAN DEFAULT true`,
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS onayli BOOLEAN DEFAULT true`,
```

- [ ] **Step 2: Migration'ı çalıştır**

Run: `cd /c/Users/muham/kurumsal-kartvizit && node scripts/migrate.js`
Expected: Her satır `OK: ...`, sonda `Migration tamamlandı.`

- [ ] **Step 3: Kolonların oluştuğunu doğrula**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const r = await pool.query(\"SELECT table_name, column_name FROM information_schema.columns WHERE column_name='onayli' ORDER BY table_name\");
  console.log(r.rows);
  await pool.end();
})();
"
```
Expected: `calisanlar` ve `eczaneler` için `onayli` satırları.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.js
git commit -m "IP-3: onayli kolonu migration"
```

---

### Task 2: `eczaneExcelParse` saf fonksiyonu

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\utils\excel.js`
- Create: `C:\Users\muham\kurumsal-kartvizit\tests\excel.test.js`

- [ ] **Step 1: Başarısız testi yaz** — `tests/excel.test.js` oluştur:

```javascript
const XLSX = require('xlsx');
const { eczaneExcelParse } = require('../utils/excel');

function bufferOlustur(satirlar) {
  const ws = XLSX.utils.aoa_to_sheet(satirlar);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Eczaneler');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('utils/excel — eczaneExcelParse', () => {
  test('geçerli satırları ad ve adres ile döner', () => {
    const buf = bufferOlustur([
      ['ad', 'adres'],
      ['Merkez Eczanesi', 'Ana Cad. 5'],
      ['Şube Eczanesi', ''],
    ]);
    const { eczaneler, hatalar } = eczaneExcelParse(buf);
    expect(hatalar).toHaveLength(0);
    expect(eczaneler).toHaveLength(2);
    expect(eczaneler[0]).toEqual({ ad: 'Merkez Eczanesi', adres: 'Ana Cad. 5' });
    expect(eczaneler[1]).toEqual({ ad: 'Şube Eczanesi', adres: null });
  });

  test('ad boş olan satırı hata listesine ekler, diğerlerini işler', () => {
    const buf = bufferOlustur([
      ['ad', 'adres'],
      ['', 'Adres var ama ad yok'],
      ['Geçerli Eczane', 'Adres'],
    ]);
    const { eczaneler, hatalar } = eczaneExcelParse(buf);
    expect(eczaneler).toHaveLength(1);
    expect(eczaneler[0].ad).toBe('Geçerli Eczane');
    expect(hatalar).toHaveLength(1);
    expect(hatalar[0]).toContain('Satır 2');
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/excel.test.js`
Expected: FAIL — `eczaneExcelParse is not a function`

- [ ] **Step 3: `utils/excel.js`'e fonksiyonu ekle** — `module.exports`'tan önce ekle:

```javascript
function eczaneExcelParse(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const eczaneler = [];
  const hatalar = [];

  rows.forEach((row, i) => {
    const ad = String(row['ad'] || '').trim();
    if (!ad) {
      hatalar.push(`Satır ${i + 2}: ad zorunlu`);
      return;
    }
    eczaneler.push({
      ad,
      adres: String(row['adres'] || '').trim() || null,
    });
  });

  return { eczaneler, hatalar };
}
```

`module.exports` satırını şu hale getir:

```javascript
module.exports = { excelParse, eczaneExcelParse };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/excel.test.js`
Expected: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add utils/excel.js tests/excel.test.js
git commit -m "IP-3: eczaneExcelParse saf fonksiyonu"
```

---

### Task 3: Çalışan toplu yüklemesi `onayli=false` yazsın

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\panel.js:110-114`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\panel.test.js`

- [ ] **Step 1: Başarısız test ekle** — `tests/panel.test.js`'te mevcut `describe('routes/panel — temsilci giriş bilgisi', ...)` bloğunun İÇİNE (son test'ten sonra, `afterAll`'dan önce değil — testlerin arasına) ekle:

```javascript
  test('Excel toplu yüklenen çalışan onayli=false ile eklenir', async () => {
    const XLSX = require('xlsx');
    const agent = await girisYap(firmaEmail);
    const ws = XLSX.utils.aoa_to_sheet([
      ['ad', 'soyad', 'unvan', 'departman', 'telefon', 'email', 'linkedin', 'biyografi'],
      ['Toplu', 'Onaysiz', '', '', '', '', '', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Çalışanlar');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const res = await agent.post('/firma/panel/toplu-yukle')
      .attach('excel', buffer, { filename: 'test.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(res.statusCode).toBe(302);
    const c = await pool.query(
      "SELECT onayli FROM calisanlar WHERE firma_id = $1 AND ad = 'Toplu' AND soyad = 'Onaysiz'",
      [firmaId]
    );
    expect(c.rows.length).toBe(1);
    expect(c.rows[0].onayli).toBe(false);
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/panel.test.js -t "onayli=false"`
Expected: FAIL — `onayli` `true` döner (henüz DEFAULT)

- [ ] **Step 3: `routes/panel.js`'teki toplu-yukle INSERT'ini güncelle** — mevcut:

```javascript
      await pool.query(
        `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, slug)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.session.firmaId, c.ad, c.soyad, c.unvan, c.departman, c.telefon, c.email, c.linkedin, c.biyografi, slug]
      );
```

Şununla değiştir (`onayli` kolonu + `false` değeri eklendi):

```javascript
      await pool.query(
        `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, slug, onayli)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, false)`,
        [req.session.firmaId, c.ad, c.soyad, c.unvan, c.departman, c.telefon, c.email, c.linkedin, c.biyografi, slug]
      );
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/panel.test.js -t "onayli=false"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/panel.js tests/panel.test.js
git commit -m "IP-3: calisan toplu yukleme onayli=false"
```

---

### Task 4: Eczane şablon + toplu yükleme uçları

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\kurumsal.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\kurumsal.test.js`

- [ ] **Step 1: Başarısız test ekle** — `tests/kurumsal.test.js`'te mevcut `describe('Kurumsal panel uçları', ...)` bloğunun İÇİNE (son test'ten sonra) ekle:

```javascript
  test('eczane Excel toplu yüklenir, kod üretilir ve onayli=false olur', async () => {
    const XLSX = require('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['ad', 'adres'],
      ['Toplu Eczane A', 'Adres A'],
      ['Toplu Eczane B', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Eczaneler');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const res = await kurumsalAgent.post('/kurumsal/eczane-toplu-yukle')
      .attach('excel', buffer, { filename: 'ecz.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(res.statusCode).toBe(302);
    const e = await pool.query(
      "SELECT ad, kod, eczaci_kod, onayli FROM eczaneler WHERE firma_id = $1 AND ad = 'Toplu Eczane A'",
      [kurumsalId]
    );
    expect(e.rows.length).toBe(1);
    expect(e.rows[0].kod).toHaveLength(8);
    expect(e.rows[0].eczaci_kod).toHaveLength(8);
    expect(e.rows[0].onayli).toBe(false);
  });

  test('eczane şablonu .xlsx olarak iner', async () => {
    const res = await kurumsalAgent.get('/kurumsal/eczane-sablon');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js -t "eczane Excel toplu"`
Expected: FAIL — 404 (route yok)

- [ ] **Step 3: `routes/kurumsal.js` importlarına multer + eczaneExcelParse ekle** — dosya başındaki importlara ekle (mevcut `const XLSX = require('xlsx');` satırından sonra):

```javascript
const multer = require('multer');
const { eczaneExcelParse } = require('../utils/excel');
```

Ve `const eczaciPdfUpload = ...` satırından sonra ekle:

```javascript
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
```

- [ ] **Step 4: `routes/kurumsal.js`'e uçları ekle** — `eczane-kod-uret` route'undan sonra, `router.post('/calisan/:id/kart-isaretle'...)`'dan önce (veya `module.exports`'tan önce herhangi bir yere) ekle:

```javascript
router.get('/eczane-sablon', (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['ad', 'adres'],
    ['Örnek Eczane', 'Merkez Mah. No:1'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Eczaneler');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="eczaneler-sablon.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

router.post('/eczane-toplu-yukle', excelUpload.single('excel'), async (req, res) => {
  if (!req.file) {
    req.flash('error', 'Dosya seçilmedi.');
    return res.redirect('/?tab=excel');
  }
  const { eczaneler, hatalar } = eczaneExcelParse(req.file.buffer);
  let eklenen = 0;
  for (const e of eczaneler) {
    try {
      const kod = await benzersizEczaneKoduUret();
      const eczaciKod = await benzersizEczaciKoduUret();
      await pool.query(
        'INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod, onayli) VALUES ($1,$2,$3,$4,$5, false)',
        [req.session.firmaId, e.ad, e.adres, kod, eczaciKod]
      );
      eklenen++;
    } catch (err) {
      console.error(err);
      hatalar.push(`${e.ad}: eklenemedi`);
    }
  }
  const mesaj = `${eklenen} eczane eklendi.${hatalar.length ? ' Hatalar: ' + hatalar.join('; ') : ''}`;
  req.flash(hatalar.length && eklenen === 0 ? 'error' : 'success', mesaj);
  res.redirect('/?tab=excel');
});
```

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/kurumsal.test.js -t "eczane Excel toplu|eczane şablonu"`
Expected: PASS (2 test)

- [ ] **Step 6: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "IP-3: eczane sablon + toplu yukleme uclari"
```

---

### Task 5: Onaylama uçları

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\panel.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\kurumsal.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\panel.test.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\kurumsal.test.js`

- [ ] **Step 1: Başarısız testleri yaz** — `tests/panel.test.js` bloğuna ekle:

```javascript
  test('çalışan onaylama onayli=true yapar', async () => {
    const agent = await girisYap(firmaEmail);
    const c = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug, onayli) VALUES ($1,'Onay','Bekleyen','onay-bekleyen',false) RETURNING id",
      [firmaId]
    );
    const res = await agent.post(`/firma/panel/calisan/${c.rows[0].id}/onayla`);
    expect(res.statusCode).toBe(302);
    const r = await pool.query('SELECT onayli FROM calisanlar WHERE id = $1', [c.rows[0].id]);
    expect(r.rows[0].onayli).toBe(true);
  });
```

Ve `tests/kurumsal.test.js` bloğuna ekle:

```javascript
  test('eczane onaylama onayli=true yapar', async () => {
    const e = await pool.query(
      "INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod, onayli) VALUES ($1,'Onay Eczane','onaykod1','onayeczaci1',false) RETURNING id",
      [kurumsalId]
    );
    const res = await kurumsalAgent.post(`/kurumsal/eczane/${e.rows[0].id}/onayla`);
    expect(res.statusCode).toBe(302);
    const r = await pool.query('SELECT onayli FROM eczaneler WHERE id = $1', [e.rows[0].id]);
    expect(r.rows[0].onayli).toBe(true);
  });
```

- [ ] **Step 2: Testleri çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/panel.test.js tests/kurumsal.test.js -t "onaylama"`
Expected: FAIL — 404 (route yok)

- [ ] **Step 3: `routes/panel.js`'e onaylama ucu ekle** — `toplu-yukle` route'undan sonra ekle:

```javascript
router.post('/calisan/:id/onayla', async (req, res) => {
  try {
    await pool.query(
      'UPDATE calisanlar SET onayli = true WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.session.firmaId]
    );
  } catch (err) {
    console.error(err);
    req.flash('error', 'Onaylanamadı.');
  }
  res.redirect('/?tab=calisanlar');
});
```

- [ ] **Step 4: `routes/kurumsal.js`'e onaylama ucu ekle** — `eczane-toplu-yukle` route'undan sonra ekle:

```javascript
router.post('/eczane/:id/onayla', async (req, res) => {
  try {
    await pool.query(
      'UPDATE eczaneler SET onayli = true WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.session.firmaId]
    );
  } catch (err) {
    console.error(err);
    req.flash('error', 'Onaylanamadı.');
  }
  res.redirect('/?tab=raf');
});
```

- [ ] **Step 5: Testleri çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/panel.test.js tests/kurumsal.test.js -t "onaylama"`
Expected: PASS (2 test)

- [ ] **Step 6: Commit**

```bash
git add routes/panel.js routes/kurumsal.js tests/panel.test.js tests/kurumsal.test.js
git commit -m "IP-3: calisan + eczane onaylama uclari"
```

---

### Task 6: Mobil görünürlük filtresi (`onayli = true`)

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\mobilApi.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\mobilApi.test.js`

- [ ] **Step 1: Başarısız test assertion'ları ekle** — `tests/mobilApi.test.js`'te mevcut `describe('Mobil API — /api/mobil/firma/calisanlarimiz', ...)` bloğunun `beforeAll`'una, mevcut 'Ali'/'Veli' çalışanı eklemesinden sonra bir onaysız çalışan ekle:

```javascript
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, onayli) VALUES ($1, 'Onaysiz', 'Calisan', 'onaysiz-calisan-fc', false)`,
      [firmaId]
    );
```

Ve aynı bloğun `'yalnızca kendi firmasının çalışanları döner'` testinin sonuna ekle:

```javascript
    expect(adlar).not.toContain('Onaysiz');
```

`describe('Mobil API — /api/mobil/firma/eczanelerimiz', ...)` bloğunun `beforeAll`'una, 'Benim Eczanem' eklemesinden sonra ekle:

```javascript
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, onayli) VALUES ($1, 'Onaysiz Eczane', 'feonaysiz1', false)`,
      [firmaId]
    );
```

Ve `'yalnızca kendi firmasının eczaneleri (eczaci_kod dahil) döner'` testinin sonuna ekle:

```javascript
    expect(adlar).not.toContain('Onaysiz Eczane');
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -t "calisanlarimiz|eczanelerimiz"`
Expected: FAIL — onaysız kayıtlar listede geldiği için `not.toContain` başarısız.

- [ ] **Step 3: `routes/mobilApi.js`'te beş sorguyu güncelle**

`GET /api/mobil/firma/calisanlarimiz` içindeki:
```javascript
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
```
→
```javascript
      'SELECT * FROM calisanlar WHERE firma_id = $1 AND onayli = true ORDER BY created_at DESC',
```

`GET /api/mobil/musteriler/:firmaId/calisanlar` içindeki (aynı metin — bu ikinci geçiş):
```javascript
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
```
→
```javascript
      'SELECT * FROM calisanlar WHERE firma_id = $1 AND onayli = true ORDER BY created_at DESC',
```

> Not: Bu iki sorgu birebir aynı metin. `replace_all` KULLANMA — her birini ayrı ayrı, çevresindeki route bağlamıyla eşleştirerek değiştir (İP-1'de firma/calisanlarimiz eklendiğinde ilki, ikincisi mevcut bayi ucu).

`GET /api/mobil/firma/eczanelerimiz` ve `GET /api/mobil/eczanelerim` içindeki İKİ sorgu (birebir aynı, İP-2'de genişletildi):
```javascript
      `SELECT id, ad, adres, kod, eczaci_kod, musteri_karta_yazildi, musteri_kart_kilitli, eczaci_karta_yazildi, eczaci_kart_kilitli FROM eczaneler WHERE firma_id = $1 ORDER BY created_at DESC`,
```
→ (her ikisi de)
```javascript
      `SELECT id, ad, adres, kod, eczaci_kod, musteri_karta_yazildi, musteri_kart_kilitli, eczaci_karta_yazildi, eczaci_kart_kilitli FROM eczaneler WHERE firma_id = $1 AND onayli = true ORDER BY created_at DESC`,
```

`GET /api/mobil/musteriler` sayacı — mevcut:
```javascript
      `SELECT f.id, f.ad, f.slug, COUNT(c.id) as calisan_sayisi
       FROM firmalar f LEFT JOIN calisanlar c ON c.firma_id = f.id
       WHERE f.bayi_id = $1 GROUP BY f.id ORDER BY f.created_at DESC`,
```
→ (`COUNT(c.id)` → `COUNT(c.id) FILTER (WHERE c.onayli)`):
```javascript
      `SELECT f.id, f.ad, f.slug, COUNT(c.id) FILTER (WHERE c.onayli) as calisan_sayisi
       FROM firmalar f LEFT JOIN calisanlar c ON c.firma_id = f.id
       WHERE f.bayi_id = $1 GROUP BY f.id ORDER BY f.created_at DESC`,
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js -t "calisanlarimiz|eczanelerimiz"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "IP-3: mobil listelerde onayli filtresi + musteriler sayaci"
```

---

### Task 7: Panel UI — onay rozeti/butonu + eczane Excel bölümü

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\views\public\dashboard.ejs`

- [ ] **Step 1: Çalışanlar tablosuna onay rozeti/butonu ekle** — `tab=calisanlar` tablosunda "Durum" hücresini bul:

```html
            <td><span class="badge badge-<%= c.durum %>"><%= c.durum %></span></td>
```
Şununla değiştir (onaysızlara rozet + Onayla butonu eklendi):

```html
            <td>
              <span class="badge badge-<%= c.durum %>"><%= c.durum %></span>
              <% if (!c.onayli) { %>
                <div style="margin-top:6px">
                  <span style="color:#b45309;font-size:12px">⏳ Onay Bekliyor</span>
                  <form method="POST" action="/firma/panel/calisan/<%= c.id %>/onayla" style="display:inline">
                    <button type="submit" class="btn btn-gold btn-sm">Onayla</button>
                  </form>
                </div>
              <% } %>
            </td>
```

- [ ] **Step 2: Raf Kartları tablosuna onay rozeti/butonu ekle** — `tab=raf` tablosunda eczane adı hücresini bul:

```html
            <td><%= e.ad %></td>
            <td><%= e.adres || '-' %></td>
```
Şununla değiştir (ad hücresine onay durumu eklendi):

```html
            <td>
              <%= e.ad %>
              <% if (!e.onayli) { %>
                <div style="margin-top:4px">
                  <span style="color:#b45309;font-size:12px">⏳ Onay Bekliyor</span>
                  <form method="POST" action="/kurumsal/eczane/<%= e.id %>/onayla" style="display:inline"><button type="submit">Onayla</button></form>
                </div>
              <% } %>
            </td>
            <td><%= e.adres || '-' %></td>
```

- [ ] **Step 3: Excel sekmesine eczane bölümü ekle** — `tab=excel` bölümünde mevcut `<div class="excel-card">...</div>`'in kapanışından sonra (çalışan kartından sonra) ikinci bir kart ekle. Mevcut:

```html
      <form method="POST" action="/firma/panel/toplu-yukle" enctype="multipart/form-data">
        <div class="form-group">
          <label>Excel dosyası (.xlsx)</label>
          <input type="file" name="excel" accept=".xlsx,.xls" required>
        </div>
        <button type="submit" class="btn btn-gold" style="height:36px;">Yükle ve İçe Aktar</button>
      </form>
    </div>
```
Şununla değiştir (çalışan kartının kapanışından sonra eczane kartı eklendi):

```html
      <form method="POST" action="/firma/panel/toplu-yukle" enctype="multipart/form-data">
        <div class="form-group">
          <label>Excel dosyası (.xlsx)</label>
          <input type="file" name="excel" accept=".xlsx,.xls" required>
        </div>
        <button type="submit" class="btn btn-gold" style="height:36px;">Yükle ve İçe Aktar</button>
      </form>
    </div>
    <% if (firma.paket === 'kurumsal') { %>
    <div class="excel-card" style="margin-top:20px">
      <h3>Eczane ile toplu yükleme</h3>
      <p>Eczane listesini Excel ile toplu ekleyin. İçe aktarılan eczaneler onaylanana kadar mobilde görünmez.</p>
      <a href="/kurumsal/eczane-sablon" class="btn btn-border" style="margin-bottom:20px;height:36px;">⬇ Eczane Şablonu İndir (.xlsx)</a>
      <form method="POST" action="/kurumsal/eczane-toplu-yukle" enctype="multipart/form-data">
        <div class="form-group">
          <label>Excel dosyası (.xlsx)</label>
          <input type="file" name="excel" accept=".xlsx,.xls" required>
        </div>
        <button type="submit" class="btn btn-gold" style="height:36px;">Yükle ve İçe Aktar</button>
      </form>
    </div>
    <% } %>
```

- [ ] **Step 4: Panelin render olduğunu doğrula (kurumsal.test.js'te bir assertion)** — `tests/kurumsal.test.js` bloğuna ekle:

```javascript
  test('Excel sekmesinde eczane toplu yükleme bölümü görünür', async () => {
    const res = await kurumsalAgent.get('/?tab=excel');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Eczane ile toplu yükleme');
    expect(res.text).toContain('/kurumsal/eczane-sablon');
  });
```

Run: `npx jest tests/kurumsal.test.js -t "Excel sekmesinde eczane"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add views/public/dashboard.ejs tests/kurumsal.test.js
git commit -m "IP-3: panel onay rozeti + eczane excel bolumu UI"
```

---

### Task 8: Tam test + deploy + production doğrulama

**Files:** Yok (komutlar)

- [ ] **Step 1: Tüm backend testleri**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

> Not: Testler arası kalan `firmalar_slug_key` veya benzer çakışma olursa (önceki başarısız koşudan artık veri), ilgili slug'ı `node -e "...DELETE FROM firmalar WHERE slug='...'"` ile temizleyip tekrar çalıştır (bu oturumda birkaç kez yaşandı).

- [ ] **Step 2: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Prod migration**

Run: `node scripts/migrate.js`
Expected: yeni `onayli` ALTER satırları `OK`.

- [ ] **Step 4: Deploy'un canlıya çıkışını doğrula (yeni uca özgü marker)** — eczane şablon ucu deploy öncesi 404, sonrası 200 döner:

```bash
node -e "
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./db');
(async () => {
  const hash = await bcrypt.hash('marker1234', 12);
  await pool.query(\"INSERT INTO firmalar (ad, slug, yetkili_email, kullanici_adi, yetkili_sifre_hash, paket) VALUES ('IP3 Marker','ip3-marker','ip3marker@example.com','ip3marker',\$1,'kurumsal')\", [hash]);
  console.log('marker olusturuldu');
  await pool.end();
})();
"
```

Sonra cookie ile giriş yapıp eczane-sablon'u iste (200 + xlsx içerik-tipi gelene kadar dene):

```bash
for i in $(seq 1 20); do
  curl -s -c /tmp/ip3.txt -X POST https://www.nfckartify.com.tr/giris -d "giris_bilgisi=ip3marker&sifre=marker1234" -o /dev/null
  CT=$(curl -s -b /tmp/ip3.txt -o /dev/null -w "%{content_type}" https://www.nfckartify.com.tr/kurumsal/eczane-sablon)
  echo "Deneme $i: $CT"
  echo "$CT" | grep -q "spreadsheetml" && { echo "BASARILI"; break; }
  sleep 10
done
rm -f /tmp/ip3.txt
```
Expected: `spreadsheetml` içeren content-type → `BASARILI`.

- [ ] **Step 5: Marker'ı temizle**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => { await pool.query(\"DELETE FROM firmalar WHERE slug='ip3-marker'\"); console.log('silindi'); await pool.end(); })();
"
```

- [ ] **Step 6: git durumu**

Run: `git status --short`
Expected: Boş.
