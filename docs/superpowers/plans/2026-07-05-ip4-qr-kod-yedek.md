# İP-4 — QR Kod Her Zaman Yedek Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raf kartı ve eczacı sayfalarına, çalışan profil sayfasındaki QR kod yedeğinin aynısını ekle; bu sırada profil sayfasındaki mevcut QR'ın yanlış domaine (`nfckart.com`) işaret ettiği kök nedeni düzeltip her üç sayfada da QR'ın gerçek istek host'undan (`req.get('host')`) üretilmesini sağla.

**Architecture:** `routes/public.js`'teki dört render çağrısına (`/bayi/:bayiSlug/:firmaSlug/:calisanSlug`, `/:firmaSlug/:calisanSlug`, `/raf/:kod`, `/eczaci/:kod`) `qrHedef` adında hazır-kurulmuş bir mutlak URL (`${req.protocol}://${req.get('host')}${sayfaYolu}`) geçilir. View'lar artık `process.env.DOMAIN` veya `typeof req !== 'undefined'` gibi kırılgan mantığa dokunmaz — sadece `qrHedef`'i `encodeURIComponent` ile `api.qrserver.com` QR görsel URL'sine koyar. `raf.ejs` ve `eczaci.ejs` kendi bağımsız `<style>` bloklarına, profildeki `.btn-qr`/`.modal-overlay` desenlerinin sayfaya özgü eşdeğerlerini alır.

**Tech Stack:** Node.js/Express, EJS, `api.qrserver.com` (harici QR servisi, yeni npm bağımlılığı yok), Jest + supertest.

---

### Task 1: `routes/public.js` — profil route'larına `qrHedef` ekle (mevcut QR'ın domain düzeltmesi)

**Files:**
- Modify: `routes/public.js:161-181` (bayi URL'li profil route'u), `routes/public.js:269-289` (standart profil route'u)
- Modify: `views/public/profil.ejs:226-238` (QR modal)
- Test: `tests/linkTiklama.test.js`

**Bağlam:** `tests/linkTiklama.test.js:7-60` içinde `link-test-firma`/`link-test` slug'larıyla bir firma+çalışan fixture'ı zaten var (`describe('Çalışan profili link tıklama — kullanıcı adı normalleştirme', ...)` bloğunun `beforeAll`'ında oluşturuluyor). Bu bloğa yeni bir test eklenecek.

- [ ] **Step 1: Write the failing test**

`tests/linkTiklama.test.js` içindeki `describe('Çalışan profili link tıklama — kullanıcı adı normalleştirme', ...)` bloğunun sonuna (satır 60'daki son `test(...)` bloğundan hemen sonra, `});` kapanışından önce) ekle:

```javascript
  test('profil sayfasında QR kod doğru domaine işaret eder, nfckart.com içermez', async () => {
    const res = await request(app).get('/link-test-firma/link-test');
    expect(res.text).toContain('api.qrserver.com');
    expect(res.text).not.toContain('nfckart.com');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/linkTiklama.test.js -t "QR kod doğru domaine"`
Expected: FAIL — `expect(res.text).not.toContain('nfckart.com')` başarısız olur çünkü mevcut kod `process.env.DOMAIN` set değilken `nfckart.com` fallback'ine düşer.

- [ ] **Step 3: routes/public.js'teki iki profil route'una `qrHedef` ekle**

`routes/public.js:172-176` (bayi URL'li route) şu anki hali:

```javascript
    const vcfUrl = `/bayi/${req.params.bayiSlug}/${req.params.firmaSlug}/${calisan.slug}/vcf`;
    const profilUrl = `/bayi/${req.params.bayiSlug}/${req.params.firmaSlug}/${calisan.slug}`;
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const t = cevirmenOlustur(lang);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, profilUrl, lang, t, layout: false });
```

Şununla değiştir:

```javascript
    const vcfUrl = `/bayi/${req.params.bayiSlug}/${req.params.firmaSlug}/${calisan.slug}/vcf`;
    const profilUrl = `/bayi/${req.params.bayiSlug}/${req.params.firmaSlug}/${calisan.slug}`;
    const qrHedef = `${req.protocol}://${req.get('host')}${profilUrl}`;
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const t = cevirmenOlustur(lang);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, profilUrl, qrHedef, lang, t, layout: false });
```

`routes/public.js:280-284` (standart route) şu anki hali:

```javascript
    const vcfUrl = `/${req.params.firmaSlug}/${calisan.slug}/vcf`;
    const profilUrl = `/${req.params.firmaSlug}/${calisan.slug}`;
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const t = cevirmenOlustur(lang);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, profilUrl, lang, t, layout: false });
```

Şununla değiştir:

```javascript
    const vcfUrl = `/${req.params.firmaSlug}/${calisan.slug}/vcf`;
    const profilUrl = `/${req.params.firmaSlug}/${calisan.slug}`;
    const qrHedef = `${req.protocol}://${req.get('host')}${profilUrl}`;
    const lang = req.query.lang === 'en' ? 'en' : 'tr';
    const t = cevirmenOlustur(lang);
    res.render('public/profil', { title: `${calisan.ad} ${calisan.soyad}`, calisan, branding, vcfUrl, profilUrl, qrHedef, lang, t, layout: false });
