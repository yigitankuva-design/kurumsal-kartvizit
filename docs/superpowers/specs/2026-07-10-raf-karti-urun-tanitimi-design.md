# Raf Kartı Ürün Tanıtımı — Tasarım

## Amaç

Eczacı/müşteri raf kartını okuttuğunda, firmanın iletişim bilgilerinin yanında, firmanın tanıtmak istediği diğer ürünlerini de görebilsin.

## Mevcut durum (kod tabanında doğrulandı)

- `firmalar` tablosunda tek bir `katalog_url` (tek PDF) var — çoklu, isimli/görselli ürün desteği yok.
- Eczane raf kartı public sayfası (`views/public/raf.ejs`) İçerik/PDF bölümünü zaten gösteriyor (K1 T3, K1 T6).
- Foto yükleme + kırpma için `public/js/foto-kirpici.js` zaten var ve kurumsal panelde kullanılıyor — aynısı ürün fotoları için kullanılacak.
- Tıklama takibi için `eczaci_tiklamalar (id, eczane_id, tip, created_at)` deseni var — aynı desen ürün tıklamaları için tekrar kullanılacak.

## Veri modeli

```sql
CREATE TABLE IF NOT EXISTS urunler (
  id          SERIAL PRIMARY KEY,
  firma_id    INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
  ad          TEXT NOT NULL,
  aciklama    TEXT,
  foto_url    TEXT,
  pdf_url     TEXT,
  sira        INTEGER DEFAULT 0,
  aktif       BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS urun_tiklamalar (
  id          SERIAL PRIMARY KEY,
  urun_id     INTEGER REFERENCES urunler(id) ON DELETE CASCADE,
  eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

- Ürünler **firma genelinde ortak**: bir firma bir kere ürün listesi hazırlar, firmanın tüm eczanelerinin raf kartı sayfasında aynı liste görünür (eczane bazlı özelleştirme bu turda yok).
- `sira`, panelde sürükle-bırak veya yukarı/aşağı ok ile değiştirilir; raf sayfasında bu sıraya göre listelenir.
- `aktif=false` ürünler panelde saklı kalır ama public sayfada görünmez (silmeden gizleme).

## Panel (kurumsal)

- `dashboard.ejs`'e yeni "Ürünler" sekmesi (İçerik sekmesinin yanına, mevcut sekme desenine uyumlu).
- Liste: her ürün satırında küçük foto önizleme, ad, aktif/pasif toggle, düzenle/sil.
- Ekle/Düzenle formu: ad (zorunlu), açıklama (opsiyonel, textarea), foto (opsiyonel, `foto-kirpici.js` ile kare kırpma), PDF (opsiyonel, mevcut `pdfUploadMiddleware` ile).
- Backend uçları (`routes/kurumsal.js`): `GET/POST /kurumsal/panel/:firmaId/urunler`, `PUT/DELETE /kurumsal/panel/:firmaId/urunler/:id`, `PUT /kurumsal/panel/:firmaId/urunler/:id/sira`.
- Yetki: mevcut `requireKurumsalPaket` middleware'i ile aynı paket kontrolüne tabi (raf kartı zaten bu pakette).

## Public sayfa (`raf.ejs`)

- Mevcut İçerik/PDF bölümünün altına, ürün varsa "Ürünlerimiz" başlıklı yeni bir bölüm.
- Her ürün küçük bir kart: foto (varsa) + ad + kısa açıklama (2 satırla sınırlı, CSS `-webkit-line-clamp`).
- Karta tıklanınca: PDF varsa yeni sekmede açılır ve `urun_tiklamalar`'a kayıt düşer; PDF yoksa açıklamanın tamamı bir modal'da gösterilir (mevcut QR/imza modal deseniyle aynı yapı).
- Hiç aktif ürün yoksa bölüm hiç render edilmez (boş başlık göstermez).

## Analitik

- Kurumsal panel Saha İstatistikleri / Analitik bölümüne, mevcut "eczacı PDF tıklama takibi" (Analitik T4) deseniyle aynı şekilde, hangi ürünün kaç tıklama aldığı eklenir.

## Test planı

- Backend: jest+supertest — ürün CRUD, sıralama güncelleme, `aktif=false` ürünün public sayfada görünmediği, tıklama kaydının doğru `urun_id`/`eczane_id` ile düştüğü.
- Tarayıcı: kurumsal panelden ürün ekleme → raf kartı public sayfasında göründüğünü doğrulama (preview_* araçlarıyla), foto kırpıcının doğru çalıştığı, PDF tıklamasının yeni sekmede açıldığı.

## Kapsam dışı (bu turda yapılmayacak)

- Eczane bazlı özel ürün listesi/eşleştirme (şimdilik firma genelinde ortak liste).
- Ürün kategorileri/filtreleme.
