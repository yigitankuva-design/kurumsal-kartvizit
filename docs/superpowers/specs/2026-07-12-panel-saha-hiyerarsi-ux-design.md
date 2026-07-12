# Firma Paneli — Saha & Hiyerarşi UX İyileştirmesi (Spec)

**Tarih:** 2026-07-12
**Amaç:** Firma panelinde (1) hiyerarşiyi görsel bir ağaç olarak göstermek, (2) dağınık saha raporlarını sekme/accordion + arama ile düzenlemek, (3) mümessil performansını (yıldız/geride, 60+ gün ziyaretsiz) tek yerde göstermek.

**Mimari:** DB sorguları `app.js` GET `/` handler'ında kalır. Saf dönüşümler (ağaç kurma, performans bayrakları) yeni `utils/sahaAnaliz.js`'e taşınır ve jest ile birim test edilir. Görsel değişiklikler `views/public/dashboard.ejs` içinde; ek kütüphane yok (mevcut Chart.js + vanilla JS + `<details>`).

**Tech Stack:** Node/Express, EJS, PostgreSQL, jest+supertest (mevcut).

**Mevcut durum (teşhis):**
- `amiri_id`/`ekip_yoneticisi` yalnızca çalışan ekle/düzenle formunda ayarlanabiliyor — hiyerarşiyi **gösteren** bir görünüm yok (`dashboard.ejs:1452,1461`).
- Saha İstatistikleri sekmesi (`dashboard.ejs:1279+`): ziyaret notları `<ul>`, "60+ gün ziyaret edilmeyen **eczaneler**" `<ul>`, 4 grafik alt alta ve **eczane-bazlı tıklama tablosu** (1000 eczane → binlerce satır). Arama/accordion yok.
- Mümessil (temsilci) performansı — yıldız/geride, 60+ gün ziyaretsiz **temsilci** — hiçbir yerde yok. Veri seed'de var ama panelde görünmüyor.

---

## 1. Karar
Hiyerarşi ağacı **Çalışanlar grubunda yeni "Organizasyon" sekmesi** olacak (`tab=organizasyon`, `aktifGrup=calisanlar`). Performans bölümü **Saha grubunda** kalır (saha verisiyle mantıksal bütünlük).

---

## 2. Backend — `utils/sahaAnaliz.js` (yeni, saf + test edilebilir)

**`hiyerarsiAgaciKur(kisiler, ziyaretSayilari)`**
- Girdi: `kisiler` = `[{id, ad, soyad, unvan, amiri_id, ekip_yoneticisi}]` (firmanın tüm aktif çalışanları); `ziyaretSayilari` = `{ [calisanId]: sayi }` (kişinin kendi ziyaret sayısı, son 90 gün).
- Çıktı: kök düğümler dizisi; her düğüm `{ id, ad, soyad, unvan, ekip_yoneticisi, kendiZiyaret, ekipZiyaret, cocuklar: [...] }`. `ekipZiyaret` = düğümün kendi + tüm alt ağacının ziyaret toplamı (özyinelemeli).
- Amiri olmayanlar (amiri_id null) kök; döngü/kopuk referanslara karşı dayanıklı (ziyaret edilen id seti ile guard).

**`mumessilPerformansi(satirlar)`**
- Girdi: `satirlar` = `[{ id, ad, soyad, unvan, ziyaret30, ziyaret90, sonZiyaret }]` (yalnızca `ekip_yoneticisi=false` saha mümessilleri).
- Çıktı: aynı satırlar + `{ durum: 'yildiz' | 'geride' | 'normal' }`:
  - `geride`: `sonZiyaret` yok VEYA 60 günden eski.
  - `yildiz`: geride değil VE `ziyaret30` en üst %20 diliminde (eşik: sıralı listede 80. persentil).
  - diğer: `normal`.
- Sıralama: geride'ler üstte (uyarı öne), sonra ziyaret30 azalan.

