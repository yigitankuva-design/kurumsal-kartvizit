# Kurumsal Raf Kartı Sistemi — Faz K4 Tasarımı (Uygulama İçi Raf Kartı Yazma)

## Amaç ve Bağlam

K3 testinde raf kartları üçüncü parti bir uygulamayla (NFC Tools) yazılmak zorunda
kaldı çünkü `nfckartify-bayi-android`'da eczane raf kartı yazma ekranı yok. K4,
temsilcinin sahada boş bir NFC kartına eczanenin `/raf/:kod` URL'sini uygulama
içinden yazabilmesini sağlar.

Onaylanmış kararlar (brainstorming, 2026-07-04):
- Kartı temsilci yazar (mobil uygulama) — web panelden yazma yok (Web NFC pratik değil).
- Yazma sonrası opsiyonel kilitleme sunulur (K1'deki aynı UX: uyarı diyaloğu +
  geri alınamaz onayı).

K4 kapsamı DIŞI: eczacı kartı yazma (K5'te bu akışa ikinci buton olarak eklenecek),
eczane ekleme/düzenleme (web panelde var).

## 1. Backend

- **`GET /api/mobil/eczanelerim`**: `requireCalisanToken` korumalı, temsilcinin
  kendi firmasına ait eczaneleri döner: `{ ok, eczaneler: [{ id, ad, adres, kod }] }`,
  `created_at DESC` sıralı. Eczane yoksa boş liste.

## 2. Android — Eczanelerim (kart yazma) listesi

- Temsilci Ana Ekranı'na üçüncü buton: **"Raf Kartı Yaz"** → yeni `EczanelerimEkrani`.
- `EczanelerimEkrani` + `EczanelerimViewModel`: K3'ün `ZiyaretlerimEkrani` deseniyle
  aynı (LazyColumn + Card, `viewModel { }` factory, 401'de "Giriş Ekranına Dön").
- Bir eczaneye dokununca mevcut `kartaYaz/{adSoyad}/{url}` route'una yönlendirilir:
  `adSoyad` yerine eczane adı, `url = https://www.nfckartify.com.tr/raf/{kod}`.
  Yazma, WebView önizleme ve opsiyonel kilitleme dahil tüm `KartaYazEkrani`/
  `KartaYazViewModel` mantığı değişmeden yeniden kullanılır.

## 3. KartaYazEkrani metin parametreleştirme

- `KartaYazEkrani`'ndaki iki sabit metin çalışan kartvizitine özel:
  "Profili Görüntüle" butonu ve "Profili kontrol ettiysen: boş bir NFC kartı..."
  bekleme mesajı. Bunlar composable parametrelerine çekilir
  (`goruntuleButonMetni: String`, `bekleMesaji: String`), mevcut çağrı yerleri
  eski metinleri geçer; raf kartı akışı "Sayfayı Görüntüle" / "Sayfayı kontrol
  ettiysen: boş bir NFC kartı telefonun arkasına yaklaştırın." geçer.
- Navigasyon route'una hangi metin setinin kullanılacağını taşımak için
  `kartaYaz` route'una opsiyonel bir `tip` argümanı eklenir (`calisan` | `raf`,
  varsayılan `calisan`).

## Hata Yönetimi

- `/api/mobil/eczanelerim` token yok/geçersiz → 401 (mevcut desen).
- Eczane listesi boşsa ekranda "Henüz eczane eklenmemiş. Eczaneler web panelden
  eklenir." mesajı.
- Yazma/kilitleme hataları `KartaYazEkrani`'nın mevcut hata durumlarıyla aynen
  yönetilir (kart erken çekildi, salt-okunur kart, kapasite vb.).

## Test Planı

- Backend: `/api/mobil/eczanelerim` Jest testleri — kendi firmasının eczanelerini
  döner, başka firmanınkileri dönmez, token yoksa 401.
- Android: `ApiServiceTest`'e MockWebServer testi (eczanelerim listeyi döner).
- Cihazda uçtan uca: temsilci girişi → Raf Kartı Yaz → eczane seç → gerçek boş
  NFC karta yaz → kartı NFC Tools ile okutup doğru URL'nin yazıldığını doğrula →
  müşteri gibi okutup `/raf/:kod` sayfasının açıldığını doğrula.
