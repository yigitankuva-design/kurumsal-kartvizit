# Kurumsal Raf Kartı Sistemi — Faz K3 Tasarımı (Android Temsilci Modu)

## Amaç ve Bağlam

K1'de kurumsal firmaların raf kartı sistemi (eczane/katalog/tıklama takibi) ve K2'de
temsilci hesabı + ziyaret kaydı API'si + Saha İstatistikleri web paneli kuruldu.
K3, K2'de hazırlanan `/api/mobil/temsilci-giris` ve `/api/mobil/ziyaret-kaydet`
uçlarını gerçek NFC okumaya bağlayan Android tarafını ekler.

Proje: `nfckartify-bayi-android` (ayrı repo, `C:\Users\muham\nfckartify-bayi-android`).
Mevcut uygulama sadece **bayi** rolü için (bayi girişi, müşteri/çalışan listeleri,
profil oluşturma, NFC yazma — Faz 1-3'te tamamlandı). K3, aynı uygulamaya ikinci bir
rol (**temsilci**) ekler.

Onaylanmış kararlar (brainstorming, 2026-07-03):
- Aynı APK'ya ikinci giriş modu eklenir (ayrı uygulama değil).
- Temsilci, K1'de eczane rafına yapıştırılan **aynı** NFC kartını okutarak ziyaret
  kaydeder (müşteri için tarayıcıda açılan kart, temsilci uygulaması açıkken
  uygulama içi algılanır).
- Temsilci kendi ziyaret geçmişini basit bir liste halinde uygulama içinde görebilir.

K3 kapsamı DIŞI: eczane ekleme/düzenleme (zaten web panelde var), harita/konum
doğrulaması, offline mod, push bildirim.

## 1. Giriş Ekranı

- `GirisEkrani.kt`'ye üstte "Bayi" / "Temsilci" segmented toggle eklenir.
- Temsilci seçiliyken alan etiketleri "Giriş E-postası" + "Şifre" olur, form
  `ApiService.temsilciGiris(email, sifre)` çağırır (K2'de hazır olan
  `POST /api/mobil/temsilci-giris` ucu).
- Başarılı girişte dönen token `TokenDeposu.temsilciTokenKaydet(token)` ile saklanır,
  kullanıcı Temsilci Ana Ekranı'na yönlendirilir.
- Bayi akışı (mevcut davranış) hiç değişmez — toggle sadece hangi form/API'nin
  kullanılacağını belirler.

## 2. Ağ Katmanı ve Token Saklama

- `ApiService.kt`'ye üç fonksiyon eklenir:
  - `temsilciGiris(email, sifre): TemsilciGirisYaniti` → K2'de hazır uç.
  - `ziyaretKaydet(token, eczaneKod): ZiyaretKaydetYaniti` → K2'de hazır uç
    (`POST /api/mobil/ziyaret-kaydet`).
  - `ziyaretlerim(token): List<ZiyaretKaydi>` → **yeni backend ucu**,
    `GET /api/mobil/ziyaretlerim`, `requireCalisanToken` korumalı, temsilcinin kendi
    ziyaretlerini (eczane adı, tarih) `created_at DESC` sırayla döner. K2'de
    planlanmamıştı, K3'ün parçası olarak backend'e eklenir.
- `TokenDeposu.kt`'ye `temsilciToken` alanı eklenir — mevcut `bayiToken` ile aynı
  EncryptedSharedPreferences deseni, ayrı bir anahtar (`temsilci_token`).
- `data/Models.kt`'ye `TemsilciGirisYaniti`, `ZiyaretKaydetYaniti`, `ZiyaretKaydi`
  veri sınıfları eklenir.

## 3. Ziyaret Kaydet Ekranı

K1'in `KartaYazEkrani`/`KartaYazViewModel` state-machine deseni birebir tekrar
kullanılır:

- `ZiyaretKaydetDurumu` enum: `KART_BEKLENIYOR`, `KAYDEDILIYOR`, `KAYDEDILDI`, `HATA`.
- Ekran açıkken (mevcut `MainActivity`'deki NFC foreground dispatch + `NfcOlayYayini`
  altyapısı aynen kullanılır) temsilci karta okutur, `Ndef` mesajındaki URL'den
  `Regex("/raf/([a-z0-9]+)")` ile eczane kodu çıkarılır.
- Kod çıkarılınca `ziyaretKaydet(token, kod)` çağrılır:
  - Başarılı (201) → `KAYDEDILDI`, "Ziyaret kaydedildi" mesajı + eczane adı (API
    yanıtından, gerekirse ayrıca `GET /api/mobil/musteriler/:firmaId/calisanlar`
    benzeri bir sorgu değil — backend yanıtına eczane adı da eklenir, bkz. Hata
    Yönetimi).
  - 403/404 → `HATA`, backend'in döndürdüğü mesaj gösterilir ("Bu eczaneye ziyaret
    kaydedemezsiniz." / "Eczane bulunamadı.").
  - Ağ hatası → `HATA`, genel bağlantı hatası mesajı.
- "Tekrar Dene" butonu `KART_BEKLENIYOR`'a döner (K1'deki `tekrarDene()` deseniyle
  aynı).

