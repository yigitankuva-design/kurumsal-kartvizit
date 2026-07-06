# Eczane Bazlı Detaylı Analitik Design

## Amaç

Kurumsal panelde, Raf Kartları sekmesindeki her eczane satırı için detaylı bir
etkileşim görünümü sunmak: kaç kez okutulduğu, hangi içeriğin ne sıklıkla
tıklandığı, eczacı kartındaki eğitim PDF'inin kaç kez açıldığı, yaklaşık kaç
farklı kişinin okuttuğu, ve mümessil ziyaretlerinin okutma etkinliğiyle
ilişkisi.

## Mevcut Durum (tespit)

- `raf_okutmalar (id, eczane_id, created_at)` — her raf kartı okutması zaten
  kaydediliyor, ama sadece toplam sayı olarak (kimlik/IP bilgisi yok).
- `raf_tiklamalar (id, eczane_id, tip, created_at)` — katalog/website/instagram/
  linkedin/twitter/youtube/tiktok/whatsapp tıklamaları zaten `tip` alanıyla
  ayrı ayrı kaydediliyor (`routes/public.js`, `RAF_TIKLAMA_TIPLERI` beyaz
  listesi). Eczane bazlı filtrelenebilir durumda.
- `eczaci_okutmalar (id, eczane_id, created_at)` — eczacı kartı okutmaları
  kaydediliyor.
- **Eczacı kartındaki eğitim PDF'i (`f.eczaci_pdf_url`) hiç izlenmiyor** —
  `views/public/eczaci.ejs`'te doğrudan `<a href="...">` linki, herhangi bir
  `/tikla/:tip` deseninden geçmiyor.
- `ziyaretler (id, calisan_id, eczane_id, created_at)` — mümessil saha
  ziyaretleri zaten kaydediliyor (K2/K3).
- Panelde (`views/public/dashboard.ejs`) şu an sadece **toplam/agregat**
  grafikler var (Son 30 Gün Günlük Ziyaret, Temsilci Başına Ziyaret, Eczane
  Başına Okutma, İçerik Tıklama Dağılımı) — eczane bazlı **drill-down** görünüm
  yok.
- Panel erişimi `requireFirma` middleware ile korunuyor (`app.js:63,68`) —
  firma içinde ayrı yetki seviyesi (örn. salt-okunur ikinci hesap) yok. Bu
  özellik de aynı modeli kullanacak: sadece firma hesabına giren kişi görür,
  mümessil/temsilci mobil uygulamadan göremez.

## Kapsam

**Dahil:**
1. Raf Kartları sekmesinde her eczane satırına "Detay" butonu; tıklanınca açılan
   görünümde:
   - Toplam okutma sayısı
   - Tip bazlı tıklama sayıları (katalog, website, Instagram, vb.)
   - Eczacı kartı PDF açılma sayısı (yeni takip)
   - Yaklaşık farklı kişi sayısı (IP hash'i bazlı, aşağıya bkz.)
   - Mümessil ziyareti ↔ okutma ilişkisi: her ziyaret için, o ziyaretten
     sonraki ziyarete kadar (son ziyaretse şu ana kadar) kaç okutma oldu
2. Eczacı kartı PDF'i için tıklama takibi eklenir (yeni `eczaci_tiklamalar`
   tablosu + `/eczaci/:kod/tikla/pdf` yönlendirme ucu).
3. "Farklı kişi" tahmini için IP'nin **kendisi saklanmaz** — tuzlanmış
   (salted) SHA-256 hash'i saklanır, DISTINCT hash sayısı yaklaşık farklı kişi
   sayısı olarak gösterilir.

**Hariç:** Bildirim sistemi (ayrı bir sonraki alt-proje), firma içi yeni yetki
seviyeleri (mevcut tek-firma-girişi modeli korunuyor).

## Veri Modeli

`scripts/migrate.js`'e eklenecek:

