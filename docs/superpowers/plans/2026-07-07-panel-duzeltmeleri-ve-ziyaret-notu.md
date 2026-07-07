# Panel Düzeltmeleri ve Ziyaret Notu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dört bağımsız düzeltme/özelliği tek planda uygula: (1) TikTok/YouTube link oluşturma hatası, (2) eczanelerde toplu onayla/pasife-al/sil + scroll zıplaması düzeltmesi, (3) foto kırpıcının varsayılan konumu (üste yaslı, ortalı değil), (4) Android'de ziyaret kaydına not girme adımı.

**Architecture:** Backend değişiklikleri (kurumsal-kartvizit, Node/Express/EJS/PostgreSQL) TDD ile yazılır, tek deploy'da yayınlanır. Android değişikliği (nfckartify-bayi-android, Kotlin/Compose) ayrı bir derleme+cihaz testi gerektirdiği için son bloktadır.

**Tech Stack:** Node.js/Express, PostgreSQL, EJS, vanilla JS; Kotlin/Jetpack Compose/Retrofit.

---

### Task 1: utils/sosyalMedya.js — TikTok/YouTube link düzeltmesi

**Files:**
- Modify: `utils/sosyalMedya.js`
- Test: `tests/sosyalMedya.test.js`

Kanıtlanmış hata: production'da `tiktok = "#orzax"` girildiğinde `kullaniciAdiTemizle` sadece `@` işaretini temizliyor, `#` kalıyor → `https://tiktok.com/@#orzax` (bozuk, TikTok anasayfaya düşürüyor). `youtube = "@orzaxturkiye"` girildiğinde `urlNormallestir` `@` ile başlayan YouTube kanal biçimini tanımıyor, başına doğrudan `https://` ekliyor → `https://@orzaxturkiye` (geçersiz adres, tarayıcı "sayfa görüntülenemiyor" diyor).

- [ ] **Step 1: Write the failing tests**

`tests/sosyalMedya.test.js` dosyasının sonuna (mevcut `describe` bloklarının dışına, dosya sonuna) ekle:

```javascript
describe('tiktokLinkOlustur — gerçek hata senaryoları', () => {
  test('# ile başlayan kullanıcı adını da linke çevirir', () => {
    expect(tiktokLinkOlustur('#orzax')).toBe('https://tiktok.com/@orzax');
  });

  test('protokolsüz tiktok.com linkini kullanıcı adı sanmaz, https ekler', () => {
    expect(tiktokLinkOlustur('tiktok.com/@orzax')).toBe('https://tiktok.com/@orzax');
  });
});

describe('youtubeLinkOlustur', () => {
  test('@ ile başlayan kanal adını linke çevirir', () => {
    expect(youtubeLinkOlustur('@orzaxturkiye')).toBe('https://youtube.com/@orzaxturkiye');
  });

  test('@ olmadan girilen kanal adını da @ ekleyerek linke çevirir', () => {
    expect(youtubeLinkOlustur('orzaxturkiye')).toBe('https://youtube.com/@orzaxturkiye');
  });

  test('protokolsüz youtube.com linkini kanal adı sanmaz, https ekler', () => {
    expect(youtubeLinkOlustur('youtube.com/channel/UCxxxx')).toBe('https://youtube.com/channel/UCxxxx');
  });

  test('zaten tam link girilmişse dokunmaz', () => {
    expect(youtubeLinkOlustur('https://youtube.com/@orzaxturkiye')).toBe('https://youtube.com/@orzaxturkiye');
  });

  test('boş/null için null döner', () => {
    expect(youtubeLinkOlustur(null)).toBeNull();
    expect(youtubeLinkOlustur('')).toBeNull();
  });
});
```

Dosyanın en üstündeki import satırını güncelle:

```javascript
const { instagramLinkOlustur, twitterLinkOlustur, tiktokLinkOlustur, urlNormallestir, youtubeLinkOlustur } = require('../utils/sosyalMedya');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/sosyalMedya.test.js`
Expected: `youtubeLinkOlustur` tanımsız olduğu için hata; yeni tiktok testleri de `https://tiktok.com/@#orzax` / `https://tiktok.com/@tiktok.com/@orzax` gibi yanlış değer döndüğü için FAIL.

- [ ] **Step 3: Implement the fix**

`utils/sosyalMedya.js` dosyasının tamamını şu içerikle değiştir:

```javascript
function tamLinkMi(deger) {
  return /^https?:\/\//i.test(deger);
}

function kullaniciAdiTemizle(deger) {
  return deger.trim().replace(/^[@#]+/, '');
}

function instagramLinkOlustur(deger) {
  if (!deger) return null;
  if (tamLinkMi(deger)) return deger;
  const kullaniciAdi = kullaniciAdiTemizle(deger);
  return kullaniciAdi ? `https://instagram.com/${kullaniciAdi}` : null;
}

function twitterLinkOlustur(deger) {
  if (!deger) return null;
  if (tamLinkMi(deger)) return deger;
  const kullaniciAdi = kullaniciAdiTemizle(deger);
  return kullaniciAdi ? `https://twitter.com/${kullaniciAdi}` : null;
}