```

- [ ] **Step 4: `views/public/profil.ejs`'teki modal'ı `qrHedef` kullanacak şekilde düzelt**

`views/public/profil.ejs:226-238` şu anki hali:

```html
  <!-- QR Modal -->
  <div id="qr-modal" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('aktif')">
    <div class="modal-kart">
      <button class="modal-kapat" onclick="document.getElementById('qr-modal').classList.remove('aktif')">✕</button>
      <h3 style="margin-bottom:16px;font-size:16px;font-weight:700"><%= t('qr_modal_baslik') %></h3>
      <% const fullUrl = 'https://' + (process.env.DOMAIN || (typeof req !== 'undefined' ? req.hostname : 'nfckart.com')) + profilUrl; %>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=<%= encodeURIComponent(fullUrl) %>" alt="QR Kod" style="width:220px;height:220px;border-radius:8px">
      <p style="margin-top:12px;font-size:12px;color:#6b7280;text-align:center"><%= t('qr_aciklama') %></p>
      <a href="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=<%= encodeURIComponent(fullUrl) %>" download="qr-kod.png" class="btn" style="margin-top:14px;width:100%;justify-content:center;font-size:14px">
        ⬇ <%= t('qr_indir') %>
      </a>
    </div>
  </div>
```

Şununla değiştir:

```html
  <!-- QR Modal -->
  <div id="qr-modal" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('aktif')">
    <div class="modal-kart">
      <button class="modal-kapat" onclick="document.getElementById('qr-modal').classList.remove('aktif')">✕</button>
      <h3 style="margin-bottom:16px;font-size:16px;font-weight:700"><%= t('qr_modal_baslik') %></h3>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=<%= encodeURIComponent(qrHedef) %>" alt="QR Kod" style="width:220px;height:220px;border-radius:8px">
      <p style="margin-top:12px;font-size:12px;color:#6b7280;text-align:center"><%= t('qr_aciklama') %></p>
      <a href="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=<%= encodeURIComponent(qrHedef) %>" download="qr-kod.png" class="btn" style="margin-top:14px;width:100%;justify-content:center;font-size:14px">
        ⬇ <%= t('qr_indir') %>
      </a>
    </div>
  </div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/linkTiklama.test.js`
Expected: Tüm testler PASS (yeni test dahil).

- [ ] **Step 6: Commit**

```bash
git add routes/public.js views/public/profil.ejs tests/linkTiklama.test.js
git commit -m "IP-4: profil QR yanlis domain duzeltmesi (req host tabanli qrHedef)"
```

---

### Task 2: Raf kartı sayfasına QR kod ekle

**Files:**
- Modify: `routes/public.js:24-40` (`GET /raf/:kod`)
- Modify: `views/public/raf.ejs`
- Test: `tests/raf.test.js`

**Bağlam:** `tests/raf.test.js:7-43` içinde `describe('Raf kartı public sayfası', ...)` bloğu var, `beforeAll`'da bir eczane fixture'ı oluşturuluyor (kod değişkeni `kod` olarak saklanıyor — mevcut testlere bakılarak teyit edilecek, örn. `res.text).toContain('Ürün Kataloğu')` deseni satır 38-39'da).

- [ ] **Step 1: Write the failing test**

`tests/raf.test.js` içindeki `describe('Raf kartı public sayfası', ...)` bloğunda, `test('geçerli kod 200 döner, okutma kaydedilir', ...)` testinin (satır 34-43) hemen altına ekle:

```javascript
  test('QR kodu gösterilir, doğru domaine işaret eder', async () => {
    const res = await request(app).get(`/raf/${kod}`);
    expect(res.text).toContain('api.qrserver.com');
    expect(res.text).toContain('QR Kodu Göster');
    expect(res.text).not.toContain('nfckart.com');
  });
