# Mümessil Hiyerarşisi + GPS + Otomatik Raporlama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firmalar mümessil/temsilcilerine esnek derinlikte bir müdür hiyerarşisi kurabilsin; müdürler kendi ekibinin ziyaretlerini, notlarını (sadece direkt amiri) ve ziyaret anı GPS konumunu görebilsin; firma sahibi not içeriğini göremesin, sadece sayısal özet görsün.

**Architecture:** `calisanlar` tablosuna self-referencing `amiri_id` + `ekip_yoneticisi` bayrağı, `ziyaretler`e `lat`/`lng`. Kurulum kurumsal panelden (mevcut çalışan düzenleme formu). Erişim kontrolü backend'de `calisanAltZinciriIdleri` (recursive CTE) yardımcı fonksiyonuyla. Android'de yeni "Ekibim" ekranı + ziyaret kaydına konum okuma + mevcut katalog-uyarısı bannerıyla aynı desende günlük özet.

**Tech Stack:** Node.js/Express, PostgreSQL (recursive CTE), EJS, Kotlin/Jetpack Compose (mevcut Android app).

---

### Task 1: DB migration — `amiri_id`, `ekip_yoneticisi`, `lat`/`lng`

**Files:**
- Modify: `scripts/migrate.js`

- [ ] **Step 1: Migration dizisinin sonuna ekle**

`scripts/migrate.js`'in migration dizisindeki son satırdan hemen önce ekle:

```javascript
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS amiri_id INTEGER REFERENCES calisanlar(id) ON DELETE SET NULL`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS ekip_yoneticisi BOOLEAN DEFAULT false`,
    `ALTER TABLE ziyaretler ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`,
    `ALTER TABLE ziyaretler ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`,
```

- [ ] **Step 2: Migration'ı yerel veritabanında çalıştır**

Run: `cd /c/Users/muham/kurumsal-kartvizit && node scripts/migrate.js`
Expected: Yeni dört satır için `OK`, hata yok.

- [ ] **Step 3: Kolonların oluştuğunu doğrula**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const r = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE (table_name='calisanlar' AND column_name IN ('amiri_id','ekip_yoneticisi')) OR (table_name='ziyaretler' AND column_name IN ('lat','lng'))\");
  console.log(r.rows.map(x => x.column_name).sort());
  await pool.end();
})();
"
```
Expected: `['amiri_id', 'ekip_yoneticisi', 'lat', 'lng']`.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.js
git commit -m "Hiyerarsi T1: DB migration - amiri_id, ekip_yoneticisi, ziyaret lat/lng"
```

---

### Task 2: `utils/hiyerarsi.js` — alt zincir sorgusu + döngü kontrolü

**Files:**
- Create: `utils/hiyerarsi.js`
- Test: `tests/hiyerarsi.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
require('dotenv').config();
const { pool } = require('../db');
const { calisanAltZinciriIdleri, amiriGecerliMi } = require('../utils/hiyerarsi');

describe('utils/hiyerarsi', () => {
  let firmaId, ust, orta, alt1, alt2, ilgisiz;

  beforeAll(async () => {
    const f = await pool.query(
      "INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket) VALUES ('Hiyerarşi Test', 'hiyerarsi-test-firma', 'hiyerarsitest@example.com', 'x', 'kurumsal') RETURNING id"
    );
    firmaId = f.rows[0].id;

    ust = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, ekip_yoneticisi) VALUES ($1,'Üst','Müdür','ust-mudur-htest',true) RETURNING id", [firmaId])).rows[0].id;
    orta = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, ekip_yoneticisi, amiri_id) VALUES ($1,'Orta','Müdür','orta-mudur-htest',true,$2) RETURNING id", [firmaId, ust])).rows[0].id;
    alt1 = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, amiri_id) VALUES ($1,'Alt','Bir-htest','alt-bir-htest',$2) RETURNING id", [firmaId, orta])).rows[0].id;
    alt2 = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, amiri_id) VALUES ($1,'Alt','Iki-htest','alt-iki-htest',$2) RETURNING id", [firmaId, orta])).rows[0].id;
    ilgisiz = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'Ilgisiz','Kisi-htest','ilgisiz-kisi-htest') RETURNING id", [firmaId])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('çok seviyeli zincirdeki tüm alt id\'leri döner, ilgisiz kişiyi içermez', async () => {
    const idler = await calisanAltZinciriIdleri(ust);
    expect(idler.sort()).toEqual([orta, alt1, alt2].sort());
    expect(idler).not.toContain(ilgisiz);
  });

  test('en alttaki kişinin altı boştur', async () => {
    const idler = await calisanAltZinciriIdleri(alt1);
    expect(idler).toEqual([]);
  });

  test('amiriGecerliMi: doğrudan amiri true döner', async () => {
    expect(await amiriGecerliMi(orta, alt1)).toBe(true);
  });

  test('amiriGecerliMi: üst müdür (dolaylı) false döner — sadece direkt amiri geçerli', async () => {
    expect(await amiriGecerliMi(ust, alt1)).toBe(false);
  });

  test('amiriGecerliMi: ilgisiz kişi false döner', async () => {
    expect(await amiriGecerliMi(ilgisiz, alt1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/hiyerarsi.test.js`
Expected: FAIL — `Cannot find module '../utils/hiyerarsi'`.

- [ ] **Step 3: Write implementation**