function tiktokLinkOlustur(deger) {
  if (!deger) return null;
  const temiz = deger.trim();
  if (!temiz) return null;
  if (tamLinkMi(temiz)) return temiz;
  if (temiz.toLowerCase().includes('tiktok.com')) return `https://${temiz}`;
  const kullaniciAdi = kullaniciAdiTemizle(temiz);
  return kullaniciAdi ? `https://tiktok.com/@${kullaniciAdi}` : null;
}

function youtubeLinkOlustur(deger) {
  if (!deger) return null;
  const temiz = deger.trim();
  if (!temiz) return null;
  if (tamLinkMi(temiz)) return temiz;
  if (temiz.toLowerCase().includes('youtube.com') || temiz.toLowerCase().includes('youtu.be')) {
    return `https://${temiz}`;
  }
  const kullaniciAdi = kullaniciAdiTemizle(temiz);
  return kullaniciAdi ? `https://youtube.com/@${kullaniciAdi}` : null;
}

function urlNormallestir(deger) {
  if (!deger) return null;
  const temiz = deger.trim();
  if (!temiz) return null;
  return tamLinkMi(temiz) ? temiz : `https://${temiz}`;
}

module.exports = { instagramLinkOlustur, twitterLinkOlustur, tiktokLinkOlustur, youtubeLinkOlustur, urlNormallestir };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/sosyalMedya.test.js`
Expected: tüm testler (eskiler dahil) PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/sosyalMedya.js tests/sosyalMedya.test.js
git commit -m "Fix: TikTok # onekini temizlemiyordu, YouTube @kanal bicimini tanimiyordu"
```

---

### Task 2: routes/public.js — YouTube linklerinde yeni fonksiyonu kullan

**Files:**
- Modify: `routes/public.js`
- Test: `tests/raf.test.js`

- [ ] **Step 1: Write the failing test**

`tests/raf.test.js` dosyasındaki `describe('Raf kartı public sayfası', ...)` bloğunun içine, son testten (`boş alanın tıklaması sayfaya geri döner`) sonra ekle. DİKKAT: bu dosyada eczane kodu değişkeninin adı `eczaneKod` değil `kod`'dur (satır 10: `const kod = 'raftest1'`), firma değişkeni `firmaId`'dir:

```javascript
test('youtube @kanal biçiminde kayıtlıysa tıklayınca doğru adrese yönlendirir', async () => {
  await pool.query('UPDATE firmalar SET youtube = $1 WHERE id = $2', ['@orzaxturkiye', firmaId]);
  const res = await request(app).get(`/raf/${kod}/tikla/youtube`);
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe('https://youtube.com/@orzaxturkiye');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/raf.test.js -t "youtube @kanal"`
Expected: FAIL, `location` `https://@orzaxturkiye` döner.

- [ ] **Step 3: Implement the fix**

`routes/public.js` satır 7'deki import satırını güncelle:

```javascript
const { instagramLinkOlustur, twitterLinkOlustur, tiktokLinkOlustur, urlNormallestir, youtubeLinkOlustur } = require('../utils/sosyalMedya');
```

Satır ~62 civarındaki `/raf/:kod/tikla/:tip` handler'ındaki `hedefler` nesnesinde:

```javascript
      youtube: urlNormallestir(veri.youtube),
```
satırını
```javascript
      youtube: youtubeLinkOlustur(veri.youtube),
```
olarak değiştir.

Satır ~249 civarındaki `/:firmaSlug/:calisanSlug/t/:tip` handler'ındaki `hedefler` nesnesinde de aynı değişikliği yap:
```javascript
      youtube: urlNormallestir(calisan.youtube),
```
→
```javascript
      youtube: youtubeLinkOlustur(calisan.youtube),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/raf.test.js`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/public.js tests/raf.test.js
git commit -m "Fix: raf ve calisan YouTube tiklamalarinda @kanal bicimini destekle"
```

---

### Task 3: DB migration — eczaneler.durum kolonu

**Files:**
- Modify: `scripts/migrate.js`

- [ ] **Step 1: Migration satırını ekle**

`scripts/migrate.js` içindeki migrations dizisinin sonuna (son eleman olan `ALTER TABLE eczaneler DROP COLUMN IF EXISTS yonetici_notu` satırının hemen altına) ekle:

```javascript
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS durum TEXT DEFAULT 'aktif'`,
```

- [ ] **Step 2: Migration'ı lokalde çalıştır (ZORUNLU — sonraki testler bu kolona bağımlı)**

Bu projede test paketi `.env`'deki DATABASE_URL'e (production DB) bağlanır ve otomatik migrate YOKTUR. Task 4/5/6 testleri `eczaneler.durum` kolonuna INSERT/SELECT yapar; kolon yoksa "column durum does not exist" hatası verir. migrate.js `IF NOT EXISTS` ile idempotenttir (önceki görevlerde de bu şekilde çalıştırıldı), güvenle çalıştırılır:

Run: `node scripts/migrate.js`
Expected: hatasız tamamlanır. Doğrula:

```bash
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='eczaneler' AND column_name='durum'\");
  console.log(r.rows.length ? 'durum kolonu VAR' : 'YOK');
  await pool.end();
})();
"
```
Expected çıktı: `durum kolonu VAR`

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate.js
git commit -m "Migration: eczaneler.durum kolonu (aktif/pasif)"
```

(Production'da migration deploy sırasında Task 8'de tekrar çalışacak.)

---

### Task 4: routes/kurumsal.js — Eczane toplu işlem ucu

**Files:**
- Modify: `routes/kurumsal.js`
- Test: `tests/kurumsal.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/kurumsal.test.js` içine, eczane ile ilgili mevcut testlerin yanına (aynı `describe` bloğu içinde, `kurumsalAgent`/`kurumsalId` gibi zaten tanımlı değişkenleri kullanarak) ekle:

```javascript
test('toplu-islem: pasife-al seçilen eczaneleri pasif yapar', async () => {
  const e1 = await pool.query(`INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1,'Toplu Ecz 1','topluecz1') RETURNING id`, [kurumsalId]);
  const e2 = await pool.query(`INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1,'Toplu Ecz 2','topluecz2') RETURNING id`, [kurumsalId]);
  const res = await kurumsalAgent.post('/kurumsal/eczane/toplu-islem').send({
    idler: [e1.rows[0].id, e2.rows[0].id], islem: 'pasife-al',
  });
  expect(res.statusCode).toBe(200);
  expect(res.body.ok).toBe(true);
  const r = await pool.query('SELECT durum FROM eczaneler WHERE id = ANY($1)', [[e1.rows[0].id, e2.rows[0].id]]);
  expect(r.rows.every(row => row.durum === 'pasif')).toBe(true);
  await pool.query('DELETE FROM eczaneler WHERE id = ANY($1)', [[e1.rows[0].id, e2.rows[0].id]]);
});

test('toplu-islem: onayla seçilen eczaneleri onaylar', async () => {
  const e1 = await pool.query(`INSERT INTO eczaneler (firma_id, ad, kod, onayli) VALUES ($1,'Onaysiz Ecz','onaysizecz1', false) RETURNING id`, [kurumsalId]);
  const res = await kurumsalAgent.post('/kurumsal/eczane/toplu-islem').send({
    idler: [e1.rows[0].id], islem: 'onayla',
  });
  expect(res.statusCode).toBe(200);
  const r = await pool.query('SELECT onayli FROM eczaneler WHERE id = $1', [e1.rows[0].id]);
  expect(r.rows[0].onayli).toBe(true);
  await pool.query('DELETE FROM eczaneler WHERE id = $1', [e1.rows[0].id]);
});

test('toplu-islem: sil seçilen eczaneleri kalıcı siler', async () => {
  const e1 = await pool.query(`INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1,'Silinecek Ecz','silinecekecz1') RETURNING id`, [kurumsalId]);
  const res = await kurumsalAgent.post('/kurumsal/eczane/toplu-islem').send({
    idler: [e1.rows[0].id], islem: 'sil',
  });
  expect(res.statusCode).toBe(200);
  const r = await pool.query('SELECT id FROM eczaneler WHERE id = $1', [e1.rows[0].id]);
  expect(r.rows.length).toBe(0);
});

test('toplu-islem: başka firmanın eczanesine dokunmaz', async () => {
  const digerFirma = await pool.query(
    `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket) VALUES ('Diger Firma Ecz','diger-firma-ecz','digerfirmaecz@example.com','x','kurumsal') RETURNING id`
  );
  const eDiger = await pool.query(`INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1,'Diger Ecz','digerecz1') RETURNING id`, [digerFirma.rows[0].id]);
  const res = await kurumsalAgent.post('/kurumsal/eczane/toplu-islem').send({
    idler: [eDiger.rows[0].id], islem: 'sil',
  });
  expect(res.statusCode).toBe(200);
  const r = await pool.query('SELECT id FROM eczaneler WHERE id = $1', [eDiger.rows[0].id]);
  expect(r.rows.length).toBe(1); // silinmedi
  await pool.query('DELETE FROM eczaneler WHERE id = $1', [eDiger.rows[0].id]);
  await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirma.rows[0].id]);
});

