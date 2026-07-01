# Profil Kartı Yeni Alanları + HTML Bio Güvenliği Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Çalışan profiline WhatsApp, TikTok, Sahibinden, Hürriyet Emlak, Adres (Google Maps autocomplete ile), Google Yorum Linki alanlarını eklemek; biyografi alanına güvenli (sanitize edilmiş) HTML desteği getirmek. Hem `/firma/panel` hem `/bayi/panel` çalışan formlarına ve public profil sayfasına yansıtmak.

**Architecture:** `calisanlar` tablosuna 6 yeni TEXT sütunu eklenir (mevcut `scripts/migrate.js` idempotent migration deseniyle). Biyografi, kayıt anında `utils/sanitize.js`'teki `biyografiTemizle()` ile temizlenir (yalnızca temel etiketlere izin verilir) ve DB'ye zaten temiz haliyle yazılır — render tarafında ekstra bir sanitize adımına gerek yok çünkü veri kaynağı tek ve güvenilir (yazma anında temizlenmiş). Adres alanı için Google Maps Places Autocomplete, formlara eklenen bir `<script>` ile frontend'de çalışır, backend'de sadece düz metin adres saklanır.

**Not — Bağımsız Uygulanabilirlik:** Bu plan `routes/panel.js` ve `routes/bayi.js`'te slug üretim satırlarına (Slug Sistemi planı) veya foto-upload route kayıt satırlarına (Foto İşleme planı) **dokunmaz** — sadece form alanı/INSERT-UPDATE bloklarını hedefler, böylece diğer planlardan bağımsız, herhangi bir sırada uygulanabilir.

**Tech Stack:** sanitize-html, PostgreSQL, EJS, Google Maps JavaScript API (Places), Jest

---

## Task 1: `sanitize-html` ile Biyografi Temizleme Yardımcısı

**Files:**
- Modify: `package.json`
- Create: `utils/sanitize.js`
- Test: `tests/sanitize.test.js`

- [x] **Step 1: Paketi yükle**

```bash
npm install sanitize-html
```

- [x] **Step 2: Failing test yaz**

`tests/sanitize.test.js`:

```javascript
const { biyografiTemizle } = require('../utils/sanitize');

describe('biyografiTemizle', () => {
  test('izin verilen etiketleri korur', () => {
    expect(biyografiTemizle('<b>Merhaba</b> dünya')).toBe('<b>Merhaba</b> dünya');
  });

  test('script etiketini ve içeriğini temizler', () => {
    expect(biyografiTemizle('<script>alert(1)</script>Merhaba')).toBe('Merhaba');
  });

  test('on-event attribute temizler ama linki korur', () => {
    expect(biyografiTemizle('<a href="https://x.com" onclick="alert(1)">link</a>'))
      .toBe('<a href="https://x.com">link</a>');
  });

  test('izin verilmeyen etiketi (div) soyar ama içeriğini korur', () => {
    expect(biyografiTemizle('<div>metin</div>')).toBe('metin');
  });

  test('boş veya null girdi için null döner', () => {
    expect(biyografiTemizle(null)).toBe(null);
    expect(biyografiTemizle('')).toBe(null);
  });
});
```

- [x] **Step 3: Testin başarısız olduğunu doğrula**

Run: `npx jest tests/sanitize.test.js`
Expected: FAIL (`utils/sanitize.js` henüz yok)

- [x] **Step 4: utils/sanitize.js oluştur**

```javascript
const sanitizeHtml = require('sanitize-html');

function biyografiTemizle(biyografi) {
  if (!biyografi) return null;
  const temiz = sanitizeHtml(biyografi, {
    allowedTags: ['b', 'i', 'br', 'p', 'a', 'strong', 'em'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
  });
  return temiz || null;
}

module.exports = { biyografiTemizle };
```

- [x] **Step 5: Testi çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/sanitize.test.js`
Expected: PASS (5 test)

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json utils/sanitize.js tests/sanitize.test.js
git commit -m "feat: biyografi icin sanitize-html tabanli HTML temizleme"
```

---

## Task 2: Veritabanı Migration — Yeni Profil Alanları

**Files:**
- Modify: `scripts/migrate.js`
- Modify: `db/schema.sql`

- [x] **Step 1: scripts/migrate.js'e yeni migration satırları ekle**

`scripts/migrate.js` dosyasındaki `migrations` dizisinin sonuna (son elemandan sonra, dizinin kapanışından önce) ekle:

```javascript
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS whatsapp TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS tiktok TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS sahibinden TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS hurriyet_emlak TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS adres TEXT`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS google_yorum_link TEXT`,
```

- [x] **Step 2: db/schema.sql'i güncelle (referans şema — yeni kurulumlar için)**

`db/schema.sql` içindeki `calisanlar` tablosu tanımında `ilaclar TEXT[],` satırından hemen sonra ekle:

```sql
  whatsapp            TEXT,
  tiktok              TEXT,
  sahibinden          TEXT,
  hurriyet_emlak      TEXT,
  adres               TEXT,
  google_yorum_link   TEXT,
```

- [x] **Step 3: Migration'ı çalıştır**

```bash
node scripts/migrate.js
```

Expected çıktı: her yeni `ALTER TABLE` satırı için `OK: ALTER TABLE calisanlar ADD COLUMN...` satırı, sonunda `Migration tamamlandı.`