Bu iki fonksiyon DB'ye dokunmaz; `app.js` sorgu sonuçlarını verir.

---

## 2.1 Akıllı Sorular (rapor kataloğu)

Saha raporları artık **soru odaklı**: kullanıcı bir soru "chip"ine tıklar, o rapor **anında** görünür (hepsi sunucuda önceden hesaplanıp gömülür, tıklama sadece göster/gizle). Bu, "dağınık uzun listeler" sorununu kökten çözer — tek scroll yerine bir seferde tek rapor.

`app.js` bu raporları `sahaIstatistik.akilliSorular` nesnesine hesaplar (çoğu top-10/sayım; ucuz):

| # | Soru (chip) | Veri | Boyut |
|---|-------------|------|-------|
| 1 | ⭐ En çok ziyaret yapan mümessiller | mümessil + son 90g ziyaret, azalan (ilk 10) | küçük |
| 2 | ⚠️ 60+ gün ziyaret etmeyen mümessiller | mümessil + son ziyaret tarihi | küçük |
| 3 | 📉 Bu ay hiç ziyaret yapmayan mümessiller | mümessil listesi | küçük |
| 4 | 🏆 En aktif eczaneler | eczane + okutma (ilk 10) | küçük |
| 5 | 💊 En çok tıklanan ürünler | ürün + tıklama (ilk 10) | küçük |
| 6 | 🪪 Kartı eksik eczaneler | müşteri VEYA eczacı kartı yazılmamış — sayı + liste (ilk 100 + arama) | büyük |
| 7 | 🗺️ Bölge/ekip performansı | bölge müdürü + ekip ziyaret toplamı | küçük |
| 8 | 🎁 İndirim özeti | üretilen / kullanılan / oran | tek satır |

- Soru 1-2 zaten `mumessilPerformansi` çıktısından türetilir (ayrı sorgu gerekmez).
- Soru 4 (`eczaneOkutma`) ve 5 (`urun_tiklamalar` top) mevcut/eklenecek küçük GROUP BY sorguları.
- Soru 6 potansiyel büyük → ilk 100 gömülür + toplam sayı; arama gömülü 100 içinde çalışır (yeterli; tam liste "Kartı Eksik Eczaneler" için Excel raporunda zaten var).
- Soru 7 hiyerarşi ağacındaki `ekipZiyaret`'ten türetilir (bölge müdürü düğümleri).

---

## 3. Backend — `app.js` GET `/` handler

