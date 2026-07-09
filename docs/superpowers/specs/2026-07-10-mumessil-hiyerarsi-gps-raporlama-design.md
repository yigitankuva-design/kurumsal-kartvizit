# Mümessil Hiyerarşisi + GPS + Otomatik Raporlama — Tasarım

## Amaç

Firmalar, mümessil/temsilcilerini yöneten bir müdür hiyerarşisi kurabilsin (mümessil → müdür → üst müdür → ... → firma sahibi). Müdürler kendine bağlı ekibin ziyaretlerini, ziyaret sırasında alınan GPS konumunu ve ziyaret notlarını görebilsin. Firma sahibi sadece sayısal özet görür, not içeriğini göremez.

## Mevcut durum (kod tabanında doğrulandı)

- `calisanlar` tablosunda hiyerarşi/amiri kavramı yok. Her temsilci doğrudan bir firmaya bağlı, aralarında bir üst-alt ilişkisi tutulmuyor.
- `ziyaretler (id, calisan_id, eczane_id, created_at, temsilci_notu)` tablosu var, konum alanı yok.
- Ziyaret notu (`temsilci_notu`) bugün firma sahibine (Saha İstatistikleri, kurumsal panel) filtresiz görünüyor.
- Push bildirim (FCM) altyapısı kod tabanında hiç yok; "Bildirim T1-T9" (katalog güncelleme uyarısı) kapsamında bilinçli olarak kapsam dışı bırakılmış, yerine uygulama-içi banner/polling deseni kullanılmış (`GET /api/mobil/katalog-durumu` + `TemsilciAnaEkrani` banner). Bu proje de aynı deseni izleyecek.

## Veri modeli

```sql
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS amiri_id INTEGER REFERENCES calisanlar(id) ON DELETE SET NULL;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS ekip_yoneticisi BOOLEAN DEFAULT false;
ALTER TABLE ziyaretler ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE ziyaretler ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
```

- `amiri_id IS NULL` → doğrudan firma sahibine bağlı (firma sahibi için ayrı bir kayıt açılmaz, mevcut `firmalar` hesabı hiyerarşinin tepesi kabul edilir).
- Zincir derinliği sınırsız (esnek): A → B → C → ... şeklinde `amiri_id` takip edilerek yukarı çıkılır. Döngü oluşmasını engellemek için (X, X'in kendi amiri ya da alt zincirindeki biri olamaz) panel tarafında ekleme/güncelleme anında kontrol edilir.
- `ekip_yoneticisi=true` olan bir `calisan`, hem kendi sahasına çıkabilir (normal temsilci gibi ziyaret kaydedebilir) hem de kendine bağlı (`amiri_id = kendi id'si` olan) alt kayıtları görebilir.

## Kurulum akışı (kurumsal panel)

- `dashboard.ejs` → Çalışanlar sekmesinde her satıra "Bağlı olduğu yönetici" dropdown'u eklenir (firma içindeki diğer çalışanlardan seçilir, kendisi ve kendi alt zinciri listede görünmez).
- Aynı ekranda "Ekip yöneticisi" checkbox'ı.
- Backend: `PUT /kurumsal/panel/:firmaId/calisan/:id/hiyerarsi` — `{ amiri_id, ekip_yoneticisi }` günceller, döngü kontrolü yapar (400 döner: "Bu kişi zaten bu zincirde").

## Erişim kontrolü

- Yeni yardımcı: `calisanAltZinciriIdleri(calisanId)` — bir müdürün altındaki tüm calisan id'lerini (çok seviyeli, recursive CTE ile) döner.
- `GET /api/mobil/ekibim` (yeni uç, `requireCalisanToken`, sadece `ekip_yoneticisi=true` olan çağırabilir) — alt zincirdeki her temsilci için: ad, bugünkü/haftalık ziyaret sayısı, son ziyaret tarihi.
- `GET /api/mobil/ekibim/:calisanId/ziyaretler` — o temsilcinin ziyaret listesi + `temsilci_notu` + `lat/lng` — **sadece istek yapan, o temsilcinin `amiri_id`'si ise** döner (401/403 aksi halde). Üst müdürler (amirinin amiri) bu uca erişemez — sadece direkt amiri.
- Mevcut kurumsal panel Saha İstatistikleri sorgusu güncellenir: `temsilci_notu` alanı response'dan çıkarılır, sadece ziyaret sayıları/tarihleri kalır (firma sahibi hâlâ sayısal özeti görür).

## GPS

- Ziyaret kaydı anında (`POST /api/mobil/ziyaret-kaydet`) istekte `lat`, `lng` opsiyonel alan olarak eklenir; Android tarafında `ACCESS_FINE_LOCATION` izni o an istenir (izin verilmezse ziyaret yine kaydedilir, konum `null` kalır — engelleyici değil).
- Sürekli/canlı takip yok. Konum sadece "bu ziyaret gerçekten o eczanenin yakınında mı yapıldı" doğrulaması ve müdürün ziyaret geçmişini haritada görmesi için kullanılır.

## Günlük özet (bildirim yerine banner)

- Yeni uç: `GET /api/mobil/ekip-ozeti` — bugün alt zincirde kaç ziyaret yapıldığını, kaç temsilcinin hiç ziyaret yapmadığını döner.
- Android: `ekip_yoneticisi=true` olan hesaplar uygulamayı açtığında ana ekranda (mevcut katalog-uyarısı bannerıyla aynı desende) "Bugün ekibin N ziyaret yaptı" kartı — tıklanınca Ekibim ekranına gider. Gerçek push bildirimi bu projenin kapsamı dışında (yukarıda gerekçelendirildi).

## Android

- Yeni ekran: `EkibimEkrani.kt` + `EkibimViewModel.kt` — sadece giriş yapan hesap `ekip_yoneticisi=true` ise navigasyonda görünür (mevcut rol bazlı navigasyon desenine benzer, bkz. İP-1 firma/bayi/temsilci seçici).
- `ZiyaretKaydetViewModel`'e konum okuma eklenir (FusedLocationProviderClient veya basit `LocationManager`).
- `Models.kt` / `ApiService.kt`'e yeni response tipleri ve uçlar.

## Test planı

- Backend: jest+supertest — hiyerarşi CRUD (döngü reddi dahil), `calisanAltZinciriIdleri` çok seviyeli zincirde doğru id'leri döndürüyor mu, `/ekibim/:id/ziyaretler` sadece direkt amirine 200 diğerlerine 403 dönüyor mu, Saha İstatistikleri artık `temsilci_notu` içermiyor mu.
- Android: gerçek cihazda ziyaret kaydında konum izni akışı, Ekibim ekranının doğru veriyi gösterdiği, yönetici olmayan hesapta sekmenin görünmediği.

## Kapsam dışı (bu turda yapılmayacak)

- Gerçek push bildirimi (FCM) — ayrı, daha büyük bir alt proje olarak ele alınmalı.
- Canlı/sürekli GPS takibi — sadece ziyaret anı konumu.
- Eczane bazlı özel ürün/yetki ayarları (bu proje B'ye ait değil, Proje A'da ayrıca ele alınıyor).