- [x] **Step 4: Commit**

```bash
git add scripts/migrate.js db/schema.sql
git commit -m "feat: calisanlar tablosuna yeni profil alanlari ekle (whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link)"
```

---

## Task 3: `routes/panel.js` — Yeni Alanlar ve Biyografi Temizleme

**Files:**
- Modify: `routes/panel.js`

- [x] **Step 1: Import ekle**

`routes/panel.js` dosyasının başındaki require'ların yanına ekle:

```javascript
const { biyografiTemizle } = require('../utils/sanitize');
```

- [x] **Step 2: `/ekle` POST route'unun destructure satırını güncelle**

Mevcut:

```javascript
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, biyografi, ilaclar } = req.body;
```

satırını (bu satır `router.post('/ekle', async (req, res) => {` bloğunun ilk satırıdır) şu şekilde değiştir:

```javascript
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar } = req.body;
```

- [x] **Step 3: `/ekle` POST route'undaki INSERT bloğunu güncelle**

Mevcut (slug üretim satırlarından SONRA gelen blok — slug satırlarına dokunma):

```javascript
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, biyografi, ilaclar, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [req.session.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null,
       instagram || null, twitter || null, youtube || null, website || null,
       biyografi || null, ilaclarArray, slug]
    );
```

şu şekilde değiştir:

```javascript
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    const biyografiTemiz = biyografiTemizle(biyografi);
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [req.session.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null,
       instagram || null, twitter || null, youtube || null, website || null,
       whatsapp || null, tiktok || null, sahibinden || null, hurriyet_emlak || null,
       adres || null, google_yorum_link || null,
       biyografiTemiz, ilaclarArray, slug]
    );
```

- [x] **Step 4: `/:id/duzenle` POST route'unun içeriğini güncelle**

Mevcut (route kayıt satırının `fotoUpload.single('foto')` kısmına dokunma, sadece handler gövdesini hedefle):

