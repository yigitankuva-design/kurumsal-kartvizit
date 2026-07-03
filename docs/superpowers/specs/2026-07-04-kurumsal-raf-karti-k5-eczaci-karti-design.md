# Kurumsal Raf Kartı Sistemi — Faz K5 Tasarımı (Eczacıya Özel Kart ve Sayfa)

## Amaç ve Bağlam

Müşteri raf kartı (`/raf/:kod`) son tüketiciye katalog/site/sosyal medya gösteriyor.
K5, eczacının kendisine yönelik AYRI bir fiziksel NFC kartı ekler: eczacı bu kartı
okuttuğunda firmanın kampanya bilgisi ve ürün eğitim içeriğini (PDF + video) gören
özel bir sayfaya gider.

Onaylanmış kararlar (brainstorming, 2026-07-04):
- Ayrı ikinci fiziksel kart (müşteri kartından bağımsız, ör. tezgah altına).
- İçerik firma geneli, tek set (eczane başına özelleştirme yok).
- İçerik türleri: kampanya başlığı + kısa metin, PDF dokümanı, video linki (YouTube).
- Eczacı sayfası okutmaları sayılır (yönetici "eczacılar içeriğe bakıyor mu?"
  sorusunun cevabını görür).
- Eczacı kartı da yazma sonrası opsiyonel kilitlenebilir (K4'ün akışı üzerinden,
  otomatik gelir).

K5 kapsamı DIŞI: eczane başına özel içerik, eczacı sayfasında link tıklama takibi
(sadece okutma sayılır), eczacı için ayrı giriş/hesap.

## 1. Veri Modeli

```sql
ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS eczaci_kod TEXT UNIQUE;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS eczaci_baslik TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS eczaci_metin TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS eczaci_pdf_url TEXT;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS eczaci_video_url TEXT;

CREATE TABLE IF NOT EXISTS eczaci_okutmalar (
  id          SERIAL PRIMARY KEY,
  eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

- Yeni eczane oluşturulurken `kod` ile birlikte `eczaci_kod` da üretilir
  (`benzersizEczaneKoduUret` deseni, `eczaci_kod` kolonu için ayrı benzersizlik
  kontrolüyle).
- MEVCUT eczanelerin `eczaci_kod`'u NULL kalır — migration'da toplu doldurma
  yapılmaz; mevcut eczanelere kod, K5 sonrası panelde "Eczacı kodu üret" butonuyla
  tek tek üretilir (aşağıda, Bölüm 3). Böylece migration basit ve risksiz kalır.

## 2. Eczacı Sayfası (herkese açık)

- **`GET /eczaci/:kod`**: eczaneyi `eczaci_kod`'a göre bulur (bulamazsa 404),
  `eczaci_okutmalar`'a satır ekler, `views/public/eczaci.ejs` render eder.
- Sayfa içeriği (mobile-first, `raf.ejs`'in görsel deseniyle):
  - Firma logosu + firma adı + eczane adı başlığı
  - `eczaci_baslik` (varsa) büyük başlık, `eczaci_metin` (varsa) altında paragraf
  - `eczaci_video_url` varsa YouTube embed (iframe; URL'den video id
    `youtube.com/watch?v=` ve `youtu.be/` biçimlerinden çıkarılır, çıkarılamazsa
    düz link gösterilir)
  - `eczaci_pdf_url` varsa "Eğitim Dokümanını Aç (PDF)" butonu (yeni sekmede açar)
  - Hiçbir içerik girilmemişse "İçerik henüz eklenmedi." mesajı

## 3. Kurumsal Panel

- **İçerik sekmesi**: "Eczacı Sayfası" bölümü eklenir — başlık alanı, metin alanı
  (textarea), video linki alanı (tek formda, `POST /kurumsal/eczaci-icerik`),
  ayrıca PDF yükleme formu (`POST /kurumsal/eczaci-pdf`, mevcut
  `pdfUploadMiddleware`/katalog deseniyle, `eczaci-dokumanlar/` prefix'i).
- **Raf Kartları sekmesi**: eczane tablosuna "Eczacı Kartı" sütunu eklenir —
  `eczaci_kod` varsa `/eczaci/:kod` linki + eczacı okutma sayısı; yoksa
  "Kod Üret" butonu (`POST /kurumsal/eczane/:id/eczaci-kod-uret`, firma
  doğrulamalı, benzersiz kod üretip kaydeder).

## 4. Mobil (K4'e ek)

- `/api/mobil/eczanelerim` yanıtına `eczaci_kod` alanı da eklenir (NULL olabilir).
- K4'ün Eczanelerim ekranında her eczane satırında iki buton: **"Müşteri Kartı"**
  (`/raf/:kod`) ve **"Eczacı Kartı"** (`/eczaci/:eczaci_kod`; `eczaci_kod` NULL ise
  buton devre dışı, "Web panelden kod üretin" ipucu). İkisi de K4'ün `kartaYaz`
  akışını (raf metin setiyle) kullanır; kilitleme otomatik olarak her ikisinde de
  çalışır.

## Hata Yönetimi

- `/eczaci/:kod` geçersiz kod → 404 sayfası (raf'taki aynı desen).
- Video URL'sinden YouTube id çıkarılamazsa embed yerine tıklanabilir düz link.
- Panel formlarında PDF olmayan dosya reddedilir (mevcut mime kontrolü),
  eczaci-kod-uret başka firmanın eczanesi için 302 + hata flash (tenant izolasyonu).

## Test Planı

- Migration sonrası yeni eczane oluşturmada `eczaci_kod` üretildiği.
- `GET /eczaci/:kod`: geçerli kodla 200 + `eczaci_okutmalar`'a kayıt; geçersiz kod
  404; içerik alanları doluyken sayfada göründüğü; hepsi boşken "İçerik henüz
  eklenmedi." göründüğü.
- `POST /kurumsal/eczaci-icerik`: alanların kaydedildiği; başka firmadan istek
  atılamadığı.
- `POST /kurumsal/eczane/:id/eczaci-kod-uret`: kod üretildiği, ikinci çağrıda
  mevcut kodun değişmediği (idempotent), başka firmanın eczanesi için çalışmadığı.
- PDF upload: 302 + mime reddi (katalog testleriyle aynı desen).
- Dashboard Raf Kartları sekmesinde eczacı kartı sütununun göründüğü.
- Mobil: `/api/mobil/eczanelerim` yanıtında `eczaci_kod`; cihazda eczacı kartı
  yazma + gerçek kartla okutup `/eczaci/:kod` sayfasının açıldığı, okutma
  sayacının arttığı.
