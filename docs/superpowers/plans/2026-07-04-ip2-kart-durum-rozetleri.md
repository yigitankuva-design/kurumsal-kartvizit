# İP-2 — Kart Durum Rozetleri & Envanter Özeti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bir kartın yazılıp yazılmadığını ve kilitli olup olmadığını hem mobilde hem web panelde rozetle göster; NFC yazımı başarılı olunca durumu otomatik işaretle; yetkili elle de işaretleyebilsin.

**Architecture:** `calisanlar` ve `eczaneler` tablolarına durum kolonları eklenir (eczanede müşteri ve eczacı kartı için ayrı ayrı). Mobil NFC yazımı başarılı olunca tek bir `POST /api/mobil/kart-yazildi` ucu çağrılır; bu uç token'ı payload alan adına göre (bayi/temsilci/firma) çözer ve tenant izolasyonu uygular. Liste ekranları/panel tabloları yeni kolonları rozet olarak render eder.

**Tech Stack:** Backend: Node/Express, PostgreSQL, Jest+supertest. Android: Kotlin, Compose, Retrofit.

**İki repo:**
- Backend: `C:\Users\muham\kurumsal-kartvizit` (git + GitHub, Railway deploy)
- Android: `C:\Users\muham\nfckartify-bayi-android` (git, remote YOK)

**Android komutları (PowerShell):**
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat <görev>
```

---

## BÖLÜM A — BACKEND

### Task 1: DB migration (durum kolonları)

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\scripts\migrate.js`

- [ ] **Step 1: `scripts/migrate.js`'e migrationları ekle** — `migrations` dizisinin son elemanından (`eczaci_okutmalar` CREATE TABLE) sonra, dizinin kapanış `];`'inden önce ekle:

```javascript
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS karta_yazildi BOOLEAN DEFAULT false`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS kart_kilitli BOOLEAN DEFAULT false`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS kart_yazma_tarihi TIMESTAMP`,
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS musteri_karta_yazildi BOOLEAN DEFAULT false`,
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS musteri_kart_kilitli BOOLEAN DEFAULT false`,
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS musteri_kart_yazma_tarihi TIMESTAMP`,
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS eczaci_karta_yazildi BOOLEAN DEFAULT false`,
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS eczaci_kart_kilitli BOOLEAN DEFAULT false`,
    `ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS eczaci_kart_yazma_tarihi TIMESTAMP`,
```

- [ ] **Step 2: Migration'ı çalıştır**

Run: `cd /c/Users/muham/kurumsal-kartvizit && node scripts/migrate.js`
Expected: Her satır için `OK: ...`, sonda `Migration tamamlandı.`

- [ ] **Step 3: Kolonların oluştuğunu doğrula**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const r = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='eczaneler' AND column_name LIKE '%karta_yazildi'\");
  console.log(r.rows.map(x => x.column_name));
  await pool.end();
})();
"
```
Expected: `[ 'musteri_karta_yazildi', 'eczaci_karta_yazildi' ]`

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.js
git commit -m "IP-2: kart durum kolonlari migration"
```

---

