# Raf Kartı Ürün Tanıtımı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurumsal firmaların, eczane raf kartı sayfasında iletişim bilgilerinin yanında kendi ürünlerini (foto + isim + açıklama + opsiyonel PDF) tanıtabilmesi.

**Architecture:** Yeni `urunler` ve `urun_tiklamalar` tabloları (firma genelinde ortak liste). Kurumsal panelde mevcut "İçerik" sekmesinin yanına "Ürünler" sekmesi — CRUD + sıralama. Public `raf.ejs` sayfasına, mevcut buton listesinin altına aktif ürünleri gösteren bir bölüm — tıklamalar `urun_tiklamalar`'a düşer, PDF'li ürünler `/raf/:kod/urun/:urunId/tikla` üzerinden yeni sekmede açılır, PDF'siz ürünler bir modal'da açıklamayı gösterir.

**Tech Stack:** Node.js/Express, PostgreSQL, EJS, mevcut `public/js/foto-kirpici.js` (kare kırpma), `middleware/upload.js` (`uploadMiddleware`/`pdfUploadMiddleware`).

---

### Task 1: DB migration — `urunler` + `urun_tiklamalar` tabloları

**Files:**
- Modify: `scripts/migrate.js`

- [ ] **Step 1: Migration dizisinin sonuna ekle**

`scripts/migrate.js`'in migration dizisindeki son satırdan hemen önce ekle:

```javascript
    `CREATE TABLE IF NOT EXISTS urunler (
      id          SERIAL PRIMARY KEY,
      firma_id    INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
      ad          TEXT NOT NULL,
      aciklama    TEXT,
      foto_url    TEXT,
      pdf_url     TEXT,
      sira        INTEGER DEFAULT 0,
      aktif       BOOLEAN DEFAULT true,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS urun_tiklamalar (
      id          SERIAL PRIMARY KEY,
      urun_id     INTEGER REFERENCES urunler(id) ON DELETE CASCADE,
      eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
```

- [ ] **Step 2: Migration'ı yerel veritabanında çalıştır**

Run: `cd /c/Users/muham/kurumsal-kartvizit && node scripts/migrate.js`
Expected: Yeni iki satır için `OK`, hata yok.

- [ ] **Step 3: Tabloların oluştuğunu doğrula**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const r = await pool.query(\"SELECT table_name FROM information_schema.tables WHERE table_name IN ('urunler','urun_tiklamalar')\");
  console.log(r.rows.map(r => r.table_name));
  await pool.end();
})();
"
```
Expected: `['urunler', 'urun_tiklamalar']` (sırası önemsiz).

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.js
git commit -m "Urun tanitimi T1: DB migration - urunler + urun_tiklamalar tablolari"
```

---

### Task 2: Kurumsal panel — ürün CRUD uçları

**Files:**
- Modify: `routes/kurumsal.js`
- Test: `tests/kurumsal.test.js`

**Bağlam:** `routes/kurumsal.js`'in üstünde `uploadMiddleware`/`pdfUploadMiddleware` zaten import edilmiş (satır 8), `guvenliUpload` yardımcı fonksiyonu (satır 16-32) mevcut. Ürün foto/pdf yüklemesi için aynı desen kullanılacak.

- [ ] **Step 1: Write the failing test**

`tests/kurumsal.test.js`'e, `describe('Kurumsal panel uçları', ...)` bloğu içine ekle:

```javascript
  test('ürün eklenir, listelenir, güncellenir, silinir', async () => {
    const agent = kurumsalAgent;
    const ekle = await agent.post('/kurumsal/urunler').send({ ad: 'Test Ürünü', aciklama: 'Açıklama metni' });
    expect(ekle.statusCode).toBe(302);

    const liste = await pool.query('SELECT * FROM urunler WHERE firma_id = $1', [kurumsalId]);
    expect(liste.rows.length).toBe(1);
    expect(liste.rows[0].ad).toBe('Test Ürünü');
    expect(liste.rows[0].aktif).toBe(true);
    const urunId = liste.rows[0].id;

    const guncelle = await agent.put(`/kurumsal/urunler/${urunId}`).send({ ad: 'Güncel Ürün', aciklama: 'Yeni açıklama', aktif: 'false' });
    expect(guncelle.statusCode).toBe(302);
    const guncelKontrol = await pool.query('SELECT ad, aktif FROM urunler WHERE id = $1', [urunId]);
    expect(guncelKontrol.rows[0].ad).toBe('Güncel Ürün');
    expect(guncelKontrol.rows[0].aktif).toBe(false);

    const sil = await agent.delete(`/kurumsal/urunler/${urunId}`);
    expect(sil.statusCode).toBe(302);
    const silKontrol = await pool.query('SELECT * FROM urunler WHERE id = $1', [urunId]);
    expect(silKontrol.rows.length).toBe(0);
  });

  test('başka firmanın ürünü düzenlenemez/silinemez', async () => {
    const urunRes = await pool.query(
      "INSERT INTO urunler (firma_id, ad) VALUES ($1, 'Yabancı Ürün') RETURNING id",
      [kurumsalId]
    );
    const urunId = urunRes.rows[0].id;
    const digerId = await firmaOlustur('kurumsal', 'k1urundigeri@example.com');
    const digerAgent = await girisYap('k1urundigeri@example.com');

    await digerAgent.put(`/kurumsal/urunler/${urunId}`).send({ ad: 'HACKLENDI' });
    const kontrol = await pool.query('SELECT ad FROM urunler WHERE id = $1', [urunId]);
    expect(kontrol.rows[0].ad).toBe('Yabancı Ürün');

    await digerAgent.delete(`/kurumsal/urunler/${urunId}`);
    const silKontrol = await pool.query('SELECT * FROM urunler WHERE id = $1', [urunId]);
    expect(silKontrol.rows.length).toBe(1);

    await pool.query('DELETE FROM urunler WHERE id = $1', [urunId]);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerId]);
  });

  test('ürün sırası güncellenir', async () => {
    const a = (await pool.query("INSERT INTO urunler (firma_id, ad, sira) VALUES ($1, 'A', 0) RETURNING id", [kurumsalId])).rows[0].id;
    const b = (await pool.query("INSERT INTO urunler (firma_id, ad, sira) VALUES ($1, 'B', 1) RETURNING id", [kurumsalId])).rows[0].id;

    await kurumsalAgent.put(`/kurumsal/urunler/${a}/sira`).send({ sira: 1 });
    await kurumsalAgent.put(`/kurumsal/urunler/${b}/sira`).send({ sira: 0 });

    const kontrol = await pool.query('SELECT id, sira FROM urunler WHERE id = ANY($1) ORDER BY sira', [[a, b]]);
    expect(kontrol.rows[0].id).toBe(b);
    expect(kontrol.rows[1].id).toBe(a);

    await pool.query('DELETE FROM urunler WHERE id = ANY($1)', [[a, b]]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/kurumsal.test.js -t "ürün"`
Expected: FAIL — uçlar henüz yok (404/302 redirect farkı ile veya sorgu boş dönerek).

- [ ] **Step 3: `routes/kurumsal.js`'e ürün upload middleware'lerini ekle**

Dosyanın üst kısmındaki middleware tanımlarının yanına (satır 10-12'den sonra) ekle:

```javascript
const urunFotoUpload = uploadMiddleware('urunler');
const urunPdfUpload = pdfUploadMiddleware('urun-dokumanlar');
```

- [ ] **Step 4: CRUD uçlarını ekle**

Dosyanın sonuna, `module.exports = router;` satırından hemen önce ekle:

```javascript
// Ürün ekle
router.post('/urunler', guvenliUpload(urunFotoUpload, 'foto', '/?tab=urunler'), async (req, res) => {
  const { ad, aciklama } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Ürün adı zorunlu.');
    return res.redirect('/?tab=urunler');
  }
  try {
    const siraSonuc = await pool.query('SELECT COALESCE(MAX(sira), -1) + 1 AS sonraki FROM urunler WHERE firma_id = $1', [req.session.firmaId]);
    await pool.query(
      'INSERT INTO urunler (firma_id, ad, aciklama, foto_url, sira) VALUES ($1, $2, $3, $4, $5)',
      [req.session.firmaId, ad.trim(), aciklama || null, req.file?.location || null, siraSonuc.rows[0].sonraki]
    );
    req.flash('success', 'Ürün eklendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Ürün eklenemedi.');
  }
  res.redirect('/?tab=urunler');
});

// Ürün düzenle
router.put('/urunler/:id', guvenliUpload(urunFotoUpload, 'foto', '/?tab=urunler'), async (req, res) => {
  const { ad, aciklama, aktif } = req.body;
  if (!ad || !ad.trim()) {
    req.flash('error', 'Ürün adı zorunlu.');
    return res.redirect('/?tab=urunler');
  }
  try {
    if (req.file?.location) {
      await pool.query(
        'UPDATE urunler SET ad=$1, aciklama=$2, aktif=$3, foto_url=$4 WHERE id=$5 AND firma_id=$6',
        [ad.trim(), aciklama || null, aktif !== 'false', req.file.location, req.params.id, req.session.firmaId]
      );
    } else {
      await pool.query(
        'UPDATE urunler SET ad=$1, aciklama=$2, aktif=$3 WHERE id=$4 AND firma_id=$5',
        [ad.trim(), aciklama || null, aktif !== 'false', req.params.id, req.session.firmaId]
      );
    }
    req.flash('success', 'Ürün güncellendi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Güncellenemedi.');
  }
  res.redirect('/?tab=urunler');
});

// Ürün sil
router.delete('/urunler/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM urunler WHERE id=$1 AND firma_id=$2', [req.params.id, req.session.firmaId]);
    req.flash('success', 'Ürün silindi.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Silinemedi.');
  }
  res.redirect('/?tab=urunler');
});

