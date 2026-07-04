# Google Yorum Linki — İşletme Arama ile Otomatik Doldurma (Android)

## Amaç ve Bağlam

`ProfilOlusturEkrani.kt`'deki "Google Yorum Linki" alanı şu an serbest metin —
kullanıcı Google'ın yorum yazma linkini elle bulup yapıştırmak zorunda. Gerçek bir
kullanım sırasında bir profildeki Instagram alanına (yanlışlıkla) kullanıcı adı
girilmesi, diğer sosyal medya/URL alanlarının da benzer şekilde yanlış
doldurulabileceğini gösterdi — Google Yorum Linki alanı için de aynı risk var, üstelik
bu alan tamamen "doğru linki bul ve yapıştır" bilgisine dayanıyor.

Çözüm: adres alanındaki (`AdresAlani.kt`) Google Places otomatik tamamlama deseni
yeniden kullanılarak, kullanıcı işletmesini arayıp seçebilsin; seçilen yerin
`place_id`'sinden doğru Google yorum linki otomatik oluşturulsun.

Onaylanmış kararlar (brainstorming, 2026-07-04):
- Sadece Android uygulaması (web paneli kapsam dışı, ayrı bir aşama olabilir).
- Serbest metin alanı kalkmaz — arama kutusu üstüne eklenir, seçim yapılınca metin
  alanını otomatik doldurur, kullanıcı yine elle düzenleyebilir/silebilir.

Kapsam DIŞI: web paneli entegrasyonu, seçilen yerin yorum/değerlendirme özelliğinin
açık olup olmadığının önceden kontrolü.

## 1. Yeni Bileşen — `IsletmeAramaAlani.kt`

- `AdresAlani.kt` ile birebir aynı teknik desen: `Places.createClient()`,
  `AutocompleteSessionToken`, doğrudan `placesClient.findAutocompletePredictions()`
  çağrısı (Fragment tabanlı `AutocompleteSupportFragment` KULLANILMAZ — Faz2'de bu
  yaklaşımın Compose içinde çalışmadığı zaten tespit edilmişti).
- Fark: `AdresAlani`'nin aksine, seçilen önerinin sadece metnini değil `place_id`'sini
  de dışarı vermesi gerekiyor. Composable imzası:

  ```kotlin
  @Composable
  fun IsletmeAramaAlani(
      yerSecildi: (placeId: String, adı: String) -> Unit,
      modifier: Modifier = Modifier,
  )
  ```

- İçeride arama metni kendi state'inde tutulur (`remember { mutableStateOf("") }`),
  dışarıya kalıcı bir değer taşımaz — sadece seçim anında `yerSecildi` callback'i
  tetiklenir.
- Öneri seçilince arama kutusu placeholder'a döner (temizlenir), aşağıdaki metin
  alanının dolduğunu kullanıcı görsün diye.

## 2. Link Oluşturma

- Yeni saf fonksiyon (test edilebilir, Context'e bağımlı değil):

  ```kotlin
  fun googleYorumLinkiOlustur(placeId: String): String =
      "https://search.google.com/local/writereview?placeid=$placeId"
  ```

  `NfcYazici.kt` yanına değil, ayrı bir dosyaya (`GoogleYorumLinki.kt`) konur —
  NFC ile ilgisi yok, karıştırılmasın.

## 3. `ProfilOlusturEkrani.kt` Entegrasyonu

- "Google Yorum Linki" `OutlinedTextField`'ının hemen üstüne `IsletmeAramaAlani`
  eklenir.
- `yerSecildi = { placeId, _ -> viewModel.googleYorumLink = googleYorumLinkiOlustur(placeId) }`
  — işletme adı kullanılmıyor (sadece linki dolduruyoruz, ayrı bir alanda
  saklamıyoruz).
- Mevcut metin alanı davranışı değişmez: kullanıcı doğrudan da yazabilir/silebilir,
  arama kutusu sadece kolaylık sağlar.

## Hata Yönetimi

- Places API çağrısı başarısız olursa (ağ hatası vb.) öneri listesi boş kalır,
  hata mesajı gösterilmez — `AdresAlani.kt`'deki mevcut sessiz-başarısızlık deseniyle
  tutarlı (kullanıcı sadece yazmaya devam edebilir).
- Seçilen yerin Google'da değerlendirme özelliği kapalıysa, oluşturulan link yine de
  kaydedilir; bu durumda link tıklanınca Google'ın kendi hata/bilgi sayfası açılır —
  bu senaryo uygulama tarafında ayrıca ele alınmaz.

## Test Planı

- `googleYorumLinkiOlustur` için JVM unit testi: verilen `place_id`'den beklenen
  linkin üretildiği (`tests` dizini yerine Android'in `app/src/test` altında, Kotlin).
- `IsletmeAramaAlani` UI mantığı Compose testleriyle doğrulanmaz (proje genelinde
  Compose UI testi kurulu değil) — cihazda gerçek arama yapılarak, gerçek bir
  işletme seçilip metin alanının doğru linkle dolduğu ve o linkin tarayıcıda
  Google'ın "yorum yaz" ekranını gerçekten açtığı doğrulanır.
