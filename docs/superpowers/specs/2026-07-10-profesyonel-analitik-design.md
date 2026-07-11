# Profesyonel Analitik Deneyimi — Tasarım

**Tarih:** 2026-07-10
**Durum:** Onaylandı, implementasyona alınmadı — yapılacaklar listesinde bekliyor.
**Bağlam:** [2026-07-10-panel-redesign-oneri.md](2026-07-10-panel-redesign-oneri.md)'deki "Genel Bakış" (Yaklaşım A) önerisinin genişletilmiş hali.

## Amaç

Firma sahibine (CEO gözüyle) "profesyonel yazılım" hissi veren, ham veri yerine hazır yorumlanmış görsel sunum sağlayan bir analitik deneyimi kurmak. Mevcut altyapı: Chart.js zaten yüklü (sadece Saha İstatistikleri sekmesinde kullanılıyor), veri zaten toplanıyor (raf_okutmalar, raf_tiklamalar, ziyaretler, indirim_kodlari, urun_tiklamalar, link_tiklama), ama sunum düz tablo/sayı halinde.

## 1. Genel Bakış Ana Ekranı

Girişte varsayılan sekme "Çalışanlar" yerine yeni bir "Genel Bakış" olur. 5-6 KPI kartı:
- Her kartta büyük rakam + **sparkline** (mini trend çizgisi, son 30 gün)
- Bir önceki eşdeğer döneme göre **% değişim göstergesi** (↑/↓ ok + renk)

Gerekli: mevcut sorgulara bir önceki dönemle karşılaştırma eklenmesi (ör. `WHERE created_at >= NOW() - INTERVAL '30 days'` yanına `WHERE created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'`).

## 2. Çeşitlendirilmiş Görselleştirme

- **Aktivite ısı haritası:** Son 90 günün her günü bir kare (CSS grid), renk yoğunluğu o günkü toplam okutma/ziyaret sayısına göre. Yeni kütüphane gerekmez.
- **Dağılım grafiği:** Mevcut "tıklama dağılımı" düz listesi Chart.js donut/pasta grafiğe çevrilir.
- **Liderlik tablosu:** En aktif 10 temsilci, en çok okutulan 10 eczane — sıralı liste + rozet (🥇🥈🥉).

## 3. Gelişmiş Excel Raporu

Mevcut tek-sayfalık ziyaret listesi (`/kurumsal/ziyaretler-excel`) çok sayfalı rapor kitabına dönüşür: Ziyaretler, Eczane Bazlı Özet, Temsilci Bazlı Özet, İndirim Kullanımı — her biri ayrı sekmede.

**Teknik sınır (implementasyon öncesi netleştirilmeli):** Kullanılan `xlsx` (SheetJS) paketinin (community/free sürüm, `^0.18.5`) hücre renklendirme/kalın yazı gibi görsel stilleri güvenilir şekilde desteklemediği biliniyor. Çok sayfalı, düzenli veri yapısı garanti; "renkli, tasarlanmış" görünüm için ek kütüphane (ör. `exceljs`) değerlendirilmesi gerekebilir — implementasyon başında karar verilecek.

## 4. Talebe Bağlı PDF Özet Raporu

"Haftalık/Aylık Özet İndir" butonu — bugünkü NFCKartify-Sunum.pdf'in üretildiği yöntemle aynı (HTML yaz → headless Chrome ile `--print-to-pdf`). İçerik: firma logosu, KPI'lar, Chart.js grafiklerinin görüntüleri (canvas'tan PNG olarak alınıp PDF'e gömülür), markalı ve yönetim kuruluna iletilebilir formatta.

## Öncelik / Bağımlılık Sırası

1. Genel Bakış + trend göstergeleri (temel, diğerleri buna oturur)
2. Görselleştirme çeşitliliği (ısı haritası, donut, liderlik tablosu)
3. Gelişmiş Excel raporu (stil kütüphanesi kararı gerekiyor)
4. PDF özet raporu (1 ve 2'nin çıktısını kullanır, en son yapılmalı)

## Not

Mevcut teknoloji yığını korunur (EJS + vanilla CSS + Chart.js), framework değişikliği yapılmaz.