```javascript
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, biyografi, ilaclar } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(`/firma/panel/${req.params.id}/duzenle`);
  }
  try {
    const ilaclarArray = ilaclar ? ilaclar.split(',').map(s => s.trim()).filter(Boolean) : null;
    const fotoUrl = req.file ? (req.file.location || null) : undefined;

    const baseFields = [ad, soyad, unvan || null, departman || null, telefon || null,
      email || null, linkedin || null, instagram || null, twitter || null,
      youtube || null, website || null, biyografi || null, ilaclarArray];

    if (fotoUrl !== undefined) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
         email=$6, linkedin=$7, instagram=$8, twitter=$9, youtube=$10, website=$11,
         biyografi=$12, ilaclar=$13, foto_url=$14 WHERE id=$15 AND firma_id=$16`,
        [...baseFields, fotoUrl, req.params.id, req.session.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1, soyad=$2, unvan=$3, departman=$4, telefon=$5,
         email=$6, linkedin=$7, instagram=$8, twitter=$9, youtube=$10, website=$11,
         biyografi=$12, ilaclar=$13 WHERE id=$14 AND firma_id=$15`,
        [...baseFields, req.params.id, req.session.firmaId]
      );
    }
```

şu şekilde değiştir:

```javascript
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, ilaclar } = req.body;
  if (!ad || !soyad) {
    req.flash('error', 'Ad ve soyad zorunlu.');
    return res.redirect(`/firma/panel/${req.params.id}/duzenle`);
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
```

- [x] **Step 5: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add routes/panel.js
git commit -m "feat: firma panelinde yeni profil alanlari ve biyografi temizleme"
```

---

## Task 4: `views/panel/ekle.ejs` — Yeni Form Alanları

**Files:**
- Modify: `views/panel/ekle.ejs`

- [x] **Step 1: Dosyanın tam içeriğini güncelle**

`views/panel/ekle.ejs` dosyasının tamamını şu içerikle değiştir:

```html
<div class="form-container">
  <h2>Yeni Çalışan Ekle</h2>
  <a href="/firma/panel" class="btn-link" style="display:inline-block;margin-bottom:20px">← Panele Dön</a>
  <form method="POST" action="/firma/panel/ekle">
    <div class="form-group"><label>Ad *</label><input type="text" name="ad" required></div>
    <div class="form-group"><label>Soyad *</label><input type="text" name="soyad" required></div>
    <div class="form-group"><label>Unvan</label><input type="text" name="unvan"></div>
    <div class="form-group"><label>Departman</label><input type="text" name="departman"></div>
    <div class="form-group"><label>Telefon</label><input type="tel" name="telefon"></div>
    <div class="form-group"><label>Email</label><input type="email" name="email"></div>
    <div class="form-group"><label>Adres</label><input type="text" name="adres" id="adres-input" placeholder="Adres aramaya başlayın..." autocomplete="off"></div>
    <div class="form-group"><label>Biyografi <small style="color:#888">(temel HTML desteklenir: &lt;b&gt;, &lt;i&gt;, &lt;a&gt;)</small></label><textarea name="biyografi" rows="3" placeholder="Kısa tanıtım yazısı..."></textarea></div>
    <div class="form-group"><label>Çalışılan İlaçlar <small style="color:#888">(virgülle ayır)</small></label><input type="text" name="ilaclar" placeholder="Cardura, Norvasc, Beloc"></div>

    <div class="form-section-title">Sosyal Medya & Linkler</div>
    <div class="form-group"><label>LinkedIn URL</label><input type="url" name="linkedin" placeholder="https://linkedin.com/in/..."></div>
    <div class="form-group"><label>Instagram URL</label><input type="url" name="instagram" placeholder="https://instagram.com/..."></div>
    <div class="form-group"><label>Twitter / X URL</label><input type="url" name="twitter" placeholder="https://x.com/..."></div>
    <div class="form-group"><label>YouTube URL</label><input type="url" name="youtube" placeholder="https://youtube.com/@..."></div>
    <div class="form-group"><label>Web Sitesi</label><input type="url" name="website" placeholder="https://..."></div>
    <div class="form-group"><label>WhatsApp Numarası</label><input type="tel" name="whatsapp" placeholder="+905001112233"></div>
    <div class="form-group"><label>TikTok URL</label><input type="url" name="tiktok" placeholder="https://tiktok.com/@..."></div>
    <div class="form-group"><label>Sahibinden İlan URL</label><input type="url" name="sahibinden" placeholder="https://sahibinden.com/..."></div>
    <div class="form-group"><label>Hürriyet Emlak İlan URL</label><input type="url" name="hurriyet_emlak" placeholder="https://hurriyetemlak.com/..."></div>
    <div class="form-group"><label>Google Yorum Linki</label><input type="url" name="google_yorum_link" placeholder="https://g.page/r/.../review"></div>

    <button type="submit" class="btn">Ekle</button>
  </form>
</div>

<% if (process.env.GOOGLE_MAPS_API_KEY) { %>
<script src="https://maps.googleapis.com/maps/api/js?key=<%= process.env.GOOGLE_MAPS_API_KEY %>&libraries=places&callback=adresAutocompleteBaslat" async defer></script>
<script>
  function adresAutocompleteBaslat() {
    const input = document.getElementById('adres-input');
    if (!input || !window.google) return;
    new google.maps.places.Autocomplete(input, { types: ['address'], componentRestrictions: { country: 'tr' } });
  }
</script>
<% } %>
```

- [x] **Step 2: Manuel test**

```bash
npm run dev
```

`/firma/panel/ekle` sayfasını aç, yeni alanların (Adres, WhatsApp, TikTok, Sahibinden, Hürriyet Emlak, Google Yorum Linki) göründüğünü doğrula. `GOOGLE_MAPS_API_KEY` `.env`'de tanımlıysa adres alanına yazarken otomatik tamamlama önerilerinin çıktığını doğrula; tanımlı değilse alan normal bir metin kutusu olarak çalışmaya devam etmeli (hata vermemeli).

- [x] **Step 3: Commit**

```bash
git add views/panel/ekle.ejs
git commit -m "feat: firma panelinde yeni cikan alanlarin formu"
```

---

## Task 5: `views/panel/duzenle.ejs` — Yeni Form Alanları

**Files:**
- Modify: `views/panel/duzenle.ejs`

- [x] **Step 1: Dosyanın tam içeriğini güncelle**

`views/panel/duzenle.ejs` dosyasının tamamını şu içerikle değiştir:

```html
<div class="form-container">
  <h2>Çalışan Düzenle</h2>
  <a href="/firma/panel" class="btn-link" style="display:inline-block;margin-bottom:20px">← Panele Dön</a>
  <form method="POST" action="/firma/panel/<%= calisan.id %>/duzenle" enctype="multipart/form-data">
    <div class="form-group"><label>Ad *</label><input type="text" name="ad" value="<%= calisan.ad %>" required></div>
    <div class="form-group"><label>Soyad *</label><input type="text" name="soyad" value="<%= calisan.soyad %>" required></div>
    <div class="form-group"><label>Unvan</label><input type="text" name="unvan" value="<%= calisan.unvan || '' %>"></div>
    <div class="form-group"><label>Departman</label><input type="text" name="departman" value="<%= calisan.departman || '' %>"></div>
    <div class="form-group"><label>Telefon</label><input type="tel" name="telefon" value="<%= calisan.telefon || '' %>"></div>
    <div class="form-group"><label>Email</label><input type="email" name="email" value="<%= calisan.email || '' %>"></div>
    <div class="form-group"><label>Adres</label><input type="text" name="adres" id="adres-input" value="<%= calisan.adres || '' %>" autocomplete="off"></div>
    <div class="form-group"><label>Biyografi <small style="color:#888">(temel HTML desteklenir: &lt;b&gt;, &lt;i&gt;, &lt;a&gt;)</small></label><textarea name="biyografi" rows="3"><%= calisan.biyografi || '' %></textarea></div>
    <div class="form-group"><label>Çalışılan İlaçlar <small style="color:#888">(virgülle ayır)</small></label><input type="text" name="ilaclar" value="<%= (calisan.ilaclar || []).join(', ') %>"></div>

    <div class="form-section-title">Sosyal Medya & Linkler</div>
    <div class="form-group"><label>LinkedIn URL</label><input type="url" name="linkedin" value="<%= calisan.linkedin || '' %>"></div>
    <div class="form-group"><label>Instagram URL</label><input type="url" name="instagram" value="<%= calisan.instagram || '' %>"></div>
    <div class="form-group"><label>Twitter / X URL</label><input type="url" name="twitter" value="<%= calisan.twitter || '' %>"></div>
    <div class="form-group"><label>YouTube URL</label><input type="url" name="youtube" value="<%= calisan.youtube || '' %>"></div>
    <div class="form-group"><label>Web Sitesi</label><input type="url" name="website" value="<%= calisan.website || '' %>"></div>
    <div class="form-group"><label>WhatsApp Numarası</label><input type="tel" name="whatsapp" value="<%= calisan.whatsapp || '' %>" placeholder="+905001112233"></div>
    <div class="form-group"><label>TikTok URL</label><input type="url" name="tiktok" value="<%= calisan.tiktok || '' %>"></div>
    <div class="form-group"><label>Sahibinden İlan URL</label><input type="url" name="sahibinden" value="<%= calisan.sahibinden || '' %>"></div>
    <div class="form-group"><label>Hürriyet Emlak İlan URL</label><input type="url" name="hurriyet_emlak" value="<%= calisan.hurriyet_emlak || '' %>"></div>
    <div class="form-group"><label>Google Yorum Linki</label><input type="url" name="google_yorum_link" value="<%= calisan.google_yorum_link || '' %>"></div>

    <div class="form-group">
      <label>Fotoğraf</label>
      <% if (calisan.foto_url) { %>
        <img src="<%= calisan.foto_url %>" class="foto-onizleme" alt="Mevcut foto">
      <% } %>
      <input type="file" name="foto" accept="image/jpeg,image/png,image/webp">
      <small style="color:#888">Yeni dosya seçmezsen mevcut foto kalır.</small>
    </div>
    <button type="submit" class="btn">Kaydet</button>
  </form>
  <p class="slug-bilgi">Profil URL'si: <code>/<%= firma_slug %>/<%= calisan.slug %></code> (hiç değişmez)</p>
</div>

<% if (process.env.GOOGLE_MAPS_API_KEY) { %>
<script src="https://maps.googleapis.com/maps/api/js?key=<%= process.env.GOOGLE_MAPS_API_KEY %>&libraries=places&callback=adresAutocompleteBaslat" async defer></script>
<script>
  function adresAutocompleteBaslat() {
    const input = document.getElementById('adres-input');
    if (!input || !window.google) return;
    new google.maps.places.Autocomplete(input, { types: ['address'], componentRestrictions: { country: 'tr' } });
  }
</script>
<% } %>
```

- [x] **Step 2: Manuel test**

```bash
npm run dev
```

Var olan bir çalışanı düzenleme sayfasını aç, yeni alanların mevcut değerleriyle dolu geldiğini (varsa) doğrula, birkaçını değiştirip kaydet, panelde/profilde yansıdığını kontrol et.

- [x] **Step 3: Commit**

```bash
git add views/panel/duzenle.ejs
git commit -m "feat: firma panelinde duzenleme formuna yeni alanlar"
```

---

## Task 6: `routes/bayi.js` — Yeni Alanlar, Eksik Sosyal Medya Alanları ve Biyografi Temizleme

**Not:** Bayi panelindeki çalışan formları, firma panelinden farklı olarak Instagram/Twitter/YouTube/Website alanlarını hiç içermiyordu (kolonlar DB'de zaten vardı, sadece form/route eksikti). Aynı görev kapsamında (sosyal medya bölümünü genişletirken) bu eksikliği de gideriyoruz — iki panel arasında özellik tutarlılığı sağlamak için.

**Files:**
- Modify: `routes/bayi.js`

- [x] **Step 1: Import ekle**

`routes/bayi.js` dosyasının başındaki require'ların yanına ekle:

```javascript
const { biyografiTemizle } = require('../utils/sanitize');
```

- [x] **Step 2: `/panel/:firmaId/calisan-ekle` POST route'unun destructure satırını güncelle**

Mevcut:

```javascript
  const { ad, soyad, unvan, departman, telefon, email, linkedin, biyografi } = req.body;
```

(bu route'un ilk satırı — dosyada iki kez benzer satır var, bu **calisan-ekle** route'undaki, `if (!ad || !soyad) { ... return res.redirect(\`/bayi/panel/${req.params.firmaId}/calisan-ekle\`);` satırının hemen üstündeki) şu şekilde değiştir:

```javascript
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi } = req.body;
```

- [x] **Step 3: `/panel/:firmaId/calisan-ekle` POST route'undaki INSERT bloğunu güncelle**

Mevcut (firma-bayi sahiplik kontrolü ve slug üretim satırlarından SONRA gelen blok — onlara dokunma):

```javascript
    const fotoUrl = req.file?.location || null;

    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [req.params.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null, biyografi || null, fotoUrl, slug]
    );
```

şu şekilde değiştir:

```javascript
    const fotoUrl = req.file?.location || null;
    const biyografiTemiz = biyografiTemizle(biyografi);

    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [req.params.firmaId, ad, soyad, unvan || null, departman || null,
       telefon || null, email || null, linkedin || null, instagram || null, twitter || null,
       youtube || null, website || null, whatsapp || null, tiktok || null, sahibinden || null,
       hurriyet_emlak || null, adres || null, google_yorum_link || null,
       biyografiTemiz, fotoUrl, slug]
    );
```

- [x] **Step 4: `/panel/:firmaId/calisan/:id/duzenle` POST route'unun destructure satırını güncelle**

Mevcut (bu route'un ilk satırı — `/bayi/panel/${req.params.firmaId}/calisan/${req.params.id}/duzenle` redirect'inin bulunduğu bloğun hemen üstünde):

```javascript
  const { ad, soyad, unvan, departman, telefon, email, linkedin, biyografi } = req.body;
```

şu şekilde değiştir:

```javascript
  const { ad, soyad, unvan, departman, telefon, email, linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden, hurriyet_emlak, adres, google_yorum_link, biyografi } = req.body;
```

- [x] **Step 5: `/panel/:firmaId/calisan/:id/duzenle` POST route'undaki UPDATE bloğunu güncelle**

Mevcut:

```javascript
    const fotoUrl = req.file?.location || null;

    if (fotoUrl) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,biyografi=$8,foto_url=$9
         WHERE id=$10 AND firma_id=$11`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, biyografi||null, fotoUrl,
         req.params.id, req.params.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,biyografi=$8
         WHERE id=$9 AND firma_id=$10`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, biyografi||null,
         req.params.id, req.params.firmaId]
      );
    }
```

şu şekilde değiştir:

```javascript
    const fotoUrl = req.file?.location || null;
    const biyografiTemiz = biyografiTemizle(biyografi);

    if (fotoUrl) {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,instagram=$8,twitter=$9,youtube=$10,website=$11,
         whatsapp=$12,tiktok=$13,sahibinden=$14,hurriyet_emlak=$15,adres=$16,google_yorum_link=$17,
         biyografi=$18,foto_url=$19
         WHERE id=$20 AND firma_id=$21`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, instagram||null, twitter||null, youtube||null, website||null,
         whatsapp||null, tiktok||null, sahibinden||null, hurriyet_emlak||null, adres||null, google_yorum_link||null,
         biyografiTemiz, fotoUrl,
         req.params.id, req.params.firmaId]
      );
    } else {
      await pool.query(
        `UPDATE calisanlar SET ad=$1,soyad=$2,unvan=$3,departman=$4,telefon=$5,
         email=$6,linkedin=$7,instagram=$8,twitter=$9,youtube=$10,website=$11,
         whatsapp=$12,tiktok=$13,sahibinden=$14,hurriyet_emlak=$15,adres=$16,google_yorum_link=$17,
         biyografi=$18
         WHERE id=$19 AND firma_id=$20`,
        [ad, soyad, unvan||null, departman||null, telefon||null,
         email||null, linkedin||null, instagram||null, twitter||null, youtube||null, website||null,
         whatsapp||null, tiktok||null, sahibinden||null, hurriyet_emlak||null, adres||null, google_yorum_link||null,
         biyografiTemiz,
         req.params.id, req.params.firmaId]
      );
    }
