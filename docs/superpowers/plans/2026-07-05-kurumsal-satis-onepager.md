# Kurumsal Satış One-Pager'ları (Pharma + Gıda Takviyesi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurumsal ilaç ve gıda takviyesi firmalarına gönderilecek iki ayrı PDF one-pager (satış dokümanı) üretmek.

**Architecture:** İki bağımsız HTML dosyası (repo dışında, `Desktop/NFCKartify-Kurumsal-Sunum/` klasöründe) yazılır, Artifact aracıyla görsel onaya sunulur, onay sonrası Chrome/Edge headless print-to-pdf ile PDF'e dönüştürülür. Bu iş `kurumsal-kartvizit` kod tabanına dahil edilmez, pazarlama materyali olarak ayrı tutulur.

**Tech Stack:** Düz HTML + inline CSS (sistem fontları, ağ bağımlılığı yok), Chrome/Edge headless print-to-pdf.

---

### Task 1: Pharma one-pager HTML'ini yaz

**Files:**
- Create: `C:\Users\muham\Desktop\NFCKartify-Kurumsal-Sunum\pharma-onepager.html`

- [ ] **Step 1: `artifact-design` skill'ini yükle**

Artifact aracıyla önizleme yapılacağı için önce tasarım ilkelerini yükle: Skill tool ile `artifact-design` çağır.

