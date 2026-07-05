# İP-4 — QR Kod Her Zaman Yedek (Raf & Eczacı Sayfaları) Design

## Amaç

NFC okumayan/kapalı cihazlarda satış kesilmesin diye raf kartı ve eczacı sayfalarına,
çalışan profil sayfasında zaten var olan QR kod yedeğinin aynısı eklenir.

## Mevcut Durum (tespit)

- QR kod şu an **sadece** çalışan/müşteri profil sayfasında var
  (`views/public/profil.ejs:207-238`): "QR Kodu Göster" butonu → modal → QR resmi
  (`api.qrserver.com` harici servisi, npm paketi yok) + "İndir" linki (500x500 png).
- Raf kartı sayfası (`views/public/raf.ejs`) — QR yok.
- Eczacı sayfası (`views/public/eczaci.ejs`) — QR yok.
- Panelde "QR indir" butonu yok, mobil kart yazma ekranında QR önizleme yok —
  **bu ikisi bu İP'nin kapsamı dışında** (kullanıcı onayıyla).

### KRİTİK BULGU — mevcut profil QR'ı kırık (yanlış domain)

Profil QR URL'si şöyle kuruluyor (`profil.ejs:231`):
`'https://' + (process.env.DOMAIN || (typeof req !== 'undefined' ? req.hostname : 'nfckart.com')) + profilUrl`

Ama:
- `process.env.DOMAIN` ne `.env`'de ne Railway'de set (Railway'de sadece
  `RAILWAY_PUBLIC_DOMAIN` var, kod onu okumuyor).
- `req`, hiçbir view'a geçilmiyor ve `res.locals`'a konmuyor (`app.js:55-59` sadece
  `success`/`error`/`session` koyuyor) → EJS'te `typeof req === 'undefined'`.

Sonuç: her zaman `'nfckart.com'` fallback'ine düşüyor. Prod doğrulaması
(`www.nfckartify.com.tr/abdi-ibrahim-ilac/r8LvURT9`):
`...create-qr-code/?...&data=https%3A%2F%2Fnfckart.com%2Fabdi-ibrahim-ilac%2Fr8LvURT9`
→ QR **yanlış domaine** (`nfckart.com`) gidiyor, gerçek domain `www.nfckartify.com.tr`.

Eski desen aynen kopyalanırsa raf/eczacı QR'ları da yanlış domaine gider ve İP-4'ün
amacı (NFC okumazsa QR ile satışın devamı) hiç sağlanamaz. Bu yüzden QR mutlak
URL'si `process.env.DOMAIN`'e güvenmeden, **gerçek istek host'undan** üretilir ve
profil sayfasındaki mevcut kırık QR da aynı kök nedenle düzeltilir.

## Kapsam

**Dahil:**
- Raf kartı ve eczacı sayfalarına, profil sayfasındakiyle aynı UX'te (buton + popup
  modal + QR resmi + indir linki) QR kod eklenir.
- QR mutlak URL'si her üç sayfada da route içinde `req`'ten üretilir (aşağıya bkz.),
  böylece **doğru domaine** işaret eder.
- Profil sayfasındaki mevcut kırık QR de düzeltilir (kullanıcı onayıyla).

**Hariç:** Panelde QR indir butonu, mobil kart yazma ekranında QR önizleme.

## Mimari

Yeni DB alanı **yok**. `raf.ejs` ve `eczaci.ejs` kendi `<style>` bloklarına sahip
bağımsız sayfalar — paylaşılan `public/css/style.css`'i ve `utils/i18n.js`'i
kullanmıyorlar (sadece Türkçe metin). Bu yüzden profildeki `.btn-qr`/`.modal-overlay`
class'ları olduğu gibi kopyalanamaz; her sayfanın kendi inline stiline uygun eşdeğer
bir modal stili eklenir — davranış profildekiyle birebir aynı, görünüm sayfaya özgü.

### QR mutlak URL'sinin doğru üretimi (ortak desen)

Her üç route'ta da, QR'ın işaret edeceği tam URL, gerçek istek host'undan üretilir:
`const qrHedef = `${req.protocol}://${req.get('host')}${<sayfa yolu>}`;`
ve view'a `qrHedef` olarak geçilir. Böylece `process.env.DOMAIN`'e ihtiyaç kalmaz,
QR her ortamda (prod/localhost/test) doğru domaine gider. View'lar artık `req` veya
`process.env.DOMAIN`'e dokunmaz; sadece hazır `qrHedef`'i `encodeURIComponent`'le
`api.qrserver.com` URL'sine koyar.