### Task 2: `POST /api/mobil/kart-yazildi` ucu

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\mobilApi.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\mobilApi.test.js`

- [ ] **Step 1: Başarısız test bloğunu yaz** — `tests/mobilApi.test.js`'te son `describe`'dan (`eczanelerim`) ÖNCE ekle (bu blok sonuncu olmayacağı için `pool.end()` KOYMA):

```javascript
describe('Mobil API — /api/mobil/kart-yazildi', () => {
  let firmaId, calisanId, eczaneId, firmaToken;

  beforeAll(async () => {
    const { firmaTokenUret } = require('../utils/jwt');
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Kart Yazildi Test', 'kart-yazildi-test', 'ky1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = f.rows[0].id;
    firmaToken = firmaTokenUret(firmaId);
    const c = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Kart', 'Test', 'kart-test-ky') RETURNING id`,
      [firmaId]
    );
    calisanId = c.rows[0].id;
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'KY Eczane', 'kymus001', 'kyecz001') RETURNING id`,
      [firmaId]
    );
    eczaneId = e.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).post('/api/mobil/kart-yazildi').send({ tip: 'calisan', id: calisanId });
    expect(res.statusCode).toBe(401);
  });

  test('geçersiz tip 400 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .send({ tip: 'gecersiz', id: calisanId });
    expect(res.statusCode).toBe(400);
  });

  test('çalışan kartını yazıldı işaretler', async () => {
    const res = await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .send({ tip: 'calisan', id: calisanId, kilitli: false });
    expect(res.statusCode).toBe(200);
    const c = await pool.query('SELECT karta_yazildi, kart_kilitli FROM calisanlar WHERE id = $1', [calisanId]);
    expect(c.rows[0].karta_yazildi).toBe(true);
    expect(c.rows[0].kart_kilitli).toBe(false);
  });

  test('eczane müşteri ve eczacı kartını bağımsız işaretler', async () => {
    await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .send({ tip: 'musteri', id: eczaneId, kilitli: true });
    let e = await pool.query('SELECT musteri_karta_yazildi, musteri_kart_kilitli, eczaci_karta_yazildi FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(e.rows[0].musteri_karta_yazildi).toBe(true);
    expect(e.rows[0].musteri_kart_kilitli).toBe(true);
    expect(e.rows[0].eczaci_karta_yazildi).toBe(false);

    await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .send({ tip: 'eczaci', id: eczaneId });
    e = await pool.query('SELECT eczaci_karta_yazildi FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(e.rows[0].eczaci_karta_yazildi).toBe(true);
  });

  test('başka firmanın kartında 403 döner', async () => {
    const { firmaTokenUret } = require('../utils/jwt');
    const d = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('KY Diger', 'ky-diger', 'ky2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    const digerToken = firmaTokenUret(d.rows[0].id);
    const res = await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${digerToken}`)
      .send({ tip: 'calisan', id: calisanId });
    expect(res.statusCode).toBe(403);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [d.rows[0].id]);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -t "kart-yazildi"`
Expected: FAIL — 404 (route yok)

- [ ] **Step 3: `routes/mobilApi.js` importunu güncelle** — 5. satırdaki jwt importuna `Dogrula` fonksiyonlarını ekle:

```javascript
const { bayiTokenUret, calisanTokenUret, firmaTokenUret, firmaTokenDogrula, calisanTokenDogrula, bayiTokenDogrula } = require('../utils/jwt');
```

- [ ] **Step 4: `routes/mobilApi.js`'e yardımcı + route ekle** — `firma/eczanelerimiz` route'undan sonra (`module.exports = router;`'dan önce):

```javascript
async function tokenSahibiCoz(token) {
  let payload;
  try {
    payload = firmaTokenDogrula(token);
  } catch {
    return null;
  }
  if (payload.firmaId != null) {
    return { tur: 'firma', firmaId: payload.firmaId };
  }
  if (payload.calisanId != null) {
    const c = await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [payload.calisanId]);
    return c.rows.length ? { tur: 'calisan', firmaId: c.rows[0].firma_id } : null;
  }
  if (payload.bayiId != null) {
    return { tur: 'bayi', bayiId: payload.bayiId };
  }
  return null;
}

