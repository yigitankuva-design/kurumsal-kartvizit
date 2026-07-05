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

## Kapsam

**Dahil:** Raf kartı ve eczacı sayfalarına, profil sayfasındakiyle aynı UX'te
(buton + popup modal + QR resmi + indir linki) QR kod eklenir.

**Hariç:** Panelde QR indir butonu, mobil kart yazma ekranında QR önizleme.

## Mimari

Yeni DB alanı **yok**. `raf.ejs` ve `eczaci.ejs` kendi `<style>` bloklarına sahip
bağımsız sayfalar — paylaşılan `public/css/style.css`'i ve `utils/i18n.js`'i
kullanmıyorlar (sadece Türkçe metin). Bu yüzden profildeki `.btn-qr`/`.modal-overlay`
class'ları olduğu gibi kopyalanamaz; her sayfanın kendi inline stiline uygun eşdeğer
bir modal stili eklenir — davranış profildekiyle birebir aynı, görünüm sayfaya özgü.

### Backend — `routes/public.js`

- `GET /raf/:kod` handler'ı (satır 24-40): `res.render('public/raf', {...})` çağrısına
  `rafUrl: `/raf/${veri.kod}`` eklenir.
- `GET /eczaci/:kod` handler'ı (satır 85-101): `res.render('public/eczaci', {...})`
  çağrısına `eczaciUrl: `/eczaci/${req.params.kod}`` eklenir. (`eczaciGetir()` sorgusu
  `kod` select etmiyor ama route parametresi zaten mevcut, DB değişikliği gerekmez.)
- QR görsel URL'si, profildeki desenle aynı şekilde view içinde kurulur:
  `'https://' + (process.env.DOMAIN || req.hostname) + rafUrl` (ve `eczaciUrl` için aynısı).

### Frontend — `views/public/raf.ejs`

- Mevcut `.govde` içindeki sosyal medya linklerinin altına "QR Kodu Göster" butonu.
- Sayfa sonuna modal: QR resmi (`api.qrserver.com/v1/create-qr-code/?size=220x220&data=...`)
  + "İndir" linki (`size=500x500`, `download="qr-kod.png"`).
- Modal/buton CSS'i sayfanın kendi `<style>` bloğuna eklenir (profildeki
  `.btn-qr`/`.modal-overlay`/`.modal-kart`/`.modal-kapat` class'larının bu sayfaya
  özgü eşdeğerleri — aynı görsel dil: `--renk` marka rengi, mevcut `.btn`/`.btn-dis`
  boyut ve radius değerleriyle tutarlı).

### Frontend — `views/public/eczaci.ejs`

- Aynı desen: içerik bloğunun altına buton + aynı modal yapısı, sayfanın kendi
  `<style>` bloğuna eklenen eşdeğer CSS.

## Test

`tests/raf.test.js` ve `tests/eczaci.test.js`'e birer test eklenir (mevcut dosyalardaki
supertest + `res.text` `toContain` deseniyle aynı):
- Geçerli kod ile GET isteğinde `res.text`'in `api.qrserver.com` QR görsel URL'sini
  ve "QR Kodu Göster" metnini içerdiği doğrulanır.

## Deploy

Yeni migration yok. Backend değişikliği (route'lara değişken ekleme) + iki EJS
şablonu. Standart TDD döngüsü + `git push` + `railway up` + prod'da gerçek bir
raf/eczacı kodu ile (veya test verisiyle) canlıda görsel doğrulama yeterli — ayrı bir
migration adımı gerekmiyor.
