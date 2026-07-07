# Foto/Logo Kırpıcı + Eksik Fotoğraf Uyarısı — Design

## Amaç

İki bağımsız iyileştirme:
1. Firma panelinde logo ve çalışan fotoğrafı yüklerken kullanıcı, karenin hangi kısmının görüneceğini sürükle/yakınlaştır ile kendi seçebilsin (şu an sunucu otomatik "attention" stratejisiyle kırpıyor, kullanıcının kontrolü yok).
2. Excel ile toplu eklenen çalışanların foto_url'si boş kalıyor — bu kişiler çalışanlar listesinde fotoğrafsız olduğu belirgin bir şekilde görünsün ve tek tıkla foto eklenebilsin.

## Kapsam

- Firma paneli (`views/public/dashboard.ejs`): İçerik sekmesi logo yükleme, Yeni Çalışan/Düzenle formundaki fotoğraf alanı.
- Bayi paneli ve mobil uygulama kapsam dışı (kullanıcı onayı ile).

## 1) Sürükle/Yakınlaştır Kırpıcı

**Mevcut durum (tespit):** `middleware/upload.js`'teki `fotoIsle()` her yüklemede `sharp(buffer).resize(600,600,{fit:'cover', position: attention})` çalıştırıyor — hem logo hem çalışan fotoğrafı için. Kullanıcının hangi kısmın kare içinde kalacağı üzerinde hiç kontrolü yok.

**Yaklaşım:** Dış kütüphane kullanmadan (projenin mevcut vanilla JS tarzına uygun), tek bir yeniden kullanılabilir JS bileşeni:

- Dosya seçilince (`<input type="file">`'ın `change` olayında) bir modal açılır: kare bir önizleme çerçevesi (örn. 280×280px) içinde seçilen görsel gösterilir.
- **Sürükleme:** Fare ile basılı tutup sürükleyince görsel çerçeve içinde kayar (dokunmatik için touch olayları da desteklenir). Görsel çerçeveyi asla tam kaplamaktan küçük olamaz (boşluk kalmaz).
- **Yakınlaştırma:** Bir slider (2-3 kademe arası, min=çerçeveyi tam kaplayan ölçek, max=min'in ~3 katı) ile görsel büyütülüp küçültülür.
- **Onay:** "Kullan" butonuna basınca, o anki görünüm bir `<canvas>` üzerine (600×600) çizilir, `canvas.toBlob()` ile bir dosyaya dönüştürülür ve `DataTransfer` API'siyle orijinal `<input type="file">`'ın `files` listesine enjekte edilir. Form normal şekilde submit edilir; sunucu tarafı hiç değişmez.
- **Güvenli çöküş (fallback):** Kullanıcı modalı iptal ederse veya tarayıcıda bir JS hatası olursa, orijinal dosya (kırpılmamış haliyle) yüklenmeye devam eder — form asla kilitlenmez.
- Sunucu tarafındaki `fotoIsle()` fonksiyonu aynı kalır (600×600'e resize hâlâ çalışır, ama artık gelen görsel zaten kare olduğu için pratikte no-op'a yakın olur — ekstra kırpma yapmaz).

**Nerede kullanılacak:** Aynı modal + JS fonksiyonu iki yerde bağlanır: Logo yükleme formu (`#logo` input) ve Yeni Çalışan/Düzenle formundaki foto alanı (`#f_foto` input).

## 2) Eksik Fotoğraf Uyarısı

**Mevcut durum:** Excel toplu yükleme (`/toplu-yukle`) çalışanı `foto_url = NULL` ile ekliyor. Çalışanlar tablosunda bu görünmüyor, fark edilmesi zor.

**Yaklaşım:** Çalışanlar tablosunda (`views/public/dashboard.ejs`), `c.foto_url` boşsa İşlem sütununa mevcut "Düzenle"/"Pasife Al" butonlarının yanına turuncu/uyarı renkli bir **"📷 Fotoğraf Ekle"** butonu eklenir. Bu buton yeni bir akış açmaz — var olan `openSlideEdit(c)` fonksiyonunu çağırır (Düzenle paneli zaten foto alanını içeriyor).

## Test

- Kırpıcı: saf JS mantığı (min/max zoom sınırları, pan sınırları hesaplama) için birim test yazılabilirse yazılır; tam sürükle/yakınlaştır etkileşimi otomatik test edilemeyeceğinden gerçek tarayıcıda (preview) manuel doğrulanır.
- Eksik fotoğraf uyarısı: `foto_url IS NULL` olan bir çalışan için dashboard render testinde "Fotoğraf Ekle" metninin çıktığını, `foto_url` doluysa çıkmadığını doğrulayan bir entegrasyon testi (mevcut `tests/panel.test.js` deseniyle).

## Dışarıda Bırakılanlar

- Bayi paneli ve Android mobil uygulama (kullanıcı onayıyla kapsam dışı — mobilde zaten kırpma/yakınlaştırma var).
- Kartın "teslim sonrası güncellenmesi" konusu: zaten mevcut mimaride çalışıyor (fiziksel kart sadece link/kod taşıyor, içerik her okutmada panelden canlı çekiliyor) — kullanıcı onayladı, ek iş gerekmiyor.