> Not: `req.protocol` proxy arkasında `http` görebilir; ancak `data` parametresine
> giden değer `req.get('host')` (doğru domain) olduğu için QR'ın hedefi doğru kalır.
> İstenirse ileride `x-forwarded-proto` ele alınabilir, bu İP kapsamında YAGNI.

### Backend — `routes/public.js`

- `GET /raf/:kod` handler'ı (satır 24-40): render'a
  `qrHedef: `${req.protocol}://${req.get('host')}/raf/${veri.kod}`` eklenir.
- `GET /eczaci/:kod` handler'ı (satır 85-101): render'a
  `qrHedef: `${req.protocol}://${req.get('host')}/eczaci/${req.params.kod}`` eklenir.
  (`eczaciGetir()` sorgusu `kod` select etmiyor ama route parametresi mevcut, DB
  değişikliği gerekmez.)
- **Profil düzeltmesi:** `/bayi/:bayiSlug/:firmaSlug/:calisanSlug` (satır 173-176) ve
  `/:firmaSlug/:calisanSlug` (satır 281-284) route'larına da
  `qrHedef: `${req.protocol}://${req.get('host')}${profilUrl}`` eklenir; `profilUrl`
  zaten hesaplanıyor.

### Frontend — `views/public/raf.ejs`

- Mevcut `.govde` içindeki sosyal medya linklerinin altına "QR Kodu Göster" butonu.
- Sayfa sonuna modal: QR resmi
  (`api.qrserver.com/v1/create-qr-code/?size=220x220&data=<%= encodeURIComponent(qrHedef) %>`)
  + "İndir" linki (`size=500x500`, `download="qr-kod.png"`).
- Modal/buton CSS'i sayfanın kendi `<style>` bloğuna eklenir (profildeki
  `.btn-qr`/`.modal-overlay`/`.modal-kart`/`.modal-kapat` class'larının bu sayfaya
  özgü eşdeğerleri — aynı görsel dil: `--renk` marka rengi, mevcut `.btn`/`.btn-dis`
  boyut ve radius değerleriyle tutarlı).

### Frontend — `views/public/eczaci.ejs`

- Aynı desen: içerik bloğunun altına buton + aynı modal yapısı, sayfanın kendi
  `<style>` bloğuna eklenen eşdeğer CSS, `qrHedef` kullanılır.

### Frontend — `views/public/profil.ejs` (düzeltme)

- Satır 231'deki `fullUrl` hesabı kaldırılır; modal artık view'a geçilen `qrHedef`'i
  kullanır (satır 232 ve 234'teki `encodeURIComponent(fullUrl)` → `encodeURIComponent(qrHedef)`).

## Test

Mevcut dosyalardaki supertest + `res.text` `toContain` deseniyle:
- `tests/raf.test.js` ve `tests/eczaci.test.js`'e birer test: geçerli kod ile GET
  isteğinde `res.text`'in `api.qrserver.com` QR görsel URL'sini ve "QR Kodu Göster"
  metnini içerdiği; ayrıca `data=` parametresinde **`nfckart.com` GEÇMEDİĞİ**
  (`expect(res.text).not.toContain('nfckart.com')`) doğrulanır — regresyon koruması.
- Ayrı bir profil-render testi yok. `tests/linkTiklama.test.js` zaten
  `link-test-firma/link-test` firma+çalışan fixture'ına sahip; oraya profil sayfasını
  GET edip (`/link-test-firma/link-test`) `res.text`'in `api.qrserver.com` içerdiği ve
  `nfckart.com` **içermediği** doğrulanan bir test eklenir.

> Not: supertest istekleri `127.0.0.1` host'uyla gelir; test `api.qrserver.com`
> varlığını ve `nfckart.com` yokluğunu kontrol eder, spesifik domain'i değil.

## Deploy

Yeni migration yok. Backend değişikliği (route'lara `qrHedef` ekleme, profil
düzeltmesi) + üç EJS şablonu. Standart TDD döngüsü + `git push` + `railway up` +
prod'da gerçek bir profil/raf/eczacı kodu ile canlıda `curl | grep api.qrserver.com`
ile QR `data` parametresinin **doğru domaini** (`www.nfckartify.com.tr`) içerdiği
doğrulanır. Ayrı migration adımı gerekmez.