**Not:** `/api/mobil/ziyaret-kaydet` şu an sadece `{ ok: true }` döner (K2'de
yazıldığı gibi). K3'te ekranın eczane adını gösterebilmesi için bu uç
`{ ok: true, eczaneAdi }` şeklinde genişletilir (backend'de tek satırlık ek alan,
zaten sorgulanan `eczaneler` satırından `ad` de seçilip yanıta eklenir).

## 4. Ziyaretlerim Ekranı

- `MusterilerEkrani.kt`'nin liste deseniyle aynı yapı: `viewModel { ZiyaretlerimViewModel(tokenDeposu) }`
  factory ile oluşturulan ViewModel, ekran açılışında `ziyaretlerim()` çağırır,
  sonucu `LazyColumn` ile listeler (her satır: eczane adı + tarih, `yyyy-MM-dd
  HH:mm` formatında).
- Boş liste durumunda "Henüz ziyaret kaydınız yok." mesajı.

## 5. Navigasyon

- `NfcKartifyApp.kt`'ye temsilci girişinden sonra ulaşılan `temsilciAnaEkran` route'u
  eklenir: iki büyük buton — "Ziyaret Kaydet" (`ziyaretKaydet` route'una gider) ve
  "Ziyaretlerim" (`ziyaretlerim` route'una gider).
- Geri tuşu/çıkış: mevcut bayi akışındaki "Çıkış" davranışıyla aynı — `TokenDeposu`
  temizlenir, giriş ekranına dönülür.

## Hata Yönetimi

- Temsilci girişi başarısız → mevcut `GirisEkrani`'nin hata mesajı gösterme deseni
  aynen kullanılır (K2 backend zaten 400/401 ile anlamlı mesaj dönüyor).
- NFC kartı okutulur ama URL'de `/raf/` deseni yoksa (müşteri profil kartı, raf
  kartı değil) → `HATA`, "Bu kart bir eczane raf kartı değil." mesajı.
- Token süresi dolmuşsa (`ziyaretKaydet`/`ziyaretlerim` 401 dönerse) → ekranda
  "Oturumunuz sona erdi, tekrar giriş yapın." mesajı gösterilir ve "Giriş Ekranına
  Dön" butonu sunulur (mevcut bayi akışında 401 için otomatik yönlendirme yok,
  aynı seviyede tutulur — sadece hata mesajı + manuel dönüş).

## Test Planı

- Backend: `GET /api/mobil/ziyaretlerim` için Jest testi — kendi ziyaretlerini
  döndüğü, başka temsilcinin ziyaretlerini görmediği, token yoksa 401.
  `POST /api/mobil/ziyaret-kaydet` yanıtına eklenen `eczaneAdi` alanı için mevcut
  testler güncellenir.
- Android: Faz 1-3'te kurulan ADB otomasyon deseniyle (uiautomator dump + tap/text,
  gerçek fiziksel NFC kartla uçtan uca okutma) temsilci girişi → Ziyaret Kaydet →
  gerçek kartı okutma → "Ziyaret kaydedildi" onayı → Ziyaretlerim listesinde
  görünmesi doğrulanır. Ayrıca "yanlış firmanın kartı" senaryosu (403) gerçek bir
  ikinci test eczanesiyle denenir.
