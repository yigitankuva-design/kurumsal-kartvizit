# Bayi Kredi Sistemi & Profil Genişletmeleri — Tasarım Spesifikasyonu

**Tarih:** 2026-07-01
**Durum:** Onaylandı
**İlgili:** `docs/superpowers/specs/2026-06-28-kurumsal-nfc-kartvizit-design.md` (temel sistem)

---

## Genel Bakış

Harici bir "teknik brifing" dokümanı (yeni/farklı bir NFC kartvizit konsepti için yazılmış) mevcut `kurumsal-kartvizit` projesiyle karşılaştırıldı. Karşılaştırma sonucunda ortaya çıkan gerçek iş ihtiyacı şu:

- Proje **matbaa bayileri** ve kurumsal işyerleri için kullanılacak. Matbaa bayileri kullanıcı adı/şifresiyle bu sisteme giriyor, müşteri firmalarını (kurumsal işyerlerini) ekliyor.
- Bayiler, firma ekleyebilmek için **kredi/jeton** harcıyor. Krediler bu siteden **gerçek online ödeme (PayTR)** ile satın alınıyor.
- Fiziksel NFC kartı yazma işlemi ayrı, ileride yapılacak bir mobil uygulamanın kapsamında — **bu proje kapsamı dışında**.
- **Kapsam dışı bırakılanlar (bu fazda):**
  - `evlilik` / `evcil` / `diger` profil tipleri — istenmiyor, sistem sadece kurumsal çalışan modeliyle devam ediyor.
  - Telegram bildirimleri — sonraki fazda konuşulacak.
  - Admin panel değişiklikleri (başvuru/onay iş akışı, admin panelinden kredi paketi yönetimi vb.) — sonraki fazda konuşulacak. Mevcut süperadmin/firma/bayi panel yapısı korunuyor, sadece kredi düşme/PayTR callback gibi arka plan mantığı ekleniyor.
  - Başvuru (`basvurular`) veri modeli — **kurulmuyor**. Mevcut self-servis firma kaydı (`/firma/kayit`) aynen kalıyor, kredi sistemine tabi değil.

---

## Stack Değişiklikleri

**Yeni bağımlılıklar:**
- `sharp` — fotoğraf işleme (EXIF düzeltme + yüz odaklı kırpma)
- `sanitize-html` — HTML destekli biyografi için XSS koruması
- `helmet` — güvenlik header middleware
- `express-rate-limit` — brute-force / kötüye kullanım koruması

**Yeni env değişkenleri:**
```
PAYTR_MERCHANT_ID
PAYTR_MERCHANT_KEY
PAYTR_MERCHANT_SALT
GOOGLE_MAPS_API_KEY
```

PayTR entegrasyonu için ayrı bir npm paketi kullanılmıyor — token/hash üretimi Node'un yerleşik `crypto` modülüyle yapılıyor (HMAC-SHA256), PayTR resmi dokümantasyonundaki akışa uygun.

---

## 1. Veritabanı Şeması Değişiklikleri

