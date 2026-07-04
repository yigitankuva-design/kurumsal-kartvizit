# İP-1 — Firma Yetkilisi Mobil Girişi (Tasarım)

## Amaç ve Bağlam

Bugün fiziksel NFC karta yazma yalnızca **bayi** veya **temsilci** hesabıyla mobil
uygulamadan yapılabiliyor. Kurumsal firmanın kendi yetkilisi (web panele giren kişi)
mobile hiç giremiyor — kart yazdırmak için ayrı bir bayi/temsilci hesabına muhtaç.
Bu bir kopukluk yaratıyor.

Bu iş paketi, firmaya verilen **mevcut web panel kullanıcı adı/şifresiyle** mobil
uygulamaya girip firmanın **çalışan, müşteri/raf ve eczacı** kartlarını yazabilmesini
sağlar.

Onaylanmış kararlar (brainstorming, 2026-07-04):
- Yetki kapsamı: **hepsi** — çalışan kartviziti + müşteri/raf kartı + eczacı kartı.
- Giriş ekranı: mevcut Bayi/Temsilci seçicisine **üçüncü seçenek "Firma Yetkilisi"**.

Kapsam DIŞI: kart durum rozetleri (İP-2), toplu Excel (İP-3), QR yedek (İP-4),
mobilde çalışan/eczane DÜZENLEME (yalnızca listeleme + kart yazma).

## Mimari

Mevcut iki auth deseni (bayi, temsilci/calisan) zaten var. Firma için **birebir aynı
desen** üçüncü kez uygulanır — yeni kimlik tablosu YOK, `firmalar` tablosunun mevcut
alanları kullanılır.

### 1. Kimlik Doğrulama (Backend)

- `utils/jwt.js`: `bayiTokenUret/Dogrula`, `calisanTokenUret/Dogrula` yanına
  `firmaTokenUret(firmaId)` / `firmaTokenDogrula(token)` eklenir (payload `{ firmaId }`,
  `expiresIn: '30d'` — mevcut desenle aynı).
- `middleware/tokenAuth.js`: `requireFirmaToken` eklenir — `Bearer` header'dan token
  alır, `firmaTokenDogrula` ile doğrular, `req.firmaId` set eder (mevcut
  `requireCalisanToken` deseniyle aynı).

### 2. Uçlar (routes/mobilApi.js)

- `POST /api/mobil/firma-giris` (rate-limited, `/temsilci-giris` deseni):
  - Girdi: `giris_bilgisi` (email veya kullanıcı adı), `sifre`.
  - `SELECT * FROM firmalar WHERE yetkili_email = $1 OR kullanici_adi = $1`.
  - `bcrypt.compare(sifre, firma.yetkili_sifre_hash)`.
  - Başarılıysa `firmaTokenUret(firma.id)` → `{ ok, token, firma: { id, ad } }`.
  - Hatalı bilgide 401, jenerik mesaj (kullanıcı adı/şifre ayrımı sızdırılmaz).
