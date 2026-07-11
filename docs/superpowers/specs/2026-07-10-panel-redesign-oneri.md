# Yönetim Paneli (Dashboard) Redesign — Öneri

**Tarih:** 2026-07-10
**Durum:** Onaylandı, implementasyona alınmadı — yapılacaklar listesinde bekliyor.
**Kapsam:** `views/public/dashboard.ejs` (1157 satır)

## Bulgular

### 1. Bilgi mimarisi (asıl "karışık" hissin kaynağı)
- 9 düz sekme, gruplama yok: Çalışanlar, İstatistik, Link Analytics, Excel Yükle, İçerik, Ürünler, İndirim, Raf Kartları, Saha İstatistikleri.
- 3 ayrı "istatistik" sekmesi var (İstatistik, Link Analytics, Saha İstatistikleri) — isimler birbirine çok yakın, hangisinde ne olduğu tahmin edilemiyor.
- "Excel Yükle" bağımsız üst sekme ama aslında Çalışanlar'ın alt-işlevi (toplu ekleme).
- Basic paket firma 4 sekme görüyor, kurumsal firma 9 — aradaki fark büyük, kurumsal kullanıcı ilk girişte boğuluyor.

**Öneri:** Sekmeleri 4 mantıksal gruba topla:
- **Çalışanlar** (alt-sekmeler: liste, İstatistik, Link Analytics, Excel Yükle)
- **Eczane Ağı** (alt-sekmeler: Raf Kartları, İndirim)
- **İçerik**
- **Saha Raporları**

### 2. Tasarım sistemi tanımlı ama tutarsız uygulanıyor
`:root`'ta `--success` (#22c55e), `--danger` (#ef4444), `--text-faint` (#444440) gibi değişkenler tanımlı ama kod genelinde en az 10+ yerde ham hex renk kullanılıyor, tanımlı değişkenlerle uyuşmuyor:
```
style="color:#2e7d32"   → --success değil, farklı yeşil
style="color:#9ca3af"   → --text-faint değil, farklı gri
style="color:#b45309"   → "onay bekliyor" için tanımlı değişken yok
style="color:#b91c1c"   → --danger değil, farklı kırmızı
```
Ayrıca "Kaldır" / "Yazıldı işaretle" gibi bazı butonlar `.btn` class'ı almıyor, tarayıcı varsayılan görünümünde kalıyor.

**Öneri:**
- Mevcut hex renkleri ilgili CSS değişkenlerine bağla.
- "Onay bekliyor" turuncusu için yeni `--warning` değişkeni ekle.
- Sınıfsız butonlara `.btn.btn-sm` (veya `.btn-danger-sm`) uygula.

### 3. Bağlamsız üst buton
Header'daki "+ Yeni Çalışan" butonu tüm sekmelerde sabit duruyor (Raf Kartları, İndirim gibi alakasız sekmelerde de görünüyor).

**Öneri:** Sadece Çalışanlar sekmesinde göster.

## Öncelik Sırası
1. Renk/buton tutarlılığı — hızlı, düşük risk
2. Bağlamsız buton düzeltmesi — hızlı, düşük risk
3. Sekme gruplaması — en büyük etki, en çok emek (backend `tab` query parametresi ve routing mantığı da güncellenmeli)

## Not
Mevcut teknoloji yığını (EJS + vanilla CSS, framework yok) korunacak, yeniden yazım yapılmayacak — sadece hedefli iyileştirmeler uygulanacak.