Mevcut proje `scripts/migrate.js` içinde idempotent (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`) bir migration deseni kullanıyor. Yeni değişiklikler bu **mevcut desene** eklenecek; `db/schema.sql` da referans şema olarak güncellenecek.

```sql
-- bayiler tablosuna kredi bakiyesi
ALTER TABLE bayiler ADD COLUMN IF NOT EXISTS kredi_bakiyesi INTEGER DEFAULT 0;

-- Kredi hareket defteri (ledger)
CREATE TABLE IF NOT EXISTS kredi_hareketleri (
  id           SERIAL PRIMARY KEY,
  bayi_id      INTEGER REFERENCES bayiler(id) ON DELETE CASCADE,
  tip          TEXT NOT NULL,        -- 'yukleme' | 'harcama'
  miktar       INTEGER NOT NULL,     -- yukleme: pozitif, harcama: negatif
  aciklama     TEXT,
  firma_id     INTEGER REFERENCES firmalar(id) ON DELETE SET NULL,
  odeme_id     INTEGER,              -- FK aşağıda odemeler tablosu oluştuktan sonra eklenir
  created_at   TIMESTAMP DEFAULT NOW()
);

-- PayTR ödeme kayıtları
CREATE TABLE IF NOT EXISTS odemeler (
  id                  SERIAL PRIMARY KEY,
  bayi_id             INTEGER REFERENCES bayiler(id) ON DELETE CASCADE,
  paytr_merchant_oid  TEXT UNIQUE NOT NULL,
  kredi_miktari       INTEGER NOT NULL,
  tutar               NUMERIC(10,2) NOT NULL,
  durum               TEXT DEFAULT 'beklemede',  -- 'beklemede' | 'basarili' | 'basarisiz'
  created_at          TIMESTAMP DEFAULT NOW(),
  onaylanma_tarihi    TIMESTAMP
);

ALTER TABLE kredi_hareketleri
  ADD CONSTRAINT fk_kredi_hareketleri_odeme
  FOREIGN KEY (odeme_id) REFERENCES odemeler(id) ON DELETE SET NULL;

-- calisanlar tablosuna yeni profil alanları
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS tiktok TEXT;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS sahibinden TEXT;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS hurriyet_emlak TEXT;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS adres TEXT;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS google_yorum_link TEXT;
```

`biyografi` alanı zaten mevcut — tip değişikliği yok, sadece render/sanitize mantığı değişiyor (bkz. Bölüm 3).

`profil_tipi` gibi yeni bir alan/tablo **eklenmiyor** — evlilik/evcil/diğer istenmediği için sistem tek model (kurumsal çalışan) ile devam ediyor.

---

## 2. Kredi & Ödeme Akışı (PayTR)

**Kapsam:** Kredi sistemi yalnızca **bayi kanalı** için geçerli. Doğrudan `/firma/kayit` ile kaydolan firmalar (bayisiz) kredi sistemine tabi değil, bugünkü gibi serbest kalıyor.

**Kredi birimi:** 1 kredi = 1 firma/işyeri kaydı (çalışan sayısı sınırsız).

**Akış:**
1. Bayi panelinde yeni "Kredi Yükle" sekmesi — sabit kredi paketleri (örn. 10/25/50/100 kredi + TL fiyatı, kod içinde config olarak tanımlı).
2. Paket seçilince: `odemeler` tablosuna `durum='beklemede'` kaydı açılır → PayTR token API'sine istek (merchant_oid = ödeme kaydı id'si, tutar, sepet, kullanıcı bilgisi).
3. Bayi PayTR iFrame'inde kart bilgilerini girer (kart verisi bizim sunucumuza hiç uğramaz).
4. PayTR sonucu **callback URL**'e (`POST /bayi/odeme/paytr-callback`) bildirir → route PayTR imzasını (HMAC hash) doğrular.
5. Başarılıysa tek DB transaction içinde: `odemeler.durum='basarili'`, `bayiler.kredi_bakiyesi += kredi_miktari`, `kredi_hareketleri`'ne `'yukleme'` kaydı. Route PayTR'ye düz metin `"OK"` döner (dönmezse PayTR isteği tekrar dener).
6. Bayi `/bayi/odeme/basarili` sayfasına yönlendirilir (bilgilendirme; asıl işlem callback'te arka planda tamamlanmış olur).

**Firma ekleme sırasında kredi düşürme** (`POST /bayi/panel/firma-ekle`):
- Önce `kredi_bakiyesi >= 1` kontrolü. Yetersizse: "Krediniz kalmadı, lütfen kredi yükleyin" hatası, firma eklenmez.
- Yeterliyse: firma insert + `kredi_bakiyesi -= 1` + `kredi_hareketleri`'ne `'harcama'` kaydı — **tek transaction** içinde (yarım kalmış firma/kredi durumu oluşmasın diye).

**Hata durumları:**
- PayTR callback imzası doğrulanamazsa: işlem reddedilir, `odemeler.durum` değişmez, log'lanır.
- Aynı `merchant_oid` için callback birden fazla gelirse (PayTR retry): `odemeler.durum` zaten `'basarili'` ise işlem tekrar yapılmaz (idempotency — `UNIQUE` constraint + durum kontrolü).

---

## 3. Profil Kartı Yeni Alanları + HTML Bio Güvenliği

- **WhatsApp:** `https://wa.me/<temizlenmiş numara>` formatında link üretilir.
- **TikTok / Sahibinden / Hürriyet Emlak:** mevcut sosyal medya butonu deseniyle aynı şekilde eklenir.
- **Tıklama takibi:** `/t/:tip` route'undaki `izinliTipler` listesine `whatsapp, tiktok, sahibinden, hurriyet_emlak, google_yorum` eklenir.
- **Adres:** Google Maps Places Autocomplete (frontend'de Maps JS API + Autocomplete widget) firma/bayi panelindeki adres input'una eklenir.
- **Google yorum linki:** Ayrı alan (`google_yorum_link`). `GET /:firmaSlug/:calisanSlug/degerlendir` route'u bu linke redirect eder; link yoksa 404.
- **HTML destekli tanıtım:** Ham HTML doğrudan basılmaz (XSS riski — profil herkese açık). `sanitize-html` paketiyle yalnızca temel etiketlere (`b, i, br, p, a, strong, em`) izin verilir; script/style/on-event temizlenir. Hem kayıt sırasında (server-side, DB'ye yazmadan önce) hem render sırasında sanitize edilir (defense-in-depth).
- Yeni alanlar hem `/firma/panel` hem `/bayi/panel` çalışan ekle/düzenle formlarına eklenir (mevcut kalıpta iki panel bağımsız, aynı alanlar iki yerde tekrarlanıyor).

---

## 4. Fotoğraf İşleme (sharp)

- `middleware/upload.js`: multer `memoryStorage()` kullanır → `sharp` ile işlenir:
  ```js
  sharp(buffer).rotate()
    .resize(600, 600, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 88 })
    .toBuffer()
  ```
- İşlenmiş buffer `@aws-sdk/lib-storage`'ın `Upload` sınıfıyla Object Storage'a yüklenir (multer-s3'ün otomatik akışı yerine — artık ara işleme adımı var).
- Çıktı her zaman JPEG (orijinal PNG/WebP olsa bile).
- Upload limiti **5MB → 15MB** çıkarılır (sharp zaten 600×600'e indirdiği için depolama sorun olmaz).
- Hem `/firma/panel` hem `/bayi/panel` foto upload yollarına uygulanır (`middleware/upload.js` ortak middleware, iki panel de bunu kullanıyor).

---

## 5. Rehbere Ekleme + Dil Desteği + Telefon Çerçevesi

**Android intent deep link:**
Profil sayfasında client-side User-Agent algılaması: Android'de "Rehbere Ekle" `intent://contacts/add#Intent;...;end` linkine gider, açılmazsa `.vcf` indirmeye düşer. iOS/PC'de mevcut `.vcf` davranışı korunur. Tamamen frontend değişikliği, backend'de değişiklik yok.

**Dil desteği TR/EN:**
Yalnızca **public profil sayfası** kapsar (panel/admin arayüzleri Türkçe kalır). `utils/i18n.js` içinde `{ tr: {...}, en: {...} }` sözlük. `?lang=en` query param'ı okunur, `res.render`'a `lang` ve `t()` çeviri fonksiyonu geçirilir. Kullanıcı verisi (ad, biyografi vb.) çevrilmez — yalnızca arayüz metinleri (buton etiketleri vb.).

**Telefon çerçevesi:**
Sadece masaüstü genişliğinde (`@media (min-width: 768px)`) profil kartı, saf CSS ile çizilmiş bir telefon çerçevesi içinde ortalanmış gösterilir. Mobilde (kartın gerçek kullanım ortamı) çerçeve gösterilmez. Harici görsel/kütüphane gerekmez.

---

## 6. Slug Sistemi Değişikliği

- `calisanSlugOlustur()` artık `nanoid(8)` yerine ad-soyad temelli, Türkçe karakter normalize edilmiş bir slug üretir (firma slug'ındaki normalize mantığı ortak bir yardımcıya çıkarılır).
- Çakışma kontrolü: firma içinde aynı slug varsa `-2`, `-3` şeklinde sıralı sayı eklenir (mevcut retry-with-random yerine deterministik sayaç).
- Maksimum 80 karakter sınırı uygulanır.
- **Geriye dönük uyumluluk:** Mevcut nanoid tabanlı slug'lara sahip çalışanlar **değiştirilmez** (URL'ler NFC kartlara yazılmış olabilir, sabit kalmalı). Yeni davranış yalnızca **yeni eklenen** çalışanlar için geçerli.

---

## 7. Güvenlik / Altyapı

- `helmet()` `app.js`'e eklenir. Profil sayfasındaki inline `<style>/<script>` kullanımını bozmaması için `contentSecurityPolicy` bu fazda gevşetilmiş bırakılır (ayrı bir sıkılaştırma adımı olarak not düşülür, sonraki fazda ele alınabilir).
- `express-rate-limit`: `/firma/giris`, `/bayi/giris`, `/superadmin/giris` POST route'larına (brute-force koruması, örn. 15 dakikada 10 deneme) ve `/bayi/panel/firma-ekle`'ye (kötüye kullanım/spam koruması) uygulanır.
- Upload limiti 15MB (Bölüm 4).

---

## 8. Dosya Yapısı Özeti

```
routes/
  odeme.js           → PayTR akışı (yeni)
  bayi.js            → kredi kontrolü + kredi-yükle route'ları eklenir
  public.js          → /degerlendir route'u + yeni /t/:tip tipleri eklenir
utils/
  paytr.js           → PayTR token/hash yardımcıları (yeni)
  i18n.js            → TR/EN sözlük (yeni)
  slug.js            → calisanSlugOlustur güncellenir, ortak normalize fonksiyonu çıkarılır
middleware/
  upload.js          → sharp entegrasyonu, limit 15MB
app.js               → helmet, rate-limit middleware eklenir
scripts/migrate.js   → yeni ALTER/CREATE statement'ları eklenir
db/schema.sql         → yeni tablo/alanlarla güncellenir
views/bayi/           → kredi yükle sayfası, firma-ekle'de kredi uyarısı
views/panel/, views/bayi/  → yeni profil alanları formlara eklenir
views/public/profil.ejs    → yeni butonlar, dil desteği, telefon çerçevesi, Android intent
```

---

## Test Stratejisi

Mevcut `tests/utils.test.js` deseni takip edilir:
- Yeni slug fonksiyonu (ad-soyad format, çakışma numaralandırma, 80 karakter limiti) için birim testleri.
- `utils/i18n.js` çeviri fonksiyonu için birim testleri.
- PayTR hash üretimi/doğrulaması için birim testleri — gerçek PayTR API'sine istek atılmadan, mock imza ile.
- Kredi düşürme/yükleme transaction mantığı için (mümkünse) entegrasyon testi — yetersiz kredide firma eklenmediğini doğrulayan test.

---

## Ön Koşul

PayTR entegrasyonunun gerçek ortamda test edilebilmesi için bir **PayTR mağaza (merchant) hesabı** gerekiyor (`PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` PayTR mağaza panelinden alınır). Hesap henüz yoksa PayTR'nin test/sandbox modu kullanılarak kod geliştirilebilir, ama üretime almadan önce gerçek mağaza hesabı ve PayTR'nin API/dokümantasyon detaylarının (test kartları, callback imza formatı) doğrulanması gerekir — bu detaylar implementasyon sırasında PayTR'nin güncel dokümantasyonundan teyit edilecek, şu an tahmini/genel bir akış olarak tasarlandı.

## Açık Notlar (Sonraki Fazlar)

- Telegram bildirimleri — sonraki fazda.
- Admin panel: başvuru/onay iş akışı, kredi paketlerinin admin panelinden yönetimi (şu an kod içi sabit) — sonraki fazda.
- `helmet` CSP sıkılaştırması — bu fazda gevşetilmiş bırakıldı, ayrı bir güvenlik iyileştirmesi olarak ele alınabilir.
- Farklı kredi paketlerinin farklı "haklar" (özellik seviyeleri) açması — bu fazda YOK, sadece basit kredi sayacı var.