```

- [x] **Step 6: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add routes/bayi.js
git commit -m "feat: bayi panelinde yeni profil alanlari, eksik sosyal medya alanlari ve biyografi temizleme"
```

---

## Task 7: `views/bayi/calisan-ekle.ejs` — Yeni Form Alanları

**Files:**
- Modify: `views/bayi/calisan-ekle.ejs`

- [x] **Step 1: Dosyanın tam içeriğini güncelle**

`views/bayi/calisan-ekle.ejs` dosyasının tamamını şu içerikle değiştir:

```html
<div class="panel-container">
  <header class="panel-header">
    <h2>Yeni Kart — <%= firma.ad %></h2>
    <a href="/bayi/panel/<%= firma.id %>/calisanlar" class="btn-link">← Geri</a>
  </header>
  <form method="POST" action="/bayi/panel/<%= firma.id %>/calisan-ekle" enctype="multipart/form-data" class="form-grup">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label>Ad *</label>
        <input type="text" name="ad" required>
      </div>
      <div>
        <label>Soyad *</label>
        <input type="text" name="soyad" required>
      </div>
    </div>
    <label>Unvan</label>
    <input type="text" name="unvan" placeholder="Örn: Satış Müdürü">

    <label>Departman</label>
    <input type="text" name="departman">

    <label>Telefon</label>
    <input type="tel" name="telefon" placeholder="+905001112233">

    <label>Email</label>
    <input type="email" name="email">

    <label>Adres</label>
    <input type="text" name="adres" id="adres-input" placeholder="Adres aramaya başlayın..." autocomplete="off">

    <label>Biyografi <small style="color:#888">(temel HTML desteklenir)</small></label>
    <textarea name="biyografi" rows="3"></textarea>

    <div class="form-section-title">Sosyal Medya & Linkler</div>
    <label>LinkedIn URL</label>
    <input type="url" name="linkedin" placeholder="https://linkedin.com/in/...">
    <label>Instagram URL</label>
    <input type="url" name="instagram" placeholder="https://instagram.com/...">
    <label>Twitter / X URL</label>
    <input type="url" name="twitter" placeholder="https://x.com/...">
    <label>YouTube URL</label>
    <input type="url" name="youtube" placeholder="https://youtube.com/@...">
    <label>Web Sitesi</label>
    <input type="url" name="website" placeholder="https://...">
    <label>WhatsApp Numarası</label>
    <input type="tel" name="whatsapp" placeholder="+905001112233">
    <label>TikTok URL</label>
    <input type="url" name="tiktok" placeholder="https://tiktok.com/@...">
    <label>Sahibinden İlan URL</label>
    <input type="url" name="sahibinden" placeholder="https://sahibinden.com/...">
    <label>Hürriyet Emlak İlan URL</label>
    <input type="url" name="hurriyet_emlak" placeholder="https://hurriyetemlak.com/...">
    <label>Google Yorum Linki</label>
    <input type="url" name="google_yorum_link" placeholder="https://g.page/r/.../review">

    <label>Fotoğraf</label>
    <input type="file" name="foto" accept="image/jpeg,image/png,image/webp">

    <button type="submit" class="btn" style="margin-top:8px">Kart Oluştur</button>
  </form>
</div>

<% if (process.env.GOOGLE_MAPS_API_KEY) { %>
<script src="https://maps.googleapis.com/maps/api/js?key=<%= process.env.GOOGLE_MAPS_API_KEY %>&libraries=places&callback=adresAutocompleteBaslat" async defer></script>
<script>
  function adresAutocompleteBaslat() {
    const input = document.getElementById('adres-input');
    if (!input || !window.google) return;
    new google.maps.places.Autocomplete(input, { types: ['address'], componentRestrictions: { country: 'tr' } });
  }
</script>
<% } %>
```