test('toplu-islem: geçersiz islem değeri 400 döner', async () => {
  const res = await kurumsalAgent.post('/kurumsal/eczane/toplu-islem').send({ idler: [1], islem: 'gecersiz' });
  expect(res.statusCode).toBe(400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/kurumsal.test.js -t "toplu-islem"`
Expected: FAIL — 404 (uç henüz yok).

- [ ] **Step 3: Implement the endpoint**

`routes/kurumsal.js` içinde `router.post('/eczane/:id/onayla', ...)` bloğunun hemen altına (satır ~306'dan sonra) ekle:

```javascript
// Eczane toplu işlem: onayla / pasife-al / aktif-yap / sil
router.post('/eczane/toplu-islem', async (req, res) => {
  const { idler, islem } = req.body;
  const izinliIslemler = ['onayla', 'pasife-al', 'aktif-yap', 'sil'];
  if (!Array.isArray(idler) || !idler.length || !izinliIslemler.includes(islem)) {
    return res.status(400).json({ ok: false, error: 'Geçersiz istek.' });
  }
  try {
    if (islem === 'onayla') {
      await pool.query('UPDATE eczaneler SET onayli = true WHERE id = ANY($1) AND firma_id = $2', [idler, req.session.firmaId]);
    } else if (islem === 'pasife-al') {
      await pool.query("UPDATE eczaneler SET durum = 'pasif' WHERE id = ANY($1) AND firma_id = $2", [idler, req.session.firmaId]);
    } else if (islem === 'aktif-yap') {
      await pool.query("UPDATE eczaneler SET durum = 'aktif' WHERE id = ANY($1) AND firma_id = $2", [idler, req.session.firmaId]);
    } else if (islem === 'sil') {
      await pool.query('DELETE FROM eczaneler WHERE id = ANY($1) AND firma_id = $2', [idler, req.session.firmaId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'İşlem başarısız.' });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/kurumsal.test.js`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "Feat: eczane toplu onayla/pasife-al/sil ucu"
```

---

### Task 5: routes/mobilApi.js — Pasif eczaneleri mobilden gizle

**Files:**
- Modify: `routes/mobilApi.js`
- Test: `tests/mobilApi.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/mobilApi.test.js` içinde `/eczanelerim` ve `/firma/eczanelerimiz` testlerinin bulunduğu `describe` bloklarına ekle (dosyadaki mevcut `firmaId`/`token`/`eczaneId` değişken adlarını kullan):

```javascript
test('pasif durumdaki eczane listede görünmez', async () => {
  const pasifEcz = await pool.query(
    `INSERT INTO eczaneler (firma_id, ad, kod, durum) VALUES ($1,'Pasif Ecz Mobil','pasifeczmobil1','pasif') RETURNING id`,
    [firmaId]
  );
  const res = await request(app).get('/api/mobil/eczanelerim').set('Authorization', `Bearer ${token}`);
  expect(res.statusCode).toBe(200);
  expect(res.body.eczaneler.find(e => e.id === pasifEcz.rows[0].id)).toBeUndefined();
  await pool.query('DELETE FROM eczaneler WHERE id = $1', [pasifEcz.rows[0].id]);
});
```

(Bu testi `/eczanelerim` ucunu test eden `describe` bloğunun içine ekle; `/firma/eczanelerimiz` ucu için de aynı desende ayrı bir test ekle, o bloktaki `firmaToken`/`firmaId` değişkenlerini kullanarak.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/mobilApi.test.js -t "pasif durumdaki eczane"`
Expected: FAIL — pasif eczane hâlâ listede dönüyor.

- [ ] **Step 3: Implement the fix**

`routes/mobilApi.js` satır 137 (`/firma/eczanelerimiz`) ve satır 270 (`/eczanelerim`) sorgularındaki:

```sql
WHERE firma_id = $1 AND onayli = true
```

kısmını ikisinde de şu şekilde değiştir:

```sql
WHERE firma_id = $1 AND onayli = true AND durum = 'aktif'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/mobilApi.test.js`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Fix: pasif eczaneler mobil uclarda gorunmesin"
```

---

### Task 6: views/public/dashboard.ejs — Toplu seçim UI + scroll koruma + Pasif Eczaneler bölümü

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] **Step 1: Aktif/pasif eczane ayrımı ve checkbox'lı tablo**

Satır 520-579 civarındaki (Raf Kartları tab'ındaki eczane tablosu) bloğu bul:

```html
    <div class="table-wrap">
      <table>
        <thead><tr><th>Eczane</th><th>Adres</th><th>Kart Linki</th><th>Okutma</th><th>Kart Durumu</th><th>Eczacı Kartı</th><th></th></tr></thead>
        <tbody>
          <% eczaneler.forEach(e => { %>
```

Bunu şu şekilde değiştir (checkbox sütunu + toplu işlem araç çubuğu + `aktifEczaneler` filtresi eklendi):

```html
    <% const aktifEczaneler = eczaneler.filter(e => e.durum !== 'pasif'); const pasifEczaneler = eczaneler.filter(e => e.durum === 'pasif'); %>
    <div class="table-wrap" style="padding:12px 20px;margin-bottom:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button type="button" id="eczaneTopluOnaylaBtn" disabled onclick="eczaneTopluIslem('onayla')">✓ Toplu Onayla</button>
      <button type="button" id="eczaneTopluPasifBtn" disabled onclick="eczaneTopluIslem('pasife-al')">⏸ Toplu Pasife Al</button>
      <button type="button" id="eczaneTopluSilBtn" disabled onclick="eczaneTopluIslem('sil')" style="color:#b91c1c">🗑 Toplu Sil</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th><input type="checkbox" id="eczaneTumSec" onchange="eczaneTumSecToggle(this)"></th><th>Eczane</th><th>Adres</th><th>Kart Linki</th><th>Okutma</th><th>Kart Durumu</th><th>Eczacı Kartı</th><th></th></tr></thead>
        <tbody>
          <% aktifEczaneler.forEach(e => { %>
```

- [ ] **Step 2: Satır içine checkbox td ekle**

Aynı blok içinde, satırın ilk `<td>`'sinden önce (yani `<%= e.ad %>` içeren `<td>`'den hemen önce) yeni bir `<td>` ekle. Bul:

```html
          <tr>
            <td>
              <%= e.ad %>
```

Değiştir:

```html
          <tr>
            <td><input type="checkbox" class="eczane-sec" value="<%= e.id %>"></td>
            <td>
              <%= e.ad %>
```

Bu değişiklik `colspan="7"` olan boş-liste satırını da etkiler; bul:

```html
          <% if (!eczaneler.length) { %><tr><td colspan="7">Henüz eczane eklenmemiş.</td></tr><% } %>
```

Değiştir:

```html
          <% if (!aktifEczaneler.length) { %><tr><td colspan="8">Aktif eczane yok.</td></tr><% } %>
```

- [ ] **Step 3: "Onayla" ve "Sil" butonlarını tek eczane işlemine bağla, Pasife Al butonu ekle**

Satırın son `<td>`'sindeki (Detay/Sil butonları) mevcut kodu bul:

```html
            <td>
              <button type="button" onclick="eczaneDetayGoster(<%= e.id %>, '<%= e.ad.replace(/'/g, "\\'") %>')" style="margin-right:6px">Detay</button>
              <form method="POST" action="\kurumsal\eczane\<%= e.id %>\sil" style="display:inline"
                    onsubmit="return confirm('<%= e.ad %> silinsin mi? Okutma geçmişi de silinir.')">
                <button type="submit">Sil</button>
              </form>
            </td>
```

Değiştir:

```html
            <td>
              <button type="button" onclick="eczaneDetayGoster(<%= e.id %>, '<%= e.ad.replace(/'/g, "\\'") %>')" style="margin-right:6px">Detay</button>
              <button type="button" onclick="eczaneTekIslem(<%= e.id %>, 'pasife-al')" style="margin-right:6px">Pasife Al</button>
              <form method="POST" action="\kurumsal\eczane\<%= e.id %>\sil" style="display:inline"
                    onsubmit="return confirm('<%= e.ad %> silinsin mi? Okutma geçmişi de silinir.')">
                <button type="submit">Sil</button>
              </form>
            </td>
```

Ayrıca "Onayla" butonunu tam sayfa reload'dan AJAX'a çevir. Bul:

```html
              <% if (!e.onayli) { %>
                <div style="margin-top:4px">
                  <span style="color:#b45309;font-size:12px">⏳ Onay Bekliyor</span>
                  <form method="POST" action="/kurumsal/eczane/<%= e.id %>/onayla" style="display:inline"><button type="submit">Onayla</button></form>
                </div>
              <% } %>
```

Değiştir:

```html
              <% if (!e.onayli) { %>
                <div style="margin-top:4px">
                  <span style="color:#b45309;font-size:12px">⏳ Onay Bekliyor</span>
                  <button type="button" onclick="eczaneTekIslem(<%= e.id %>, 'onayla')">Onayla</button>
                </div>
              <% } %>
```

- [ ] **Step 4: Pasif Eczaneler bölümünü ekle**

Eczaneler tablosunun kapanışından hemen sonra (mevcut `</tbody></table></div>` bloğunun ardından, Raf Kartları tab'ının kapanışından önce) ekle:

```html
    <% if (pasifEczaneler.length) { %>
    <details class="table-wrap" style="padding:0;margin-top:16px">
      <summary style="padding:16px 20px;cursor:pointer;font-weight:600">Pasif Eczaneler (<%= pasifEczaneler.length %>)</summary>
      <table>
        <thead><tr><th>Eczane</th><th>Adres</th><th></th></tr></thead>
        <tbody>
          <% pasifEczaneler.forEach(e => { %>
          <tr>
            <td><%= e.ad %></td>
            <td><%= e.adres || '-' %></td>
            <td><button type="button" onclick="eczaneTekIslem(<%= e.id %>, 'aktif-yap')">Aktif Yap</button></td>
          </tr>
          <% }) %>
        </tbody>
      </table>
    </details>
    <% } %>
```

- [ ] **Step 5: JS fonksiyonlarını ekle (scroll korumalı toplu işlem)**

`eczaneDetayGoster` fonksiyonunun tanımlandığı `<script>` bloğunda, o fonksiyonun hemen üstüne veya altına ekle:

```javascript
  async function eczaneIslemGonder(idler, islem) {
    if (islem === 'sil' && !confirm(idler.length + ' eczane silinsin mi? Okutma geçmişi de silinir.')) return;
    if (islem === 'pasife-al' && !confirm(idler.length + ' eczane pasife alınsın mı?')) return;
    sessionStorage.setItem('eczaneScrollY', String(window.scrollY));
    try {
      const res = await fetch('/kurumsal/eczane/toplu-islem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idler, islem }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        alert('İşlem başarısız.');
      }
    } catch (err) {
      alert('Bağlantı hatası.');
    }
  }

  function eczaneTekIslem(id, islem) {
    eczaneIslemGonder([id], islem);
  }

  function eczaneSecilenler() {
    return [...document.querySelectorAll('.eczane-sec:checked')].map(el => Number(el.value));
  }

  function eczaneTopluIslem(islem) {
    const idler = eczaneSecilenler();
    if (!idler.length) return;
    eczaneIslemGonder(idler, islem);
  }

  function eczaneTumSecToggle(kaynak) {
    document.querySelectorAll('.eczane-sec').forEach(el => { el.checked = kaynak.checked; });
    eczaneToplaButonDurumu();
  }

  function eczaneToplaButonDurumu() {
    const varMi = eczaneSecilenler().length > 0;
    ['eczaneTopluOnaylaBtn', 'eczaneTopluPasifBtn', 'eczaneTopluSilBtn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !varMi;
    });
  }

  document.addEventListener('change', (e) => {
    if (e.target.classList && e.target.classList.contains('eczane-sec')) eczaneToplaButonDurumu();
  });

  // 'load' kullanılıyor ('DOMContentLoaded' değil): tablo tam yerleşmeden
  // scrollTo hedefe ulaşamayabilir.
  window.addEventListener('load', () => {
    const kayitliScroll = sessionStorage.getItem('eczaneScrollY');
    if (kayitliScroll !== null) {
      window.scrollTo(0, Number(kayitliScroll));
      sessionStorage.removeItem('eczaneScrollY');
    }
  });
```

- [ ] **Step 6: Manuel tarayıcı doğrulaması**

Kod değişikliği JS/CSS görünürlüğü içerdiği için otomatik test yerine gerçek tarayıcıda doğrula (bu oturumda daha önce z-index ve display:none hatalarının otomatik testlerden kaçtığı biliniyor — ekran görüntüsü şart):
1. `preview_start` ile sunucuyu başlat, kurumsal bir firma ile giriş yap.
2. Raf Kartları sekmesine git, en az 2 onaysız eczane oluştur (Excel toplu yükleme veya doğrudan DB ile).
3. İki eczaneyi checkbox ile seç, "Toplu Onayla"ya bas → `preview_screenshot` ile sayfanın scroll pozisyonunun korunduğunu ve "⏳ Onay Bekliyor" etiketlerinin kalktığını doğrula.
4. Tek bir eczanede "Pasife Al"a bas → eczanenin "Pasif Eczaneler" bölümüne taşındığını doğrula.
5. "Aktif Yap" ile geri al, doğrula.

- [ ] **Step 7: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "Feat: eczanelerde toplu onayla/pasife-al/sil + scroll korumali AJAX"
```

---

### Task 7: public/js/foto-kirpici.js — Varsayılan konumu üste yasla

**Files:**
- Modify: `public/js/foto-kirpici.js`

Kanıtlanmış hata: kırpıcı modalı açılınca görselin dikey eksende ortasını gösteriyor. Dikey (portre) fotoğraflarda yüz genelde üst bölgede olduğu için, kullanıcı elle kaydırmazsa kafa kesik çıkıyor. Bu davranış hem çalışan fotoğrafı hem firma logosu için aynı bileşeni (`fotoKirpiciArayuzOlustur`) kullanır; logo genelde yatay olduğundan (dikeyde boşluk kalmadığından) bu değişiklik logoyu etkilemez.

- [ ] **Step 1: Varsayılan dikey konumu değiştir**

`public/js/foto-kirpici.js` içinde bul:

```javascript
  let olcek = minOlcek;
  let konumX = (FOTO_KIRPICI_VIEWPORT - img.naturalWidth * olcek) / 2;
  let konumY = (FOTO_KIRPICI_VIEWPORT - img.naturalHeight * olcek) / 2;
```

Değiştir:

```javascript
  let olcek = minOlcek;
  let konumX = (FOTO_KIRPICI_VIEWPORT - img.naturalWidth * olcek) / 2;
  // Varsayılan olarak üste yasla (ortalamak yerine) — portre fotoğraflarda yüz
  // genelde üst bölgede olur, ortalanmış kırpma kafayı kesiyordu.
  let konumY = 0;
```

- [ ] **Step 2: Reproduksiyon öncesi/sonrası doğrulama**

Bu dosya için proje kararı gereği (bkz. `docs/superpowers/specs/2026-07-07-foto-kirpici-ve-uyari-design.md`) otomatik test yazılmıyor, gerçek tarayıcıda doğrulanıyor:

1. `preview_eval` ile 400×700 boyutlu, üstte sarı bir daire ("kafa") içeren sentetik bir görsel oluşturup `#f_foto` inputuna enjekte et (bu oturumda daha önce aynı yöntem kullanıldı).
2. Değişiklik öncesi `preview_screenshot` al — dairenin üstten kesik olduğunu doğrula (regresyon kanıtı, zaten bu görevin başında alındı).
3. Değişikliği uygula, sunucuyu yeniden yükle, aynı adımı tekrarla — `preview_screenshot` ile dairenin artık tam göründüğünü doğrula.
4. Aynı testi firma logosu inputu (`#logoInput`) için de tekrarla, yatay bir test görseliyle (örn. 400×150) — davranışın değişmediğini (zaten tam görünür olduğunu) doğrula.

- [ ] **Step 3: Commit**

```bash
git add public/js/foto-kirpici.js
git commit -m "Fix: foto kirpici varsayilan konumu ortalama yerine uste yasla"
```

---

### Task 8: Backend tam test + deploy + prod doğrulama

**Files:** (yok — doğrulama görevi)

- [ ] **Step 1: Tüm test paketini çalıştır**

Run: `npx jest`
Expected: tüm test dosyaları PASS, 0 fail.

- [ ] **Step 2: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Deploy tamamlanmasını bekle, migration'ı doğrula**

`mcp__railway__list_deployments` ile son deploy'un `SUCCESS` olduğunu doğrula. Ardından production DB'de `eczaneler.durum` kolonunun oluştuğunu doğrula:

```bash
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='eczaneler' AND column_name='durum'\");
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
"
```

- [ ] **Step 4: Marker firma ile prod doğrulama**

Marker firma oluştur (tiktok=`#test`, youtube=`@testkanal` ile), curl ile giriş yap, `/raf/:kod/tikla/tiktok` ve `/raf/:kod/tikla/youtube` uçlarının doğru `Location` header'ı döndürdüğünü doğrula. `/kurumsal/eczane/toplu-islem` ucuna gerçek bir istek atıp `durum` alanının değiştiğini doğrula. Sonunda marker verilerini sil, `git status --short` ile repo'nun temiz olduğunu doğrula.

- [ ] **Step 5: Commit**

Bu görevde kod değişikliği yok, commit gerekmiyor.

---

### Task 9: Android — ApiService.kt ziyaret notu alanı

**Files:**
- Modify: `app/src/main/java/com/nfckartify/bayi/data/ApiService.kt`
- Test: `app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt`

Backend zaten `not` alanını destekliyor (`routes/mobilApi.js` `ziyaret-kaydet` ucu, bu oturumda başka bir laptoptan zaten deploy edildi — bkz. commit `b01c400`). Eksik olan Android tarafının bu alanı göndermesi.

- [ ] **Step 1: Mevcut testi güncelle (failing hale getir)**

`app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt` içinde bul:

```kotlin
        val cevap = servis.ziyaretKaydet("Bearer test-token", "abc123kd")
```

Değiştir:

```kotlin
        val cevap = servis.ziyaretKaydet("Bearer test-token", "abc123kd", "Eczacı stok yetersiz dedi")
```

Aynı dosyada yeni bir test ekle (mevcut `ziyaretKaydet basarili cevabi eczane adiyla doner` testinin altına):

```kotlin
    @Test
    fun `ziyaretKaydet not olmadan da cagrilabilir`() = runBlocking {
        server.enqueue(
            MockResponse().setBody("""{"ok":true,"eczaneAdi":"Merkez Eczane"}""").setResponseCode(201)
        )

        val cevap = servis.ziyaretKaydet("Bearer test-token", "abc123kd", null)

        assertTrue(cevap.isSuccessful)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew testDebugUnitTest --tests "*ApiServiceTest*"`
Expected: derleme hatası — `ziyaretKaydet` 3 parametre kabul etmiyor.

- [ ] **Step 3: ApiService.kt'yi güncelle**

`app/src/main/java/com/nfckartify/bayi/data/ApiService.kt` içinde bul:

```kotlin
    @FormUrlEncoded
    @POST("api/mobil/ziyaret-kaydet")
    suspend fun ziyaretKaydet(
        @Header("Authorization") yetki: String,
        @Field("eczane_kod") eczaneKod: String,
    ): Response<ZiyaretKaydetCevap>
```

Değiştir:

```kotlin
    @FormUrlEncoded
    @POST("api/mobil/ziyaret-kaydet")
    suspend fun ziyaretKaydet(
        @Header("Authorization") yetki: String,
        @Field("eczane_kod") eczaneKod: String,
        @Field("not") not: String?,
    ): Response<ZiyaretKaydetCevap>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew testDebugUnitTest --tests "*ApiServiceTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/data/ApiService.kt app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt
git commit -m "Feat: ziyaretKaydet API cagrisina not alani eklendi"
```

---

### Task 10: Android — ZiyaretKaydetViewModel.kt not girme adımı

**Files:**
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetViewModel.kt`

- [ ] **Step 1: ViewModel'i güncelle**

`app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetViewModel.kt` dosyasının tamamını şu içerikle değiştir:

```kotlin
package com.nfckartify.bayi.ui

import android.nfc.Tag
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.TokenDeposu
import com.nfckartify.bayi.data.hataMesajiAl
import kotlinx.coroutines.launch

enum class ZiyaretKaydetDurumu { KART_BEKLENIYOR, NOT_GIRILIYOR, KAYDEDILIYOR, KAYDEDILDI, HATA }

private val ECZANE_KOD_DESENI = Regex("/raf/([a-z0-9]+)")

class ZiyaretKaydetViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var durum by mutableStateOf(ZiyaretKaydetDurumu.KART_BEKLENIYOR)
        private set
    var hataMesaji by mutableStateOf<String?>(null)
        private set
    var oturumSuresiDoldu by mutableStateOf(false)
        private set
    var kaydedilenEczaneAdi by mutableStateOf<String?>(null)
        private set
    var not by mutableStateOf("")
        private set

    private var algilananEczaneKodu: String? = null

    fun tagAlgilandi(tag: Tag) {
        if (durum == ZiyaretKaydetDurumu.KAYDEDILIYOR || durum == ZiyaretKaydetDurumu.NOT_GIRILIYOR) return
        val url = tagdanUrlOku(tag)
        val kod = url?.let { ECZANE_KOD_DESENI.find(it)?.groupValues?.get(1) }
        if (kod == null) {
            durum = ZiyaretKaydetDurumu.HATA
            oturumSuresiDoldu = false
            hataMesaji = "Bu kart bir eczane raf kartı değil."
            return
        }
        algilananEczaneKodu = kod
        not = ""
        durum = ZiyaretKaydetDurumu.NOT_GIRILIYOR
    }

    fun notDegisti(yeniNot: String) {
        not = yeniNot
    }

    fun notuKaydet() {
        val kod = algilananEczaneKodu ?: return
        ziyaretiKaydet(kod, not.trim().ifEmpty { null })
    }

    private fun ziyaretiKaydet(eczaneKod: String, notMetni: String?) {
        val token = tokenDeposu.temsilciTokenAl() ?: run {
            durum = ZiyaretKaydetDurumu.HATA
            oturumSuresiDoldu = true
            hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
            return
        }
        durum = ZiyaretKaydetDurumu.KAYDEDILIYOR
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.ziyaretKaydet("Bearer $token", eczaneKod, notMetni)
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    kaydedilenEczaneAdi = govde.eczaneAdi
                    durum = ZiyaretKaydetDurumu.KAYDEDILDI
                    oturumSuresiDoldu = false
                    hataMesaji = null
                } else if (cevap.code() == 401) {
                    durum = ZiyaretKaydetDurumu.HATA
                    oturumSuresiDoldu = true
                    hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
                } else {
                    durum = ZiyaretKaydetDurumu.HATA
                    oturumSuresiDoldu = false
                    hataMesaji = govde?.error ?: hataMesajiAl(cevap.errorBody()) ?: "Ziyaret kaydedilemedi."
                }
            } catch (e: Exception) {
                durum = ZiyaretKaydetDurumu.HATA
                oturumSuresiDoldu = false
                hataMesaji = "Bağlantı hatası: ${e.message}"
            }
        }
    }

    fun tekrarDene() {
        durum = ZiyaretKaydetDurumu.KART_BEKLENIYOR
        hataMesaji = null
        oturumSuresiDoldu = false
        kaydedilenEczaneAdi = null
        algilananEczaneKodu = null
        not = ""
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetViewModel.kt
git commit -m "Feat: ziyaret kaydinda kart okuma ile kayit arasina not girme adimi eklendi"
```

---

### Task 11: Android — ZiyaretKaydetEkrani.kt UI

**Files:**
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetEkrani.kt`

- [ ] **Step 1: Not girme ekranını ekle**

`app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetEkrani.kt` dosyasının tamamını şu içerikle değiştir:

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nfckartify.bayi.data.NfcOlayYayini

@Composable
fun ZiyaretKaydetEkrani(viewModel: ZiyaretKaydetViewModel, girisEkraninaDon: () -> Unit) {
    val algilananTag by NfcOlayYayini.algilananTag.collectAsState()

    LaunchedEffect(algilananTag) {
        val tag = algilananTag ?: return@LaunchedEffect
        viewModel.tagAlgilandi(tag)
        NfcOlayYayini.temizle()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Ziyaret Kaydet", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(24.dp))

        when (viewModel.durum) {
            ZiyaretKaydetDurumu.KART_BEKLENIYOR -> {
                Text("Eczanedeki raf kartını telefonun arkasına yaklaştırın.")
            }
            ZiyaretKaydetDurumu.NOT_GIRILIYOR -> {
                Text("Kart okundu. İsterseniz bu ziyaret için bir not ekleyin.")
                Spacer(modifier = Modifier.padding(12.dp))
                OutlinedTextField(
                    value = viewModel.not,
                    onValueChange = { viewModel.notDegisti(it) },
                    label = { Text("Not (opsiyonel)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.padding(16.dp))
                Button(onClick = { viewModel.notuKaydet() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Kaydet")
                }
            }
            ZiyaretKaydetDurumu.KAYDEDILIYOR -> {
                CircularProgressIndicator()
                Text("Kaydediliyor, kartı telefondan çekmeyin...")
            }
            ZiyaretKaydetDurumu.KAYDEDILDI -> {
                Text(
                    "Ziyaret kaydedildi: ${viewModel.kaydedilenEczaneAdi ?: ""}",
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(modifier = Modifier.padding(16.dp))
                Button(onClick = { viewModel.tekrarDene() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Başka Kart Okut")
                }
            }
            ZiyaretKaydetDurumu.HATA -> {
                Text(viewModel.hataMesaji ?: "Kaydedilemedi.", color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.padding(16.dp))
                if (viewModel.oturumSuresiDoldu) {
                    Button(onClick = girisEkraninaDon, modifier = Modifier.fillMaxWidth()) {
                        Text("Giriş Ekranına Dön")
                    }
                } else {
                    Button(onClick = { viewModel.tekrarDene() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Tekrar Dene")
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetEkrani.kt
git commit -m "Feat: ziyaret kaydet ekranina not girme adimi UI"
```

---

### Task 12: Android tam derleme + cihazda gerçek test

**Files:** (yok — doğrulama görevi)

- [ ] **Step 1: Unit testleri çalıştır**

Run: `./gradlew testDebugUnitTest`
Expected: tüm testler PASS.

- [ ] **Step 2: Derle**

Run: `./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Cihazda gerçek kart ile uçtan uca test**

APK'yı cihaza kur, temsilci olarak giriş yap, gerçek bir eczane raf kartını okut:
1. Kart okunduktan sonra "Not (opsiyonel)" ekranının açıldığını doğrula.
2. Bir not yazıp "Kaydet"e bas → "Ziyaret kaydedildi" ekranının çıktığını doğrula.
3. Firma panelinde (web) Saha İstatistikleri sekmesinde bu notun göründüğünü doğrula.
4. Tekrar kart okut, bu sefer notu boş bırakıp "Kaydet"e bas → kaydın notsuz düştüğünü DB'den doğrula.

- [ ] **Step 4: Commit**

Bu görevde kod değişikliği yok, commit gerekmiyor.