- `GET /api/mobil/firma/calisanlarimiz` (`requireFirmaToken`):
  - `SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC`.
  - `{ ok, firma: { id, ad, slug }, calisanlar }` — `CalisanlarEkrani`'nin beklediği
    biçim (`/musteriler/:firmaId/calisanlar` çıktısıyla uyumlu, `firmaId` param'a
    gerek yok çünkü token'dan gelir).
- `GET /api/mobil/firma/eczanelerimiz` (`requireFirmaToken`):
  - `SELECT id, ad, adres, kod, eczaci_kod FROM eczaneler WHERE firma_id = $1
    ORDER BY created_at DESC` (mevcut `/eczanelerim` deseniyle aynı çıktı).

### 3. Mobil — Giriş (GirisEkrani + GirisViewModel)

- `GirisRolu` enum'a `FIRMA` eklenir (mevcut `BAYI`, `TEMSILCI` yanına).
- `GirisEkrani`: iki butonluk seçici üç seçenekli hale gelir (Bayi / Temsilci /
  Firma Yetkilisi). Seçili olmayan roller `OutlinedButton`, seçili olan vurgulu.
- Rol `FIRMA` iken alan etiketi "E-posta / Kullanıcı Adı", giriş `firma-giris`
  ucuna gider. `GirisViewModel`'e `firmaGirisBasarili` flag'i + `firma-giris`
  çağrısı eklenir (mevcut bayi/temsilci flag desenleriyle aynı).
- `Response.body()` null olabildiği için `hataMesajiAl(errorBody())` deseni kullanılır
  (mevcut ApiClient yardımcı).

### 4. Mobil — Token Saklama (TokenDeposu)

- `firmaTokenKaydet(token, firmaAdi)` / `firmaTokenAl()` / `firmaAdiAl()` eklenir
  (mevcut temsilci token desenleriyle aynı). `cikisYap()` zaten `clear()` yaptığı
  için firma token'ı da kapsar.

### 5. Mobil — Ana Ekran & Navigasyon (NfcKartifyApp)

- Firma girişi başarılıysa yeni rota: `firmaAna`.
- Yeni `FirmaAnaEkrani`: "Çalışanlarımız" + "Eczanelerimiz" iki buton + "Çıkış"
  (mevcut `TemsilciAnaEkrani` yapısıyla aynı stil).
- **Liste ekranları yeniden kullanılır:**
  - `CalisanlarEkrani` (Composable UI) aynen kullanılır; onu besleyen veri firma
    token'lı yeni bir ViewModel'den gelir (`FirmaCalisanlarViewModel`, `calisanlarimiz`
    ucunu çağırır). "Kart Yaz" butonu mevcut haliyle çalışır.
  - `EczanelerimEkrani` (Composable UI) aynen kullanılır; firma token'lı
    `FirmaEczanelerViewModel` (`eczanelerimiz` ucunu çağırır) ile beslenir. İki buton
    (Müşteri Kartı / Eczacı Kartı) mevcut haliyle çalışır.
  - Kart yazma rotası (`kartaYaz/...?tip=...`) ve `KartaYazEkrani` değişmez.

> **Not:** Yeni ViewModel'ler gerekiyor çünkü mevcut `CalisanlarViewModel` bayi
> token'ıyla, `EczanelerimViewModel` calisan token'ıyla çalışıyor. UI Composable'ları
> aynı; yalnızca veri kaynağı firma token'a bağlanıyor.

## Veri Akışı

1. Kullanıcı "Firma Yetkilisi" seçer, web panel bilgileriyle giriş yapar.
2. `firma-giris` → `firmaToken` döner, `TokenDeposu`'ya kaydedilir, `firmaAna`'ya gidilir.
3. "Çalışanlarımız" → `calisanlarimiz` listesi → satırda "Kart Yaz" → NFC yazma.
4. "Eczanelerimiz" → `eczanelerimiz` listesi → "Müşteri Kartı" / "Eczacı Kartı" → NFC yazma.
5. "Çıkış" → token temizlenir, giriş ekranına dönülür.

## Hata Yönetimi

- Giriş: hatalı bilgi → 401 jenerik mesaj. Sunucu hatası → 500, mobilde kullanıcıya
  "Sunucu hatası" gösterilir.
- Liste uçları: geçersiz/süresi dolmuş token → 401; mobil oturumu düşürüp giriş
  ekranına döndürür (mevcut `oturumSuresiDoldu` deseni).
- Tenant izolasyonu: tüm liste uçları yalnızca `req.firmaId`'ye ait kayıtları döndürür.

## Test Planı

- **Backend (Jest + supertest):**
  - `firma-giris`: doğru bilgiyle token döner; yanlış şifre 401; olmayan
    kullanıcı 401; eksik alan 400. Hem `yetkili_email` hem `kullanici_adi` ile giriş.
  - `calisanlarimiz`: token'sız 401; yalnızca kendi firmasının çalışanları; başka
    firmanın çalışanı görünmez.
  - `eczanelerimiz`: token'sız 401; yalnızca kendi firması; `eczaci_kod` alanı döner.
- **Android (JVM unit):** `firma-giris` yanıtının doğru deserialize olması
  (ApiServiceTest deseni). ViewModel'lerin firma token'ı doğru gönderdiği.
- **Cihazda uçtan uca:** Firma Yetkilisi ile giriş → çalışan kartı yaz + eczane
  müşteri/eczacı kartı yaz → gerçek NFC kartla okutup doğru sayfanın açıldığını
  doğrula. (Manuel, mevcut ADB akışıyla.)
