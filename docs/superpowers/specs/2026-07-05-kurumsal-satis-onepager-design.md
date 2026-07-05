# Kurumsal Satış One-Pager'ları (Pharma + Gıda Takviyesi) Design

## Amaç

NFCKartify'ı kurumsal ilaç firmalarına ve gıda takviyesi firmalarına satmak için,
mevcut esnaf-odaklı broşürden (`Desktop/NFCKartify-Satis-Brosur.pdf`) tamamen
ayrı, B2B/kurumsal karar vericiye hitap eden iki adet PDF one-pager hazırlanır.

## Kapsam

**Dahil:** İki ayrı PDF one-pager:
1. **Pharma versiyonu** — eczane/mümessil/eczacı terminolojisiyle
2. **Gıda Takviyesi versiyonu** — satış noktası/diyetisyen terminolojisiyle, "eczane"
   kelimesi hiç geçmez

**Hariç (bu spec'in dışında, ayrı bir sonraki alt-proje):** Video prodüksiyonu
(motion graphics, seslendirme) — ayrı bir spec/plan döngüsünde ele alınacak.

## İçerik İskeleti (her iki dokümanda ortak)

1. **Başlık + değer önerisi** — tek cümlelik
2. **Sorun tanımı** — sahadaki ziyaret sonrası görünürlük eksikliği (kartvizit/katalog
   çöpe gidiyor, etkinin ölçülememesi)
3. **Çözüm — üç katman:**
   - Personel kartviziti (her iki versiyonda ortak)
   - Raf kartı / satış noktası kartı (pharma: eczane rafı, gıda takviyesi: mağaza/spor
     salonu rafı)
   - Pharma: **Eczacı kartı** (eğitim videosu/PDF, kampanya — eczacıya özel) /
     Gıda Takviyesi: **Satış noktası personeli/diyetisyen kartı** (aynı mekanizma,
     farklı isimlendirme ve içerik örnekleri)
4. **Ölçeklenebilirlik vurgusu** — 500-1000 mümessil ölçeğindeki firmalar için: Excel
   ile toplu yükleme + onay akışı (gerçek, çalışan özellik — İP-3) sayesinde yüzlerce
   personel/eczane tek tek elle girilmez
5. **Somut senaryo** — açıkça **"Örnek:"** etiketiyle işaretlenmiş varsayımsal kullanım:
   "Örneğin 5000 satış noktanızla (pharma: eczane, gıda takviyesi: satış noktası)
   çalıştığınızı düşünün — panelde hangi noktanın ne kadar aktif olduğunu görürsünüz."
   Gerçek veri gibi sunulmaz, net biçimde örnek/senaryo olduğu belirtilir.
6. **Güven bloğu (KVKK/veri güvenliği)** — kısa 2-3 madde: veri nerede tutuluyor,
   kim erişebiliyor, tenant izolasyonu (her firma sadece kendi verisini görür)
7. **Kapanış + CTA** — "Demo/görüşme talep edin", somut fiyat verilmez.
   İletişim: **Hasan Yiğit — 0507 584 76 46 — yigitankuva@gmail.com**

## Segment Farkları

| | Pharma | Gıda Takviyesi |
|---|---|---|
| Üçüncü katman adı | Eczacı Kartı | Satış Noktası/Diyetisyen Kartı |
| Terminoloji | eczane, mümessil, eczacı | satış noktası, saha temsilcisi, mağaza/diyetisyen |
| Örnek senaryo | "5000 eczane" | "5000 satış noktası (spor salonu, eczane-dışı mağaza, diyetisyen)" |

## Görsel Kimlik

Mevcut broşürden (lacivert başlık + mavi vurgu, kalın sans-serif) **farklı**, yeni
bir kurumsal kimlik:
- **Palet:** Koyu petrol yeşili/lacivert zemin + tek sıcak vurgu rengi (altın/amber),
  nötr griler
- **Tipografi:** Ciddi bir serif/yarı-serif başlık fontu + okunaklı sans-serif gövde
- **Düzen:** Bol boşluklu, numaralı/etiketli bölüm hiyerarşisi, maskot/robot görseli
  yok — sade geometrik sağlık-teknoloji imgeleri veya minimal ikonlar

## Üretim Hattı

1. İçerik bu spec'te onaylandığı haliyle iki ayrı HTML dosyası olarak yazılır
   (inline CSS, artifact-design ilkeleriyle — gerçek içerik, lorem yok)
2. Artifact aracıyla görsel olarak önizlenir, kullanıcı onayı alınır
3. Onay sonrası Chrome/Edge headless print (`--headless --print-to-pdf`) ile PDF'e
   dönüştürülür
4. Nihai PDF dosyaları kullanıcının masaüstüne kaydedilir

Bu üretim ana `kurumsal-kartvizit` kod tabanına dahil edilmez — ayrı, bağımsız
pazarlama materyali dosyaları olarak üretilir (repo dışında, örn. masaüstünde bir
klasörde).

## Test / Doğrulama

Bu bir yazılım özelliği olmadığı için TDD uygulanmaz. Doğrulama adımları:
- Her iki HTML dosyası Artifact'te görsel olarak gözden geçirilir (yazım hatası,
  içerik eksikliği, tasarım tutarlılığı kontrolü)
- Üretilen PDF dosyaları açılıp sayfa taşması/kesilme olmadığı doğrulanır
- İçerikteki tüm teknik iddiaların (Excel toplu yükleme, onay akışı, panel
  istatistikleri, QR yedek vb.) gerçekten kodda var olan özelliklere karşılık
  geldiği teyit edilir (bu session'da zaten yapılan doğrulamalarla tutarlı)
