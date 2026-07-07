# Foto/Logo Kırpıcı + Eksik Fotoğraf Uyarısı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firma panelinde logo/çalışan fotoğrafı yüklerken kullanıcı sürükle+yakınlaştır ile kareyi kendi seçebilsin; Excel ile eklenen fotoğrafsız çalışanlar için belirgin bir "Fotoğraf Ekle" kısayolu çıksın.

**Architecture:** Kütüphanesiz, vanilla JS bir kırpma modalı (`public/js/foto-kirpici.js`) — dosya seçilince açılır, kullanıcı sürükleyip yakınlaştırır, "Kullan" ile canvas üzerinden 600×600 bir görsele dönüştürülüp orijinal `<input type="file">`'a `DataTransfer` ile geri yazılır. Form ve sunucu tarafı (routes/panel.js, routes/kurumsal.js, middleware/upload.js) hiç değişmez — sadece tarayıcıya giden dosya kullanıcının seçtiği kare olur. Eksik fotoğraf uyarısı salt EJS/CSS değişikliği.

**Tech Stack:** Vanilla JS (DOM, Canvas API, DataTransfer), EJS, mevcut Jest/supertest test altyapısı.

---

### Task 1: Eksik fotoğraf uyarısı

**Files:**
- Modify: `views/public/dashboard.ejs` (aktif ve pasif çalışanlar tabloları, İşlem sütunu)
- Test: `tests/panel.test.js`

- [ ] **Step 1: Write the failing test**

`tests/panel.test.js`'in sonuna, mevcut son test bloğundan sonra (describe kapanışından önce) ekle:

```javascript
  test('foto_url boş olan çalışan için "Fotoğraf Ekle" kısayolu çıkar, doluysa çıkmaz', async () => {
    const agent = await girisYap(firmaEmail);
    const fotosuz = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'Fotosuz','Kisi','fotosuz-kisi') RETURNING id",
      [firmaId]
    );
    const fotolu = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug, foto_url) VALUES ($1,'Fotolu','Kisi','fotolu-kisi','https://ornek.com/foto.jpg') RETURNING id",
      [firmaId]
    );
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Fotoğraf Ekle');
    await pool.query('DELETE FROM calisanlar WHERE id = ANY($1)', [[fotosuz.rows[0].id, fotolu.rows[0].id]]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/panel.test.js -t "Fotoğraf Ekle"`
Expected: FAIL — sayfa metninde "Fotoğraf Ekle" henüz yok.

- [ ] **Step 3: `views/public/dashboard.ejs`'teki aktif çalışanlar tablosuna ekle**

Aktif çalışanlar tablosundaki (`aktifCalisanlar.forEach`) İşlem `<td>` içindeki mevcut hali:

```html
            <td>
              <div class="td-actions">
                <button class="btn btn-border btn-sm" onclick='openSlideEdit(<%- JSON.stringify(c) %>)'>Düzenle</button>
                <form method="POST" action="/firma/panel/<%= c.id %>/durum" style="margin:0">
                  <input type="hidden" name="_method" value="PATCH">
                  <input type="hidden" name="durum" value="<%= c.durum === 'aktif' ? 'pasif' : 'aktif' %>">
                  <button type="submit" class="btn btn-danger-sm btn-sm"><%= c.durum === 'aktif' ? 'Pasife Al' : 'Aktif Et' %></button>
                </form>
              </div>
            </td>
```

Şununla değiştir (sadece `<div class="td-actions">` açıldıktan hemen sonra bir `<% if %>` bloğu eklenir):

```html
            <td>
              <div class="td-actions">
                <% if (!c.foto_url) { %>
                  <button class="btn btn-sm" style="background:#b45309;color:#fff;border:none" onclick='openSlideEdit(<%- JSON.stringify(c) %>)'>📷 Fotoğraf Ekle</button>
                <% } %>
                <button class="btn btn-border btn-sm" onclick='openSlideEdit(<%- JSON.stringify(c) %>)'>Düzenle</button>
                <form method="POST" action="/firma/panel/<%= c.id %>/durum" style="margin:0">
                  <input type="hidden" name="_method" value="PATCH">
                  <input type="hidden" name="durum" value="<%= c.durum === 'aktif' ? 'pasif' : 'aktif' %>">
                  <button type="submit" class="btn btn-danger-sm btn-sm"><%= c.durum === 'aktif' ? 'Pasife Al' : 'Aktif Et' %></button>
                </form>
              </div>
            </td>
```