- `aktifGrup==='calisanlar'` ve `tab==='organizasyon'` durumunda: firmanın tüm çalışanlarını (`id, ad, soyad, unvan, amiri_id, ekip_yoneticisi`) + son 90 gün kişi-başı ziyaret sayılarını (`ziyaretler` GROUP BY calisan_id) çek → `hiyerarsiAgaciKur(...)` → `hiyerarsiAgaci` olarak view'e geçir.
- `aktifGrup==='saha'` (kurumsal) durumunda mevcut `sahaIstatistik`'e ek olarak:
  - saha mümessillerinin son 30/90 gün ziyaret sayısı + son ziyaret tarihi → `mumessilPerformansi(...)` → `sahaIstatistik.performans` (soru 1-2-3 buradan türetilir).
  - `sahaIstatistik.akilliSorular` = { enAktifEczaneler (top10 okutma), enCokTiklananUrunler (top10), kartiEksikEczaneler: { sayi, liste: ilk100 }, bolgePerformans (hiyerarşi ağacından bölge müdürü ekipZiyaret'leri), indirimOzeti: { uretilen, kullanilan, oran } }.
  - Bu ek sorgular küçük GROUP BY/COUNT'lardır; mevcut `eczaneOkutma`/`tiklamaDagilimi` sorgularının yanına eklenir.
- Render payload'a `hiyerarsiAgaci` eklenir (organizasyon sekmesi için).

---

## 4. Frontend — `dashboard.ejs`

**A) Organizasyon sekmesi (Çalışanlar grubu)**
- Sekme linki: `dash-tabs` içindeki `aktifGrup==='calisanlar'` bloğuna `<a href="/?tab=organizasyon">Organizasyon</a>`.
- İçerik (`tab==='organizasyon'`): `hiyerarsiAgaci` özyinelemeli render — iç içe girintili liste. Yöneticiler (`ekip_yoneticisi` veya çocuğu olanlar) `<details open>` ile aç/kapa; her satır: **ad soyad · ünvan · 👥 ekip ziyaret: N** (mümessil için 🧍 kendi ziyaret: N). Girinti seviyeye göre. EJS partial/yardımcı fonksiyonla özyineleme.

**B) Saha Raporları — Akıllı Sorular (Saha grubu, `tab==='saha'`)**
- En üstte **soru chip bar'ı**: her `akilliSorular` maddesi bir buton (emoji + kısa başlık). Varsayılan ilk soru (⭐ En çok ziyaret) açık gelir.
- Her sorunun rapor kartı sayfaya **gömülü ama gizli** render edilir (`<div class="soru-rapor" data-soru="1">…`). Chip'e tıklayınca JS ilgili kartı gösterir, diğerlerini gizler, aktif chip'i işaretler → **anlık, ağ isteği yok**.
- Küçük raporlar (1-5, 7, 8) tablo/özet kartı. Büyük rapor (6, kartı eksik eczaneler) tablo + **arama kutusu** (gömülü ilk 100 içinde `input`'ta anlık filtre).
- Mevcut **grafikler** (günlük ziyaret, temsilci başına, eczane okutma, tıklama dağılımı) ayrı bir "📊 Grafikler" chip'i altında toplanır (aynı göster/gizle mantığı; Chart.js ilk gösterimde init).
- **Excel'e Aktar** ve **ziyaret notları** (gizlilik gereği içerik göstermez) chip bar'ın altında sabit küçük bir satırda kalır.

**JS davranışı (vanilla, tek dosya içi script):**
- `soruGoster(no)`: tüm `.soru-rapor` gizle, seçileni göster, chip'lerin `active` sınıfını güncelle. Grafik chip'i ilk kez açıldığında Chart init edilir (tekrar init'i önlemek için bayrak).
- `tabloAra(inputId, tabloId)`: `input` olayında büyük/küçük harf duyarsız `includes` ile satırları gizle/göster (soru 6 için).

---

## 5. Test

- **Birim (jest):** `tests/sahaAnaliz.test.js` —
  - `hiyerarsiAgaciKur`: 3 kademeli örnek ağaç → doğru iç içe yapı; `ekipZiyaret` alt ağaç toplamı doğru; amiri_id null kökler; kopuk amiri_id güvenli.
  - `mumessilPerformansi`: 60+ gün / hiç ziyaret → `geride`; üst %20 → `yildiz`; sıralama geride-önce.
- **Tarayıcı smoke:** Orzax paneline giriş → Organizasyon sekmesinde ağaç (GM→müdür→bölge→mümessil) görünüyor, aç/kapa çalışıyor; Saha'da **akıllı soru chip'lerine tıklayınca ilgili rapor anında** açılıyor (⭐ en çok ziyaret, ⚠️ 60+ gün geride üstte, 🏆 en aktif eczaneler, 💊 en çok ürün, 🪪 kartı eksik + arama, 🗺️ bölge performansı, 🎁 indirim özeti, 📊 grafikler); kartı-eksik aramada filtre çalışıyor.

---

## Kapsam dışı (YAGNI)

- Ziyaret notu içeriğini web'de göstermek (gizlilik kararı korunur — sadece bağlı yöneticiye mobilde).
- Yeni grafik türü/harita eklemek.
- `dashboard.ejs`'i tam yeniden yazmak — yalnızca ilgili iki bölüm (Organizasyon + Saha) düzenlenir.
- Sunucu tarafı sayfalama (arama client-side; ilk-100 limiti yeterli).