// Ürün PDF yükle
router.post('/urunler/:id/pdf', guvenliUpload(urunPdfUpload, 'pdf', '/?tab=urunler'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE urunler SET pdf_url=$1 WHERE id=$2 AND firma_id=$3', [req.file.location, req.params.id, req.session.firmaId]);
      req.flash('success', 'Ürün dokümanı yüklendi.');
    } else {
      req.flash('error', 'Dosya kaydedilemedi (depolama yapılandırılmamış).');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Doküman yüklenemedi.');
  }
  res.redirect('/?tab=urunler');
});

// Ürün sırasını güncelle
router.put('/urunler/:id/sira', async (req, res) => {
  try {
    await pool.query('UPDATE urunler SET sira=$1 WHERE id=$2 AND firma_id=$3', [req.body.sira, req.params.id, req.session.firmaId]);
    res.redirect('/?tab=urunler');
  } catch (err) {
    console.error(err);
    res.redirect('/?tab=urunler');
  }
});

```

**Not:** `PUT`/`DELETE` metodları, projenin geri kalanında da kullanılan `method-override` middleware'i (form'daki gizli `_method` alanı) üzerinden çalışır — `app.js`'te zaten kurulu (bkz. `openSlideEdit`/`kartForm` desenleri).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/kurumsal.test.js`
Expected: Tüm testler PASS (yeni testler dahil).