router.post('/kart-yazildi', mobilProfilLimiter, async (req, res) => {
  const { tip, id, kilitli } = req.body;
  if (!tip || !id || !['calisan', 'musteri', 'eczaci'].includes(tip)) {
    return res.status(400).json({ ok: false, error: 'tip ve id zorunlu.' });
  }
  const header = req.headers.authorization || '';
  const [bearerTip, token] = header.split(' ');
  if (bearerTip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  const sahip = await tokenSahibiCoz(token);
  if (!sahip) {
    return res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
  try {
    const hedefFirmaId = tip === 'calisan'
      ? (await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [id])).rows[0]?.firma_id
      : (await pool.query('SELECT firma_id FROM eczaneler WHERE id = $1', [id])).rows[0]?.firma_id;
    if (!hedefFirmaId) {
      return res.status(404).json({ ok: false, error: 'Kayıt bulunamadı.' });
    }
    if (sahip.tur === 'bayi') {
      const f = await pool.query('SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2', [hedefFirmaId, sahip.bayiId]);
      if (!f.rows.length) return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    } else if (hedefFirmaId !== sahip.firmaId) {
      return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    }

    if (tip === 'calisan') {
      await pool.query(
        'UPDATE calisanlar SET karta_yazildi = true, kart_kilitli = $1, kart_yazma_tarihi = NOW() WHERE id = $2',
        [!!kilitli, id]
      );
    } else {
      const kolonOn = tip === 'musteri' ? 'musteri' : 'eczaci';
      await pool.query(
        `UPDATE eczaneler SET ${kolonOn}_karta_yazildi = true, ${kolonOn}_kart_kilitli = $1, ${kolonOn}_kart_yazma_tarihi = NOW() WHERE id = $2`,
        [!!kilitli, id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 5: Eczane liste uçlarının SELECT'lerini genişlet** — bu iki uç açık kolon listesi kullanıyor (`SELECT *` değil), yeni durum kolonlarını EKLEMEDEN rozetler mobilde hiç dolmaz. `routes/mobilApi.js`'te İKİ yerde:

`/eczanelerim` route'undaki sorguyu bul:
```javascript
      `SELECT id, ad, adres, kod, eczaci_kod FROM eczaneler WHERE firma_id = $1 ORDER BY created_at DESC`,
```
İKİ kez geçiyor (biri `/eczanelerim`, biri `/firma/eczanelerimiz`) — HER İKİSİNİ de şuna çevir:
```javascript
      `SELECT id, ad, adres, kod, eczaci_kod, musteri_karta_yazildi, musteri_kart_kilitli, eczaci_karta_yazildi, eczaci_kart_kilitli FROM eczaneler WHERE firma_id = $1 ORDER BY created_at DESC`,
```

> Not: `firma/calisanlarimiz` ve `musteriler/:firmaId/calisanlar` uçları `SELECT *`
> kullandığı için `karta_yazildi`/`kart_kilitli` zaten dönüyor — çalışan uçlarında
> değişiklik gerekmez.

- [ ] **Step 6: Eczane SELECT testini ekle** — `kart-yazildi` describe bloğuna bir test daha ekle (eczane liste ucunun yeni alanları döndürdüğünü doğrular). Mevcut `firma/eczanelerimiz` describe bloğundaki test zaten `eczaci_kod` kontrol ediyor; oraya durum alanı kontrolü de ekle — `tests/mobilApi.test.js`'te `firma/eczanelerimiz` bloğundaki `'yalnızca kendi firmasının eczaneleri (eczaci_kod dahil) döner'` testinin sonuna ekle:

```javascript
    expect(benim.musteri_karta_yazildi).toBe(false);
    expect(benim.eczaci_karta_yazildi).toBe(false);
```

- [ ] **Step 7: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js -t "kart-yazildi|eczanelerimiz"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "IP-2: /api/mobil/kart-yazildi ucu + eczane liste durum kolonlari"
```

---

### Task 3: Panel manuel işaretleme uçları

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\kurumsal.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\kurumsal.test.js`

- [ ] **Step 1: Başarısız test yaz** — `tests/kurumsal.test.js`'te mevcut `describe('Kurumsal panel uçları', ...)` bloğunun İÇİNE (son test'ten sonra, `afterAll`'dan önce değil — bloğun içindeki testlerin arasına, örn. son `test(...)`'tan hemen sonra) ekle:

```javascript
  test('çalışan kartını elle yazıldı işaretler ve geri alır', async () => {
    const c = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Elle', 'Isaret', 'elle-isaret-k') RETURNING id`,
      [kurumsalId]
    );
    const calisanId = c.rows[0].id;
    await kurumsalAgent.post(`/kurumsal/calisan/${calisanId}/kart-isaretle`).send({ yazildi: 'true' });
    let r = await pool.query('SELECT karta_yazildi FROM calisanlar WHERE id = $1', [calisanId]);
    expect(r.rows[0].karta_yazildi).toBe(true);
    await kurumsalAgent.post(`/kurumsal/calisan/${calisanId}/kart-isaretle`).send({ yazildi: 'false' });
    r = await pool.query('SELECT karta_yazildi FROM calisanlar WHERE id = $1', [calisanId]);
    expect(r.rows[0].karta_yazildi).toBe(false);
  });

  test('eczane müşteri kartını elle işaretler', async () => {
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Elle Eczane', 'elleecz1') RETURNING id`,
      [kurumsalId]
    );
    const eczaneId = e.rows[0].id;
    await kurumsalAgent.post(`/kurumsal/eczane/${eczaneId}/kart-isaretle`).send({ tip: 'musteri', yazildi: 'true' });
    const r = await pool.query('SELECT musteri_karta_yazildi, eczaci_karta_yazildi FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(r.rows[0].musteri_karta_yazildi).toBe(true);
    expect(r.rows[0].eczaci_karta_yazildi).toBe(false);
  });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/kurumsal.test.js -t "elle"`
Expected: FAIL — 404 (route yok)

- [ ] **Step 3: `routes/kurumsal.js`'e route ekle** — `eczaci-kod-uret` route'undan sonra (`module.exports = router;`'dan önce):

```javascript
router.post('/calisan/:id/kart-isaretle', async (req, res) => {
  const yazildi = req.body.yazildi === 'true';
  try {
    await pool.query(
      'UPDATE calisanlar SET karta_yazildi = $1 WHERE id = $2 AND firma_id = $3',
      [yazildi, req.params.id, req.session.firmaId]
    );
  } catch (err) {
    console.error(err);
    req.flash('error', 'İşaretlenemedi.');
  }
  res.redirect('/?tab=istatistik');
});

router.post('/eczane/:id/kart-isaretle', async (req, res) => {
  const yazildi = req.body.yazildi === 'true';
  const tip = req.body.tip === 'eczaci' ? 'eczaci' : 'musteri';
  try {
    await pool.query(
      `UPDATE eczaneler SET ${tip}_karta_yazildi = $1 WHERE id = $2 AND firma_id = $3`,
      [yazildi, req.params.id, req.session.firmaId]
    );
  } catch (err) {
    console.error(err);
    req.flash('error', 'İşaretlenemedi.');
  }
  res.redirect('/?tab=raf');
});
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/kurumsal.test.js -t "elle"`
Expected: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "IP-2: panel manuel kart isaretleme uclari"
```

---

### Task 4: Panel UI — rozetler + işaretle butonları

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\views\public\dashboard.ejs`

- [ ] **Step 1: İstatistik sekmesine "Kart" sütunu ekle** — `dashboard.ejs`'te İstatistik tablosunun başlık satırını değiştir:

Bul:
```html
        <thead><tr><th>Ad Soyad</th><th>Görüntülenme</th><th>Durum</th></tr></thead>
```
Yap:
```html
        <thead><tr><th>Ad Soyad</th><th>Görüntülenme</th><th>Durum</th><th>Kart</th></tr></thead>
```

Bul:
```html
            <td><span class="badge badge-<%= c.durum %>"><%= c.durum %></span></td>
          </tr>
          <% }); %>
```
Yap:
```html
            <td><span class="badge badge-<%= c.durum %>"><%= c.durum %></span></td>
            <td>
              <% if (c.karta_yazildi) { %>
                <span style="color:#2e7d32;font-weight:600">✓ Yazıldı<%= c.kart_kilitli ? ' 🔒' : '' %></span>
                <form method="POST" action="/kurumsal/calisan/<%= c.id %>/kart-isaretle" style="display:inline">
                  <input type="hidden" name="yazildi" value="false">
                  <button type="submit">Kaldır</button>
                </form>
              <% } else { %>
                <span style="color:#9ca3af">○ Yazılmadı</span>
                <form method="POST" action="/kurumsal/calisan/<%= c.id %>/kart-isaretle" style="display:inline">
                  <input type="hidden" name="yazildi" value="true">
                  <button type="submit">Yazıldı işaretle</button>
                </form>
              <% } %>
            </td>
          </tr>
          <% }); %>
