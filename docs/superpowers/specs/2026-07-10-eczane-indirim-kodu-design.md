# Eczane İndirim Kodu Sistemi — Tasarım

**Tarih:** 2026-07-10

## Amaç

Firma, raf kartını okutan veya Instagram'a yönlenen müşterilerine eczanede ürün alırken %5 (firma tarafından ayarlanabilir) indirim tanımak istiyor. NFCKartify'ın eczane kasa/POS sistemiyle entegrasyonu yok ve olması bu projenin kapsamı dışında. Instagram'da gerçekten yorum yapıldığını otomatik doğrulamak da teknik olarak mümkün değil (Instagram API üçüncü taraflara bu doğrulamayı vermiyor).

Bu yüzden sistem şöyle çalışır: müşteri raf sayfasında bir buton ile bir **indirim kodu** alır, kasada eczacıya gösterir, eczacı kendi NFC kartıyla eczacı sayfasına girip kodu sisteme girer, sistem kodu doğrular/kullanılmış işaretler, eczacı kendi kasasında indirimi **elle** uygular. Instagram paylaşımı zorunlu tutulmaz, sadece teşvik notu olarak gösterilebilir.

## Veri Modeli

Yeni tablo:

```sql
CREATE TABLE indirim_kodlari (
  id                SERIAL PRIMARY KEY,
  firma_id          INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
  eczane_id         INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
  kod               TEXT UNIQUE NOT NULL,
  yuzde             INTEGER NOT NULL,
  cerez_id          TEXT NOT NULL,
  kullanildi        BOOLEAN DEFAULT false,
  olusturulma_tarihi TIMESTAMP DEFAULT NOW(),
  kullanilma_tarihi TIMESTAMP
);
```

Firma ayarları (`firmalar` tablosuna eklenecek kolonlar):

```sql
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS indirim_aktif BOOLEAN DEFAULT false;
ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS indirim_yuzdesi INTEGER DEFAULT 5;
```

`yuzde` kod satırına oluşturma anında `firmalar.indirim_yuzdesi`'nden kopyalanır — firma sonradan yüzdeyi değiştirse bile zaten üretilmiş kodlar eski yüzdeyle geçerli kalır.

## Müşteri Akışı (Public Raf Sayfası)

- `views/public/raf.ejs`: `firma.indirim_aktif === true` ise "İndirim Kodu Al" butonu gösterilir.
- Buton tıklanınca `POST /raf/:kod/indirim-kodu-al`:
  1. İstemci cookie'sinde bu eczane için bugüne ait bir `cerez_id` var mı kontrol edilir (cookie yoksa yeni bir rastgele `cerez_id` üretilip cookie'ye yazılır).
  2. `indirim_kodlari` tablosunda bugün, bu `eczane_id` + `cerez_id` için zaten bir kayıt var mı sorgulanır — varsa o kod tekrar döndürülür (yeni kod üretilmez).
  3. Yoksa: 6 haneli rastgele sayısal kod üretilir (çakışma ihtimaline karşı unique constraint + retry), `firmalar.indirim_yuzdesi` kopyalanarak yeni satır eklenir.
  4. Kod JSON olarak döndürülür, sayfada büyük puntoyla gösterilir: "Bu kodu kasada eczacınıza gösterin. Kod bugün gece yarısına kadar geçerlidir."

## Eczacı Akışı (Public Eczacı Sayfası)

- `views/public/eczaci.ejs`: "İndirim Kodu Doğrula" başlıklı bir form (6 haneli kod girişi + "Doğrula" butonu).
- `POST /eczaci/:eczaciKod/indirim-dogrula { kod }`:
  1. `eczaciKod`'dan eczane bulunur (mevcut `/eczaci/:kod` route'unun yaptığı gibi).
  2. Girilen `kod`'a ait `indirim_kodlari` satırı aranır. Bulunamazsa: **"Kod geçersiz."**
  3. Satırın `eczane_id`'si bu eczanenin id'sine eşit değilse: **"Bu kod bu eczaneye ait değil."**
  4. `olusturulma_tarihi`, bugünün tarihinden farklıysa (yani gece yarısını geçmişse): **"Bu kodun süresi dolmuş."**
  5. `kullanildi = true` ise: **"Bu kod zaten kullanılmış."**
  6. Hepsi geçerliyse, çifte kullanımı önlemek için atomik güncelleme yapılır:
     ```sql
     UPDATE indirim_kodlari
     SET kullanildi = true, kullanilma_tarihi = NOW()
     WHERE id = $1 AND kullanildi = false
     RETURNING *
     ```
     Satır dönerse: **"✓ Onaylandı — %{yuzde} indirim uygulayabilirsiniz."** Dönmezse (yarış durumunda başka bir istek araya girmişse): **"Bu kod zaten kullanılmış."**

Eczacının ayrı bir giriş/şifre sistemi yok — kendi eczacı NFC kartıyla bu sayfaya erişmiş olması yeterli kimlik sayılır (mevcut `/eczaci/:kod` sayfasının güvenlik modeliyle aynı).

## Firma Paneli

`routes/kurumsal.js` + `views/public/dashboard.ejs`'e yeni bir "İndirim Kampanyası" bölümü:

- **Ayarlar:** kampanyayı aç/kapa toggle (`indirim_aktif`), yüzde girişi (`indirim_yuzdesi`, 1-100 arası doğrulama).
- **Raporlama:** toplam üretilen kod sayısı, toplam kullanılan kod sayısı, eczane bazlı dağılım tablosu (eczane adı, kullanılan kod sayısı) — mevcut Analitik özelliğindeki eczane detay modalına benzer bir liste.

## Hata Durumları

- Kod üretiminde unique çakışması: retry (maksimum birkaç deneme), yine çakışırsa genel hata mesajı.
- `indirim_aktif=false` olan bir firmanın raf sayfasında buton hiç gösterilmez; route'a doğrudan istek atılırsa 403 döner.
- Eczacı doğrulama endpoint'i rate-limit'e tabi olmalı (mevcut `createJsonLimiter` deseni) — brute-force ile kod tahmin etmeyi zorlaştırmak için.

## Test Planı

- Kod üretimi: aynı cookie + aynı gün + aynı eczane → aynı kod döner (yeni satır açılmaz).
- Farklı eczane veya farklı gün → yeni kod üretilir.
- Eczacı doğrulama: geçerli kod → başarılı + `kullanildi=true`; yanlış eczanenin kodu → red; süresi geçmiş kod → red; zaten kullanılmış kod → red; eşzamanlı iki istekte sadece biri başarılı olmalı (atomik UPDATE testi).
- Firma paneli: toggle ve yüzde güncelleme; raporlama sorgusunun doğru sayıları döndürmesi.
- `indirim_aktif=false` iken raf sayfasında buton görünmemeli.