- [ ] **Step 6: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "Urun tanitimi T2: kurumsal panel urun CRUD uclari"
```

---

### Task 3: Kurumsal panel — "Ürünler" sekmesi UI

**Files:**
- Modify: `views/public/dashboard.ejs`
- Modify: `app.js` (dashboard render — `urunler` verisinin view'a geçirilmesi)

**Bağlam:** `dashboard.ejs`'in tab menüsü (satır 250-260) `firma.paket === 'kurumsal'` bloğunun içinde "İçerik"/"Raf Kartları"/"Saha İstatistikleri" sekmeleri var. Dashboard render eden `app.js`'teki route (kurumsal panel ana sayfası), `calisanlar`, `firma` gibi değişkenleri zaten view'a geçiriyor — oraya `urunler` eklenecek.

- [ ] **Step 1: `app.js`'te dashboard render'ına `urunler` sorgusu ekle**

`app.js`'te kurumsal panel ana route'unun (dashboard render eden, `firma.paket === 'kurumsal'` olan firmalar için `eczaneler`/`linkAnalytics` gibi ekstra verilerin sorgulandığı yer) içine, aynı desenle bir sorgu ekle:

```javascript
    const urunlerSonuc = firma.paket === 'kurumsal'
      ? await pool.query('SELECT * FROM urunler WHERE firma_id = $1 ORDER BY sira', [firma.id])
      : { rows: [] };
```

Ve `res.render('public/dashboard', { ... })` çağrısındaki obje içine `urunler: urunlerSonuc.rows,` ekle.

**Not:** Bu adımdan önce `app.js`'teki tam render bloğunu okuyup mevcut değişken isimlerini (örn. `eczaneler` nasıl sorgulanıyor) birebir eşleştirerek ekleyin — dosyanın tam güncel hali bu plandan bağımsız olarak kontrol edilmeli.

- [ ] **Step 2: Tab menüsüne "Ürünler" linkini ekle**

`views/public/dashboard.ejs:255-259`'daki mevcut hali:

```html
    <% if (firma.paket === 'kurumsal') { %>
    <a href="/?tab=icerik" class="dash-tab <%= tab === 'icerik' ? 'active' : '' %>">İçerik</a>
    <a href="/?tab=raf"    class="dash-tab <%= tab === 'raf'    ? 'active' : '' %>">Raf Kartları</a>
    <a href="/?tab=saha"   class="dash-tab <%= tab === 'saha'   ? 'active' : '' %>">Saha İstatistikleri</a>
    <% } %>
```

Şununla değiştir:

```html
    <% if (firma.paket === 'kurumsal') { %>
    <a href="/?tab=icerik"  class="dash-tab <%= tab === 'icerik'  ? 'active' : '' %>">İçerik</a>
    <a href="/?tab=urunler" class="dash-tab <%= tab === 'urunler' ? 'active' : '' %>">Ürünler</a>
    <a href="/?tab=raf"     class="dash-tab <%= tab === 'raf'     ? 'active' : '' %>">Raf Kartları</a>
    <a href="/?tab=saha"    class="dash-tab <%= tab === 'saha'    ? 'active' : '' %>">Saha İstatistikleri</a>
    <% } %>