```javascript
const { pool } = require('../db');

// Bir müdürün (calisanId) altındaki TÜM zinciri (çok seviyeli, çocuk-çocuk dahil) döner.
// calisanId'nin kendisi listeye dahil edilmez.
async function calisanAltZinciriIdleri(calisanId) {
  const result = await pool.query(
    `WITH RECURSIVE zincir AS (
       SELECT id FROM calisanlar WHERE amiri_id = $1
       UNION ALL
       SELECT c.id FROM calisanlar c JOIN zincir z ON c.amiri_id = z.id
     )
     SELECT id FROM zincir`,
    [calisanId]
  );
  return result.rows.map(r => r.id);
}

// adayAmiriId, hedefCalisanId'nin DOĞRUDAN amiri mi? (dolaylı üst müdürler dahil değil)
async function amiriGecerliMi(adayAmiriId, hedefCalisanId) {
  const result = await pool.query('SELECT amiri_id FROM calisanlar WHERE id = $1', [hedefCalisanId]);
  if (!result.rows.length) return false;
  return result.rows[0].amiri_id === adayAmiriId;
}

module.exports = { calisanAltZinciriIdleri, amiriGecerliMi };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/hiyerarsi.test.js`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add utils/hiyerarsi.js tests/hiyerarsi.test.js
git commit -m "Hiyerarsi T2: alt zincir sorgusu + amiri dogrulama yardimci fonksiyonlari"
```

---

### Task 3: `routes/panel.js` — çalışan düzenlemede hiyerarşi alanları + döngü kontrolü

**Files:**
- Modify: `routes/panel.js`
- Test: `tests/panel.test.js`

**Bağlam:** `routes/panel.js:162-224`'teki `duzenleHandler`, `giris_email`/`giris_sifre` için ayrı bir UPDATE bloğu içeriyor (satır 197-214) — aynı desenle `amiri_id`/`ekip_yoneticisi` için üçüncü bir blok eklenecek. Döngü kontrolü: bir çalışan, kendi alt zincirindeki birine (veya kendine) amiri olarak atanamaz.

- [ ] **Step 1: Write the failing test**

`tests/panel.test.js`'e (mevcut `describe` bloğu içine) ekle:

```javascript
  test('çalışana amiri ve ekip yöneticisi ataması yapılabilir', async () => {
    const mudur = (await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'Test','Müdür','test-mudur-ptest') RETURNING id",
      [firmaId]
    )).rows[0].id;
    const temsilci = (await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'Test','Temsilci','test-temsilci-ptest') RETURNING id",
      [firmaId]
    )).rows[0].id;

    await agent.put(`/firma/panel/${mudur}/duzenle`).send({ ad: 'Test', soyad: 'Müdür', ekip_yoneticisi: 'true' });
    await agent.put(`/firma/panel/${temsilci}/duzenle`).send({ ad: 'Test', soyad: 'Temsilci', amiri_id: String(mudur) });

    const kontrol = await pool.query('SELECT amiri_id, ekip_yoneticisi FROM calisanlar WHERE id = ANY($1) ORDER BY id', [[mudur, temsilci]]);
    expect(kontrol.rows.find(r => r.amiri_id === null).ekip_yoneticisi).toBe(true);

    const temsilciKontrol = await pool.query('SELECT amiri_id FROM calisanlar WHERE id = $1', [temsilci]);
    expect(temsilciKontrol.rows[0].amiri_id).toBe(mudur);

    await pool.query('DELETE FROM calisanlar WHERE id = ANY($1)', [[mudur, temsilci]]);
  });

  test('döngü oluşturacak amiri ataması reddedilir', async () => {
    const a = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'A','Kisi','a-kisi-ptest') RETURNING id", [firmaId])).rows[0].id;
    const b = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, amiri_id) VALUES ($1,'B','Kisi','b-kisi-ptest',$2) RETURNING id", [firmaId, a])).rows[0].id;

    // A'yı B'nin altına bağlamaya çalış — döngü
    const res = await agent.put(`/firma/panel/${a}/duzenle`).send({ ad: 'A', soyad: 'Kisi', amiri_id: String(b) });
    expect(res.statusCode).toBe(302);

    const kontrol = await pool.query('SELECT amiri_id FROM calisanlar WHERE id = $1', [a]);
    expect(kontrol.rows[0].amiri_id).toBeNull();

    await pool.query('DELETE FROM calisanlar WHERE id = ANY($1)', [[a, b]]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/panel.test.js -t "amiri"`
Expected: FAIL — `amiri_id`/`ekip_yoneticisi` şu an güncellenmiyor, döngü kontrolü yok.

- [ ] **Step 3: `routes/panel.js`'in üstüne import ekle**

`routes/panel.js`'in import bloğuna (dosyanın başındaki `require` satırlarının yanına) ekle:

```javascript
const { calisanAltZinciriIdleri } = require('../utils/hiyerarsi');
```

- [ ] **Step 4: `duzenleHandler`'a hiyerarşi bloğu ekle**

`routes/panel.js:163`'teki `duzenleHandler` fonksiyon imzasını güncelle — mevcut hali:

```javascript
async function duzenleHandler(req, res) {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, giris_email, giris_sifre } = req.body;
```

Şununla değiştir:

```javascript
async function duzenleHandler(req, res) {
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, giris_email, giris_sifre, amiri_id, ekip_yoneticisi } = req.body;
```

`routes/panel.js:214`'teki (giris_email/giris_sifre UPDATE bloğunun kapanışı — `}` ) hemen sonrasına, `req.flash('success', 'Çalışan güncellendi.');` satırından önce ekle:

```javascript

    const amiriIdDeger = amiri_id && amiri_id.trim() ? Number(amiri_id) : null;
    if (amiriIdDeger !== null) {
      if (amiriIdDeger === Number(req.params.id)) {
        req.flash('error', 'Bir kişi kendi amiri olamaz.');
        return res.redirect('/');
      }
      const altZincir = await calisanAltZinciriIdleri(req.params.id);
      if (altZincir.includes(amiriIdDeger)) {
        req.flash('error', 'Bu kişi zaten bu zincirde — döngü oluşur.');
        return res.redirect('/');
      }
    }
    await pool.query(
      'UPDATE calisanlar SET amiri_id=$1, ekip_yoneticisi=$2 WHERE id=$3 AND firma_id=$4',
      [amiriIdDeger, ekip_yoneticisi === 'true', req.params.id, req.session.firmaId]
    );
```

**Not:** `calisanAltZinciriIdleri` içindeki recursive CTE zaten `pool`'u `utils/hiyerarsi.js` üzerinden kullanıyor — `routes/panel.js`'te ayrıca `pool` import etmeye gerek yok (zaten mevcut).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/panel.test.js`
Expected: Tüm testler PASS (yeni testler dahil).

- [ ] **Step 6: Commit**

```bash
git add routes/panel.js tests/panel.test.js
git commit -m "Hiyerarsi T3: calisan duzenlemede amiri_id/ekip_yoneticisi + dongu kontrolu"
```

---

### Task 4: `dashboard.ejs` — amiri seçimi + ekip yöneticisi checkbox UI