- [x] **Step 2: Manuel test**

```bash
npm run dev
```

Bir bayi hesabıyla giriş yap, "Kart Oluştur" formunun yeni alanları içerdiğini doğrula.

- [x] **Step 3: Commit**

```bash
git add views/bayi/calisan-ekle.ejs
git commit -m "feat: bayi panelinde yeni alanlarin formu"
```

---

## Task 8: `views/bayi/calisan-duzenle.ejs` — Yeni Form Alanları

**Files:**
- Modify: `views/bayi/calisan-duzenle.ejs`

- [x] **Step 1: Dosyanın tam içeriğini güncelle**

`views/bayi/calisan-duzenle.ejs` dosyasının tamamını şu içerikle değiştir:

```html
<div class="panel-container">
  <header class="panel-header">
    <h2>Kart Düzenle — <%= calisan.ad %> <%= calisan.soyad %></h2>
    <a href="/bayi/panel/<%= firma.id %>/calisanlar" class="btn-link">← Geri</a>
  </header>
  <form method="POST" action="/bayi/panel/<%= firma.id %>/calisan/<%= calisan.id %>/duzenle" enctype="multipart/form-data" class="form-grup">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label>Ad *</label>
        <input type="text" name="ad" value="<%= calisan.ad %>" required>
      </div>
      <div>
        <label>Soyad *</label>
        <input type="text" name="soyad" value="<%= calisan.soyad %>" required>
      </div>
    </div>
    <label>Unvan</label>
    <input type="text" name="unvan" value="<%= calisan.unvan || '' %>">

    <label>Departman</label>
    <input type="text" name="departman" value="<%= calisan.departman || '' %>">

    <label>Telefon</label>
    <input type="tel" name="telefon" value="<%= calisan.telefon || '' %>">

    <label>Email</label>
    <input type="email" name="email" value="<%= calisan.email || '' %>">

    <label>Adres</label>
    <input type="text" name="adres" id="adres-input" value="<%= calisan.adres || '' %>" autocomplete="off">

    <label>Biyografi <small style="color:#888">(temel HTML desteklenir)</small></label>
    <textarea name="biyografi" rows="3"><%= calisan.biyografi || '' %></textarea>

    <div class="form-section-title">Sosyal Medya & Linkler</div>
    <label>LinkedIn URL</label>
    <input type="url" name="linkedin" value="<%= calisan.linkedin || '' %>">
    <label>Instagram URL</label>
    <input type="url" name="instagram" value="<%= calisan.instagram || '' %>">
    <label>Twitter / X URL</label>
    <input type="url" name="twitter" value="<%= calisan.twitter || '' %>">
    <label>YouTube URL</label>
    <input type="url" name="youtube" value="<%= calisan.youtube || '' %>">
    <label>Web Sitesi</label>
    <input type="url" name="website" value="<%= calisan.website || '' %>">
    <label>WhatsApp Numarası</label>
    <input type="tel" name="whatsapp" value="<%= calisan.whatsapp || '' %>" placeholder="+905001112233">
    <label>TikTok URL</label>
    <input type="url" name="tiktok" value="<%= calisan.tiktok || '' %>">
    <label>Sahibinden İlan URL</label>
    <input type="url" name="sahibinden" value="<%= calisan.sahibinden || '' %>">
    <label>Hürriyet Emlak İlan URL</label>
    <input type="url" name="hurriyet_emlak" value="<%= calisan.hurriyet_emlak || '' %>">
    <label>Google Yorum Linki</label>
    <input type="url" name="google_yorum_link" value="<%= calisan.google_yorum_link || '' %>">

    <label>Fotoğraf</label>
    <% if (calisan.foto_url) { %>
      <img src="<%= calisan.foto_url %>" style="height:60px;border-radius:50%;display:block;margin-bottom:8px" alt="Mevcut foto">
    <% } %>
    <input type="file" name="foto" accept="image/jpeg,image/png,image/webp">
    <small style="color:#888">Yeni seçmezsen mevcut kalır.</small>

    <div style="margin-top:16px;padding:12px;background:#f5f5f5;border-radius:6px">
      <small>NFC Profil URL'si:</small><br>
      <code style="font-size:13px">/bayi/<%= firma.bayi_slug %>/<%= firma.slug %>/<%= calisan.slug %></code>
    </div>

    <button type="submit" class="btn" style="margin-top:16px">Kaydet</button>
  </form>
</div>

<% if (process.env.GOOGLE_MAPS_API_KEY) { %>
<script src="https://maps.googleapis.com/maps/api/js?key=<%= process.env.GOOGLE_MAPS_API_KEY %>&libraries=places&callback=adresAutocompleteBaslat" async defer></script>
<script>
  function adresAutocompleteBaslat() {
    const input = document.getElementById('adres-input');
    if (!input || !window.google) return;
    new google.maps.places.Autocomplete(input, { types: ['address'], componentRestrictions: { country: 'tr' } });
  }
</script>
<% } %>
```

