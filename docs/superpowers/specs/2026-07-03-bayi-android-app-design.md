# Bayi Android Uygulaması — Tasarım Notları (devam ediyor)

> Bu doküman brainstorming sürecinin tamamlanmadığı bir kontrol noktasıdır (checkpoint).
> Henüz "onaylanmış spec" değil — yarın konuşmaya buradan devam edilecek.

## Amaç

Bayilerin (kartvizitçi/matbaacı) şu an web üzerinden yaptığı işleri (giriş, müşteri
profili oluşturma, NFC karta yazılacak URL üretme) telefondan, tam native bir Android
uygulaması üzerinden yapabilmesi. Uygulama içinden ayrıca üretilen linki doğrudan boş
NFC karta yazabilme ve kartı kilitleyebilme (bir daha yazılamaz hale getirme) özelliği
eklenecek — böylece bayi ayrı bir "NFC Tools" uygulamasına ihtiyaç duymayacak.

## Şu ana kadar netleşen kararlar

- **Platform sırası**: Önce Android, iOS sonra (Apple'ın NFC yazma izni süreci daha
  yavaş/belirsiz; Türkiye'de Android payı yüksek; MVP'yi hızlı test etme isteği).
- **Mimari**: Tam native (B seçeneği) — WebView/hibrit değil. Uygulamanın tüm arayüzü
  Kotlin ile sıfırdan yazılacak, mevcut backend'e (Node/Express) yeni JSON API
  uçlarıyla bağlanacak.
- **Kapsam iki alt projeye bölündü**:
  1. **Backend API** — mevcut `kurumsal-kartvizit` reposuna mobil için JSON uçları
     eklemek (giriş/token, müşteri listesi, profil oluşturma, abonelik durumu).
     Önce bu bitecek.
  2. **Android Uygulaması** — Kotlin, yukarıdaki API'yi tüketen, NFC yaz/kilitle
     özellikli gerçek uygulama. Backend bittikten sonra başlanacak.
- **Profil oluşturma formu — v1'den itibaren tam özellik paritesi** isteniyor: fotoğraf
  kırpma/yakınlaştırma, adres otomatik tamamlama, biyografi kalın/italik/ortala —
  web'deki kadar dolu, basitleştirilmiş bir ilk sürüm değil.
- **NFC özellikleri**: "Karta Yaz" (üretilen URL'i boş karta NDEF olarak yazma) +
  "Kilitle" (kartı salt-okunur/read-only hale getirme, geri alınamaz).
- **Bayi hesabı açma**: Sadece süperadmin panelinden (mevcut model aynen devam).
  Uygulama içinden bayi kendi kendine kayıt olamayacak (self-signup yok).
- **CRM / lead-capture (Salesforce/HubSpot tarzı otomatik kişi yakalama)**: Bu proje
  kapsamı **dışında**. İleride ayrı bir "kurumsal mobil uygulama" için düşünülecek —
  KVKK açısından açık rıza gerektirebileceği not edildi, netleşmedi.
- **Rakip araştırması yapıldı** (Popl, Linq, Blinq, HiHello, Dot Card): Hiçbirinde
  bayi/reseller ağı modeli görülmedi — bizim farkımız olabilir. HiHello bile kendi
  app'ine native NFC yazma koymamış, kullanıcıyı NFC Tools'a yönlendiriyor.

## Ortam durumu (doğrulandı)

Bu bilgisayarda (C:\Users\muham) Android geliştirme için gereken her şey **zaten
kurulu**, ek indirme gerekmedi:
- Android Studio 2026.1 (`C:\Program Files\Android\Android Studio`)
- Android SDK (`C:\Users\muham\AppData\Local\Android\Sdk`) — android-35, android-36.1
  platformları mevcut
- adb 1.0.41 (SDK içinde, `platform-tools\adb.exe`)
- Gömülü Java 21 (Android Studio'nun `jbr` klasöründe, ayrı JDK kurulumuna gerek yok)
- Emülatör **kurulmadı** (bilinçli) — NFC gerçek cihaz gerektirir, emülatörde çalışmaz.

## İşbölümü (netleşti)

- **Claude yazar/derler**: Tüm kod (backend API uçları + Android/Kotlin uygulaması),
  komut satırından derleme/hata kontrolü.
- **Kullanıcı yapar**: Gerçek telefonla fiziksel NFC testi (karta yazma/kilitleme),
  uygulamayı telefona kurup gözle kontrol, Google Play Developer hesabı açma/ödeme
  (Claude hesap açamaz/ödeme yapamaz).

## Henüz netleşmedi / yarın devam edilecek

- Backend API'nin kimlik doğrulama yöntemi (JWT token önerilecek, henüz onaylanmadı).
- API uçlarının tam listesi ve request/response şemaları.
- Android tarafında ekran akışı (giriş → müşteri listesi → profil oluştur/düzenle →
  karta yaz) detaylı UI planı.
- Test planı (backend API testleri + Android tarafı manuel test senaryoları).
- Bu doküman henüz brainstorming skill'inin "Present design" / "spec self-review" /
  "user reviews spec" adımlarından geçmedi — sadece konuşmanın özeti.

## Devam etmek için

Yarın bu depoda (`kurumsal-kartvizit`) Claude Code açılıp bu dosyanın yolu
(`docs/superpowers/specs/2026-07-03-bayi-android-app-design.md`) verilerek veya
sadece "devam edelim" denilerek kaldığımız yerden sürdürülebilir.