**Files:**
- Modify: `views/public/dashboard.ejs`
- Modify: `app.js` (dashboard render'a `calisanlar` zaten geçiyor — dropdown seçenekleri için ekstra veri gerekmez)

- [ ] **Step 1: Formun "Mobil Giriş (Temsilci)" bölümüne alanları ekle**

`views/public/dashboard.ejs:758-765`'teki mevcut hali:

```html
          <div class="field">
            <label>Giriş E-postası</label>
            <input type="email" name="giris_email" id="f_giris_email" placeholder="temsilci@firma.com">
          </div>
          <div class="field">
            <label>Giriş Şifresi</label>
            <input type="password" name="giris_sifre" id="f_giris_sifre" placeholder="Boş bırakılırsa değişmez">
          </div>
          <% } %>
```

Şununla değiştir:

```html
          <div class="field">
            <label>Giriş E-postası</label>
            <input type="email" name="giris_email" id="f_giris_email" placeholder="temsilci@firma.com">
          </div>
          <div class="field">
            <label>Giriş Şifresi</label>
            <input type="password" name="giris_sifre" id="f_giris_sifre" placeholder="Boş bırakılırsa değişmez">
          </div>
          <div class="field">
            <label>Bağlı Olduğu Yönetici</label>
            <select name="amiri_id" id="f_amiri_id">
              <option value="">— Doğrudan firma sahibine bağlı —</option>
              <% calisanlar.forEach(diger => { %>
                <option value="<%= diger.id %>" data-calisan-id="<%= diger.id %>"><%= diger.ad %> <%= diger.soyad %></option>
              <% }); %>
            </select>
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:6px">
              <input type="checkbox" name="ekip_yoneticisi" id="f_ekip_yoneticisi" value="true" style="width:auto">
              Ekip yöneticisi (kendine bağlı ekibi mobilde görebilir)
            </label>
          </div>
          <% } %>
```

- [ ] **Step 2: `openSlideEdit`'te kendisini ve alt zincirini dropdown'dan gizle, mevcut değerleri doldur**

`views/public/dashboard.ejs:942-953`'teki `openSlideEdit` fonksiyonunun mevcut hali:

```javascript
  function openSlideEdit(c) {
    editId = c.id;
    document.getElementById('slideTitle').textContent = 'Çalışan Düzenle';
    document.getElementById('slideForm').action = `/firma/panel/${c.id}/duzenle`;
    document.getElementById('formMethod').value = 'PUT';
    document.getElementById('createOnlyFields').style.display = 'none';
    document.getElementById('f_kvkk').required = false;
    fillForm(c);
    document.getElementById('f_foto').value = '';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
```

Şununla değiştir:

```javascript
  function openSlideEdit(c) {
    editId = c.id;
    document.getElementById('slideTitle').textContent = 'Çalışan Düzenle';
    document.getElementById('slideForm').action = `/firma/panel/${c.id}/duzenle`;
    document.getElementById('formMethod').value = 'PUT';
    document.getElementById('createOnlyFields').style.display = 'none';
    document.getElementById('f_kvkk').required = false;
    fillForm(c);
    document.getElementById('f_foto').value = '';
    const amiriSelect = document.getElementById('f_amiri_id');
    if (amiriSelect) {
      // kendisini seçenekler arasından gizle (kendine bağlı olamaz)
      Array.from(amiriSelect.options).forEach(opt => {
        opt.style.display = opt.value === String(c.id) ? 'none' : '';
      });
      amiriSelect.value = c.amiri_id || '';
    }
    const ekipKutu = document.getElementById('f_ekip_yoneticisi');
    if (ekipKutu) ekipKutu.checked = !!c.ekip_yoneticisi;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
```

- [ ] **Step 3: `clearForm`'da yeni alanları sıfırla**

`views/public/dashboard.ejs:968-974`'teki mevcut hali:

```javascript
  function clearForm() {
    ['ad','soyad','unvan','departman','telefon','email','linkedin','instagram','twitter','website','biyografi','foto','giris_email','giris_sifre'].forEach(f => {
      const el = document.getElementById('f_' + f);
      if (el) el.value = '';
    });
    document.getElementById('f_kvkk').checked = false;
  }
```

Şununla değiştir:

```javascript
  function clearForm() {
    ['ad','soyad','unvan','departman','telefon','email','linkedin','instagram','twitter','website','biyografi','foto','giris_email','giris_sifre','amiri_id'].forEach(f => {
      const el = document.getElementById('f_' + f);
      if (el) el.value = '';
    });
    document.getElementById('f_kvkk').checked = false;
    const ekipKutu = document.getElementById('f_ekip_yoneticisi');
    if (ekipKutu) ekipKutu.checked = false;
  }
```

- [ ] **Step 4: Tarayıcıda manuel doğrulama**

Yerel sunucuyu başlat, kurumsal firma hesabıyla giriş yap, en az 2 çalışan oluştur. Birini "Ekip yöneticisi" yap ve kaydet. Diğerini düzenle, "Bağlı Olduğu Yönetici" dropdown'undan ilkini seç ve kaydet. Sayfayı yenile, ikinci çalışanı tekrar Düzenle'ye tıkla — dropdown'da doğru seçili gelmeli.

- [ ] **Step 5: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "Hiyerarsi T4: dashboard amiri secimi + ekip yoneticisi checkbox UI"
```

---

### Task 5: `GET /api/mobil/ekibim` ucu

**Files:**
- Modify: `routes/mobilApi.js`
- Test: `tests/mobilApi.test.js`

> **ÖNEMLİ (gözden geçirmede tespit edildi):** `tests/mobilApi.test.js`'te `calisanOlustur`/`eczaneOlustur`/`calisanTokenUret` **YOK** — dosya ham `pool.query` insert kullanıyor, token'ı login ucuyla alıyor ve sadece `bayiTokenDogrula` import ediyor. Her `describe` bloğunun kendi `firmaId`'si var. Bu yüzden Task 5, 6, 7, 8, 10'un tüm backend testleri **bu Task'ın Step 0'ında kurulan tek bir yeni ortak `describe` bloğunun içine** yazılır — yardımcılar orada tanımlanır.

- [ ] **Step 0: Hiyerarşi testleri için ortak describe bloğu + yardımcıları kur**

`tests/mobilApi.test.js`'in en üstündeki import satırına `calisanTokenUret`'i ekle:

```javascript
const { bayiTokenDogrula, calisanTokenUret } = require('../utils/jwt');
```

Dosyanın **sonuna** (son `describe` bloğunun kapanışından sonra) yeni bir ortak blok ekle. Task 5-8 ve Task 10'un backend testleri bu bloğun içine, işaretlenen `// >>> Task N testleri buraya <<<` yorumunun olduğu yere eklenir:

```javascript
describe('Mobil API — Ekip / Hiyerarşi', () => {
  let firmaId;
  let eczaneSayaci = 0;

  beforeAll(async () => {
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Ekip Test Firma', 'ekip-test-firma', 'ekiptest@example.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = f.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  // Yardımcı: firmaya çalışan oluşturur. secenekler: { amiri_id, ekip_yoneticisi, giris_email, giris_sifre }
  let calisanSayaci = 0;
  async function calisanOlustur(fId, secenekler = {}) {
    calisanSayaci += 1;
    const slug = `ekip-calisan-${calisanSayaci}-${Date.now()}`;
    let girisEmail = null, girisSifreHash = null;
    if (secenekler.giris_email) {
      girisEmail = secenekler.giris_email;
      girisSifreHash = await bcrypt.hash(secenekler.giris_sifre || 'test1234', 8);
    }
    const r = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, amiri_id, ekip_yoneticisi, giris_email, giris_sifre_hash)
       VALUES ($1, 'Ekip', 'Uye', $2, $3, $4, $5, $6) RETURNING id`,
      [fId, slug, secenekler.amiri_id || null, secenekler.ekip_yoneticisi === true, girisEmail, girisSifreHash]
    );
    return { id: r.rows[0].id };
  }

  async function eczaneOlustur(fId) {
    eczaneSayaci += 1;
    const r = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Ekip Eczanesi', $2) RETURNING id, kod`,
      [fId, `ekipkod${eczaneSayaci}${Date.now() % 100000}`]
    );
    return { id: r.rows[0].id, kod: r.rows[0].kod };
  }

  // >>> Task 5 testleri buraya <<<
  // >>> Task 6 testleri buraya <<<
  // >>> Task 7 testleri buraya <<<
  // >>> Task 8 testleri buraya <<<
  // >>> Task 10 Step 4 testi buraya <<<
});
```

- [ ] **Step 1: Write the failing test**

Yukarıdaki bloğun `// >>> Task 5 testleri buraya <<<` satırının yerine ekle:

```javascript
  test('/ekibim: ekip yöneticisi olmayan 403 alır', async () => {
    const temsilci = await calisanOlustur(firmaId, { giris_email: 'ekibim-temsilci@example.com' });
    const token = calisanTokenUret(temsilci.id);
    const res = await request(app).get('/api/mobil/ekibim').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
  });

  test('/ekibim: yönetici altındaki her temsilci için ziyaret özeti döner', async () => {
    const mudur = await calisanOlustur(firmaId, { ekip_yoneticisi: true });
    const temsilci = await calisanOlustur(firmaId, { amiri_id: mudur.id });
    const eczane = await eczaneOlustur(firmaId);
    await pool.query('INSERT INTO ziyaretler (calisan_id, eczane_id) VALUES ($1, $2)', [temsilci.id, eczane.id]);

    const token = calisanTokenUret(mudur.id);
    const res = await request(app).get('/api/mobil/ekibim').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const kayit = res.body.ekip.find(e => e.id === temsilci.id);
    expect(kayit).toBeDefined();
    expect(kayit.toplam_ziyaret).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js -t "ekibim"`
Expected: FAIL — `/api/mobil/ekibim` ucu henüz yok (404).

- [ ] **Step 3: `routes/mobilApi.js`'e import ekle**

Dosyanın import bloğuna ekle:

```javascript
const { calisanAltZinciriIdleri, amiriGecerliMi } = require('../utils/hiyerarsi');
```

- [ ] **Step 4: `/ekibim` ucunu ekle**

`routes/mobilApi.js`'teki `router.get('/eczanelerim', ...)` bloğunun (satır 263-278) hemen altına ekle:

```javascript

router.get('/ekibim', requireCalisanToken, async (req, res) => {
  try {
    const kontrol = await pool.query('SELECT ekip_yoneticisi FROM calisanlar WHERE id = $1', [req.calisanId]);
    if (!kontrol.rows.length) return res.status(401).json({ ok: false, error: 'Çalışan bulunamadı.' });
    if (!kontrol.rows[0].ekip_yoneticisi) return res.status(403).json({ ok: false, error: 'Bu ekranı görüntüleme yetkiniz yok.' });

    const altIdler = await calisanAltZinciriIdleri(req.calisanId);
    if (!altIdler.length) return res.json({ ok: true, ekip: [] });

    const result = await pool.query(
      `SELECT c.id, c.ad, c.soyad,
              COUNT(z.id) AS toplam_ziyaret,
              MAX(z.created_at) AS son_ziyaret
       FROM calisanlar c
       LEFT JOIN ziyaretler z ON z.calisan_id = c.id
       WHERE c.id = ANY($1)
       GROUP BY c.id, c.ad, c.soyad
       ORDER BY c.ad, c.soyad`,
      [altIdler]
    );
    res.json({
      ok: true,
      ekip: result.rows.map(r => ({
        id: r.id, ad: r.ad, soyad: r.soyad,
        toplam_ziyaret: Number(r.toplam_ziyaret),
        son_ziyaret: r.son_ziyaret,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js`
Expected: Tüm testler PASS (yeni testler dahil).

- [ ] **Step 6: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Hiyerarsi T5: GET /api/mobil/ekibim ucu"
```

---

### Task 6: `GET /api/mobil/ekibim/:calisanId/ziyaretler` ucu — sadece direkt amiri erişir

**Files:**
- Modify: `routes/mobilApi.js`
- Test: `tests/mobilApi.test.js`

- [ ] **Step 1: Write the failing test**

Task 5 Step 0'da kurulan `describe('Mobil API — Ekip / Hiyerarşi', ...)` bloğunun `// >>> Task 6 testleri buraya <<<` satırının yerine ekle (`calisanOlustur`/`eczaneOlustur`/`calisanTokenUret` o bloktan gelir):