```

- [ ] **Step 2: Raf Kartları sekmesine "Kart Durumu" sütunu ekle** — başlık satırını bul:

```html
        <thead><tr><th>Eczane</th><th>Adres</th><th>Kart Linki</th><th>Okutma</th><th>Eczacı Kartı</th><th></th></tr></thead>
```
Yap (Okutma'dan sonra "Kart Durumu" eklendi):
```html
        <thead><tr><th>Eczane</th><th>Adres</th><th>Kart Linki</th><th>Okutma</th><th>Kart Durumu</th><th>Eczacı Kartı</th><th></th></tr></thead>
```

- [ ] **Step 3: Raf satırına durum hücresini ekle** — bul:

```html
            <td><%= e.okutma_sayisi %></td>
            <td>
              <% if (e.eczaci_kod) { %>
```
Yap (aradaki `<td>` bloğu eklendi):
```html
            <td><%= e.okutma_sayisi %></td>
            <td>
              <div style="margin-bottom:4px">
                Müşteri:
                <% if (e.musteri_karta_yazildi) { %>
                  <span style="color:#2e7d32;font-weight:600">✓<%= e.musteri_kart_kilitli ? '🔒' : '' %></span>
                  <form method="POST" action="/kurumsal/eczane/<%= e.id %>/kart-isaretle" style="display:inline"><input type="hidden" name="tip" value="musteri"><input type="hidden" name="yazildi" value="false"><button type="submit">Kaldır</button></form>
                <% } else { %>
                  <span style="color:#9ca3af">○</span>
                  <form method="POST" action="/kurumsal/eczane/<%= e.id %>/kart-isaretle" style="display:inline"><input type="hidden" name="tip" value="musteri"><input type="hidden" name="yazildi" value="true"><button type="submit">İşaretle</button></form>
                <% } %>
              </div>
              <div>
                Eczacı:
                <% if (e.eczaci_karta_yazildi) { %>
                  <span style="color:#2e7d32;font-weight:600">✓<%= e.eczaci_kart_kilitli ? '🔒' : '' %></span>
                  <form method="POST" action="/kurumsal/eczane/<%= e.id %>/kart-isaretle" style="display:inline"><input type="hidden" name="tip" value="eczaci"><input type="hidden" name="yazildi" value="false"><button type="submit">Kaldır</button></form>
                <% } else { %>
                  <span style="color:#9ca3af">○</span>
                  <form method="POST" action="/kurumsal/eczane/<%= e.id %>/kart-isaretle" style="display:inline"><input type="hidden" name="tip" value="eczaci"><input type="hidden" name="yazildi" value="true"><button type="submit">İşaretle</button></form>
                <% } %>
              </div>
            </td>
            <td>
              <% if (e.eczaci_kod) { %>
```

- [ ] **Step 4: Boş-durum colspan'ını güncelle** — bul:

```html
          <% if (!eczaneler.length) { %><tr><td colspan="6">Henüz eczane eklenmemiş.</td></tr><% } %>
```
Yap:
```html
          <% if (!eczaneler.length) { %><tr><td colspan="7">Henüz eczane eklenmemiş.</td></tr><% } %>
```

- [ ] **Step 5: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "IP-2: panel kart durum rozetleri UI"
```

---

### Task 5: Tam backend testi + deploy + production doğrulama

**Files:** Yok (komutlar)

- [ ] **Step 1: Tüm backend testleri**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 2: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Prod migration çalıştır** — yeni kolonlar production DB'de de olmalı:

```bash
node scripts/migrate.js
```
Expected: yeni `ALTER TABLE ... ADD COLUMN` satırları `OK`.

- [ ] **Step 4: Deploy'un canlıya çıkışını doğrula** — marker firma + kart-yazildi (deploy öncesi 404, sonrası 200):

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
const { firmaTokenUret } = require('./utils/jwt');
(async () => {
  const f = await pool.query(\"INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket) VALUES ('IP2 Marker','ip2-marker','ip2marker@example.com','x','kurumsal') RETURNING id\");
  const c = await pool.query(\"INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES (\$1,'M','K','ip2-marker-cal') RETURNING id\", [f.rows[0].id]);
  console.log('TOKEN=' + firmaTokenUret(f.rows[0].id));
  console.log('CALISAN=' + c.rows[0].id);
  await pool.end();
})();
"
```

Dönen TOKEN ve CALISAN ile (200 gelene kadar dene):
```bash
curl -s -X POST https://www.nfckartify.com.tr/api/mobil/kart-yazildi \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"tip":"calisan","id":<CALISAN>,"kilitli":false}'
```
Expected: `{"ok":true}`

- [ ] **Step 5: Marker'ı temizle**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => { await pool.query(\"DELETE FROM firmalar WHERE slug='ip2-marker'\"); console.log('silindi'); await pool.end(); })();
"
```

- [ ] **Step 6: git durumu**

Run: `git status --short`
Expected: Boş.

---

## BÖLÜM B — ANDROID

### Task 6: Model + ApiService kartYazildi

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\Models.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\ApiService.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\test\java\com\nfckartify\bayi\data\ApiServiceTest.kt`

- [ ] **Step 1: Başarısız test yaz** — `ApiServiceTest.kt`'te son test'ten sonra (sınıfın kapanış `}`'ından önce) ekle:

```kotlin
    @Test
    fun `kartYazildi basarili cevabi doner`() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"ok":true}""").setResponseCode(200))
        val cevap = servis.kartYazildi("Bearer test-token", "calisan", 5, false)
        assertTrue(cevap.isSuccessful)
        assertTrue(cevap.body()?.ok == true)
    }
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run (PowerShell): `.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: FAIL — `kartYazildi` çözümlenemedi (derleme hatası).

- [ ] **Step 3: `Models.kt`'i güncelle** — `Calisan` data class'ına iki alan ekle:

```kotlin
@Serializable
data class Calisan(
    val id: Int,
    val ad: String,
    val soyad: String,
    val unvan: String? = null,
    val slug: String,
    val durum: String,
    val karta_yazildi: Boolean = false,
    val kart_kilitli: Boolean = false,
)
```

`EczaneOzet` data class'ına dört alan ekle:

```kotlin
@Serializable
data class EczaneOzet(
    val id: Int,
    val ad: String,
    val adres: String? = null,
    val kod: String,
    val eczaci_kod: String? = null,
    val musteri_karta_yazildi: Boolean = false,
    val musteri_kart_kilitli: Boolean = false,
    val eczaci_karta_yazildi: Boolean = false,
    val eczaci_kart_kilitli: Boolean = false,
)
```

Dosya sonuna yeni cevap modeli ekle:

```kotlin
@Serializable
data class KartYazildiCevap(
    val ok: Boolean,
    val error: String? = null,
)
```

- [ ] **Step 4: `ApiService.kt`'e uç ekle** — `firmaEczanelerimiz`'den sonra (interface kapanışından önce):

```kotlin
    @FormUrlEncoded
    @POST("api/mobil/kart-yazildi")
    suspend fun kartYazildi(
        @Header("Authorization") yetki: String,
        @Field("tip") tip: String,
        @Field("id") id: Int,
        @Field("kilitli") kilitli: Boolean,
    ): Response<KartYazildiCevap>
```

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Run (PowerShell): `.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/data/Models.kt app/src/main/java/com/nfckartify/bayi/data/ApiService.kt app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt
git commit -m "IP-2: kart durum modelleri + kartYazildi servisi"
```

---

### Task 7: TokenDeposu.aktifTokenAl

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\TokenDeposu.kt`

- [ ] **Step 1: `TokenDeposu.kt`'e ekle** — `firmaAdiAl()`'dan sonra, `cikisYap()`'tan önce:

```kotlin
    fun aktifTokenAl(): String? = tokenAl() ?: temsilciTokenAl() ?: firmaTokenAl()
```

- [ ] **Step 2: Derlemeyi doğrula**

Run (PowerShell): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt
git commit -m "IP-2: TokenDeposu aktifTokenAl"
```

---

### Task 8: KartaYazViewModel — yazım sonrası durum bildirimi

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\KartaYazViewModel.kt`

- [ ] **Step 1: `KartaYazViewModel.kt`'i güncelle** — importları ekle (dosya başındaki mevcut importların arasına):

```kotlin
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.TokenDeposu
import kotlinx.coroutines.launch
```

Sınıf imzasını değiştir:

```kotlin
class KartaYazViewModel(
    private val tokenDeposu: TokenDeposu? = null,
    private val kartTipi: String? = null,
    private val kartId: Int? = null,
) : ViewModel() {
```

`tagAlgilandi` içinde, yazma başarılı olunca (`durum = KartaYazDurumu.YAZILDI` satırından hemen sonra) bildirim ekle:

```kotlin
                    is NfcSonuc.Basarili -> {
                        durum = KartaYazDurumu.YAZILDI
                        hataMesaji = null
                        kartDurumunuBildir(kilitli = false)
                    }
```

Kilitleme başarılı olunca (`durum = KartaYazDurumu.KILITLENDI` satırından hemen sonra) bildirim ekle:

```kotlin
                    is NfcSonuc.Basarili -> {
                        durum = KartaYazDurumu.KILITLENDI
                        hataMesaji = null
                        kartDurumunuBildir(kilitli = true)
                    }
```

Sınıfın sonuna (son fonksiyondan sonra, kapanış `}`'ından önce) yardımcı ekle:

```kotlin
    private fun kartDurumunuBildir(kilitli: Boolean) {
        val tip = kartTipi ?: return
        val id = kartId ?: return
        val token = tokenDeposu?.aktifTokenAl() ?: return
        viewModelScope.launch {
            try {
                ApiClient.servis.kartYazildi("Bearer $token", tip, id, kilitli)
            } catch (e: Exception) {
                // sessiz — NFC yazımı zaten tamamlandı, durum bildirimi opsiyonel
            }
        }
    }
```

- [ ] **Step 2: Derlemeyi doğrula**

Run (PowerShell): `.\gradlew.bat assembleDebug`
Expected: `KartaYazViewModel()` çağrısı hâlâ parametresiz olduğu için (NfcKartifyApp'te) derlenebilir — BUILD SUCCESSFUL (Task 9'da çağrı güncellenecek).

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/KartaYazViewModel.kt
git commit -m "IP-2: KartaYazViewModel yazim sonrasi durum bildirimi"
```

---

### Task 9: Navigasyon — kartId/kartTipi taşıma

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\CalisanlarEkrani.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\NfcKartifyApp.kt`

- [ ] **Step 1: `CalisanlarEkrani.kt` callback imzasına kartId ekle** — imzayı değiştir:

```kotlin
fun CalisanlarEkrani(
    viewModel: CalisanlarViewModel,
    firmaId: Int,
    kartaYazTiklandi: (adSoyad: String, url: String, kartId: Int) -> Unit,
) {
```

`onClick` içindeki çağrıyı değiştir:

```kotlin
                            Button(
                                onClick = {
                                    val url = "https://www.nfckartify.com.tr/${viewModel.firmaSlug}/${calisan.slug}"
                                    kartaYazTiklandi("${calisan.ad} ${calisan.soyad}", url, calisan.id)
                                },
                            ) {
                                Text("Karta Yaz")
                            }
```

- [ ] **Step 2: `NfcKartifyApp.kt` — kartaYaz rotasına kartTipi/kartId paramları ekle** — `kartaYaz` composable tanımını değiştir:

```kotlin
        composable(
            "kartaYaz/{adSoyad}/{url}?tip={tip}&kartTipi={kartTipi}&kartId={kartId}",
            arguments = listOf(
                navArgument("adSoyad") { type = NavType.StringType },
                navArgument("url") { type = NavType.StringType },
                navArgument("tip") { type = NavType.StringType; defaultValue = "calisan" },
                navArgument("kartTipi") { type = NavType.StringType; defaultValue = "" },
                navArgument("kartId") { type = NavType.IntType; defaultValue = -1 },
            ),
        ) { backStackEntry ->
            val adSoyad = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("adSoyad") ?: "", "UTF-8")
            val url = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("url") ?: "", "UTF-8")
            val tip = backStackEntry.arguments?.getString("tip") ?: "calisan"
            val kartTipi = backStackEntry.arguments?.getString("kartTipi")?.ifEmpty { null }
            val kartId = backStackEntry.arguments?.getInt("kartId")?.takeIf { it >= 0 }
            val vm: KartaYazViewModel = viewModel { KartaYazViewModel(tokenDeposu, kartTipi, kartId) }
            if (tip == "raf") {
                KartaYazEkrani(
                    viewModel = vm,
                    adSoyad = adSoyad,
                    url = url,
                    goruntuleButonMetni = "Sayfayı Görüntüle",
                    bekleMesaji = "Sayfayı kontrol ettiysen: boş bir NFC kartı telefonun arkasına yaklaştırın.",
                )
            } else {
                KartaYazEkrani(vm, adSoyad, url)
            }
        }
```

- [ ] **Step 3: `NfcKartifyApp.kt` — bayi calisanlar çağrı yerini güncelle** — `composable("calisanlar/{firmaId}", ...)` içindeki `CalisanlarEkrani` çağrısını değiştir:

```kotlin
            CalisanlarEkrani(vm, firmaId) { adSoyad, url, kartId ->
                val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                val kodlanmisAd = java.net.URLEncoder.encode(adSoyad, "UTF-8")
                navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl?kartTipi=calisan&kartId=$kartId")
            }
```

- [ ] **Step 4: `NfcKartifyApp.kt` — firma calisanlar çağrı yerini güncelle** — `composable("firmaCalisanlar")` içindeki `CalisanlarEkrani` çağrısını değiştir:

```kotlin
            CalisanlarEkrani(vm, 0) { adSoyad, url, kartId ->
                val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                val kodlanmisAd = java.net.URLEncoder.encode(adSoyad, "UTF-8")
                navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl?kartTipi=calisan&kartId=$kartId")
            }
```

- [ ] **Step 5: `NfcKartifyApp.kt` — eczane (temsilci) çağrı yerlerine kartTipi/kartId ekle** — `composable("eczanelerim")` içindeki iki navigate satırını değiştir:

`musteriKartiTiklandi` içinde:
```kotlin
                    navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl?tip=raf&kartTipi=musteri&kartId=${eczane.id}")
```
`eczaciKartiTiklandi` içinde:
```kotlin
                    navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl?tip=raf&kartTipi=eczaci&kartId=${eczane.id}")
```

- [ ] **Step 6: `NfcKartifyApp.kt` — eczane (firma) çağrı yerlerine kartTipi/kartId ekle** — `composable("firmaEczaneler")` içindeki iki navigate satırını, Step 5'teki ile birebir aynı şekilde değiştir (`musteriKartiTiklandi` → `&kartTipi=musteri&kartId=${eczane.id}`, `eczaciKartiTiklandi` → `&kartTipi=eczaci&kartId=${eczane.id}`).

- [ ] **Step 7: Derlemeyi doğrula**

Run (PowerShell): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 8: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/CalisanlarEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt
git commit -m "IP-2: navigasyon kartId/kartTipi tasima"
```

---

### Task 10: Mobil liste rozetleri

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\CalisanlarEkrani.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\EczanelerimEkrani.kt`

- [ ] **Step 1: `CalisanlarEkrani.kt`'e rozet + özet ekle** — `Text("Durum: ${calisan.durum}")` satırından sonra rozet ekle:

```kotlin
                            Text("Durum: ${calisan.durum}")
                            Text(
                                if (calisan.karta_yazildi) "✓ Yazıldı" + (if (calisan.kart_kilitli) " 🔒" else "") else "○ Yazılmadı",
                                color = if (calisan.karta_yazildi) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                                style = MaterialTheme.typography.bodySmall,
                            )
```

Özet için: `firmaAdi` başlığının (`Text(viewModel.firmaAdi...)`) hemen altına, `Spacer`'dan sonra ekle:

```kotlin
        if (viewModel.calisanlar.isNotEmpty()) {
            Text(
                "${viewModel.calisanlar.count { it.karta_yazildi }}/${viewModel.calisanlar.size} kart yazıldı",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(modifier = Modifier.padding(4.dp))
        }
```

- [ ] **Step 2: `EczanelerimEkrani.kt`'e rozet + özet ekle** — `if (eczane.adres != null) { ... }` bloğundan sonra, `Spacer`'dan önce rozet satırı ekle:

```kotlin
                            if (eczane.adres != null) {
                                Text(eczane.adres, style = MaterialTheme.typography.bodySmall)
                            }
                            Text(
                                "Müşteri: " + (if (eczane.musteri_karta_yazildi) "✓" + (if (eczane.musteri_kart_kilitli) "🔒" else "") else "○") +
                                    "   Eczacı: " + (if (eczane.eczaci_karta_yazildi) "✓" + (if (eczane.eczaci_kart_kilitli) "🔒" else "") else "○"),
                                style = MaterialTheme.typography.bodySmall,
                            )
```

Özet için: `Text("Kart yazılacak eczaneyi...")` satırından sonraki `Spacer`'dan sonra ekle:

```kotlin
        if (viewModel.eczaneler.isNotEmpty()) {
            Text(
                "${viewModel.eczaneler.count { it.musteri_karta_yazildi }}/${viewModel.eczaneler.size} müşteri kartı yazıldı",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(modifier = Modifier.padding(4.dp))
        }
```

- [ ] **Step 3: Derlemeyi doğrula**

Run (PowerShell): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/CalisanlarEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/EczanelerimEkrani.kt
git commit -m "IP-2: mobil liste kart durum rozetleri"
```

---

### Task 11: Tam Android testi + cihazda uçtan uca doğrulama

**Files:** Yok (komutlar + ADB)

- [ ] **Step 1: Tüm Android unit testleri**

Run (PowerShell): `.\gradlew.bat test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Cihaza kur**

Run (PowerShell): `.\gradlew.bat installDebug`
Expected: `Installed on 1 device.`

- [ ] **Step 3: Test verisi hazırla** — "Test Firma" (id 568) altına bir çalışan + bir eczane ekle (İP-1 testinde kullanılan `benzersizEczaneKoduUret`/`benzersizEczaciKoduUret` ile):

```bash
cd /c/Users/muham/kurumsal-kartvizit
node -e "
require('dotenv').config();
const { pool } = require('./db');
const { benzersizEczaneKoduUret, benzersizEczaciKoduUret } = require('./utils/eczaneKod');
(async () => {
  const c = await pool.query(\"INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES (568,'IP2','Rozet','ip2-rozet') RETURNING id\");
  const kod = await benzersizEczaneKoduUret(); const ekod = await benzersizEczaciKoduUret();
  const e = await pool.query('INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES (568,\$1,\$2,\$3) RETURNING id', ['IP2 Rozet Eczanesi', kod, ekod]);
  console.log('calisan', c.rows[0].id, 'eczane', e.rows[0].id);
  await pool.end();
})();
"
```

- [ ] **Step 4: Firma girişi + rozet başlangıç durumu** — ADB ile "Firma" rolüyle `testfirma`/`test1234` giriş yap, "Çalışanlarımız" → çalışan satırında "○ Yazılmadı" rozeti ve üstte "0/N kart yazıldı" özeti görün (`uiautomator dump` ile doğrula).

- [ ] **Step 5: Çalışan kartı yaz → rozet güncellensin** — çalışanda "Karta Yaz" → gerçek NFC kartı yaz ("Kart başarıyla yazıldı." çıksın) → geri dön → listede rozetin artık "✓ Yazıldı" olduğunu doğrula. (ViewModel listeyi yeniden yükler; gerekirse ekrandan çıkıp tekrar gir.)

- [ ] **Step 6: Eczane iki kart bağımsızlığı** — "Eczanelerimiz" → önce "Müşteri Kartı" yaz → satırda "Müşteri: ✓  Eczacı: ○" görün; sonra "Eczacı Kartı" yaz → "Müşteri: ✓  Eczacı: ✓" görün.

- [ ] **Step 7: Web panel doğrulama** — tarayıcıda (veya curl) `testfirma` ile panele girip Raf Kartları ve İstatistik sekmelerinde aynı rozetlerin göründüğünü doğrula. (Deploy Task 5'te yapıldı.)

- [ ] **Step 8: Test verilerini temizle**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  await pool.query(\"DELETE FROM calisanlar WHERE slug='ip2-rozet'\");
  await pool.query(\"DELETE FROM eczaneler WHERE ad='IP2 Rozet Eczanesi'\");
  console.log('temizlendi'); await pool.end();
})();
"
```

- [ ] **Step 9: git durumu**

Run: `cd /c/Users/muham/nfckartify-bayi-android && git status --short`
Expected: Boş.