```

(Not: `kod` değişkeni dosyanın üstündeki `beforeAll` bloğunda zaten tanımlı ve diğer testlerde kullanılıyor — aynen kullan.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/raf.test.js -t "QR kodu gösterilir"`
Expected: FAIL — `expect(res.text).toContain('api.qrserver.com')` başarısız olur çünkü raf.ejs'te QR yok.

- [ ] **Step 3: `routes/public.js`'teki raf route'una `qrHedef` ekle**

`routes/public.js:24-40` şu anki hali:

```javascript
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
```

Şununla değiştir:

```javascript
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
    const qrHedef = `${req.protocol}://${req.get('host')}/raf/${veri.kod}`;
    res.render('public/raf', { title: veri.firma_ad, veri, qrHedef, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});
```

- [ ] **Step 4: `views/public/raf.ejs`'e QR butonu + modal ekle**

`views/public/raf.ejs`'in mevcut `<style>` bloğu (satır 7-20) şu an şöyle biter:

```html
    .btn { display: block; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: 600; }
    .btn-katalog { background: var(--renk); color: #fff; font-size: 17px; }
    .btn-dis { background: #f0f2f5; color: #1a1a2e; }
  </style>
```

Şununla değiştir (QR buton/modal stilleri eklenir):

```html
    .btn { display: block; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: 600; }
    .btn-katalog { background: var(--renk); color: #fff; font-size: 17px; }
    .btn-dis { background: #f0f2f5; color: #1a1a2e; }
    .btn-qr { background: #fff; color: #1a1a2e; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; width: 100%; }
    .btn-qr:hover { border-color: #9ca3af; background: #f9fafb; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 50; padding: 16px; }
    .modal-overlay.aktif { display: flex; }
    .modal-kart { background: #fff; border-radius: 16px; padding: 24px; max-width: 300px; width: 100%; text-align: center; position: relative; }
    .modal-kapat { position: absolute; top: 12px; right: 14px; background: none; border: none; font-size: 18px; color: #6b7280; cursor: pointer; }
    .modal-kapat:hover { color: #374151; }
  </style>
```

Sayfanın gövdesindeki (`views/public/raf.ejs`, mevcut son whatsapp butonundan sonraki) kapanış şu an şöyle (mevcut son satırlar):

```html
      <% if (veri.whatsapp) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/whatsapp">💬 WhatsApp</a>
      <% } %>
    </div>
  </div>
</body>
</html>
```

Şununla değiştir (QR butonu `.govde` içine, modal `.kart` div'inin dışına eklenir):

```html
      <% if (veri.whatsapp) { %>
        <a class="btn btn-dis" href="/raf/<%= veri.kod %>/tikla/whatsapp">💬 WhatsApp</a>
      <% } %>
      <button class="btn-qr" onclick="document.getElementById('qr-modal').classList.add('aktif')">
        📱 QR Kodu Göster
      </button>
    </div>
  </div>

  <!-- QR Modal -->
  <div id="qr-modal" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('aktif')">
    <div class="modal-kart">
      <button class="modal-kapat" onclick="document.getElementById('qr-modal').classList.remove('aktif')">✕</button>
      <h3 style="margin-bottom:16px;font-size:16px;font-weight:700">QR Kodu</h3>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=<%= encodeURIComponent(qrHedef) %>" alt="QR Kod" style="width:220px;height:220px;border-radius:8px">
      <p style="margin-top:12px;font-size:12px;color:#6b7280;text-align:center">Bu kodu okutarak sayfaya ulaşabilirsiniz.</p>
      <a href="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=<%= encodeURIComponent(qrHedef) %>" download="qr-kod.png" class="btn" style="margin-top:14px;width:100%;justify-content:center;font-size:14px">
        ⬇ QR Kodu İndir
      </a>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/raf.test.js`
Expected: Tüm testler PASS (yeni test dahil).

- [ ] **Step 6: Commit**

```bash
git add routes/public.js views/public/raf.ejs tests/raf.test.js
git commit -m "IP-4: raf kartı sayfasına QR kod yedeği eklendi"
```

---

### Task 3: Eczacı sayfasına QR kod ekle

**Files:**
- Modify: `routes/public.js:85-101` (`GET /eczaci/:kod`)
- Modify: `views/public/eczaci.ejs`
- Test: `tests/eczaci.test.js`

**Bağlam:** `tests/eczaci.test.js:7-10` içinde `describe('Eczacı kartı public sayfası', ...)` bloğu, `beforeAll`'da `'Eczacı Test Firma'`/`eczaci-test-firma` fixture'ını oluşturur; eczacı kodu sabit değişken `const eczaciKod = 'eczacitest1';` (satır 10) olarak tanımlı ve mevcut testte (`tests/eczaci.test.js:35-46`) `request(app).get(\`/eczaci/${eczaciKod}\`)` şeklinde kullanılıyor.

- [ ] **Step 1: Write the failing test**

`tests/eczaci.test.js`'teki `test('geçerli kod 200 döner, içerik gösterilir, okutma kaydedilir', ...)` testinin (satır 35-46) hemen altına, `test('geçersiz kod 404 döner', ...)` testinden önce ekle:

```javascript
  test('QR kodu gösterilir, doğru domaine işaret eder', async () => {
    const res = await request(app).get(`/eczaci/${eczaciKod}`);
    expect(res.text).toContain('api.qrserver.com');
    expect(res.text).toContain('QR Kodu Göster');
    expect(res.text).not.toContain('nfckart.com');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/eczaci.test.js -t "QR kodu gösterilir"`
Expected: FAIL — `api.qrserver.com` içermediği için.

- [ ] **Step 3: `routes/public.js`'teki eczacı route'una `qrHedef` ekle**

`routes/public.js:85-101` şu anki hali:

```javascript
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

Şununla değiştir:

```javascript
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
    const qrHedef = `${req.protocol}://${req.get('host')}/eczaci/${req.params.kod}`;
    res.render('public/eczaci', { title: veri.firma_ad, veri, qrHedef, layout: false });
  } catch (err) {
    console.error(err);
    res.status(500).render('public/404', { title: 'Hata', mesaj: 'Bir hata oluştu.', layout: false });
  }
});
```

- [ ] **Step 4: `views/public/eczaci.ejs`'e QR butonu + modal ekle**

`views/public/eczaci.ejs`'in mevcut `<style>` bloğu (satır 7-23) şu an şöyle biter:

```html
    .btn { display: block; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: 600; background: var(--renk); color: #fff; }
    .bos { text-align: center; color: #888; padding: 24px 0; }
  </style>
```

Şununla değiştir:

```html
    .btn { display: block; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: 600; background: var(--renk); color: #fff; }
    .bos { text-align: center; color: #888; padding: 24px 0; }
    .btn-qr { background: #fff; color: #1a1a2e; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; width: 100%; padding: 15px; border-radius: 12px; font-size: 16px; font-weight: 600; }
    .btn-qr:hover { border-color: #9ca3af; background: #f9fafb; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 50; padding: 16px; }
    .modal-overlay.aktif { display: flex; }
    .modal-kart { background: #fff; border-radius: 16px; padding: 24px; max-width: 300px; width: 100%; text-align: center; position: relative; }
    .modal-kapat { position: absolute; top: 12px; right: 14px; background: none; border: none; font-size: 18px; color: #6b7280; cursor: pointer; }
    .modal-kapat:hover { color: #374151; }
  </style>
```

`views/public/eczaci.ejs`'in gövde kapanışı (satır 32-52) şu an şöyle:

```html
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

Şununla değiştir:

```html
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
      <button class="btn-qr" onclick="document.getElementById('qr-modal').classList.add('aktif')">
        📱 QR Kodu Göster
      </button>
    </div>
  </div>

  <!-- QR Modal -->
  <div id="qr-modal" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('aktif')">
    <div class="modal-kart">
      <button class="modal-kapat" onclick="document.getElementById('qr-modal').classList.remove('aktif')">✕</button>
      <h3 style="margin-bottom:16px;font-size:16px;font-weight:700">QR Kodu</h3>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=<%= encodeURIComponent(qrHedef) %>" alt="QR Kod" style="width:220px;height:220px;border-radius:8px">
      <p style="margin-top:12px;font-size:12px;color:#6b7280;text-align:center">Bu kodu okutarak sayfaya ulaşabilirsiniz.</p>
      <a href="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=<%= encodeURIComponent(qrHedef) %>" download="qr-kod.png" class="btn" style="margin-top:14px;width:100%;justify-content:center;font-size:14px">
        ⬇ QR Kodu İndir
      </a>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/eczaci.test.js`
Expected: Tüm testler PASS (yeni test dahil).

- [ ] **Step 6: Commit**

```bash
git add routes/public.js views/public/eczaci.ejs tests/eczaci.test.js
git commit -m "IP-4: eczacı sayfasına QR kod yedeği eklendi"
```

---

### Task 4: Tam test + deploy + production doğrulama

**Files:** Yok (komutlar)

- [ ] **Step 1: Tüm backend testleri**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 2: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Deploy'un canlıya çıkışını doğrula — üç sayfada da QR + doğru domain**

Gerçek bir profil, raf ve eczacı kodu ile (aşağıdaki `node -e` script'i mevcut prod verisinden birer örnek çeker):

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const p = await pool.query(\"SELECT f.slug as fslug, c.slug as cslug FROM calisanlar c JOIN firmalar f ON f.id=c.firma_id WHERE c.slug IS NOT NULL LIMIT 1\");
  const r = await pool.query(\"SELECT kod FROM eczaneler WHERE kod IS NOT NULL LIMIT 1\");
  const e = await pool.query(\"SELECT eczaci_kod FROM eczaneler WHERE eczaci_kod IS NOT NULL LIMIT 1\");
  console.log('PROFIL:', p.rows[0]);
  console.log('RAF:', r.rows[0]);
  console.log('ECZACI:', e.rows[0]);
  await pool.end();
})();
"
```

Sonra her üç URL'yi canlıda kontrol et (yukarıdaki script'in çıktısındaki değerlerle `<FSLUG>`, `<CSLUG>`, `<RAFKOD>`, `<ECZACIKOD>` yerine koy):

```bash
curl -s "https://www.nfckartify.com.tr/<FSLUG>/<CSLUG>" | grep -o 'api.qrserver.com[^"]*data=[^"]*' 
curl -s "https://www.nfckartify.com.tr/raf/<RAFKOD>" | grep -o 'api.qrserver.com[^"]*data=[^"]*'
curl -s "https://www.nfckartify.com.tr/eczaci/<ECZACIKOD>" | grep -o 'api.qrserver.com[^"]*data=[^"]*'
```

Expected: Her üç çıktıda da `data=` parametresi `www.nfckartify.com.tr` içerir, **`nfckart.com` içermez**.

- [ ] **Step 4: git durumu**

Run: `git status --short`
Expected: Boş.