- [x] **Step 2: Manuel test**

```bash
npm run dev
```

Var olan bir bayi çalışanını düzenle, yeni alanların mevcut değerlerle geldiğini doğrula.

- [x] **Step 3: Commit**

```bash
git add views/bayi/calisan-duzenle.ejs
git commit -m "feat: bayi panelinde duzenleme formuna yeni alanlar"
```

---

## Task 9: `routes/public.js` — Tıklama Takibi ve Google Değerlendirme Yönlendirmesi

**Files:**
- Modify: `routes/public.js`

- [x] **Step 1: `/t/:tip` route'undaki SELECT sorgusunu genişlet**

Mevcut:

```javascript
    const result = await pool.query(
      `SELECT c.id, c.telefon, c.email, c.linkedin, c.instagram, c.twitter, c.youtube, c.website
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2 AND c.durum = 'aktif'`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );
```

şu şekilde değiştir:

```javascript
    const result = await pool.query(
      `SELECT c.id, c.telefon, c.email, c.linkedin, c.instagram, c.twitter, c.youtube, c.website,
              c.whatsapp, c.tiktok, c.sahibinden, c.hurriyet_emlak, c.google_yorum_link
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2 AND c.durum = 'aktif'`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );
```

- [x] **Step 2: `izinliTipler` listesini genişlet**