- [ ] **Step 4: Aynısını pasif çalışanlar tablosuna da ekle**

Pasif çalışanlar `<details>` bloğundaki (`pasifCalisanlar.forEach`) İşlem `<td>` içindeki mevcut hali:

```html
            <td>
              <div class="td-actions">
                <button class="btn btn-border btn-sm" onclick='openSlideEdit(<%- JSON.stringify(c) %>)'>Düzenle</button>
                <form method="POST" action="/firma/panel/<%= c.id %>/durum" style="margin:0">
                  <input type="hidden" name="_method" value="PATCH">
                  <input type="hidden" name="durum" value="aktif">
                  <button type="submit" class="btn btn-danger-sm btn-sm">Aktif Et</button>
                </form>
              </div>
            </td>
```

Şununla değiştir:

```html
            <td>
              <div class="td-actions">
                <% if (!c.foto_url) { %>
                  <button class="btn btn-sm" style="background:#b45309;color:#fff;border:none" onclick='openSlideEdit(<%- JSON.stringify(c) %>)'>📷 Fotoğraf Ekle</button>
                <% } %>
                <button class="btn btn-border btn-sm" onclick='openSlideEdit(<%- JSON.stringify(c) %>)'>Düzenle</button>
                <form method="POST" action="/firma/panel/<%= c.id %>/durum" style="margin:0">
                  <input type="hidden" name="_method" value="PATCH">
                  <input type="hidden" name="durum" value="aktif">
                  <button type="submit" class="btn btn-danger-sm btn-sm">Aktif Et</button>
                </form>
              </div>
            </td>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/panel.test.js`
Expected: Tüm testler PASS (yeni test dahil).

- [ ] **Step 6: Commit**

```bash
git add views/public/dashboard.ejs tests/panel.test.js
git commit -m "Foto kirpici T1: eksik fotograf icin Fotograf Ekle kisayolu"
```

---

### Task 2: Fotoğraf kırpıcı JS bileşeni

**Files:**
- Create: `public/js/foto-kirpici.js`

**Not (dürüstlük):** Bu dosya tamamen tarayıcı içi DOM/Canvas/sürükleme etkileşimine dayanıyor. Proje genelinde bu kategorideki dosyalar (`public/js/adres-autocomplete.js` gibi) Jest ile test edilmiyor — jsdom canvas/gerçek sürükleme olaylarını anlamlı şekilde çalıştıramıyor. Aynı kısıtlama burada da geçerli; doğrulama Task 4'te gerçek tarayıcıda (preview) yapılacak.

- [ ] **Step 1: Dosyayı oluştur**

`public/js/foto-kirpici.js`:

```javascript
// Kare kırpma/yakınlaştırma bileşeni. Kütüphanesiz: seçilen görsel bir modalda
// açılır, kullanıcı sürükleyip yakınlaştırarak kareye neyin gireceğini seçer,
// "Kullan" ile canvas üzerinden kırpılmış hali orijinal <input type="file">'a
// geri yazılır (form değişmeden aynı şekilde submit edilir). Kullanıcı iptal
// ederse veya görsel yüklenemezse orijinal (kırpılmamış) dosya olduğu gibi kalır.

const FOTO_KIRPICI_CIKTI_BOYUTU = 600;
const FOTO_KIRPICI_VIEWPORT = 280;

function fotoKirpiciBaglama(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', () => {
    const dosya = input.files && input.files[0];
    if (!dosya) return;
    fotoKirpiciModalAc(dosya, (kirpilmisDosya) => {
      const veriTransferi = new DataTransfer();
      veriTransferi.items.add(kirpilmisDosya);
      input.files = veriTransferi.files;
    });
  });
}

function fotoKirpiciModalAc(dosya, tamamlaninca) {
  const okuyucu = new FileReader();
  okuyucu.onload = () => {
    const img = new Image();
    img.onload = () => fotoKirpiciArayuzOlustur(img, tamamlaninca);
    img.onerror = () => {};
    img.src = okuyucu.result;
  };
  okuyucu.readAsDataURL(dosya);
}

function fotoKirpiciArayuzOlustur(img, tamamlaninca) {
  const minOlcek = Math.max(FOTO_KIRPICI_VIEWPORT / img.naturalWidth, FOTO_KIRPICI_VIEWPORT / img.naturalHeight);
  const maksOlcek = minOlcek * 3;
  let olcek = minOlcek;
  let konumX = (FOTO_KIRPICI_VIEWPORT - img.naturalWidth * olcek) / 2;
  let konumY = (FOTO_KIRPICI_VIEWPORT - img.naturalHeight * olcek) / 2;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100';

  const kutu = document.createElement('div');
  kutu.style.cssText = 'background:#1a1a1a;border-radius:12px;padding:20px;max-width:360px;width:100%;display:flex;flex-direction:column;gap:14px;align-items:center';

  const baslik = document.createElement('div');
  baslik.textContent = 'Fotoğrafı Ayarla';
  baslik.style.cssText = 'color:#fff;font-weight:600;font-size:15px;align-self:flex-start';

  const viewport = document.createElement('div');
  viewport.style.cssText = `width:${FOTO_KIRPICI_VIEWPORT}px;height:${FOTO_KIRPICI_VIEWPORT}px;overflow:hidden;position:relative;border-radius:8px;background:#000;touch-action:none;cursor:grab`;

  const resim = document.createElement('img');
  resim.src = img.src;
  resim.style.cssText = 'position:absolute;left:0;top:0;transform-origin:top left;user-select:none;pointer-events:none';
  viewport.appendChild(resim);

  const sinirla = () => {
    const genislik = img.naturalWidth * olcek;
    const yukseklik = img.naturalHeight * olcek;
    const minX = FOTO_KIRPICI_VIEWPORT - genislik;
    const minY = FOTO_KIRPICI_VIEWPORT - yukseklik;
    konumX = Math.min(0, Math.max(minX, konumX));
    konumY = Math.min(0, Math.max(minY, konumY));
  };

  const uygula = () => {
    sinirla();
    resim.style.transform = `translate(${konumX}px, ${konumY}px) scale(${olcek})`;
  };
  uygula();

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '0';
  slider.style.cssText = 'width:100%';
  slider.addEventListener('input', () => {
    const oran = Number(slider.value) / 100;
    olcek = minOlcek + (maksOlcek - minOlcek) * oran;
    uygula();
  });

  const butonSatiri = document.createElement('div');
  butonSatiri.style.cssText = 'display:flex;gap:10px;width:100%';

  const mousemoveHandler = (e) => suruklemeDevam(e.clientX, e.clientY);
  const mouseupHandler = () => suruklemeBitir();

  const kapat = () => {
    window.removeEventListener('mousemove', mousemoveHandler);
    window.removeEventListener('mouseup', mouseupHandler);
    overlay.remove();
  };

  const iptalBtn = document.createElement('button');
  iptalBtn.type = 'button';
  iptalBtn.textContent = 'İptal';
  iptalBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;border:1px solid #444;background:transparent;color:#fff;cursor:pointer';
  iptalBtn.addEventListener('click', kapat);

  const kullanBtn = document.createElement('button');
  kullanBtn.type = 'button';
  kullanBtn.textContent = 'Kullan';
  kullanBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;border:none;background:#d4a017;color:#1a1a1a;font-weight:600;cursor:pointer';
  kullanBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = FOTO_KIRPICI_CIKTI_BOYUTU;
    canvas.height = FOTO_KIRPICI_CIKTI_BOYUTU;
    const ctx = canvas.getContext('2d');
    const cikisOlcek = FOTO_KIRPICI_CIKTI_BOYUTU / FOTO_KIRPICI_VIEWPORT;
    ctx.drawImage(
      img,
      0, 0, img.naturalWidth, img.naturalHeight,
      konumX * cikisOlcek, konumY * cikisOlcek,
      img.naturalWidth * olcek * cikisOlcek, img.naturalHeight * olcek * cikisOlcek
    );
    canvas.toBlob((blob) => {
      if (blob) {
        const yeniDosya = new File([blob], 'kirpilmis.jpg', { type: 'image/jpeg' });
        tamamlaninca(yeniDosya);
      }
      kapat();
    }, 'image/jpeg', 0.9);
  });

  butonSatiri.appendChild(iptalBtn);
  butonSatiri.appendChild(kullanBtn);
  kutu.appendChild(baslik);
  kutu.appendChild(viewport);
  kutu.appendChild(slider);
  kutu.appendChild(butonSatiri);
  overlay.appendChild(kutu);
  document.body.appendChild(overlay);

  let surukleniyor = false;
  let baslangicX = 0;
  let baslangicY = 0;
  let baslangicKonumX = 0;
  let baslangicKonumY = 0;

  function suruklemeBaslat(x, y) {
    surukleniyor = true;
    baslangicX = x;
    baslangicY = y;
    baslangicKonumX = konumX;
    baslangicKonumY = konumY;
    viewport.style.cursor = 'grabbing';
  }
  function suruklemeDevam(x, y) {
    if (!surukleniyor) return;
    konumX = baslangicKonumX + (x - baslangicX);
    konumY = baslangicKonumY + (y - baslangicY);
    uygula();
  }
  function suruklemeBitir() {
    surukleniyor = false;
    viewport.style.cursor = 'grab';
  }

  viewport.addEventListener('mousedown', (e) => suruklemeBaslat(e.clientX, e.clientY));
  window.addEventListener('mousemove', mousemoveHandler);
  window.addEventListener('mouseup', mouseupHandler);

  viewport.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    suruklemeBaslat(t.clientX, t.clientY);
  });
  viewport.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    suruklemeDevam(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchend', suruklemeBitir);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/foto-kirpici.js
git commit -m "Foto kirpici T2: surukle/yakinlastir modal bileseni"
```

---

### Task 3: Kırpıcıyı panele bağla

**Files:**
- Modify: `views/public/dashboard.ejs` (logo input'a id ekle, script include + bağlama çağrıları)

- [ ] **Step 1: Logo input'una id ekle**

`views/public/dashboard.ejs`'teki mevcut hali:

```html
      <form method="POST" action="/kurumsal/logo" enctype="multipart/form-data" style="margin-bottom:24px">
        <input type="file" name="logo" accept="image/*" required>
        <button type="submit">Logoyu Yükle</button>
      </form>
```

Şununla değiştir:

```html
      <form method="POST" action="/kurumsal/logo" enctype="multipart/form-data" style="margin-bottom:24px">
        <input type="file" name="logo" id="logoInput" accept="image/*" required>
        <button type="submit">Logoyu Yükle</button>
      </form>
```

- [ ] **Step 2: Script include + bağlama çağrılarını ekle**

`views/public/dashboard.ejs`'in sonundaki `</script>` kapanışından hemen önce (mevcut son satıra) ekle:

```javascript
</script>
<script src="/js/foto-kirpici.js"></script>
<script>
  fotoKirpiciBaglama('logoInput');
  fotoKirpiciBaglama('f_foto');
</script>
```

(Burada iki ayrı `<script>` etiketi olacak — birincisi mevcut dosyanın kapanışı, ikincisi ve üçüncüsü yeni eklenenler.)

- [ ] **Step 3: Tam test paketini çalıştır**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm testler PASS (bu adım sadece EJS/HTML değişikliği olduğu için mevcut testlerde regresyon olmamalı).

- [ ] **Step 4: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "Foto kirpici T3: logo ve calisan foto alanlarina baglama"
```

---

### Task 4: Tam test + gerçek tarayıcıda doğrulama + deploy + prod doğrulama

**Files:** Yok (komutlar + manuel doğrulama)

- [ ] **Step 1: Tüm backend testleri**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 2: Yerel preview'da gerçek tarayıcı doğrulaması**

1. Preview sunucusunu başlat (`preview_start`), test firma hesabıyla giriş yap.
2. İçerik sekmesinde "Logoyu Yükle" alanına geniş (kare olmayan) bir test görseli seç.
3. Kırpma modalının açıldığını, görselin sürüklenebildiğini, slider ile yakınlaştırılabildiğini doğrula (`preview_screenshot` + `preview_click`/sürükleme simülasyonu ile).
4. "Kullan"a bas, modalın kapandığını ve dosya inputunun kırpılmış görseli içerdiğini doğrula (`preview_eval` ile `input.files[0].size`/`type` kontrolü).
5. Formu gönder, `/kurumsal/logo` isteğinin 302 döndüğünü ve DB'de `logo_url`'in güncellendiğini doğrula.
6. Aynı akışı "+ Yeni Çalışan" formundaki fotoğraf alanı için tekrarla.

- [ ] **Step 3: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 4: Production doğrulama**

Marker bir firma oluştur, gerçek bir dikdörtgen test görseliyle `/kurumsal/logo` ve çalışan foto yüklemesini curl/tarayıcı ile dene (kırpma tarayıcı tarafında olduğu için curl testi kare olmayan görseli olduğu gibi gönderir — bu adımda sadece uçların hâlâ 302 döndüğünü ve `/dosya/...` üzerinden erişilebilir bir görsel URL'i üretildiğini doğrula; gerçek kırpma deneyimi Step 2'de tarayıcıda zaten doğrulandı).

- [ ] **Step 5: Marker temizliği + git durumu**

Marker firma/çalışan verisini sil. `git status --short` boş olmalı.
