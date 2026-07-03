# Kurumsal Raf Kartı Sistemi — Faz K1 Tasarımı

## Amaç ve Bağlam

NFCKartify'a "kurumsal firma" özelliği eklemek. Senaryo: Orzax gibi kurumsal bir
firmanın ürünleri onlarca eczanede sergileniyor; her eczanedeki ürün rafına bir NFC
kart yapıştırılıyor. Müşteri bu kartı okutunca firmanın katalog sayfası açılıyor.

Üç fazlık planın ilki bu doküman (K1). Sonraki fazlar:
- **K2**: Temsilci hesapları, ziyaret kaydı API'si, tam istatistik paneli
  (grafikler, katalog tıklama analizi, zaman trendleri, Excel dışa aktarım).
- **K3**: Android uygulamasına temsilci modu (giriş, eczane seçme, "Ziyaret Kaydet",
  raf kartına yazma).

Onaylanmış temel kararlar (brainstorming, 2026-07-03):
- Temsilci/müşteri ayrımı: temsilci kurumsal mobil uygulamadan okutur (K3'te).
- Sistem NFCKartify'ın içine inşa edilir (ayrı ürün değil).
- Müşteri sayfası v1'de sade: logo, katalog PDF, web sitesi, sosyal medya.
- Raf kartlarını temsilci sahada uygulamayla yazar (K3'te); K1'de panel kart
  linkini gösterir, kart web'den/NFC Tools'la da yazılabilir.
- Kurumsal firma = mevcut `firmalar` tablosunda `paket='kurumsal'` olan kayıt.

## K1 Kapsamı

1. Veri modeli (yeni tablolar + `firmalar` alanları)
2. Raf kartı public sayfası (`/raf/<kod>`)
3. Kurumsal firma panelinde İçerik ve Raf Kartları sekmeleri

K1 kapsamı DIŞI: temsilci girişi, ziyaret kaydı, istatistik ekranları, Android
değişiklikleri, video/kampanya/numune/sipariş özellikleri (v2+).

## 1. Veri Modeli

`scripts/migrate.js`'e eklenecek migration'lar (hepsi idempotent, `IF NOT EXISTS`):

```sql
CREATE TABLE IF NOT EXISTS eczaneler (
  id          SERIAL PRIMARY KEY,
  firma_id    INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
  ad          TEXT NOT NULL,
  adres       TEXT,
  kod         TEXT UNIQUE NOT NULL,       -- /raf/<kod> URL'inde kullanılır
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raf_okutmalar (
  id          SERIAL PRIMARY KEY,
  eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raf_tiklamalar (
  id          SERIAL PRIMARY KEY,
  eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
  tip         TEXT NOT NULL,              -- 'katalog' | 'website' | 'instagram' | ...
  created_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS katalog_url TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS linkedin TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS twitter TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS youtube TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS tiktok TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS whatsapp TEXT;
```

- `eczaneler.kod`: 8 karakterlik rastgele alfanümerik (crypto tabanlı), üretimde
  benzersizlik çakışması kontrol edilir. Tahmin edilebilir olması sorun değil
  (sayfa zaten herkese açık) ama sıralı ID sızdırmamak için rastgele.
- Okutma/tıklama kayıtları K1'de sadece yazılır; okunması (istatistik) K2'de.

## 2. Raf Kartı Public Sayfası

- **`GET /raf/:kod`** (`routes/public.js`): eczaneyi `kod` ile bulur, bağlı firmayı
  yükler, `raf_okutmalar`a bir satır ekler, `views/public/raf.ejs` render eder.
  Kod bulunamazsa 404.
- **`GET /raf/:kod/tikla/:tip`**: `tip` beyaz listede mi kontrol eder
  (`katalog, website, instagram, linkedin, twitter, youtube, tiktok, whatsapp`),
  `raf_tiklamalar`a kaydeder, ilgili hedef URL'e redirect eder. Firma o alanı
  doldurmamışsa `/raf/:kod`a geri döner.
- **`views/public/raf.ejs`**: mobil öncelikli, `profil.ejs`'in görsel dilinde,
  firma `marka_rengi` ile temalı. İçerik: logo (varsa), firma adı, büyük
  "📄 Ürün Kataloğu" butonu (katalog_url varsa), web sitesi butonu, sosyal medya
  butonları (sadece dolu olanlar). Tüm butonlar `/raf/:kod/tikla/:tip` üzerinden
  gider (tıklama sayılsın diye).
- Katalog PDF'i karta/sayfaya gömülmez — kart yalnızca URL taşır, içerik her zaman
  sunucudan gelir (firma kataloğu değiştirince tüm kartlar otomatik güncellenir).

## 3. Kurumsal Firma Paneli

- Giriş: mevcut tek giriş (`/giris`) — değişiklik yok.
- `app.js`'teki firma dashboard dalı: `firma.paket === 'kurumsal'` ise sekme
  çubuğuna **İçerik** (`?tab=icerik`) ve **Raf Kartları** (`?tab=raf`) eklenir.
  Kurumsal olmayan firmalar bu sekmeleri görmez; route'lar da paket kontrolü yapar.
- Yeni router **`routes/kurumsal.js`**, `/kurumsal` altında, `requireFirma` +
  `requireKurumsalPaket` (yeni middleware: firmanın `paket='kurumsal'` olduğunu
  DB'den doğrular) ile korunur:
  - `POST /kurumsal/icerik` — website/sosyal medya linklerini günceller.
  - `POST /kurumsal/logo` — logo yükler (mevcut foto upload altyapısı, resim).
  - `POST /kurumsal/katalog` — katalog PDF yükler: yeni `pdfUploadMiddleware`
    (multer memory + mime `application/pdf` + 20MB limit + Railway Storage'a
    `kataloglar/` klasörüne yükleme; sharp işlemi YOK).
  - `POST /kurumsal/eczane-ekle` — ad (zorunlu) + adres; `kod` sunucuda üretilir.
  - `POST /kurumsal/eczane/:id/duzenle` — ad/adres günceller (kod değişmez,
    çünkü kod fiziksel karta yazılmış olabilir).
  - `POST /kurumsal/eczane/:id/sil` — siler (onay soran form ile); okutma
    geçmişi CASCADE ile silinir.
  - Tüm eczane işlemlerinde sahiplik kontrolü: `WHERE id=$1 AND firma_id=$2`.
- **İçerik sekmesi** (dashboard.ejs içinde): logo önizleme+yükleme, katalog PDF
  yükleme (mevcut dosya adı/linki gösterilir), link alanları formu.
- **Raf Kartları sekmesi**: eczane listesi (ad, adres, okutma linki
  `https://www.nfckartify.com.tr/raf/<kod>` kopyala butonu ile), yeni eczane
  ekleme formu, düzenle/sil.

## Hata Yönetimi

- Raf sayfası: geçersiz kod → 404; okutma kaydı başarısız olsa bile sayfa yine
  render edilir (kayıt hatası müşteri deneyimini bozmaz, sadece loglanır).
- PDF upload: yanlış mime/boyut aşımı → flash hata mesajı ile panele dönüş
  (mevcut foto upload hata desenine uygun).
- Kurumsal olmayan firma `/kurumsal/*` uçlarına istek atarsa → `/`'a redirect.

## Test Planı

Jest + supertest (mevcut desen):
- `/raf/:kod` geçerli kodla 200 döner ve `raf_okutmalar`a kayıt düşer.
- Geçersiz kod 404 döner.
- `/raf/:kod/tikla/katalog` kaydedip redirect eder; beyaz liste dışı tip reddedilir.
- Kurumsal firma eczane ekleyebilir; başka firmanın eczanesini düzenleyemez/silemez.
- `paket='basic'` firma `/kurumsal/*` uçlarından redirect ile döner.
- Katalog upload: PDF kabul, resim/başka mime red (upload birimi düzeyinde).

Her görev sonrası tam `npx jest`; faz sonunda curl ile production doğrulaması ve
test verisi temizliği (oturumun yerleşik deseni).