- [ ] **Step 2: Dosyayı tam içerikle oluştur**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>NFCKartify Kurumsal — İlaç Sektörü</title>
<style>
  :root {
    --bg-dark: #0b2b26;
    --bg-dark2: #123a33;
    --accent: #c9973e;
    --text-light: #f5f1e8;
    --text-dark: #1a2420;
    --gray: #5b6b66;
    --gray-light: #eef1ef;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--text-dark);
    background: #fff;
    max-width: 794px;
    margin: 0 auto;
  }
  .display { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif; }
  header {
    background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-dark2) 100%);
    color: var(--text-light);
    padding: 48px 56px 40px;
  }
  header .kicker {
    color: var(--accent);
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 12px;
  }
  header h1 {
    font-size: 34px;
    line-height: 1.25;
    font-weight: 700;
    text-wrap: balance;
  }
  header p.deger {
    margin-top: 14px;
    font-size: 16px;
    color: #cfe0da;
    max-width: 560px;
  }
  main { padding: 40px 56px 8px; }
  section { margin-bottom: 34px; }
  .sec-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 12px;
  }
  .sec-num {
    font-family: Georgia, serif;
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
    border: 1.5px solid var(--accent);
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sec-head h2 {
    font-size: 19px;
    font-weight: 700;
    color: var(--bg-dark);
  }
  section p, section li {
    font-size: 14.5px;
    line-height: 1.65;
    color: #333;
  }
  .katmanlar {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 10px;
  }
  .katman {
    background: var(--gray-light);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    padding: 14px 18px;
  }
  .katman .ad {
    font-weight: 700;
    color: var(--bg-dark);
    font-size: 14.5px;
    margin-bottom: 4px;
  }
  .ornek-kutu {
    background: #fdf6e8;
    border: 1px solid #eadab0;
    border-radius: 6px;
    padding: 16px 18px;
    margin-top: 8px;
  }
  .ornek-kutu .etiket {
    display: inline-block;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 3px;
    margin-bottom: 8px;
  }
  .guven-liste { margin-top: 8px; padding-left: 0; list-style: none; }
  .guven-liste li {
    padding-left: 22px;
    position: relative;
    margin-bottom: 8px;
  }
  .guven-liste li::before {
    content: "✓";
    color: var(--accent);
    font-weight: 700;
    position: absolute;
    left: 0;
  }
  footer {
    background: var(--bg-dark);
    color: var(--text-light);
    padding: 32px 56px;
    margin-top: 20px;
    text-align: center;
  }
  footer .kapanis {
    font-size: 15px;
    color: #cfe0da;
    max-width: 520px;
    margin: 0 auto 18px;
    line-height: 1.6;
  }
  footer .cta {
    font-size: 16px;
    font-weight: 700;
    color: var(--accent);
  }
  footer .iletisim {
    margin-top: 6px;
    font-size: 14px;
    color: var(--text-light);
  }
</style>
</head>
<body>

<header>
  <div class="kicker">NFCKartify Kurumsal — İlaç Sektörü</div>
  <h1 class="display">Sahadaki her ziyaretin, her eczanenin ve her temasın ölçülebilir olduğu bir sistem</h1>
  <p class="deger">Tek bir NFC kart veya QR kod ile çalışan dijital kartvizit ve saha görünürlüğü sistemi.</p>
</header>

<main>

  <section>
    <div class="sec-head"><span class="sec-num">1</span><h2>Sorun</h2></div>
    <p>Mümessilleriniz eczaneleri ziyaret ediyor; kartvizit bırakıyor, katalog bırakıyor. Çoğu zaman o kartvizit çöpe gidiyor, katalog rafın altında kalıyor — ve ziyaretin gerçekten bir etki yaratıp yaratmadığını bilmiyorsunuz. Kaç eczaneye gidildi, hangi bölge daha aktif, hangi materyal işe yarıyor — bunların hiçbiri elinizde değil.</p>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">2</span><h2>Çözüm — Üç Katman</h2></div>
    <div class="katmanlar">
      <div class="katman">
        <div class="ad">Personel Kartviziti</div>
        <p>Her mümessilin, her yöneticinin kendi dijital profili — telefon, e-posta, sosyal medya, web sitesi tek bir NFC kartta. Bilgi değiştiğinde kart yeniden basılmaz, sadece profil güncellenir.</p>
      </div>
      <div class="katman">
        <div class="ad">Raf Kartı</div>
        <p>Her eczaneye bırakılan ayrı bir NFC kart, tezgahta/rafta durur. Müşteri okuttuğunda firmanızın kataloğuna, web sitenize yönlenir — eczane sizin adınıza sürekli, pasif şekilde müşteriye ulaşır.</p>
      </div>
      <div class="katman">
        <div class="ad">Eczacı Kartı</div>
        <p>Tezgahın altında, sadece eczacının ve eczane çalışanlarının kullandığı ayrı bir kart. Güncel kampanya, eğitim videosu, ürün dokümanı — eczacıyı sürekli bilgilendirilmiş tutar.</p>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">3</span><h2>Ölçeklenebilirlik</h2></div>
    <p>500-1000 mümessili olan bir organizasyon için tek tek elle veri girişi yeterli değildir. NFCKartify, Excel ile toplu yükleme ve onay akışıyla yüzlerce personeli ve eczaneyi dakikalar içinde sisteme kaydeder; yetkili onayladıkça mobil uygulamada görünür hale gelir.</p>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">4</span><h2>Örnek Senaryo</h2></div>
    <div class="ornek-kutu">
      <span class="etiket">Örnek — varsayımsal senaryo</span>
      <p>5000 eczane ile çalıştığınızı düşünün. Panelden hangi eczanenin ne sıklıkla okutulduğunu, hangi bölgenin daha aktif olduğunu, hangi mümessilin ne kadar ziyaret kaydettiğini anlık görürsünüz. (Bu senaryo örnek amaçlıdır, gerçek kullanım verisi değildir.)</p>
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">5</span><h2>Veri Güvenliği</h2></div>
    <ul class="guven-liste">
      <li>Her firmanın verisi diğer firmalardan tamamen izole tutulur — bir firma yalnızca kendi personel ve eczane verisini görebilir.</li>
      <li>Kişisel veri toplanan tüm profil kayıtlarında KVKK onay adımı zorunludur.</li>
      <li>Erişim, kullanıcı adı/şifre ile yetkilendirilmiş hesaplar üzerinden sağlanır.</li>
    </ul>
  </section>

</main>

<footer>
  <p class="kapanis">Bugün bastırdığınız kartvizitlerin, dağıttığınız kataloğun ne kadarının işe yaradığını bilmiyorsunuz. NFCKartify ile artık biliyorsunuz.</p>
  <div class="cta">Demo veya detaylı görüşme talep edin</div>
  <div class="iletisim">Hasan Yiğit · 0507 584 76 46 · yigitankuva@gmail.com</div>
</footer>

</body>
</html>
```

- [ ] **Step 3: Dosyanın oluştuğunu doğrula**

Run: `ls -la "/c/Users/muham/Desktop/NFCKartify-Kurumsal-Sunum/pharma-onepager.html"`
Expected: Dosya boyutu > 0, hata yok.

---

### Task 2: Pharma one-pager'ı önizle ve onay al

**Files:** Yok (Artifact önizleme)

- [ ] **Step 1: Artifact aracıyla önizle**

Artifact tool'u `file_path: C:\Users\muham\Desktop\NFCKartify-Kurumsal-Sunum\pharma-onepager.html`, uygun bir `favicon` (örn. 💊) ve açıklamayla çağır.

- [ ] **Step 2: Kullanıcıya sun, onay iste**

Kullanıcıya "Pharma one-pager hazır, gözden geçirir misin?" diye sor. Değişiklik istenirse `pharma-onepager.html` dosyasını Edit ile güncelleyip Artifact'i aynı `file_path` ile tekrar çağır (yeniden deploy).

- [ ] **Step 3: Onay alındığında devam et**

Onay gelmeden Task 3'e geçme.

---

### Task 3: Gıda Takviyesi one-pager HTML'ini yaz

**Files:**
- Create: `C:\Users\muham\Desktop\NFCKartify-Kurumsal-Sunum\gida-takviyesi-onepager.html`

- [ ] **Step 1: Dosyayı tam içerikle oluştur**

Aynı CSS iskeleti (Task 1'deki `<style>` bloğu birebir aynı kalır), içerik segment diline göre değişir. "eczane" kelimesi hiç geçmez.

```html
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>NFCKartify Kurumsal — Gıda Takviyesi Sektörü</title>
<style>
  :root {
    --bg-dark: #0b2b26;
    --bg-dark2: #123a33;
    --accent: #c9973e;
    --text-light: #f5f1e8;
    --text-dark: #1a2420;
    --gray: #5b6b66;
    --gray-light: #eef1ef;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--text-dark);
    background: #fff;
    max-width: 794px;
    margin: 0 auto;
  }
  .display { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif; }
  header {
    background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-dark2) 100%);
    color: var(--text-light);
    padding: 48px 56px 40px;
  }
  header .kicker {
    color: var(--accent);
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 12px;
  }
  header h1 {
    font-size: 34px;
    line-height: 1.25;
    font-weight: 700;
    text-wrap: balance;
  }
  header p.deger {
    margin-top: 14px;
    font-size: 16px;
    color: #cfe0da;
    max-width: 560px;
  }
  main { padding: 40px 56px 8px; }
  section { margin-bottom: 34px; }
  .sec-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 12px;
  }
  .sec-num {
    font-family: Georgia, serif;
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
    border: 1.5px solid var(--accent);
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sec-head h2 {
    font-size: 19px;
    font-weight: 700;
    color: var(--bg-dark);
  }
  section p, section li {
    font-size: 14.5px;
    line-height: 1.65;
    color: #333;
  }
  .katmanlar {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 10px;
  }
  .katman {
    background: var(--gray-light);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    padding: 14px 18px;
  }
  .katman .ad {
    font-weight: 700;
    color: var(--bg-dark);
    font-size: 14.5px;
    margin-bottom: 4px;
  }
  .ornek-kutu {
    background: #fdf6e8;
    border: 1px solid #eadab0;
    border-radius: 6px;
    padding: 16px 18px;
    margin-top: 8px;
  }
  .ornek-kutu .etiket {
    display: inline-block;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 3px;
    margin-bottom: 8px;
  }
  .guven-liste { margin-top: 8px; padding-left: 0; list-style: none; }
  .guven-liste li {
    padding-left: 22px;
    position: relative;
    margin-bottom: 8px;
  }
  .guven-liste li::before {
    content: "✓";
    color: var(--accent);
    font-weight: 700;
    position: absolute;
    left: 0;
  }
  footer {
    background: var(--bg-dark);
    color: var(--text-light);
    padding: 32px 56px;
    margin-top: 20px;
    text-align: center;
  }
  footer .kapanis {
    font-size: 15px;
    color: #cfe0da;
    max-width: 520px;
    margin: 0 auto 18px;
    line-height: 1.6;
  }
  footer .cta {
    font-size: 16px;
    font-weight: 700;
    color: var(--accent);
  }
  footer .iletisim {
    margin-top: 6px;
    font-size: 14px;
    color: var(--text-light);
  }
</style>
</head>
<body>

<header>
  <div class="kicker">NFCKartify Kurumsal — Gıda Takviyesi Sektörü</div>
  <h1 class="display">Sahadaki her ziyaretin, her satış noktasının ve her temasın ölçülebilir olduğu bir sistem</h1>
  <p class="deger">Tek bir NFC kart veya QR kod ile çalışan dijital kartvizit ve saha görünürlüğü sistemi.</p>
</header>

<main>

  <section>
    <div class="sec-head"><span class="sec-num">1</span><h2>Sorun</h2></div>
    <p>Saha temsilcileriniz satış noktalarını (spor salonu, takviye/mağaza, diyetisyen ofisi) ziyaret ediyor; kartvizit bırakıyor, katalog bırakıyor. Çoğu zaman o kartvizit çöpe gidiyor, katalog rafın altında kalıyor — ve ziyaretin gerçekten bir etki yaratıp yaratmadığını bilmiyorsunuz. Kaç noktaya gidildi, hangi bölge daha aktif, hangi materyal işe yarıyor — bunların hiçbiri elinizde değil.</p>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">2</span><h2>Çözüm — Üç Katman</h2></div>
    <div class="katmanlar">
      <div class="katman">
        <div class="ad">Personel Kartviziti</div>
        <p>Her saha temsilcisinin, her yöneticinin kendi dijital profili — telefon, e-posta, sosyal medya, web sitesi tek bir NFC kartta. Bilgi değiştiğinde kart yeniden basılmaz, sadece profil güncellenir.</p>
      </div>
      <div class="katman">
        <div class="ad">Satış Noktası Kartı</div>
        <p>Her satış noktasına bırakılan ayrı bir NFC kart, tezgahta/rafta durur. Müşteri okuttuğunda firmanızın kataloğuna, web sitenize yönlenir — satış noktası sizin adınıza sürekli, pasif şekilde müşteriye ulaşır.</p>
      </div>
      <div class="katman">
        <div class="ad">Satış Noktası Personeli / Diyetisyen Kartı</div>
        <p>Tezgahın altında, sadece satış noktası personelinin veya diyetisyenin kullandığı ayrı bir kart. Güncel kampanya, ürün eğitim videosu, ürün dokümanı — personeli ve diyetisyeni sürekli bilgilendirilmiş tutar.</p>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">3</span><h2>Ölçeklenebilirlik</h2></div>
    <p>500-1000 saha temsilcisi olan bir organizasyon için tek tek elle veri girişi yeterli değildir. NFCKartify, Excel ile toplu yükleme ve onay akışıyla yüzlerce personeli ve satış noktasını dakikalar içinde sisteme kaydeder; yetkili onayladıkça mobil uygulamada görünür hale gelir.</p>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">4</span><h2>Örnek Senaryo</h2></div>
    <div class="ornek-kutu">
      <span class="etiket">Örnek — varsayımsal senaryo</span>
      <p>5000 satış noktanızla (spor salonu, takviye/mağaza, diyetisyen ofisi) çalıştığınızı düşünün. Panelden hangi noktanın ne sıklıkla okutulduğunu, hangi bölgenin daha aktif olduğunu, hangi temsilcinin ne kadar ziyaret kaydettiğini anlık görürsünüz. (Bu senaryo örnek amaçlıdır, gerçek kullanım verisi değildir.)</p>
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">5</span><h2>Veri Güvenliği</h2></div>
    <ul class="guven-liste">
      <li>Her firmanın verisi diğer firmalardan tamamen izole tutulur — bir firma yalnızca kendi personel ve satış noktası verisini görebilir.</li>
      <li>Kişisel veri toplanan tüm profil kayıtlarında KVKK onay adımı zorunludur.</li>
      <li>Erişim, kullanıcı adı/şifre ile yetkilendirilmiş hesaplar üzerinden sağlanır.</li>
    </ul>
  </section>

</main>

<footer>
  <p class="kapanis">Bugün bastırdığınız kartvizitlerin, dağıttığınız kataloğun ne kadarının işe yaradığını bilmiyorsunuz. NFCKartify ile artık biliyorsunuz.</p>
  <div class="cta">Demo veya detaylı görüşme talep edin</div>
  <div class="iletisim">Hasan Yiğit · 0507 584 76 46 · yigitankuva@gmail.com</div>
</footer>

</body>
</html>
```

- [ ] **Step 2: Dosyanın oluştuğunu doğrula**

Run: `ls -la "/c/Users/muham/Desktop/NFCKartify-Kurumsal-Sunum/gida-takviyesi-onepager.html"`
Expected: Dosya boyutu > 0, hata yok.

---

### Task 4: Gıda Takviyesi one-pager'ı önizle ve onay al

**Files:** Yok (Artifact önizleme)

- [ ] **Step 1: Artifact aracıyla önizle**

Artifact tool'u `file_path: C:\Users\muham\Desktop\NFCKartify-Kurumsal-Sunum\gida-takviyesi-onepager.html`, uygun bir `favicon` (örn. 🌿) ve açıklamayla çağır.

- [ ] **Step 2: "eczane" kelimesinin geçmediğini doğrula**

Run: `grep -i "eczane" "/c/Users/muham/Desktop/NFCKartify-Kurumsal-Sunum/gida-takviyesi-onepager.html"`
Expected: Hiçbir eşleşme (boş çıktı) — dosya adında "eczane" geçmesi sorun değil (dosya adı `gida-takviyesi-onepager.html`), ama içerikte hiç geçmemeli.

- [ ] **Step 3: Kullanıcıya sun, onay iste**

Onay gelmeden Task 5'e geçme.

---

### Task 5: Her iki dosyayı PDF'e dönüştür

**Files:**
- Create: `C:\Users\muham\Desktop\NFCKartify-Kurumsal-Sunum\pharma-onepager.pdf`
- Create: `C:\Users\muham\Desktop\NFCKartify-Kurumsal-Sunum\gida-takviyesi-onepager.pdf`

- [ ] **Step 1: Chrome/Edge headless print-to-pdf ile dönüştür**

Run:
```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
DIR="/c/Users/muham/Desktop/NFCKartify-Kurumsal-Sunum"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$DIR/pharma-onepager.pdf" \
  "file:///$DIR/pharma-onepager.html"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$DIR/gida-takviyesi-onepager.pdf" \
  "file:///$DIR/gida-takviyesi-onepager.html"
```
Expected: İki komut da hatasız biter, iki `.pdf` dosyası oluşur.

- [ ] **Step 2: PDF dosyalarının oluştuğunu ve boş olmadığını doğrula**

Run: `ls -la "/c/Users/muham/Desktop/NFCKartify-Kurumsal-Sunum/"*.pdf`
Expected: İki dosya, her biri > 0 byte.

- [ ] **Step 3: İçerik doğruluğunu son kez teyit et**

Her iki PDF'teki teknik iddiaların (Excel toplu yükleme + onay akışı, tenant izolasyonu, KVKK onay adımı) `kurumsal-kartvizit` kod tabanında gerçekten var olan özelliklere karşılık geldiğini teyit et — bu session'da zaten doğrulanmıştı (İP-3, panel.js/kurumsal.js onay uçları, `firma_id` bazlı izolasyon, `kvkk` zorunlu alan `routes/panel.js`). Yeni bir kontrol gerekmiyor, sadece PDF metninin bu gerçek özelliklerle tutarlı kaldığını gözden geçir.

- [ ] **Step 4: Kullanıcıya son teslim**

Kullanıcıya her iki PDF'in `Desktop/NFCKartify-Kurumsal-Sunum/` klasöründe hazır olduğunu bildir.