```

- [ ] **Step 3: Ürünler sekmesi içeriğini ekle**

`views/public/dashboard.ejs:465-508`'deki (TAB: KURUMSAL İÇERİK bloğunun) hemen sonuna, `<!-- TAB: RAF KARTLARI -->` yorumundan önce ekle:

```html

  <!-- TAB: ÜRÜNLER -->
  <% } else if (tab === 'urunler' && firma.paket === 'kurumsal') { %>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px;max-width:560px">
      <h3 style="margin-bottom:12px">Yeni Ürün Ekle</h3>
      <form method="POST" action="/kurumsal/urunler" enctype="multipart/form-data" style="display:flex;flex-direction:column;gap:8px">
        <input name="ad" placeholder="Ürün adı *" required>
        <textarea name="aciklama" placeholder="Kısa açıklama" rows="3"></textarea>
        <input type="file" name="foto" id="urunFotoInput" accept="image/*">
        <button type="submit">Ekle</button>
      </form>
    </div>

    <% if (urunler.length) { %>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Foto</th><th>Ad</th><th>Durum</th><th>PDF</th><th>İşlem</th></tr></thead>
        <tbody>
          <% urunler.forEach(u => { %>
          <tr>
            <td><% if (u.foto_url) { %><img src="<%= u.foto_url %>" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover"><% } else { %>—<% } %></td>
            <td class="td-name"><%= u.ad %></td>
            <td><span class="badge badge-<%= u.aktif ? 'aktif' : 'pasif' %>"><%= u.aktif ? 'Aktif' : 'Pasif' %></span></td>
            <td>
              <% if (u.pdf_url) { %><a href="<%= u.pdf_url %>" target="_blank">Görüntüle</a><% } %>
              <form method="POST" action="/kurumsal/urunler/<%= u.id %>/pdf" enctype="multipart/form-data" style="margin-top:4px">
                <input type="file" name="pdf" accept="application/pdf" style="max-width:140px">
                <button type="submit" class="btn btn-sm">Yükle</button>
              </form>
            </td>
            <td>
              <div class="td-actions">
                <button class="btn btn-border btn-sm" onclick='urunDuzenleAc(<%- JSON.stringify(u) %>)'>Düzenle</button>
                <form method="POST" action="/kurumsal/urunler/<%= u.id %>" style="display:inline">
                  <input type="hidden" name="_method" value="DELETE">
                  <button type="submit" class="btn btn-danger-sm btn-sm" onclick="return confirm('<%= u.ad %> silinsin mi?')">Sil</button>
                </form>
              </div>
            </td>
          </tr>
          <% }); %>
        </tbody>
      </table>
    </div>
    <% } else { %>
    <div class="table-wrap">
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <div class="empty-state-title">Henüz ürün yok</div>
        <div class="empty-state-sub">Eklediğiniz ürünler raf kartı sayfasında görünür</div>
      </div>
    </div>
    <% } %>

    <!-- Ürün Düzenle Modal -->
    <div id="urunDuzenleModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:60;padding:16px">
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:100%;position:relative">
        <button type="button" onclick="document.getElementById('urunDuzenleModal').style.display='none'" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:18px;cursor:pointer">✕</button>
        <h3 style="margin-bottom:16px;font-size:16px;font-weight:700">Ürün Düzenle</h3>
        <form id="urunDuzenleForm" method="POST" enctype="multipart/form-data" style="display:flex;flex-direction:column;gap:8px">
          <input type="hidden" name="_method" value="PUT">
          <input type="hidden" name="aktif" id="urunDuzenleAktifGizli" value="true">
          <input id="urunDuzenleAd" name="ad" placeholder="Ürün adı *" required>
          <textarea id="urunDuzenleAciklama" name="aciklama" placeholder="Kısa açıklama" rows="3"></textarea>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px">
            <input type="checkbox" id="urunDuzenleAktifKutu" onchange="document.getElementById('urunDuzenleAktifGizli').value = this.checked ? 'true' : 'false'">
            Raf kartı sayfasında görünsün
          </label>
          <input type="file" name="foto" id="urunDuzenleFotoInput" accept="image/*">
          <button type="submit">Kaydet</button>
        </form>
      </div>
    </div>

  <!-- TAB: RAF KARTLARI -->
```

- [ ] **Step 4: Ürün düzenle modal'ının JS fonksiyonunu + kırpıcı bağlamalarını ekle**

`views/public/dashboard.ejs:988-989`'daki mevcut hali:

```javascript
  fotoKirpiciBaglama('logoInput');
  fotoKirpiciBaglama('f_foto');
```

Şununla değiştir:

```javascript
  fotoKirpiciBaglama('logoInput');
  fotoKirpiciBaglama('f_foto');
  fotoKirpiciBaglama('urunFotoInput');
  fotoKirpiciBaglama('urunDuzenleFotoInput');
```

Aynı `<script>` bloğuna, `fotoKirpiciBaglama` çağrılarının hemen üstüne ekle:

```javascript
  function urunDuzenleAc(u) {
    document.getElementById('urunDuzenleForm').action = '/kurumsal/urunler/' + u.id;
    document.getElementById('urunDuzenleAd').value = u.ad;
    document.getElementById('urunDuzenleAciklama').value = u.aciklama || '';
    document.getElementById('urunDuzenleAktifKutu').checked = u.aktif;
    document.getElementById('urunDuzenleAktifGizli').value = u.aktif ? 'true' : 'false';
    document.getElementById('urunDuzenleFotoInput').value = '';
    document.getElementById('urunDuzenleModal').style.display = 'flex';
  }
```

- [ ] **Step 5: Tarayıcıda manuel doğrulama**

Yerel sunucuyu başlat, kurumsal firma hesabıyla giriş yap, Ürünler sekmesine git: ürün ekle (foto ile), listede göründüğünü doğrula, Düzenle ile açıklamayı değiştir, PDF yükle, Sil ile kaldır.

- [ ] **Step 6: Commit**

```bash
git add views/public/dashboard.ejs app.js
git commit -m "Urun tanitimi T3: kurumsal panel Urunler sekmesi UI"
```

---

### Task 4: Public raf kartı sayfasına "Ürünlerimiz" bölümü + tıklama takibi

**Files:**
- Modify: `routes/public.js`
- Modify: `views/public/raf.ejs`
- Test: `tests/raf.test.js`

- [ ] **Step 1: Write the failing test**

`tests/raf.test.js`'e (mevcut `describe` bloğunun içine, kurulumdan sonra) ekle:

```javascript
  test('aktif ürünler raf sayfasında görünür, pasif ürün görünmez', async () => {
    const aktifUrun = (await pool.query(
      "INSERT INTO urunler (firma_id, ad, aciklama, aktif) VALUES ($1, 'Aktif Ürün', 'Açıklama', true) RETURNING id",
      [firmaId]
    )).rows[0].id;
    await pool.query("INSERT INTO urunler (firma_id, ad, aktif) VALUES ($1, 'Pasif Ürün', false)", [firmaId]);

    const res = await request(app).get(`/raf/${kod}`);
    expect(res.text).toContain('Aktif Ürün');
    expect(res.text).not.toContain('Pasif Ürün');

    await pool.query('DELETE FROM urunler WHERE firma_id = $1', [firmaId]);
  });

  test('PDF\'li ürüne tıklama kaydedilir ve PDF\'e yönlendirir', async () => {
    const urunId = (await pool.query(
      "INSERT INTO urunler (firma_id, ad, pdf_url, aktif) VALUES ($1, 'PDF Ürünü', 'https://ornek.com/urun.pdf', true) RETURNING id",
      [firmaId]
    )).rows[0].id;

    const res = await request(app).get(`/raf/${kod}/urun/${urunId}/tikla`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://ornek.com/urun.pdf');

    const sayi = (await pool.query('SELECT COUNT(*) FROM urun_tiklamalar WHERE urun_id = $1', [urunId])).rows[0].count;
    expect(Number(sayi)).toBe(1);

    await pool.query('DELETE FROM urunler WHERE id = $1', [urunId]);
  });

  test('başka firmanın ürününe tıklama 404 döner', async () => {
    const digerFirma = await pool.query(
      "INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket) VALUES ('Diğer', 'raf-urun-diger', 'rafurundiger@example.com', 'x', 'kurumsal') RETURNING id"
    );
    const digerUrunId = (await pool.query(
      "INSERT INTO urunler (firma_id, ad, aktif) VALUES ($1, 'Diğer Ürün', true) RETURNING id",
      [digerFirma.rows[0].id]
    )).rows[0].id;

    const res = await request(app).get(`/raf/${kod}/urun/${digerUrunId}/tikla`);
    expect(res.statusCode).toBe(404);

    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirma.rows[0].id]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/raf.test.js -t "ürün"`
Expected: FAIL — `veri`de ürün listesi yok, `/raf/:kod/urun/:urunId/tikla` ucu henüz yok.

- [ ] **Step 3: `routes/public.js`'teki `GET /raf/:kod` handler'ına ürün sorgusu ekle**

`routes/public.js:37-38`'deki mevcut hali:

```javascript
    const qrHedef = `${req.protocol}://${req.get('host')}/raf/${veri.kod}`;
    res.render('public/raf', { title: veri.firma_ad, veri, qrHedef, layout: false });
```

Şununla değiştir:

```javascript
    const urunlerSonuc = await pool.query(
      'SELECT id, ad, aciklama, foto_url, pdf_url FROM urunler WHERE firma_id = (SELECT firma_id FROM eczaneler WHERE id = $1) AND aktif = true ORDER BY sira',
      [veri.eczane_id]
    );
    const qrHedef = `${req.protocol}://${req.get('host')}/raf/${veri.kod}`;
    res.render('public/raf', { title: veri.firma_ad, veri, urunler: urunlerSonuc.rows, qrHedef, layout: false });
```

- [ ] **Step 4: Ürün tıklama ucunu ekle**

`routes/public.js`'teki `router.get('/raf/:kod/tikla/:tip', ...)` bloğunun (satır 46'dan başlayan) hemen altına ekle:

```javascript

// Ürün tıklama takibi + yönlendirme (PDF'li ürünler için)
router.get('/raf/:kod/urun/:urunId/tikla', async (req, res) => {
  try {
    const veri = await eczaneGetir(req.params.kod);
    if (!veri) return res.status(404).send('Bulunamadı.');

    const urunSonuc = await pool.query(
      'SELECT pdf_url FROM urunler WHERE id = $1 AND firma_id = (SELECT firma_id FROM eczaneler WHERE id = $2) AND aktif = true',
      [req.params.urunId, veri.eczane_id]
    );
    if (!urunSonuc.rows.length) return res.status(404).send('Bulunamadı.');

    await pool.query('INSERT INTO urun_tiklamalar (urun_id, eczane_id) VALUES ($1, $2)', [req.params.urunId, veri.eczane_id]);

    if (urunSonuc.rows[0].pdf_url) {
      return res.redirect(urunSonuc.rows[0].pdf_url);
    }
    res.redirect(`/raf/${req.params.kod}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Bir hata oluştu.');
  }
});
```

- [ ] **Step 5: `views/public/raf.ejs`'e "Ürünlerimiz" bölümünü ekle**

`views/public/raf.ejs:60-64`'deki (QR butonundan hemen önceki) mevcut hali:

```html
      <button class="btn-qr" onclick="document.getElementById('qr-modal').classList.add('aktif')">
        📱 QR Kodu Göster
      </button>
    </div>
  </div>
```

Şununla değiştir:

```html
      <button class="btn-qr" onclick="document.getElementById('qr-modal').classList.add('aktif')">
        📱 QR Kodu Göster
      </button>
    </div>

    <% if (urunler.length) { %>
    <div class="urunler-bolum">
      <div class="urunler-baslik">Ürünlerimiz</div>
      <div class="urunler-liste">
        <% urunler.forEach(u => { %>
          <% if (u.pdf_url) { %>
          <a class="urun-kart" href="/raf/<%= veri.kod %>/urun/<%= u.id %>/tikla" target="_blank">
            <% if (u.foto_url) { %><img class="urun-foto" src="<%= u.foto_url %>" alt=""><% } %>
            <div class="urun-ad"><%= u.ad %></div>
            <% if (u.aciklama) { %><div class="urun-aciklama"><%= u.aciklama %></div><% } %>
          </a>
          <% } else { %>
          <button type="button" class="urun-kart urun-kart-buton" onclick="urunDetayAc('<%= u.ad.replace(/'/g, "\\'") %>', '<%= (u.aciklama || '').replace(/'/g, "\\'").replace(/\n/g, ' ') %>')">
            <% if (u.foto_url) { %><img class="urun-foto" src="<%= u.foto_url %>" alt=""><% } %>
            <div class="urun-ad"><%= u.ad %></div>
            <% if (u.aciklama) { %><div class="urun-aciklama"><%= u.aciklama %></div><% } %>
          </button>
          <% } %>
        <% }); %>
      </div>
    </div>
    <% } %>
  </div>
```

- [ ] **Step 6: Ürün bölümü CSS'ini + detay modal HTML/JS'ini ekle**

`views/public/raf.ejs:26-27`'deki (`.modal-kapat:hover` kuralından hemen sonra, `</style>`'dan önce) ekle:

```css
    .urunler-bolum { padding: 0 24px 24px; }
    .urunler-baslik { font-size: 15px; font-weight: 700; margin-bottom: 12px; color: #1a1a2e; }
    .urunler-liste { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .urun-kart { display: block; text-align: left; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; text-decoration: none; color: inherit; font: inherit; cursor: pointer; }
    .urun-foto { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; margin-bottom: 6px; }
    .urun-ad { font-size: 13px; font-weight: 600; color: #1a1a2e; }
    .urun-aciklama { font-size: 11px; color: #6b7280; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
```

Dosyanın sonundaki QR Modal `<div>`'inin (satır 78) hemen sonrasına, `</body>` etiketinden önce ekle:

```html

  <!-- Ürün Detay Modal -->
  <div id="urun-modal" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('aktif')">
    <div class="modal-kart">
      <button class="modal-kapat" onclick="document.getElementById('urun-modal').classList.remove('aktif')">✕</button>
      <h3 id="urun-modal-baslik" style="margin-bottom:12px;font-size:16px;font-weight:700"></h3>
      <p id="urun-modal-aciklama" style="font-size:13px;color:#374151;text-align:left;line-height:1.6"></p>
    </div>
  </div>
  <script>
    function urunDetayAc(ad, aciklama) {
      document.getElementById('urun-modal-baslik').textContent = ad;
      document.getElementById('urun-modal-aciklama').textContent = aciklama;
      document.getElementById('urun-modal').classList.add('aktif');
    }
  </script>
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/raf.test.js`
Expected: Tüm testler PASS (yeni testler dahil).

- [ ] **Step 8: Commit**

```bash
git add routes/public.js views/public/raf.ejs tests/raf.test.js
git commit -m "Urun tanitimi T4: raf kartina Urunlerimiz bolumu + tiklama takibi"
```

---

### Task 5: Tam test + deploy + production doğrulama

**Files:** Yok (komutlar)

- [ ] **Step 1: Tüm backend testleri**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 2: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Prod migration**

Run: `node scripts/migrate.js`
Expected: `urunler` ve `urun_tiklamalar` tabloları için `OK`.

- [ ] **Step 4: Production doğrulama**

Marker bir kurumsal firma + eczane oluştur (İP-3/İP-4/Analitik plan'larındaki desenle: `node -e` script'i ile), agent cookie'siyle giriş yap:
1. `POST /kurumsal/urunler` ile bir ürün ekle (foto olmadan, sadece `ad`).
2. `GET /raf/:kod` (marker eczanenin kodu) ile sayfanın "Ürünlerimiz" bölümünü ve ürün adını içerdiğini `curl` ile doğrula (cache-bust ile).
3. `GET /raf/:kod/urun/:urunId/tikla` çağırıp `urun_tiklamalar`'a kayıt düştüğünü DB'den doğrula.

- [ ] **Step 5: Marker verisini temizle**

Oluşturulan marker firma/eczane/ürünü sil.

- [ ] **Step 6: git durumu**

Run: `git status --short`
Expected: Boş.