```javascript
  test('/ekibim/:id/ziyaretler: direkt amiri notu dahil ziyaretleri görür', async () => {
    const mudur = await calisanOlustur(firmaId, { ekip_yoneticisi: true });
    const temsilci = await calisanOlustur(firmaId, { amiri_id: mudur.id });
    const eczane = await eczaneOlustur(firmaId);
    await pool.query(
      "INSERT INTO ziyaretler (calisan_id, eczane_id, temsilci_notu, lat, lng) VALUES ($1, $2, 'Gizli not', 41.0, 29.0)",
      [temsilci.id, eczane.id]
    );

    const token = calisanTokenUret(mudur.id);
    const res = await request(app).get(`/api/mobil/ekibim/${temsilci.id}/ziyaretler`).set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ziyaretler[0].temsilci_notu).toBe('Gizli not');
    expect(res.body.ziyaretler[0].lat).toBe(41.0);
  });

  test('/ekibim/:id/ziyaretler: dolaylı üst müdür (amirinin amiri) 403 alır', async () => {
    const ustMudur = await calisanOlustur(firmaId, { ekip_yoneticisi: true });
    const altMudur = await calisanOlustur(firmaId, { ekip_yoneticisi: true, amiri_id: ustMudur.id });
    const temsilci = await calisanOlustur(firmaId, { amiri_id: altMudur.id });

    const token = calisanTokenUret(ustMudur.id);
    const res = await request(app).get(`/api/mobil/ekibim/${temsilci.id}/ziyaretler`).set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js -t "ekibim.*ziyaretler"`
Expected: FAIL — uç henüz yok.

- [ ] **Step 3: Uç ekle**

`routes/mobilApi.js`'teki (bir önceki task'ta eklenen) `/ekibim` ucunun hemen altına ekle:

```javascript

router.get('/ekibim/:calisanId/ziyaretler', requireCalisanToken, async (req, res) => {
  try {
    const gecerli = await amiriGecerliMi(req.calisanId, req.params.calisanId);
    if (!gecerli) return res.status(403).json({ ok: false, error: 'Bu kişinin ziyaretlerini görüntüleme yetkiniz yok.' });

    const result = await pool.query(
      `SELECT e.ad AS eczane_adi, z.created_at, z.temsilci_notu, z.lat, z.lng
       FROM ziyaretler z JOIN eczaneler e ON e.id = z.eczane_id
       WHERE z.calisan_id = $1
       ORDER BY z.created_at DESC`,
      [req.params.calisanId]
    );
    res.json({ ok: true, ziyaretler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js`
Expected: Tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Hiyerarsi T6: GET /api/mobil/ekibim/:id/ziyaretler - sadece direkt amiri"
```

---

### Task 7: `GET /api/mobil/ekip-ozeti` ucu — günlük banner verisi

**Files:**
- Modify: `routes/mobilApi.js`
- Test: `tests/mobilApi.test.js`

- [ ] **Step 1: Write the failing test**

Task 5 Step 0'daki ortak bloğun `// >>> Task 7 testleri buraya <<<` satırının yerine ekle:

```javascript
  test('/ekip-ozeti: bugünkü toplam ziyaret ve sıfır ziyaretli temsilci sayısını döner', async () => {
    const mudur = await calisanOlustur(firmaId, { ekip_yoneticisi: true });
    const aktifTemsilci = await calisanOlustur(firmaId, { amiri_id: mudur.id });
    const pasifTemsilci = await calisanOlustur(firmaId, { amiri_id: mudur.id });
    const eczane = await eczaneOlustur(firmaId);
    await pool.query('INSERT INTO ziyaretler (calisan_id, eczane_id) VALUES ($1, $2)', [aktifTemsilci.id, eczane.id]);

    const token = calisanTokenUret(mudur.id);
    const res = await request(app).get('/api/mobil/ekip-ozeti').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.bugunki_ziyaret_sayisi).toBe(1);
    expect(res.body.ziyaret_yapmayan_sayisi).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js -t "ekip-ozeti"`
Expected: FAIL — uç henüz yok.

- [ ] **Step 3: Uç ekle**

`routes/mobilApi.js`'teki `/ekibim/:calisanId/ziyaretler` ucunun hemen altına ekle:

```javascript

router.get('/ekip-ozeti', requireCalisanToken, async (req, res) => {
  try {
    const kontrol = await pool.query('SELECT ekip_yoneticisi FROM calisanlar WHERE id = $1', [req.calisanId]);
    if (!kontrol.rows.length) return res.status(401).json({ ok: false, error: 'Çalışan bulunamadı.' });
    if (!kontrol.rows[0].ekip_yoneticisi) return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });

    const altIdler = await calisanAltZinciriIdleri(req.calisanId);
    if (!altIdler.length) return res.json({ ok: true, bugunki_ziyaret_sayisi: 0, ziyaret_yapmayan_sayisi: 0 });

    const bugunkuSonuc = await pool.query(
      `SELECT COUNT(*) AS sayi FROM ziyaretler WHERE calisan_id = ANY($1) AND created_at >= CURRENT_DATE`,
      [altIdler]
    );
    const yapmayanSonuc = await pool.query(
      `SELECT COUNT(*) AS sayi FROM calisanlar
       WHERE id = ANY($1) AND id NOT IN (
         SELECT DISTINCT calisan_id FROM ziyaretler WHERE calisan_id = ANY($1) AND created_at >= CURRENT_DATE
       )`,
      [altIdler]
    );
    res.json({
      ok: true,
      bugunki_ziyaret_sayisi: Number(bugunkuSonuc.rows[0].sayi),
      ziyaret_yapmayan_sayisi: Number(yapmayanSonuc.rows[0].sayi),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js`
Expected: Tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Hiyerarsi T7: GET /api/mobil/ekip-ozeti ucu"
```

---

### Task 8: `ziyaret-kaydet` ucuna `lat`/`lng` desteği

**Files:**
- Modify: `routes/mobilApi.js`
- Test: `tests/mobilApi.test.js`

- [ ] **Step 1: Write the failing test**

Task 5 Step 0'daki ortak bloğun `// >>> Task 8 testleri buraya <<<` satırının yerine ekle:

```javascript
  test('ziyaret-kaydet: lat/lng gönderilirse kaydedilir', async () => {
    const temsilci = await calisanOlustur(firmaId, { giris_email: 'lattest@example.com' });
    const eczane = await eczaneOlustur(firmaId);
    const token = calisanTokenUret(temsilci.id);

    const res = await request(app).post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: eczane.kod, lat: '41.015137', lng: '28.979530' });

    expect(res.statusCode).toBe(201);
    const kontrol = await pool.query('SELECT lat, lng FROM ziyaretler WHERE calisan_id = $1 ORDER BY id DESC LIMIT 1', [temsilci.id]);
    expect(Number(kontrol.rows[0].lat)).toBeCloseTo(41.015137);
    expect(Number(kontrol.rows[0].lng)).toBeCloseTo(28.979530);
  });

  test('ziyaret-kaydet: lat/lng gönderilmezse null kaydedilir, ziyaret yine kaydedilir', async () => {
    const temsilci = await calisanOlustur(firmaId, { giris_email: 'nolattest@example.com' });
    const eczane = await eczaneOlustur(firmaId);
    const token = calisanTokenUret(temsilci.id);

    const res = await request(app).post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: eczane.kod });

    expect(res.statusCode).toBe(201);
    const kontrol = await pool.query('SELECT lat FROM ziyaretler WHERE calisan_id = $1 ORDER BY id DESC LIMIT 1', [temsilci.id]);
    expect(kontrol.rows[0].lat).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js -t "lat/lng"`
Expected: FAIL — `lat`/`lng` şu an INSERT'e dahil değil.

- [ ] **Step 3: `routes/mobilApi.js:218-245`'teki `ziyaret-kaydet` ucunu güncelle**

Mevcut hali:

```javascript
router.post('/ziyaret-kaydet', requireCalisanToken, mobilProfilLimiter, async (req, res) => {
  const { eczane_kod, not } = req.body;
```

Şununla değiştir:

```javascript
router.post('/ziyaret-kaydet', requireCalisanToken, mobilProfilLimiter, async (req, res) => {
  const { eczane_kod, not, lat, lng } = req.body;
```

