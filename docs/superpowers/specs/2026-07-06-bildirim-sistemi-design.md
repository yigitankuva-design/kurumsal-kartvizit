# Bildirim Sistemi (Katalog Bildirimi + Ziyaret Uyarısı) Design

## Amaç

İki bağımsız bildirim/uyarı özelliği eklemek:
1. Firma yeni bir katalog yüklediğinde mümessillerin mobil uygulamada bunu görmesi
2. Firma yetkilisinin, 60 gündür ziyaret edilmeyen eczaneleri panelde görmesi

## Mevcut Durum (tespit)

- Kod tabanında hiçbir bildirim altyapısı (e-posta/nodemailer, push/FCM) yok.
- `firmalar.katalog_url` var ama ne zaman güncellendiğine dair bir zaman damgası yok.
- `ziyaretler(id, calisan_id, eczane_id, created_at)` tablosu zaten var (K2) — "son ziyaret ne zaman" bilgisi buradan türetilebilir, yeni bir tablo gerekmez.
- Android `TemsilciAnaEkrani.kt`'de (satır 19-49) Ziyaret Kaydet/Ziyaretlerim/Raf Kartı Yaz butonları var, ViewModel kullanmıyor — yeni bir ViewModel eklenecek.
- Mobil tarafta bilgi kartları için Material3 `Card` deseni zaten kullanılıyor (`ZiyaretlerimEkrani.kt:45-50`).
- `TokenDeposu.kt`'de `aktifTokenAl()` fonksiyonu hangi rol aktifse onun token'ını döner — yeni bir "görüldü" durumu client'ta saklanmayacak, backend'de tutulacak (cihaz bağımsız tutarlılık için).

## Kapsam

### A) Yeni Katalog Bildirimi (mobil, temsilciler için)

Firma katalog yüklediğinde, mümessil mobil uygulamayı açtığında ana ekranda "Yeni katalog yüklendi" banner'ı görür; "Gördüm" dediğinde kapanır ve bir daha (aynı katalog güncellemesi için) çıkmaz.

**Veri modeli:**
- `firmalar.katalog_guncelleme_tarihi TIMESTAMP` — katalog her yüklendiğinde `NOW()` ile güncellenir
- `calisanlar.son_gorulen_katalog_tarihi TIMESTAMP` — mümessil "Gördüm" dediğinde, o anki `firmalar.katalog_guncelleme_tarihi` değeriyle güncellenir

**Backend:**
- `routes/kurumsal.js`'teki `POST /katalog` ucu, `katalog_url` ile birlikte `katalog_guncelleme_tarihi = NOW()` de set eder
- Yeni uç: `GET /api/mobil/katalog-durumu` (calisanToken/firmaToken ile) — `{ yeni_katalog_var: boolean, katalog_guncelleme_tarihi }` döner. `yeni_katalog_var`, `firmalar.katalog_guncelleme_tarihi > calisanlar.son_gorulen_katalog_tarihi` (veya `son_gorulen_katalog_tarihi IS NULL` ve `katalog_guncelleme_tarihi IS NOT NULL`) koşuluyla hesaplanır
- Yeni uç: `POST /api/mobil/katalog-gorundu` (calisanToken ile) — `calisanlar.son_gorulen_katalog_tarihi = firmalar.katalog_guncelleme_tarihi` yapar

**Android:**
- Yeni `KatalogDurumuViewModel` — ekran açıldığında `GET /api/mobil/katalog-durumu` çağırır
- `TemsilciAnaEkrani.kt`'ye, mevcut buton listesinin üstüne, `yeni_katalog_var=true` ise bir Material3 `Card` banner + "Gördüm" butonu eklenir; tıklanınca `POST /api/mobil/katalog-gorundu` çağrılır ve banner kapanır

### B) 60 Gün Ziyaret Edilmedi Uyarısı (panel, firma yetkilisi için)

Panelin Saha İstatistikleri sekmesinde, 60 gündür (veya hiç) ziyaret edilmemiş eczaneler listelenir.

**Veri modeli:** Yeni kolon/tablo gerekmez — mevcut `ziyaretler` tablosundan dinamik hesaplanır.

**Backend:** `app.js`'teki Saha İstatistikleri sorgu bloğuna yeni bir sorgu eklenir: her eczane için `ziyaretler`'den `MAX(created_at)`; sonucu 60 günden eski olan veya hiç ziyaret kaydı olmayan eczaneler `sahaIstatistik.ziyaretEdilmeyenEczaneler` olarak view'a geçirilir (eczane adı + son ziyaret tarihi ya da `null`).

**Frontend (panel):** `views/public/dashboard.ejs`'in Saha İstatistikleri sekmesine yeni bir bölüm: "60+ Gündür Ziyaret Edilmeyen Eczaneler" — basit bir liste (eczane adı + "Son ziyaret: DD.MM.YYYY" veya "Hiç ziyaret edilmedi").

## Test

- Backend: jest + supertest, mevcut desenle (katalog güncelleme tarihi set edilir, `/katalog-durumu` doğru boolean döner, `/katalog-gorundu` sonrası tekrar `false` döner; 60 gün sorgusu bilinen test verisiyle doğru eczaneleri döndürür).
- Android: gerçek cihazda, katalog yükleyip mobilde banner'ın çıktığını, "Gördüm" sonrası kapandığını ve tekrar girişte çıkmadığını doğrulama.

## Dışarıda Bırakılanlar

Gerçek push bildirimi (FCM/telefon bildirim çubuğu), e-posta bildirimi — kullanıcı onayıyla kapsam dışı bırakıldı.