```sql
ALTER TABLE raf_okutmalar ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE TABLE IF NOT EXISTS eczaci_tiklamalar (
  id          SERIAL PRIMARY KEY,
  eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
  tip         TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

`ip_hash` üretimi: `crypto.createHash('sha256').update(ip + process.env.IP_HASH_SALT).digest('hex')`
— `IP_HASH_SALT` yeni bir env değişkeni, `.env`/Railway'e eklenecek.

## Backend Değişiklikleri

### `routes/public.js`

- `GET /raf/:kod` handler'ında `raf_okutmalar` INSERT'ine `ip_hash` eklenir
  (`req.ip`'ten hesaplanır, `utils/ipHash.js` yeni yardımcı fonksiyon).
- Yeni uç: `GET /eczaci/:kod/tikla/pdf` — `/raf/:kod/tikla/:tip` deseninin
  birebir kopyası: `eczaci_tiklamalar`'a `tip='pdf'` kaydı yazar, `f.eczaci_pdf_url`'e
  redirect eder.
- `views/public/eczaci.ejs`'teki PDF linki `/eczaci/<%= veri.eczaci_kod %>/tikla/pdf`'e
  güncellenir (mevcut doğrudan `f.eczaci_pdf_url` linki yerine).

### `utils/ipHash.js` (yeni dosya)

```js
const crypto = require('crypto');
function ipHashOlustur(ip) {
  return crypto.createHash('sha256').update(ip + (process.env.IP_HASH_SALT || 'dev-salt')).digest('hex');
}
module.exports = { ipHashOlustur };
```

### `routes/kurumsal.js`

Yeni uç: `GET /eczane/:id/detay` — JSON döner:
```js
{
  okutma_sayisi: 127,
  farkli_kisi_tahmini: 43,
  tiklama_dagilimi: { katalog: 12, website: 8, instagram: 3, ... },
  pdf_acilma_sayisi: 5,
  ziyaret_etkisi: [
    { ziyaret_tarihi: '2026-07-01', sonraki_okutma_sayisi: 6 },
    { ziyaret_tarihi: '2026-06-15', sonraki_okutma_sayisi: 2 }
  ]
}
```

`ziyaret_etkisi` hesaplaması: her eczane için `ziyaretler` tablosundaki
kayıtlar tarihe göre sıralanır; her ziyaretin `created_at`'i ile bir sonraki
ziyaretin `created_at`'i (veya son ziyaretse `NOW()`) arasındaki `raf_okutmalar`
sayısı sayılır. PostgreSQL `LEAD() OVER (PARTITION BY eczane_id ORDER BY created_at)`
window fonksiyonuyla bir sonraki ziyaret tarihini bulup, ardından her aralık
için ayrı bir `COUNT` sorgusu (veya tek sorguda `LATERAL JOIN`) ile yapılır.

## Frontend (Panel)

`views/public/dashboard.ejs` — Raf Kartları sekmesindeki eczane tablosuna
"Detay" butonu eklenir. Tıklanınca `fetch('/kurumsal/eczane/:id/detay')` ile
veri çekilir, bir modal içinde basit bir liste/tablo olarak gösterilir
(grafik gerekmiyor — YAGNI, mevcut agregat grafikler zaten var).

## KVKK Notu (bilgilendirme, hukuki karar kullanıcıya ait)

IP hash'i tutmak, ham IP tutmaktan çok daha düşük risklidir (geri
döndürülemez) ama KVKK'ya göre "pseudonimleştirilmiş veri" teknik olarak hâlâ
kişisel veri sayılabilir. Aydınlatma metnine kısa bir madde eklenmesi
önerilir — bu kararı kullanıcı/avukatı verecek, bu spec bir hukuki tavsiye
içermez.

## Test

- `utils/ipHash.js` için birim test: aynı IP+salt aynı hash'i üretir, farklı
  IP farklı hash üretir.
- `/eczaci/:kod/tikla/pdf` için: `eczaci_tiklamalar`'a kayıt düştüğünü ve
  `eczaci_pdf_url`'e redirect ettiğini doğrulayan supertest testi.
- `/kurumsal/eczane/:id/detay` için: bilinen test verisiyle (X okutma, Y farklı
  IP, Z tıklama) beklenen JSON'ı doğrulayan test.
- `ziyaret_etkisi` hesaplaması için: iki ziyaret + aralarında bilinen sayıda
  okutma içeren bir senaryoyla doğru sayının döndüğünü doğrulayan test.