Mevcut:

```javascript
  const izinliTipler = ['telefon', 'email', 'linkedin', 'instagram', 'twitter', 'youtube', 'website', 'vcf', 'qr'];
```

şu şekilde değiştir:

```javascript
  const izinliTipler = ['telefon', 'email', 'linkedin', 'instagram', 'twitter', 'youtube', 'website', 'whatsapp', 'tiktok', 'sahibinden', 'hurriyet_emlak', 'google_yorum', 'vcf', 'qr'];
```

- [x] **Step 3: `hedefler` objesini genişlet**

Mevcut:

```javascript
    const hedefler = {
      telefon: calisan.telefon ? `tel:${calisan.telefon}` : null,
      email: calisan.email ? `mailto:${calisan.email}` : null,
      linkedin: calisan.linkedin,
      instagram: calisan.instagram,
      twitter: calisan.twitter,
      youtube: calisan.youtube,
      website: calisan.website,
      vcf: `/${req.params.firmaSlug}/${req.params.calisanSlug}/vcf`,
    };
```

şu şekilde değiştir:

```javascript
    const hedefler = {
      telefon: calisan.telefon ? `tel:${calisan.telefon}` : null,
      email: calisan.email ? `mailto:${calisan.email}` : null,
      linkedin: calisan.linkedin,
      instagram: calisan.instagram,
      twitter: calisan.twitter,
      youtube: calisan.youtube,
      website: calisan.website,
      whatsapp: calisan.whatsapp ? `https://wa.me/${calisan.whatsapp.replace(/\D/g, '')}` : null,
      tiktok: calisan.tiktok,
      sahibinden: calisan.sahibinden,
      hurriyet_emlak: calisan.hurriyet_emlak,
      google_yorum: calisan.google_yorum_link,
      vcf: `/${req.params.firmaSlug}/${req.params.calisanSlug}/vcf`,
    };
```

- [x] **Step 4: `/degerlendir` route'unu ekle**

`router.get('/:firmaSlug/:calisanSlug/t/:tip', ...)` route bloğunun bittiği yerden (kapanış `});`'den) hemen sonra, `// Profil sayfası — standart URL` yorumundan ÖNCE ekle:

```javascript
// Google Yorum yönlendirme
router.get('/:firmaSlug/:calisanSlug/degerlendir', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.google_yorum_link
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE f.slug = $1 AND c.slug = $2 AND c.durum = 'aktif'`,
      [req.params.firmaSlug, req.params.calisanSlug]
    );
    if (!result.rows.length || !result.rows[0].google_yorum_link) {
      return res.status(404).render('public/404', { title: '404', mesaj: 'Değerlendirme linki bulunamadı.', layout: false });
    }
    res.redirect(result.rows[0].google_yorum_link);
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});

```

- [x] **Step 5: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add routes/public.js
git commit -m "feat: yeni tiklama tipleri ve google yorum yonlendirme route'u"
```

---

## Task 10: `views/public/profil.ejs` — Yeni Butonlar ve HTML Bio Render

**Files:**
- Modify: `views/public/profil.ejs`

- [x] **Step 1: Biyografi render satırını güncelle (unescaped — zaten sanitize edildi)**

Mevcut:

```html
      <% if (calisan.biyografi) { %>
        <p class="profil-bio"><%= calisan.biyografi %></p>
      <% } %>
```

şu şekilde değiştir:

```html
      <% if (calisan.biyografi) { %>
        <p class="profil-bio"><%- calisan.biyografi %></p>
      <% } %>
```

- [x] **Step 2: Website butonundan sonra yeni sosyal/link butonlarını ekle**

Mevcut (website butonu bloğu ve `.iletisim-butonlar` kapanışı):

```html
        <% if (calisan.website) { %>
          <a href="<%= base %>/t/website" target="_blank" rel="noopener" class="btn-iletisim">
            <span class="btn-iletisim-icon icon-website">
              <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </span>
            <span class="btn-iletisim-metin">
              <span class="btn-iletisim-label">Web Sitesi</span>
              Ziyaret Et
            </span>
          </a>
        <% } %>
      </div>
```

şu şekilde değiştir:

```html
        <% if (calisan.website) { %>
          <a href="<%= base %>/t/website" target="_blank" rel="noopener" class="btn-iletisim">
            <span class="btn-iletisim-icon icon-website">
              <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </span>
            <span class="btn-iletisim-metin">
              <span class="btn-iletisim-label">Web Sitesi</span>
              Ziyaret Et
            </span>
          </a>
        <% } %>
        <% if (calisan.whatsapp) { %>
          <a href="<%= base %>/t/whatsapp" target="_blank" rel="noopener" class="btn-iletisim">
            <span class="btn-iletisim-icon icon-whatsapp">
              <svg viewBox="0 0 24 24" fill="#25D366"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.35 5.07L2 22l5.06-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.6 0-3.1-.44-4.38-1.2l-.31-.19-3.01.79.8-2.94-.2-.31A7.94 7.94 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/></svg>
            </span>
            <span class="btn-iletisim-metin">
              <span class="btn-iletisim-label">WhatsApp</span>
              Mesaj Gönder
            </span>
          </a>
        <% } %>
        <% if (calisan.tiktok) { %>
          <a href="<%= base %>/t/tiktok" target="_blank" rel="noopener" class="btn-iletisim">
            <span class="btn-iletisim-icon icon-tiktok">
              <svg viewBox="0 0 24 24" fill="#000"><path d="M16.5 2h-3v13.5a2.5 2.5 0 1 1-2.5-2.5c.17 0 .34.02.5.05V9.9a5.5 5.5 0 1 0 5 5.48V8.2a7.44 7.44 0 0 0 4 1.17V6.37A4.5 4.5 0 0 1 16.5 2z"/></svg>
            </span>
            <span class="btn-iletisim-metin">
              <span class="btn-iletisim-label">TikTok</span>
              Profili Görüntüle
            </span>
          </a>
        <% } %>
        <% if (calisan.sahibinden) { %>
          <a href="<%= base %>/t/sahibinden" target="_blank" rel="noopener" class="btn-iletisim">
            <span class="btn-iletisim-icon icon-sahibinden">
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/></svg>
            </span>
            <span class="btn-iletisim-metin">
              <span class="btn-iletisim-label">Sahibinden</span>
              İlanı Görüntüle
            </span>
          </a>
        <% } %>
        <% if (calisan.hurriyet_emlak) { %>
          <a href="<%= base %>/t/hurriyet_emlak" target="_blank" rel="noopener" class="btn-iletisim">
            <span class="btn-iletisim-icon icon-hurriyet-emlak">
              <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1"/></svg>
            </span>
            <span class="btn-iletisim-metin">
              <span class="btn-iletisim-label">Hürriyet Emlak</span>
              İlanı Görüntüle
            </span>
          </a>
        <% } %>
      </div>
```

- [x] **Step 3: "Rehbere Ekle" butonundan sonra "Google'da Değerlendir" butonunu ekle**

Mevcut:

```html
      <a href="<%= vcfUrl %>" class="btn-vcf" download>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Rehbere Ekle
      </a>

      <!-- QR Kod -->
```

şu şekilde değiştir:

```html
      <a href="<%= vcfUrl %>" class="btn-vcf" download>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Rehbere Ekle
      </a>

      <% if (calisan.google_yorum_link) { %>
        <a href="<%= base %>/degerlendir" target="_blank" rel="noopener" class="btn-qr" style="margin-bottom:10px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 17.75 5.8 21l1.2-7L2 9.24l7.1-1.02L12 2l2.9 6.22L22 9.24l-5 4.76 1.2 7Z"/></svg>
          Google'da Değerlendir
        </a>
      <% } %>

      <!-- QR Kod -->
```

- [x] **Step 4: Manuel test**

```bash
npm run dev
```

Bir çalışanı düzenleyip WhatsApp, TikTok, Sahibinden, Hürriyet Emlak ve Google Yorum Linki alanlarını doldur; biyografiye `<b>kalın metin</b>` gibi basit HTML gir. Profil sayfasında (`/:firmaSlug/:calisanSlug`) yeni butonların göründüğünü, tıklandığında doğru linke gittiğini, biyografinin **kalın** göründüğünü (HTML olarak render edildiğini, escape edilmiş `&lt;b&gt;` olarak değil) doğrula. Biyografiye `<script>alert(1)</script>` girmeyi dene — hiçbir alert çıkmamalı (temizlenmiş olmalı).

- [x] **Step 5: Commit**

```bash
git add views/public/profil.ejs
git commit -m "feat: profil sayfasinda yeni butonlar, google degerlendirme ve html bio render"
```