Ve aynı fonksiyondaki INSERT satırını (mevcut hali):

```javascript
    await pool.query(
      'INSERT INTO ziyaretler (calisan_id, eczane_id, temsilci_notu) VALUES ($1, $2, $3)',
      [req.calisanId, eczane.id, not?.trim() || null]
    );
```

Şununla değiştir:

```javascript
    const latSayi = lat !== undefined && lat !== null && lat !== '' ? Number(lat) : null;
    const lngSayi = lng !== undefined && lng !== null && lng !== '' ? Number(lng) : null;
    await pool.query(
      'INSERT INTO ziyaretler (calisan_id, eczane_id, temsilci_notu, lat, lng) VALUES ($1, $2, $3, $4, $5)',
      [req.calisanId, eczane.id, not?.trim() || null, latSayi, lngSayi]
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js`
Expected: Tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Hiyerarsi T8: ziyaret-kaydet ucuna lat/lng destegi"
```

---

### Task 9: Saha İstatistikleri — firma sahibinden not içeriğini gizle

**Files:**
- Modify: `app.js`
- Test: `tests/panel.test.js`

**Bağlam:** `app.js:285-303`'teki `notlarResult` sorgusu şu an `z.temsilci_notu`'yu doğrudan firma sahibine döndürüyor. Bunun yerine not İÇERİĞİ kaldırılır, sadece kimin-hangi-eczaneye-ne-zaman ziyaret yaptığı ve not OLUP OLMADIĞI (boolean) bilgisi kalır. **Not:** `tests/panel.test.js`'te `calisanOlustur`/`eczaneOlustur` yardımcıları YOK (sadece `firmaOlustur`/`girisYap` var) — bu yüzden aşağıdaki test ham `pool.query` insert kullanır. `agent` ve `firmaId` describe scope'unda (satır 24 `let firmaId, agent`) mevcuttur; `agent` kurumsal bir firmaya giriş yapmıştır (satır 27-31), dolayısıyla `/?tab=saha` bu firma için render edilir.

- [ ] **Step 1: Write the failing test**

`tests/panel.test.js`'in mevcut `describe` bloğunun içine ekle (ham insert ile — yardımcı fonksiyon yok):

```javascript
  test('saha istatistikleri sayfası temsilci_notu içeriğini firma sahibine göstermez', async () => {
    const calisan = (await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Not', 'Test', $2) RETURNING id",
      [firmaId, `not-test-calisan-${Date.now()}`]
    )).rows[0].id;
    const eczane = (await pool.query(
      "INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Not Test Eczanesi', $2) RETURNING id",
      [firmaId, `notkod${Date.now() % 100000}`]
    )).rows[0].id;
    await pool.query(
      "INSERT INTO ziyaretler (calisan_id, eczane_id, temsilci_notu) VALUES ($1, $2, 'GİZLİ-NOT-İÇERİĞİ')",
      [calisan, eczane]
    );
    const res = await agent.get('/?tab=saha');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('GİZLİ-NOT-İÇERİĞİ');

    await pool.query('DELETE FROM calisanlar WHERE id = $1', [calisan]);
    await pool.query('DELETE FROM eczaneler WHERE id = $1', [eczane]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest -t "temsilci_notu içeriğini firma sahibine"`
Expected: FAIL — not içeriği şu an sayfada render ediliyor.

- [ ] **Step 3: `app.js`'teki `notlarResult` sorgusunu güncelle**

`app.js:285-293`'teki mevcut hali:

```javascript
      const notlarResult = await pool.query(
        `SELECT c.ad, c.soyad, e.ad AS eczane_ad, z.temsilci_notu, z.created_at
         FROM ziyaretler z
         JOIN calisanlar c ON c.id = z.calisan_id
         JOIN eczaneler e ON e.id = z.eczane_id
         WHERE c.firma_id = $1 AND z.temsilci_notu IS NOT NULL
         ORDER BY z.created_at DESC LIMIT 20`,
        [req.session.firmaId]
      );
```

Şununla değiştir (not metni yerine sadece var/yok bilgisi):

```javascript
      const notlarResult = await pool.query(
        `SELECT c.ad, c.soyad, e.ad AS eczane_ad, z.created_at
         FROM ziyaretler z
         JOIN calisanlar c ON c.id = z.calisan_id
         JOIN eczaneler e ON e.id = z.eczane_id
         WHERE c.firma_id = $1 AND z.temsilci_notu IS NOT NULL
         ORDER BY z.created_at DESC LIMIT 20`,
        [req.session.firmaId]
      );
```

Ve `app.js:301-303`'teki mevcut hali:

```javascript
        ziyaretNotlari: notlarResult.rows.map(r => ({
          ad: r.ad, soyad: r.soyad, eczaneAd: r.eczane_ad, not: r.temsilci_notu, tarih: r.created_at
        })),
```

Şununla değiştir (`not` alanı kaldırıldı, sadece `notVarMi` boole kaldı):

```javascript
        ziyaretNotlari: notlarResult.rows.map(r => ({
          ad: r.ad, soyad: r.soyad, eczaneAd: r.eczane_ad, notVarMi: true, tarih: r.created_at
        })),
```

- [ ] **Step 4: `views/public/dashboard.ejs`'teki Saha İstatistikleri notlar tablosunu güncelle**

`views/public/dashboard.ejs:628`'deki mevcut satır (gözden geçirmede doğrulandı):

```html
            <%= n.not %>
```

Şununla değiştir:

```html
            <span style="color:#9ca3af;font-style:italic">Not girildi (içerik sadece bağlı olduğu yöneticiye mobilde görünür)</span>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 6: Commit**

```bash
git add app.js views/public/dashboard.ejs tests/
git commit -m "Hiyerarsi T9: Saha Istatistikleri firma sahibinden not icerigini gizler"
```

---

### Task 10: Android — `Models.kt` + `ApiService.kt` yeni tipler/uçlar

**Files:**
- Modify: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/data/Models.kt`
- Modify: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/data/ApiService.kt`

- [ ] **Step 1: `Models.kt`'e yeni veri sınıflarını ekle**

`TemsilciOzet` (satır 70-75) mevcut hali:

```kotlin
data class TemsilciOzet(
    val id: Int,
    val ad: String,
    val soyad: String,
    val firmaId: Int,
)
```

Şununla değiştir:

```kotlin
data class TemsilciOzet(
    val id: Int,
    val ad: String,
    val soyad: String,
    val firmaId: Int,
    val ekipYoneticisi: Boolean = false,
)
```

Dosyanın sonuna (`KatalogGorunduCevap`'tan sonra) ekle:

```kotlin

@Serializable
data class EkipUyesi(
    val id: Int,
    val ad: String,
    val soyad: String,
    val toplam_ziyaret: Int,
    val son_ziyaret: String? = null,
)

@Serializable
data class EkibimCevap(
    val ok: Boolean,
    val ekip: List<EkipUyesi> = emptyList(),
    val error: String? = null,
)

@Serializable
data class EkipUyesiZiyareti(
    val eczane_adi: String,
    val created_at: String,
    val temsilci_notu: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
)

@Serializable
data class EkipUyesiZiyaretleriCevap(
    val ok: Boolean,
    val ziyaretler: List<EkipUyesiZiyareti> = emptyList(),
    val error: String? = null,
)

@Serializable
data class EkipOzetiCevap(
    val ok: Boolean,
    val bugunki_ziyaret_sayisi: Int = 0,
    val ziyaret_yapmayan_sayisi: Int = 0,
    val error: String? = null,
)
```

**Not:** `TemsilciGirisCevap`'ın backend'i (`routes/mobilApi.js`'teki `/temsilci-giris`) şu an `ekip_yoneticisi` alanını dönmüyor — bu, Task 11'de backend tarafında ayrıca eklenecek (bu görev sadece Android modelini hazırlıyor).

- [ ] **Step 2: `ApiService.kt`'e yeni uçları ekle**

Dosyanın sonuna (`katalogGorundu` fonksiyonundan sonra, interface kapanışından önce) ekle:

```kotlin

    @GET("api/mobil/ekibim")
    suspend fun ekibim(
        @Header("Authorization") yetki: String,
    ): Response<EkibimCevap>

    @GET("api/mobil/ekibim/{calisanId}/ziyaretler")
    suspend fun ekipUyesiZiyaretleri(
        @Header("Authorization") yetki: String,
        @Path("calisanId") calisanId: Int,
    ): Response<EkipUyesiZiyaretleriCevap>

    @GET("api/mobil/ekip-ozeti")
    suspend fun ekipOzeti(
        @Header("Authorization") yetki: String,
    ): Response<EkipOzetiCevap>
```

Ayrıca `ziyaretKaydet` fonksiyonuna (satır 50-56) `lat`/`lng` parametreleri ekle — mevcut hali:

```kotlin
    @FormUrlEncoded
    @POST("api/mobil/ziyaret-kaydet")
    suspend fun ziyaretKaydet(
        @Header("Authorization") yetki: String,
        @Field("eczane_kod") eczaneKod: String,
        @Field("not") not: String?,
    ): Response<ZiyaretKaydetCevap>
```

Şununla değiştir:

```kotlin
    @FormUrlEncoded
    @POST("api/mobil/ziyaret-kaydet")
    suspend fun ziyaretKaydet(
        @Header("Authorization") yetki: String,
        @Field("eczane_kod") eczaneKod: String,
        @Field("not") not: String?,
        @Field("lat") lat: Double? = null,
        @Field("lng") lng: Double? = null,
    ): Response<ZiyaretKaydetCevap>
```

- [ ] **Step 3: Backend `/temsilci-giris`'e `ekip_yoneticisi` alanını ekle (Android modeli tüketebilsin diye)**

`routes/mobilApi.js:82`'deki mevcut hali:

```javascript
    res.json({ ok: true, token, calisan: { id: calisan.id, ad: calisan.ad, soyad: calisan.soyad, firmaId: calisan.firma_id } });
```

Şununla değiştir:

```javascript
    res.json({ ok: true, token, calisan: { id: calisan.id, ad: calisan.ad, soyad: calisan.soyad, firmaId: calisan.firma_id, ekipYoneticisi: calisan.ekip_yoneticisi } });
```

- [ ] **Step 4: Backend testi ekle + doğrula**

Task 5 Step 0'daki ortak bloğun `// >>> Task 10 Step 4 testi buraya <<<` satırının yerine ekle (`calisanOlustur`, Step 0'da `giris_sifre`'yi bcrypt ile `giris_sifre_hash`'e yazacak şekilde tanımlanmıştır):

```javascript
  test('/temsilci-giris: ekipYoneticisi alanını döner', async () => {
    await calisanOlustur(firmaId, { ekip_yoneticisi: true, giris_email: 'ekipyon@example.com', giris_sifre: 'test1234' });
    const res = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: 'ekipyon@example.com', sifre: 'test1234' });
    expect(res.body.calisan.ekipYoneticisi).toBe(true);
  });
```

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
cd /c/Users/muham/nfckartify-bayi-android && git add app/src/main/java/com/nfckartify/bayi/data/Models.kt app/src/main/java/com/nfckartify/bayi/data/ApiService.kt
git commit -m "Hiyerarsi Android T10: Models.kt + ApiService.kt yeni tipler/uclar"
cd /c/Users/muham/kurumsal-kartvizit && git commit -m "Hiyerarsi T10: temsilci-giris ekipYoneticisi alani"
```

---

### Task 11: Android — `TokenDeposu` ekip yöneticisi bayrağı + `GirisViewModel` güncellemesi

**Files:**
- Modify: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt`
- Modify: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/ui/GirisViewModel.kt`

- [ ] **Step 1: `TokenDeposu.kt`'teki `temsilciTokenKaydet`'i güncelle**

Mevcut hali (satır 34-38):

```kotlin
    fun temsilciTokenKaydet(token: String, temsilciAdi: String) {
        tercihler.edit()
            .putString("temsilci_token", token)
            .putString("temsilci_adi", temsilciAdi)
            .apply()
    }
```

Şununla değiştir:

```kotlin
    fun temsilciTokenKaydet(token: String, temsilciAdi: String, ekipYoneticisi: Boolean = false) {
        tercihler.edit()
            .putString("temsilci_token", token)
            .putString("temsilci_adi", temsilciAdi)
            .putBoolean("temsilci_ekip_yoneticisi", ekipYoneticisi)
            .apply()
    }

    fun temsilciEkipYoneticisiMi(): Boolean = tercihler.getBoolean("temsilci_ekip_yoneticisi", false)
```

- [ ] **Step 2: `GirisViewModel.kt`'teki temsilci giriş çağrısını güncelle**

`GirisViewModel.kt:61-70`'deki mevcut hali:

```kotlin
                    GirisRolu.TEMSILCI -> {
                        val cevap = ApiClient.servis.temsilciGiris(girisBilgisi, sifre)
                        val govde = cevap.body()
                        if (cevap.isSuccessful && govde?.ok == true && govde.token != null) {
                            val adSoyad = "${govde.calisan?.ad ?: ""} ${govde.calisan?.soyad ?: ""}".trim()
                            tokenDeposu.temsilciTokenKaydet(govde.token, adSoyad)
                            temsilciGirisBasarili = true
                        } else {
                            hataMesaji = govde?.error ?: hataMesajiAl(cevap.errorBody()) ?: "Giriş başarısız."
                        }
                    }
```

Şununla değiştir:

```kotlin
                    GirisRolu.TEMSILCI -> {
                        val cevap = ApiClient.servis.temsilciGiris(girisBilgisi, sifre)
                        val govde = cevap.body()
                        if (cevap.isSuccessful && govde?.ok == true && govde.token != null) {
                            val adSoyad = "${govde.calisan?.ad ?: ""} ${govde.calisan?.soyad ?: ""}".trim()
                            tokenDeposu.temsilciTokenKaydet(govde.token, adSoyad, govde.calisan?.ekipYoneticisi ?: false)
                            temsilciGirisBasarili = true
                        } else {
                            hataMesaji = govde?.error ?: hataMesajiAl(cevap.errorBody()) ?: "Giriş başarısız."
                        }
                    }
```

- [ ] **Step 3: Derleme doğrulaması**

Run: `cd /c/Users/muham/nfckartify-bayi-android && ./gradlew compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android && git add app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt app/src/main/java/com/nfckartify/bayi/ui/GirisViewModel.kt
git commit -m "Hiyerarsi Android T11: TokenDeposu ekip yoneticisi bayragi + GirisViewModel"
```

---

### Task 12: Android — `EkibimViewModel` + `EkibimEkrani`

**Files:**
- Create: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/ui/EkibimViewModel.kt`
- Create: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/ui/EkibimEkrani.kt`

**Bağlam:** `ZiyaretlerimViewModel.kt` + `ZiyaretlerimEkrani.kt` (liste yükleme + loading/hata/oturum-sona-erdi durumları) ile aynı desen izlenir.

- [ ] **Step 1: `EkibimViewModel.kt`**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.EkipUyesi
import com.nfckartify.bayi.data.EkipUyesiZiyareti
import com.nfckartify.bayi.data.TokenDeposu
import com.nfckartify.bayi.data.hataMesajiAl
import kotlinx.coroutines.launch

class EkibimViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var ekip by mutableStateOf<List<EkipUyesi>>(emptyList())
        private set
    var seciliUyeZiyaretleri by mutableStateOf<List<EkipUyesiZiyareti>>(emptyList())
        private set
    var yukleniyor by mutableStateOf(false)
        private set
    var hataMesaji by mutableStateOf<String?>(null)
        private set
    var oturumSuresiDoldu by mutableStateOf(false)
        private set

    fun yukle() {
        val token = tokenDeposu.temsilciTokenAl() ?: run {
            oturumSuresiDoldu = true
            hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
            return
        }
        yukleniyor = true
        hataMesaji = null
        oturumSuresiDoldu = false
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.ekibim("Bearer $token")
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    ekip = govde.ekip
                } else if (cevap.code() == 401) {
                    oturumSuresiDoldu = true
                    hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
                } else {
                    hataMesaji = govde?.error ?: hataMesajiAl(cevap.errorBody()) ?: "Ekip bilgisi alınamadı."
                }
            } catch (e: Exception) {
                hataMesaji = "Bağlantı hatası: ${e.message}"
            } finally {
                yukleniyor = false
            }
        }
    }

    fun uyeZiyaretleriniYukle(calisanId: Int) {
        val token = tokenDeposu.temsilciTokenAl() ?: return
        yukleniyor = true
        hataMesaji = null
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.ekipUyesiZiyaretleri("Bearer $token", calisanId)
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    seciliUyeZiyaretleri = govde.ziyaretler
                } else {
                    hataMesaji = govde?.error ?: hataMesajiAl(cevap.errorBody()) ?: "Ziyaretler alınamadı."
                }
            } catch (e: Exception) {
                hataMesaji = "Bağlantı hatası: ${e.message}"
            } finally {
                yukleniyor = false
            }
        }
    }

    fun uyeSecimiTemizle() {
        seciliUyeZiyaretleri = emptyList()
    }
}
```

- [ ] **Step 2: `EkibimEkrani.kt`**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nfckartify.bayi.data.EkipUyesi

@Composable
fun EkibimEkrani(viewModel: EkibimViewModel, girisEkraninaDon: () -> Unit) {
    LaunchedEffect(Unit) { viewModel.yukle() }
    var seciliUye by remember { mutableStateOf<EkipUyesi?>(null) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Ekibim", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(8.dp))

        if (viewModel.yukleniyor) {
            CircularProgressIndicator()
        } else if (viewModel.oturumSuresiDoldu) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.padding(8.dp))
            Button(onClick = girisEkraninaDon, modifier = Modifier.fillMaxWidth()) {
                Text("Giriş Ekranına Dön")
            }
        } else if (seciliUye != null) {
            OutlinedButton(onClick = { seciliUye = null; viewModel.uyeSecimiTemizle() }) {
                Text("← Ekibe Dön")
            }
            Spacer(modifier = Modifier.padding(4.dp))
            Text("${seciliUye!!.ad} ${seciliUye!!.soyad} — Ziyaretler", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.padding(4.dp))
            if (viewModel.seciliUyeZiyaretleri.isEmpty()) {
                Text("Henüz ziyaret kaydı yok.")
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(viewModel.seciliUyeZiyaretleri) { z ->
                        Card(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
                            Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                                Text(z.eczane_adi, style = MaterialTheme.typography.titleMedium)
                                Text(z.created_at.take(16).replace("T", " "))
                                if (!z.temsilci_notu.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.padding(2.dp))
                                    Text("Not: ${z.temsilci_notu}")
                                }
                            }
                        }
                    }
                }
            }
        } else if (viewModel.hataMesaji != null) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
        } else if (viewModel.ekip.isEmpty()) {
            Text("Ekibinizde henüz kimse yok.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(viewModel.ekip) { uye: EkipUyesi ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(4.dp).clickable {
                            seciliUye = uye
                            viewModel.uyeZiyaretleriniYukle(uye.id)
                        }
                    ) {
                        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                            Text("${uye.ad} ${uye.soyad}", style = MaterialTheme.typography.titleMedium)
                            Text("Toplam ziyaret: ${uye.toplam_ziyaret}")
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Derleme doğrulaması**

Run: `cd /c/Users/muham/nfckartify-bayi-android && ./gradlew compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android && git add app/src/main/java/com/nfckartify/bayi/ui/EkibimViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/EkibimEkrani.kt
git commit -m "Hiyerarsi Android T12: EkibimViewModel + EkibimEkrani"
```

---

### Task 13: Android — `TemsilciAnaEkrani`'ne "Ekibim" butonu + günlük özet banner'ı

**Files:**
- Modify: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/ui/TemsilciAnaEkrani.kt`
- Create: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/ui/EkipOzetiViewModel.kt`

- [ ] **Step 1: `EkipOzetiViewModel.kt`**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.TokenDeposu
import kotlinx.coroutines.launch

class EkipOzetiViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var bugunkiZiyaretSayisi by mutableStateOf(0)
        private set
    var ziyaretYapmayanSayisi by mutableStateOf(0)
        private set
    var gorunur by mutableStateOf(false)
        private set

    fun kontrolEt() {
        if (!tokenDeposu.temsilciEkipYoneticisiMi()) return
        val token = tokenDeposu.temsilciTokenAl() ?: return
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.ekipOzeti("Bearer $token")
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    bugunkiZiyaretSayisi = govde.bugunki_ziyaret_sayisi
                    ziyaretYapmayanSayisi = govde.ziyaret_yapmayan_sayisi
                    gorunur = true
                }
            } catch (e: Exception) {
                // Sessizce yok say — banner sadece bilgilendirme amaçlı, kritik akışı bloklamaz.
            }
        }
    }
}
```

- [ ] **Step 2: `TemsilciAnaEkrani.kt`'yi güncelle**

Mevcut fonksiyon imzasını (satır 20-27):

```kotlin
@Composable
fun TemsilciAnaEkrani(
    katalogDurumuViewModel: KatalogDurumuViewModel,
    ziyaretKaydetTiklandi: () -> Unit,
    ziyaretlerimTiklandi: () -> Unit,
    rafKartiYazTiklandi: () -> Unit,
    cikisTiklandi: () -> Unit,
) {
    LaunchedEffect(Unit) { katalogDurumuViewModel.kontrolEt() }
```

Şununla değiştir:

```kotlin
@Composable
fun TemsilciAnaEkrani(
    katalogDurumuViewModel: KatalogDurumuViewModel,
    ekipOzetiViewModel: EkipOzetiViewModel,
    ziyaretKaydetTiklandi: () -> Unit,
    ziyaretlerimTiklandi: () -> Unit,
    rafKartiYazTiklandi: () -> Unit,
    ekibimTiklandi: () -> Unit,
    cikisTiklandi: () -> Unit,
) {
    LaunchedEffect(Unit) {
        katalogDurumuViewModel.kontrolEt()
        ekipOzetiViewModel.kontrolEt()
    }
```

Katalog banner Card'ının (satır 38-48) hemen altına, "Ziyaret Kaydet" butonundan önce ekle:

```kotlin
        if (ekipOzetiViewModel.gorunur) {
            Card(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                    Text("👥 Bugün ekibin ${ekipOzetiViewModel.bugunkiZiyaretSayisi} ziyaret yaptı", style = MaterialTheme.typography.titleMedium)
                    if (ekipOzetiViewModel.ziyaretYapmayanSayisi > 0) {
                        Text("${ekipOzetiViewModel.ziyaretYapmayanSayisi} kişi bugün henüz ziyaret yapmadı.")
                    }
                    Spacer(modifier = Modifier.padding(4.dp))
                    Button(onClick = ekibimTiklandi, modifier = Modifier.fillMaxWidth()) {
                        Text("Ekibimi Görüntüle")
                    }
                }
            }
        }
```

- [ ] **Step 3: Derleme doğrulaması**

Run: `cd /c/Users/muham/nfckartify-bayi-android && ./gradlew compileDebugKotlin`
Expected: BUILD SUCCESSFUL (hata varsa `NfcKartifyApp.kt`'teki çağrı Task 15'te güncelleneceği için bu adımda geçici bir derleme hatası normal olabilir — Task 15 tamamlanınca tekrar derlenmeli).

- [ ] **Step 4: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android && git add app/src/main/java/com/nfckartify/bayi/ui/TemsilciAnaEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/EkipOzetiViewModel.kt
git commit -m "Hiyerarsi Android T13: TemsilciAnaEkrani ekip ozeti banner + Ekibim butonu"
```

---

### Task 14: Android — `ZiyaretKaydetViewModel`'e konum okuma + izin

**Files:**
- Modify: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetViewModel.kt`
- Modify: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetEkrani.kt`
- Modify: `nfckartify-bayi-android/app/src/main/AndroidManifest.xml`

**Bağlam:** Sürekli takip yok — sadece ziyaret kaydı anında tek seferlik konum okuması. İzin reddedilirse ziyaret yine `lat=null, lng=null` ile kaydedilir (engelleyici değil).

- [ ] **Step 1: `AndroidManifest.xml`'e izin ekle**

`AndroidManifest.xml`'deki mevcut `<uses-permission android:name="android.permission.NFC" />` (veya benzeri) satırının yanına ekle:

```xml
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

- [ ] **Step 2: `ZiyaretKaydetViewModel.kt`'e konum parametresi ekle**

`fun notuKaydet()` (satır 51-54) mevcut hali:

```kotlin
    fun notuKaydet() {
        val kod = algilananEczaneKodu ?: return
        ziyaretiKaydet(kod, not.trim().ifEmpty { null })
    }
```

Şununla değiştir:

```kotlin
    fun notuKaydet(lat: Double?, lng: Double?) {
        val kod = algilananEczaneKodu ?: return
        ziyaretiKaydet(kod, not.trim().ifEmpty { null }, lat, lng)
    }
```

`private fun ziyaretiKaydet(eczaneKod: String, notMetni: String?)` (satır 56-88) mevcut hali:

```kotlin
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
```

Şununla değiştir:

```kotlin
    private fun ziyaretiKaydet(eczaneKod: String, notMetni: String?, lat: Double?, lng: Double?) {
        val token = tokenDeposu.temsilciTokenAl() ?: run {
            durum = ZiyaretKaydetDurumu.HATA
            oturumSuresiDoldu = true
            hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
            return
        }
        durum = ZiyaretKaydetDurumu.KAYDEDILIYOR
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.ziyaretKaydet("Bearer $token", eczaneKod, notMetni, lat, lng)
```

- [ ] **Step 3: `ZiyaretKaydetEkrani.kt`'te konum izni iste + `notuKaydet`'e geçir**

`ZiyaretKaydetEkrani.kt`'te "Kaydet" butonunun `onClick`'inde şu an `viewModel.notuKaydet()` çağrılıyor (dosyanın tam güncel hali önce okunmalı — `grep -n "notuKaydet" ZiyaretKaydetEkrani.kt`). Bu çağrının yapıldığı yere, tek seferlik konum okuma eklenir:

```kotlin
val context = LocalContext.current
val konumIzniLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { izinVerildi ->
    if (izinVerildi) {
        konumOku(context) { lat, lng -> viewModel.notuKaydet(lat, lng) }
    } else {
        viewModel.notuKaydet(null, null)
    }
}
```

Ve "Kaydet" butonunun `onClick`'i, doğrudan `viewModel.notuKaydet()` yerine:

```kotlin
onClick = {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
        konumOku(context) { lat, lng -> viewModel.notuKaydet(lat, lng) }
    } else {
        konumIzniLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
    }
}
```

`ZiyaretKaydetEkrani.kt`'in üstüne (veya ayrı bir `Konum.kt` dosyasına) yardımcı fonksiyon ekle:

```kotlin
@SuppressLint("MissingPermission")
private fun konumOku(context: Context, sonuc: (Double?, Double?) -> Unit) {
    val istemci = LocationServices.getFusedLocationProviderClient(context)
    istemci.lastLocation
        .addOnSuccessListener { konum -> sonuc(konum?.latitude, konum?.longitude) }
        .addOnFailureListener { sonuc(null, null) }
}
```

- [ ] **Step 4: `build.gradle.kts`'e Google Play Services Location bağımlılığı ekle (yoksa)**

Run: `grep -n "play-services-location" /c/Users/muham/nfckartify-bayi-android/app/build.gradle.kts`

Eğer sonuç boşsa, `app/build.gradle.kts`'in `dependencies` bloğuna ekle:

```kotlin
    implementation("com.google.android.gms:play-services-location:21.3.0")
```

- [ ] **Step 5: Derleme doğrulaması**

Run: `cd /c/Users/muham/nfckartify-bayi-android && ./gradlew compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android && git add app/src/main/AndroidManifest.xml app/build.gradle.kts app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetEkrani.kt
git commit -m "Hiyerarsi Android T14: ziyaret kaydinda GPS konumu okuma"
```

---

### Task 15: Android — Navigasyon (`NfcKartifyApp.kt`)

**Files:**
- Modify: `nfckartify-bayi-android/app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt`

- [ ] **Step 1: `temsilciAna` composable'ını güncelle**

`NfcKartifyApp.kt:48-62`'deki mevcut hali:

```kotlin
        composable("temsilciAna") {
            val katalogDurumuVm: KatalogDurumuViewModel = viewModel { KatalogDurumuViewModel(tokenDeposu) }
            TemsilciAnaEkrani(
                katalogDurumuViewModel = katalogDurumuVm,
                ziyaretKaydetTiklandi = { navController.navigate("ziyaretKaydet") },
                ziyaretlerimTiklandi = { navController.navigate("ziyaretlerim") },
                rafKartiYazTiklandi = { navController.navigate("eczanelerim") },
                cikisTiklandi = {
                    tokenDeposu.cikisYap()
                    navController.navigate("giris") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
```

Şununla değiştir:

```kotlin
        composable("temsilciAna") {
            val katalogDurumuVm: KatalogDurumuViewModel = viewModel { KatalogDurumuViewModel(tokenDeposu) }
            val ekipOzetiVm: EkipOzetiViewModel = viewModel { EkipOzetiViewModel(tokenDeposu) }
            TemsilciAnaEkrani(
                katalogDurumuViewModel = katalogDurumuVm,
                ekipOzetiViewModel = ekipOzetiVm,
                ziyaretKaydetTiklandi = { navController.navigate("ziyaretKaydet") },
                ziyaretlerimTiklandi = { navController.navigate("ziyaretlerim") },
                rafKartiYazTiklandi = { navController.navigate("eczanelerim") },
                ekibimTiklandi = { navController.navigate("ekibim") },
                cikisTiklandi = {
                    tokenDeposu.cikisYap()
                    navController.navigate("giris") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
        composable("ekibim") {
            val vm: EkibimViewModel = viewModel { EkibimViewModel(tokenDeposu) }
            EkibimEkrani(
                viewModel = vm,
                girisEkraninaDon = {
                    tokenDeposu.cikisYap()
                    navController.navigate("giris") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
```

- [ ] **Step 2: Derleme doğrulaması**

Run: `cd /c/Users/muham/nfckartify-bayi-android && ./gradlew compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android && git add app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt
git commit -m "Hiyerarsi Android T15: navigasyon - Ekibim ekrani + ekip ozeti wiring"
```

---

### Task 16: Tam test + deploy + production doğrulama + Android cihaz testi

**Files:** Yok (komutlar)

- [ ] **Step 1: Backend — tüm testler**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 2: Backend — push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Prod migration**

Run: `node scripts/migrate.js`
Expected: `amiri_id`, `ekip_yoneticisi`, `lat`, `lng` için `OK`.

- [ ] **Step 4: Production doğrulama (backend)**

Marker firma + 2 çalışan oluştur (`node -e` script'i ile, mevcut markerdesenle): birini `ekip_yoneticisi=true`, diğerini onun `amiri_id`'sine bağla. Marker eczane oluştur, `POST /api/mobil/ziyaret-kaydet` ile (calisan token'ıyla) `lat`/`lng` gönderip ziyaret kaydet. Müdür token'ıyla `GET /api/mobil/ekibim` ve `GET /api/mobil/ekibim/:id/ziyaretler` çağırıp doğru veriyi döndüğünü doğrula. `GET /?tab=saha` sayfasında not METNİNİN artık görünmediğini `curl` ile doğrula.

- [ ] **Step 5: Marker verisini temizle**

Oluşturulan marker firma/çalışan/eczane/ziyaret kayıtlarını sil.

- [ ] **Step 6: git durumu (backend)**

Run: `cd /c/Users/muham/kurumsal-kartvizit && git status --short`
Expected: Boş.

- [ ] **Step 7: Android — tam derleme**

Run: `cd /c/Users/muham/nfckartify-bayi-android && ./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Gerçek cihazda uçtan uca test**

Gerçek cihazda: bir hesabı "ekip yöneticisi" yapıp diğerini altına bağladıktan sonra (panel üzerinden), yönetici hesabıyla mobil girişi yap, ana ekranda ekip özeti bannerının göründüğünü, "Ekibim" ekranının doğru listeyi gösterdiğini, bir üyeye tıklayınca ziyaretlerinin (not dahil) göründüğünü doğrula. Temsilci hesabıyla bir ziyaret kaydet — konum izni istendiğinde "İzin Ver" seçilirse ziyaretin `lat`/`lng` ile, reddedilirse `null` ile ama yine de başarıyla kaydedildiğini doğrula.

- [ ] **Step 9: git durumu (Android)**

Run: `cd /c/Users/muham/nfckartify-bayi-android && git status --short`
Expected: Boş.
