# İP-3 — Toplu Excel İçe Aktarım & Onay Akışı (Tasarım)

## Amaç ve Bağlam

Kurumsal firma yetkilisinin çalışan/eczane kayıtlarını tek tek değil, Excel ile toplu
oluşturabilmesi ve yanlış/hatalı toplu yüklemenin mobil ekibe (bayi/temsilci/firma
mobil kullanıcıları) ulaşmadan önce gözden geçirilip onaylanabilmesi.

**Önemli keşif (mevcut kod okunarak doğrulandı — KURAL #1):** Çalışan için toplu
Excel yükleme **zaten mevcut** — `routes/panel.js:85-123` (`GET /firma/panel/excel-sablon`,
`POST /firma/panel/toplu-yukle`) ve `utils/excel.js` (`excelParse`). Bu iş paketi
tekerleği yeniden icat etmiyor; sadece:
1. Eczane için aynı desenin eşdeğerini ekliyor,
2. Her iki yükleme türüne de onay akışı ekliyor.

Onaylanmış kararlar (brainstorming, 2026-07-05):
- Onay akışı **hem yeni eczane yüklemesine hem mevcut çalışan yüklemesine** uygulanır.
- Onaylanana kadar kayıtlar mobilde gizli kalır.

Kapsam DIŞI: genel profil/eczane public sayfalarının (`/:firmaSlug/:calisanSlug`,
`/raf/:kod`) erişilebilirliği — onaysız bir kayda ait link biri tarafından biliniyorsa
yine açılır (kart henüz yazılmadığı için pratikte önemsiz, bilinçli bir sınırlama).

## Veri Modeli

```sql
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS onayli BOOLEAN DEFAULT true;
ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS onayli BOOLEAN DEFAULT true;
```

Mevcut kayıtlar ve **tekil** ekleme uçları (`POST /firma/panel/ekle`,
`POST /kurumsal/eczane-ekle`) hiç değişmez — `DEFAULT true` sayesinde otomatik
onaylı sayılır. Sadece **toplu Excel** eklemeleri açıkça `onayli=false` yazar.

## Backend

### 1. Mevcut çalışan toplu yüklemesine `onayli=false` eklenir

`routes/panel.js:110-114`'teki INSERT'e `onayli` kolonu ve `false` değeri eklenir
(diğer davranış — `excelParse`, slug üretimi, hata raporlama — değişmez).

### 2. Eczane Excel şablonu + toplu yükleme (yeni, `routes/kurumsal.js`)

- `GET /kurumsal/eczane-sablon` — `ad`, `adres` kolonlu örnek `.xlsx` (mevcut
  `excel-sablon` deseniyle birebir aynı, `XLSX.utils.aoa_to_sheet`).
- `utils/excel.js`'e `eczaneExcelParse(buffer)` eklenir — `excelParse`'ın eczane
  eşdeğeri: `ad` zorunlu (yoksa hata), `adres` opsiyonel.
- `POST /kurumsal/eczane-toplu-yukle` — her geçerli satır için
  `benzersizEczaneKoduUret()` + `benzersizEczaciKoduUret()` çağrılıp
  `INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod, onayli) VALUES (..., false)`.
  `/kurumsal` router'ının mevcut `requireKurumsalPaket` kısıtlaması otomatik uygulanır.
  **Not:** `routes/kurumsal.js`'de henüz multer kurulu değil (`routes/panel.js:7,14`'te
  var: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } })`)
  — bu iş paketi `routes/kurumsal.js`'e de aynı deseni ekler.

### 3. Onaylama uçları

- `POST /firma/panel/calisan/:id/onayla` — `UPDATE calisanlar SET onayli = true
  WHERE id = $1 AND firma_id = $2` (tenant-scoped, mevcut `kart-isaretle` deseniyle
  aynı yetkilendirme).
- `POST /kurumsal/eczane/:id/onayla` — `UPDATE eczaneler SET onayli = true
  WHERE id = $1 AND firma_id = $2`.

### 4. Görünürlük filtresi

**Mobil uçlar** (`routes/mobilApi.js`) — şu sorgulara `AND onayli = true` eklenir:
- `GET /api/mobil/firma/calisanlarimiz`
- `GET /api/mobil/musteriler/:firmaId/calisanlar`
- `GET /api/mobil/firma/eczanelerimiz`
- `GET /api/mobil/eczanelerim`

**Web panel listeleri** (`app.js` GET `/` sorguları, `tab=calisanlar` ve `tab=raf`)
değişmez — tüm kayıtları (onaylı + onaysız) döndürmeye devam eder; ayrım UI'da
yapılır (bkz. aşağı).

## Web Panel UI

- **Çalışanlarım sekmesi** (`views/public/dashboard.ejs`, `tab=calisanlar` tablosu):
  `onayli=false` satırlarda "Onay Bekliyor" rozeti + "Onayla" butonu
  (`POST /firma/panel/calisan/:id/onayla`).
- **Raf Kartları sekmesi** (`tab=raf` tablosu): aynı desen, `onayli=false`
  eczanelerde "Onay Bekliyor" rozeti + "Onayla" butonu
  (`POST /kurumsal/eczane/:id/onayla`).
- **Excel sekmesi** (`tab=excel`): mevcut "Çalışan İçe Aktar" bölümünün altına
  aynı yapıda ikinci bir "Eczane İçe Aktar" bölümü eklenir (şablon indir linki +
  yükleme formu, `eczane-sablon`/`eczane-toplu-yukle` uçlarına işaret eder).

## Hata Yönetimi

- Eczane Excel parse: `ad` boşsa satır hata listesine eklenir, diğer geçerli
  satırlar yine de işlenir (mevcut `excelParse` davranışıyla tutarlı).
- Kod üretimi çakışırsa (`benzersizEczaneKoduUret`/`benzersizEczaciKoduUret` zaten
  kendi içinde tekilleştiriyor) — ek hata yönetimi gerekmez.
- Onaylama uçlarında kayıt başka firmaya aitse veya bulunamazsa sessizce
  yoksayılıp redirect edilir (mevcut `kart-isaretle` deseniyle tutarlı).

## Test Planı

- `utils/excel.js` → `eczaneExcelParse`: geçerli satırlar, `ad` eksik satır hatası,
  `adres` opsiyonel.
- `POST /kurumsal/eczane-toplu-yukle`: dosya yoksa hata; geçerli satırlarda
  `kod`/`eczaci_kod` üretilip `onayli=false` ile eklendiği; kurumsal olmayan
  firmada engellendiği (mevcut `requireKurumsalPaket` testiyle tutarlı).
- Mevcut çalışan `toplu-yukle` testi: eklenen kayıtların `onayli=false` olduğu
  (yeni assertion, mevcut test genişletilir).
- `POST /firma/panel/calisan/:id/onayla` ve `POST /kurumsal/eczane/:id/onayla`:
  başarılı onaylama; başka firmanın kaydında etkisiz kaldığı.
- Mobil uçlar: `onayli=false` kayıtların dönmediği, `onayli=true` (veya
  tekil-eklenmiş, varsayılan `true`) kayıtların döndüğü.
- Web panel listeleri: `onayli=false` kayıtların da tabloda (rozetle) göründüğü.
