# Orzax Demo/Test Veri Simülasyonu — Tasarım (Spec)

**Tarih:** 2026-07-12
**Amaç:** Orzax firmasını baz alan, gerçekçi ve büyük ölçekli bir demo/test veri seti üreten tek bir tekrar-çalıştırılabilir seed script'i. Hem müşteri adaylarına canlı demo, hem de sistemin ölçekte testi için.

**Mimari:** `scripts/seed-orzax.js` — Node + `pg` (mevcut), `bcrypt` (mevcut). Ek bağımlılık yok. Türkçe isim/şehir dizileri script içinde gömülü. Çalışınca önce firma-kapsamlı test verisini temizler, sonra Orzax'ı sıfırdan doldurur. İdempotent: her çalıştırışta aynı temiz demo'yu üretir (reset gibi).

**Tech Stack:** Node.js/Express backend, PostgreSQL (Railway), `pg`, `bcrypt`.

---

## 1. Güvenlik & temizlik stratejisi

Kullanıcı onayı: **canlı DB ama gerçek ödeme yapan müşteri yok** — sadece test verisi var, hepsini silmek güvenli.

**Korunacak (SİLİNMEZ):**
- `bayiler` (panele giriş yapılan bayi hesapları) — Orzax bu bayiye bağlanır.
- `session` (aktif oturumlar).
- `odemeler`, `kredi_hareketleri` (mali geçmiş; `firma_id` referansları `ON DELETE SET NULL`).

**Silinecek:**
- `DELETE FROM firmalar` → CASCADE ile şunları temizler: `calisanlar`, `eczaneler`, `ziyaretler`, `raf_okutmalar`, `raf_tiklamalar`, `eczaci_okutmalar`, `eczaci_tiklamalar`, `urunler`, `urun_tiklamalar`, `indirim_kodlari`, `firma_kullanicilari`, `islem_gecmisi`, `link_tiklama`.

