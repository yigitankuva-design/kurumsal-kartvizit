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

## 3. Backend — `app.js` GET `/` handler

- `aktifGrup==='calisanlar'` ve `tab==='organizasyon'` durumunda: firmanın tüm çalışanlarını (`id, ad, soyad, unvan, amiri_id, ekip_yoneticisi`) + son 90 gün kişi-başı ziyaret sayılarını (`ziyaretler` GROUP BY calisan_id) çek → `hiyerarsiAgaciKur(...)` → `hiyerarsiAgaci` olarak view'e geçir.
- `aktifGrup==='saha'` (kurumsal) durumunda mevcut `sahaIstatistik`'e ek olarak: saha mümessillerinin son 30/90 gün ziyaret sayısı + son ziyaret tarihi → `mumessilPerformansi(...)` → `sahaIstatistik.performans` olarak ekle.
- Render payload'a `hiyerarsiAgaci` eklenir (organizasyon sekmesi için).

---

## 4. Frontend — `dashboard.ejs`

**A) Organizasyon sekmesi (Çalışanlar grubu)**
- Sekme linki: `dash-tabs` içindeki `aktifGrup==='calisanlar'` bloğuna `<a href="/?tab=organizasyon">Organizasyon</a>`.
- İçerik (`tab==='organizasyon'`): `hiyerarsiAgaci` özyinelemeli render — iç içe girintili liste. Yöneticiler (`ekip_yoneticisi` veya çocuğu olanlar) `<details open>` ile aç/kapa; her satır: **ad soyad · ünvan · 👥 ekip ziyaret: N** (mümessil için 🧍 kendi ziyaret: N). Girinti seviyeye göre. EJS partial/yardımcı fonksiyonla özyineleme.

**B) Saha Raporları yeniden düzeni (Saha grubu, `tab==='saha'`)**
- Üst kısımda **Performans** bölümü: `sahaIstatistik.performans` tablosu — sütunlar: Mümessil, Son 30g ziyaret, Son ziyaret tarihi, Durum (⭐ Yıldız / ⚠️ Geride / —). Üstüne **arama kutusu** (isimle anlık filtre, client-side JS).
- Grafikler (günlük ziyaret, temsilci başına, eczane okutma, tıklama dağılımı) tek bir `<details open>` "Grafikler" bölümünde.
- Uzun listeler `<details>` (kapalı başlar) içine alınır: "60+ gün ziyaret edilmeyen eczaneler" ve "eczane-bazlı tıklama detayı". Her birine **arama kutusu** + görünen satırları **ilk 100** ile sınırla, arama tümünde çalışsın.
- Ziyaret notları bloğu (gizlilik gereği zaten içerik göstermiyor) `<details>` (kapalı) içine alınır.

**Ortak arama davranışı:** Her arama kutusu, kendi tablosunun/listesinin satırlarını `input` olayında büyük/küçük harf duyarsız `includes` ile gizler/gösterir. Vanilla JS, tek küçük yardımcı fonksiyon (`tabloAra(inputId, tabloId)`).

---

## 5. Test

- **Birim (jest):** `tests/sahaAnaliz.test.js` —
  - `hiyerarsiAgaciKur`: 3 kademeli örnek ağaç → doğru iç içe yapı; `ekipZiyaret` alt ağaç toplamı doğru; amiri_id null kökler; kopuk amiri_id güvenli.
  - `mumessilPerformansi`: 60+ gün / hiç ziyaret → `geride`; üst %20 → `yildiz`; sıralama geride-önce.
- **Tarayıcı smoke:** Orzax paneline giriş → Organizasyon sekmesinde ağaç (GM→müdür→bölge→mümessil) görünüyor, aç/kapa çalışıyor; Saha'da Performans tablosunda ⚠️ geride mümessiller üstte, arama filtreliyor; uzun listeler accordion + arama ile toparlanmış.

---

## Kapsam dışı (YAGNI)

- Ziyaret notu içeriğini web'de göstermek (gizlilik kararı korunur — sadece bağlı yöneticiye mobilde).
- Yeni grafik türü/harita eklemek.
- `dashboard.ejs`'i tam yeniden yazmak — yalnızca ilgili iki bölüm (Organizasyon + Saha) düzenlenir.
- Sunucu tarafı sayfalama (arama client-side; ilk-100 limiti yeterli).
