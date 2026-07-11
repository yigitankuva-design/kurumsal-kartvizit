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

### 4. Emoji yerine gerçek ikon seti
Panelde 22 yerde 📦 🗑 ⏳ 🎁 gibi emoji fonksiyonel ikon olarak kullanılıyor — işletim sistemine/tarayıcıya göre farklı çizilir, "özenle tasarlanmış" değil "hızlıca eklenmiş" hissi verir.

**Öneri:** Mevcut altın/koyu temaya uyan, tek çizgi kalınlığında tutarlı bir SVG ikon seti ile değiştir.

### 5. Buton hiyerarşisi iki seviyede sıkışmış
Her yerde ya dolu altın buton ya da kenarlıklı (ghost) buton var — üçüncü, "düşük öncelikli" bir seviye (sade metin linki) neredeyse yok. Sonuç: her ekran "buton kalabalığı" gibi görünüyor.

**Öneri:** Az kullanılan aksiyonları (ör. "Kaldır", ikincil linkler) sade metin linkine çevir.

### 6. Rozetler hep aynı kalıpta
Aktif/pasif, onay bekliyor gibi tüm durumlar aynı hap-şekilli (pill) rozetle gösteriliyor.

**Öneri:** Küçük renkli nokta (status dot) + düz metin — Linear/Notion tarzı, daha az "template" hissi verir.

### 7. İşlem sırasında geri bildirim yok
"Kaydet"e tıklanınca buton olduğu gibi kalıyor, özellikle Excel yükleme gibi birkaç saniye süren işlemlerde kullanıcı işlemin tetiklendiğinden emin olamıyor.

**Öneri:** Tıklanınca kısa bir "Kaydediliyor..." durumu / spinner ekle.

### 8. Bir "imza an" yok
Altın/koyu renk paleti her yerde aynı yoğunlukta kullanılıyor, akılda kalan tek bir özenli detay yok.

**Öneri:** Örn. KPI kartlarındaki büyük rakamlara ince bir altın parıltı (glow) efekti gibi TEK göz alıcı detay.

### 9. Açık tema (light mode) yok
Panel şu an sadece koyu temada (`--bg: #1c1c20` sabit) — açık tema seçeneği yok.

**Öneri:** CSS değişkenleri zaten `:root` içinde merkezi tanımlı olduğu için açık tema eklemek görece düşük risk — `data-theme="light"` ile ikinci bir değişken seti + sağ üstte tema anahtarı (nav-right'a küçük bir toggle). Kullanıcının tercihi `localStorage`'da saklanır.

## Öncelik Sırası
1. Renk/buton tutarlılığı + emoji→ikon + rozet sadeleştirme — hızlı, düşük risk
2. Bağlamsız buton düzeltmesi + yükleniyor durumu — hızlı, düşük risk
3. Açık tema — orta emek, mevcut CSS değişken sistemi sayesinde nispeten kolay
4. Sekme gruplaması + "imza an" detayı — en büyük etki, en çok emek

## Not
Mevcut teknoloji yığını (EJS + vanilla CSS, framework yok) korunacak, yeniden yazım yapılmayacak — sadece hedefli iyileştirmeler uygulanacak.
