# Kurumsal Raf Kartı Sistemi — Faz K2 Tasarımı

## Amaç ve Bağlam

K1'de kurumsal firmaların raf kartı sistemi (eczane/katalog/tıklama takibi) kuruldu.
K2, temsilcilerin sahaya çıkıp eczane ziyaretlerini kaydetmesini ve yöneticinin bunu
istatistik panelinde görmesini sağlar.

Onaylanmış kararlar (brainstorming, 2026-07-03):
- Temsilci = mevcut `calisanlar` kaydına giriş bilgisi eklenmiş hali (ayrı tablo yok).
- Temsilci hesabını kurumsal firma paneli açar (çalışan ekle/düzenle formundan).
- Ziyaret kaydı API'si K2'de hazırlanır; gerçek NFC okuma K3'te (Android) bu API'ye bağlanır.
- İstatistik paneli gerçek grafiklerle (Chart.js, CDN) gösterilir + Excel dışa aktarım.

K2 kapsamı DIŞI: Android değişiklikleri (K3), ziyaret sıklığı sınırlaması/anti-spam,
konum (GPS) doğrulaması.

## 1. Veri Modeli

```sql
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS giris_email TEXT UNIQUE;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS giris_sifre_hash TEXT;

CREATE TABLE IF NOT EXISTS ziyaretler (
  id          SERIAL PRIMARY KEY,
  calisan_id  INTEGER REFERENCES calisanlar(id) ON DELETE CASCADE,
  eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

- `calisanlar.email` alanı zaten var ama o **profildeki iletişim emaili** (herkese
  açık, profil sayfasında gösteriliyor) — giriş için ayrı `giris_email` kullanılır,
  ikisi karışmasın.
- Sınırlama yok: aynı temsilci aynı eczaneyi istediği kadar okutabilir, her seferinde
  yeni satır — istatistikte "bu ayki ziyaret sayısı" gibi metrikler bu sayede anlamlı.

## 2. Temsilci Girişi ve Ziyaret Kaydı API'si

- **Panel formu**: Kurumsal firmanın çalışan ekle/düzenle formuna (mevcut
  `views/public/dashboard.ejs` çalışan slide-panel) "Giriş E-postası" ve "Giriş
  Şifresi" alanları eklenir — ikisi de opsiyonel (boşsa o çalışan mobil giriş
  yapamaz, sadece dijital kartviziti olur, mevcut davranış bozulmaz).
- **`utils/jwt.js`**'e `calisanTokenUret(calisanId)` / `calisanTokenDogrula` eklenir
  (mevcut `bayiTokenUret` ile aynı desen, farklı payload alanı `calisanId`).
- **`middleware/tokenAuth.js`**'e `requireCalisanToken` eklenir (mevcut
  `requireBayiToken` ile aynı desen).
- **`POST /api/mobil/temsilci-giris`**: `giris_email` + `sifre` alır,
  `giris_sifre_hash` ile karşılaştırır, token döner. (Mevcut `/api/mobil/giris`
  bayi'ye özel — temsilci için ayrı uç, karışmasın.)
- **`POST /api/mobil/ziyaret-kaydet`**: `requireCalisanToken` korumalı, body'de
  `eczane_kod` alır, kodu `eczaneler`de arar (bulunamazsa 404), çalışanın
  `firma_id`'siyle eczanenin `firma_id`'si eşleşmiyorsa 403 (başka firmanın
  eczanesine ziyaret kaydedilemez), eşleşiyorsa `ziyaretler`e satır ekler, 201 döner.

## 3. Saha İstatistikleri Paneli

- Dashboard'a kurumsal firmaya özel yeni sekme: **"Saha İstatistikleri"**
  (`?tab=saha`), mevcut genel "İstatistik" sekmesinden ayrı tutulur (o sekme
  bireysel çalışan görüntülenme sayılarını gösteriyor, karışmasın).
- Veri sorguları (`app.js`, `tab === 'saha'` dalında):
  - Son 30 günün günlük ziyaret sayısı (`ziyaretler.created_at` günlük GROUP BY).
  - Temsilci başına toplam ziyaret sayısı (üst 10, çok olursa).
  - Eczane başına toplam okutma sayısı (`raf_okutmalar`, üst 10).
  - İçerik tıklama dağılımı (`raf_tiklamalar.tip` GROUP BY COUNT).
- Grafik: Chart.js `<script src="https://cdn.jsdelivr.net/npm/chart.js">` ile CDN'den
  yüklenir (tek satır, npm bağımlılığı yok). Sunucu verileri JSON olarak EJS içine
  gömer, tarayıcıda `new Chart(...)` ile çizilir. Bir çizgi grafik (ziyaret trendi) +
  iki bar grafik (temsilci, eczane) + bir pasta/bar grafik (tıklama dağılımı).
- **`GET /kurumsal/ziyaretler-excel`**: `ziyaretler` tablosunu (temsilci adı, eczane
  adı, tarih) mevcut `xlsx` kütüphanesiyle (`routes/panel.js`'teki
  `excel-sablon` örüntüsü) `.xlsx` olarak indirir.

## Hata Yönetimi

- `giris_email` zaten başka bir çalışanda kullanılıyorsa panel formu hata verir
  (unique constraint → flash mesajı).
- `/api/mobil/ziyaret-kaydet`: geçersiz `eczane_kod` → 404; başka firmanın eczanesi
  → 403; `requireCalisanToken` başarısızsa (token yok/geçersiz) → 401.
- Saha istatistikleri sekmesi, hiç ziyaret/okutma yoksa boş grafik yerine "Henüz veri
  yok" mesajı gösterir (sıfır veri Chart.js'te çirkin/boş kutu olarak görünmesin diye).

## Test Planı

Jest + supertest (mevcut desen, curl ile production doğrulaması dahil):
- Panelden çalışana giriş bilgisi eklenip DB'de hash doğru saklandığı.
- `/api/mobil/temsilci-giris`: doğru bilgiyle token, yanlış şifreyle 401.
- `/api/mobil/ziyaret-kaydet`: geçerli eczane_kod ile 201 + `ziyaretler`e kayıt;
  başka firmanın eczanesiyle 403; token yoksa 401; geçersiz kod 404.
- Saha istatistikleri sekmesi: kurumsal firma için 200 + veri içerir; basic firma
  için görünmez (K1'deki paket kontrolü deseniyle aynı).
- Excel export: doğru içerik-tipi (`application/vnd.openxmlformats...`) ve indirilen
  dosyada beklenen satır sayısı.

Her görev sonrası tam `npx jest`; faz sonunda curl ile production doğrulaması ve
test verisi temizliği (oturumun yerleşik deseni).