**Bayi seçimi:** Script, Orzax'ı bağlamak için mevcut bir bayi arar. Öncelik: `bayiler` içinde `aktif = true` olan ilk kayıt (id'ye göre). Hiç bayi yoksa script hata verip durur (yanlışlıkla boş DB'ye çalışmayı önler).

**İdempotentlik:** Script her çalıştığında `firmalar` tamamen silinir ve Orzax yeniden üretilir. Bu, "canlı ama müşteri yok" kabulüne dayanır ve script başında büyük harfli bir uyarı + 3 saniye bekleme ile teyit edilir.

---

## 2. Firma: Orzax

`firmalar` tablosuna tek kayıt:

| Alan | Değer |
|------|-------|
| ad | `Orzax` |
| slug | `orzax` |
| sektor | `saglik` (veya mevcut kurumsal sektör değeri) |
| paket | kurumsal paket değeri (eczane/raf özelliklerini açan; `requireKurumsalPaket`'in kabul ettiği değer — plan aşamasında grep ile doğrulanacak) |
| yetkili_email | `panel@orzax.com` |
| yetkili_sifre_hash | bcrypt(`orzax2026`) |
| bayi_id | seçilen mevcut bayi |
| website | `www.orzax.com` |
| instagram | `orzaxturkiye` |
| linkedin | `https://www.linkedin.com/company/orzaksilac/` |
| twitter | `orzaxturkiye` |
| whatsapp | `05075847646` |
| katalog_url | placeholder PDF yolu (mevcut örnek) |
| katalog_guncelleme_tarihi | ~3 gün önce (bildirim demosu için, bkz. §9) |
| eczaci_baslik | "Eczacılara Özel Orzax İçeriği" |
| eczaci_metin | kısa tanıtım metni |
| eczaci_pdf_url | placeholder PDF |
| eczaci_video_url | bir YouTube linki (Orzax tanıtım) |
| indirim_aktif | `true` |
| indirim_yuzdesi | `5` |
| tema_renk | `#c8a84b` (marka altını) |

**firma_kullanicilari (rol demosu):** Orzax'a 3 rol kullanıcısı:
- `tam@orzax.com` → `tam_yetkili`
- `saha@orzax.com` → `sadece_saha`
- `calisan@orzax.com` → `sadece_calisan`
- Hepsinin şifresi `orzax2026`.

---

## 3. Hiyerarşi (59 kişi — `calisanlar`)

Hepsi `firma_id = Orzax`, `onayli = true`, benzersiz `slug`, `giris_email` + bcrypt(`orzax2026`). Hiyerarşi `amiri_id` zinciriyle, yöneticiler `ekip_yoneticisi = true`.

```
Genel Müdür (1)  — amiri yok, ekip_yoneticisi=true
├── Satış Müdürü      — amiri=GM, ekip_yoneticisi=true
│   ├── Bölge Müdürü: Marmara   → 10 mümessil
│   └── Bölge Müdürü: Ege       → 10 mümessil
├── Ürün Müdürü       — amiri=GM, ekip_yoneticisi=true
│   ├── Bölge Müdürü: İç Anadolu → 10 mümessil
│   └── Bölge Müdürü: Akdeniz    → 10 mümessil
└── Ticaret Müdürü    — amiri=GM, ekip_yoneticisi=true
    └── Bölge Müdürü: Karadeniz  → 10 mümessil
```

- Toplam: 1 GM + 3 müdür + 5 bölge müdürü + 50 mümessil = **59 kişi**.
- Mümessiller `ekip_yoneticisi=false`, `amiri_id` = kendi bölge müdürü.
- Bölge müdürleri `amiri_id` = bağlı oldukları fonksiyon müdürü.
- `unvan` alanları: "Genel Müdür", "Satış Müdürü", "Ürün Müdürü", "Ticaret Müdürü", "Bölge Müdürü", "Tıbbi Mümessil".
- İsimler: gömülü Türkçe ad/soyad dizilerinden rastgele, tekrarsız.
- `karta_yazildi`: mümessillerin ~%70'i `true` (kaos).

---

## 4. Eczaneler (1000 — `eczaneler`)

- Hepsi `firma_id = Orzax`.
- **Bölgesel dağıtım:** her bölgeye 200 eczane; o bölgenin şehir/ilçelerine yayılmış (§8 coğrafya).
- `ad`: "<İlçe/Semt> Eczanesi", "<Soyad> Eczanesi" gibi gerçekçi kalıplar.
- `adres`: "<Mahalle>, <İlçe>/<Şehir>".
- `kod`: benzersiz raf kartı kodu (mevcut kod üretim mantığıyla uyumlu; kısa alfanümerik).
- `eczaci_kod`: benzersiz eczacı kartı kodu.
- `onayli = true`, `durum = 'aktif'` (küçük bir kısmı `pasif` — kaos).

**Mümessil-eczane bağı:** Şemada `eczane → calisan` kolonu yok; bağ **ziyaretlerle** kurulur (§7). Her mümessile kendi bölgesinden ~20 eczane "atanmış" kabul edilir (script içinde eşleme tutulur), ziyaretler ve kart-yazma bu eşlemeye göre üretilir.

**Kart durumu (kaos, gerçekçi):**
- `musteri_karta_yazildi`: ~%80 `true`; bunların ~%30'u `musteri_kart_kilitli=true`. Yazma tarihi son 150 güne dağılmış.
- `eczaci_karta_yazildi`: ~%70 `true`; bunların ~%25'i `eczaci_kart_kilitli=true`.
- Geri kalanı yazılmamış (mümessilin yapması gereken işler).

---

## 5. Ürünler (24 — `urunler`)

Orzax vitamin serisinden gerçek 24 ürün (orzax.com.tr'den alındı), `firma_id = Orzax`, `aktif=true`, `sira` sıralı:

Ocean A Vitamini, Ocean E Vitamini Kapsül, Ocean Daily One Energy Tablet, Ocean Gummies D3K2, Ocean Gummies Multivitamin Adult, Ocean Vitamin C 1000mg Tablet, Ocean Gummies Vitamin D3, Ocean Vitamin C-SR Tablet, Ocean B Complex Kapsül, Ocean Methyl B12 500 µg 5 ml Sprey, Ocean Methyl B12 1000 µg 5 ml Sprey, Ocean Methyl B12 1000 µg 10 ml Sprey, Ocean Microfer Kapsül, Ocean VM Arginin PS Likit, Ocean Microfer Likit, Ocean Methyl Folat Tablet, Ocean Biotin Kapsül, Efervit Sambucus Nigra Kara Mürver 20 Efervesan Tablet, Efervit Defence 20 Efervesan Tablet, Ocean VM Vitamin-Mineral Likit, Ocean Microfer Tablet, Efervit Vitamin C 1000 mg 20 Efervesan Tablet, Efervit Multivitamin Mineral 20 Efervesan Tablet, Ocean Multi Likit.

---

## 6. Zaman modeli (tüm aktivitede ortak)

Tüm aktivite (okutma, tıklama, ziyaret, kart yazma, indirim) **son ~150 güne (5 ay)** yayılır ve **artan trend** izler: ilk ayın hacmi düşük, son ayın hacmi yüksek (yaklaşık aya göre ağırlık 1×, 1.5×, 2×, 2.5×, 3×). Bu, panel grafiklerinde "büyüyen iş" hikayesi verir. `created_at` değerleri bu dağılıma göre rastgele üretilir.

---

## 7. Aktivite verisi

Yaklaşık hacimler (rastgele + ağırlıklı; kesin sayı önemli değil, "kaos" hissi önemli):

| Tablo | ~Hacim | Notlar |
|-------|--------|--------|
| `raf_okutmalar` | ~8.000 | `ip_hash` dolu; eczane bazlı ağırlıklı (bazı eczaneler çok popüler). |
| `raf_tiklamalar` | ~5.000 | `tip`: website/instagram/linkedin/twitter/whatsapp/katalog/urun dağılımı. |
| `eczaci_okutmalar` | ~4.000 | Eczacı kartı yazılı eczanelere. |
| `eczaci_tiklamalar` | ~2.500 | `tip`: pdf/video. |
| `urun_tiklamalar` | ~6.000 | **Ağırlıklı**: 3 ürün açık ara popüler (Ocean Gummies Multivitamin Adult, Ocean Vitamin C 1000mg, Ocean Gummies D3K2). |
| `ziyaretler` | ~4.000 | Mümessil↔eczane eşlemesine göre; `temsilci_notu` (~%40'ında), `lat/lng` (bölge şehirlerine yakın). |

**En aktif eczane / en popüler ürün:** okutma ve ürün tıklamaları belirgin zirveler oluşturacak şekilde ağırlıklandırılır (§ demo değeri).

---

## 8. Coğrafya (5 bölge)

| Bölge | Bölge Müdürü'nün amiri | Örnek şehirler |
|-------|------------------------|----------------|
| Marmara | Satış Müdürü | İstanbul, Bursa, Kocaeli, Tekirdağ, Balıkesir |
| Ege | Satış Müdürü | İzmir, Aydın, Manisa, Muğla, Denizli |
| İç Anadolu | Ürün Müdürü | Ankara, Konya, Kayseri, Eskişehir, Sivas |
| Akdeniz | Ürün Müdürü | Antalya, Adana, Mersin, Hatay, Isparta |
| Karadeniz | Ticaret Müdürü | Samsun, Trabzon, Ordu, Rize, Zonguldak |

Her bölgenin 200 eczanesi ve ziyaret GPS'leri o bölgenin şehirlerinin yaklaşık koordinatlarına (küçük rastgele sapmayla) düşer.

---

## 9. Performans farkı + 60 gün uyarısı + katalog bildirimi

**Performans farkı (mümessil bazlı):**
- ~%10 "yıldız" mümessil: yüksek ziyaret + yüksek kart-yazma oranı.
- ~%15 "geride" mümessil: son ziyareti **60-120 gün önce** → sistemin "60+ gün ziyaret edilmedi" uyarısını tetikler.
- Geri kalan: normal.

**Katalog bildirimi:** `firmalar.katalog_guncelleme_tarihi` ~3 gün önce. Mümessillerin bir kısmının `son_gorulen_katalog_tarihi` bu tarihten **önce** (yeni katalog banner'ı görünür), bir kısmının **sonra** (görmüş).

---

## 10. İndirim (600 eczane — `indirim_kodlari`)

- 1000 eczaneden rastgele **600'üne** `%5` indirim kodu (`yuzde=5`, benzersiz `kod`, rastgele `cerez_id`).
- Bunların ~%40'ı `kullanildi=true` + `kullanilma_tarihi` (son 150 güne dağılmış).

---

## 11. Çıktı: giriş bilgileri özeti

Script sonunda `docs/orzax-demo-giris-bilgileri.md` üretir (gitignore'lu — demo şifreleri içerir):
- Firma paneli: `panel@orzax.com` / `orzax2026`
- Rol kullanıcıları: tam/saha/calisan @orzax.com / `orzax2026`
- Genel Müdür + 3 müdür + 5 bölge müdürü + birkaç örnek mümessil: `giris_email` / `orzax2026`
- Birkaç örnek raf kartı ve eczacı kartı public URL'i (kod ile).
- Konsola da özet sayımlar basılır (kaç eczane, kaç ziyaret vb.).

---

## 12. Performans (script çalışma süresi)

1000 eczane + ~30.000 aktivite satırı. Tek tek INSERT yavaş olur → **çok-satırlı toplu INSERT** (chunk ~500) kullanılır. Tüm işlem tek transaction içinde; hata olursa rollback (yarım veri kalmaz).

---

## 13. Doğrulama (script sonrası)

1. Sayım sorguları: `firmalar`=1, `calisanlar`=59, `eczaneler`=1000, `ziyaretler`>0, `indirim_kodlari`=600.
2. Firma panelinde Orzax'a giriş → 1000 eczane, hiyerarşi, grafikler, saha istatistikleri görünüyor.
3. Mobil uygulamada bir mümessil ile giriş → ~20 eczane + ziyaret geçmişi.
4. Bir bölge müdürü ile giriş → ekip özeti (alt ekip ziyaretleri) görünüyor.
5. 60+ gün uyarısı tetiklenen mümessil panelde işaretli.

---

## Kapsam dışı (YAGNI)

- Yeni sistem özelliği/kod yazılmıyor; sadece mevcut özellikleri besleyen veri üretiliyor.
- Gerçek fotoğraf/PDF yükleme yok; mevcut placeholder yollar kullanılır.
- Faker vb. yeni bağımlılık eklenmez.
