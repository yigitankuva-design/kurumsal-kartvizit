# Yapılacaklar Listesi — Uygulama Planı (5 Madde)

**Tarih:** 2026-07-10
**Durum:** Taslak — implementasyona başlanmadı, onay bekliyor.

Bu doküman 5 backlog maddesinin tamamını tek yerde topluyor. Her bölüm görev listesi halinde — tam kod detaylı TDD adımları (`docs/superpowers/plans/` altındaki diğer planlarda olduğu gibi) her madde uygulamaya alınırken ayrıca yazılacak. **Panel Redesign Faz 1 için zaten tam detaylı bir plan var:** [2026-07-10-panel-redesign-faz1.md](2026-07-10-panel-redesign-faz1.md) — o çalışmaya hazır, aşağıda sadece özetlenmiştir.

Referans spec'ler:
- [2026-07-10-panel-redesign-oneri.md](../specs/2026-07-10-panel-redesign-oneri.md)
- [2026-07-10-olcek-sorunlari-design.md](../specs/2026-07-10-olcek-sorunlari-design.md)
- [2026-07-10-islem-gecmisi-audit-log-design.md](../specs/2026-07-10-islem-gecmisi-audit-log-design.md)
- [2026-07-10-profesyonel-analitik-design.md](../specs/2026-07-10-profesyonel-analitik-design.md)
- [2026-07-10-toplu-sifre-gonderme-design.md](../specs/2026-07-10-toplu-sifre-gonderme-design.md)

---

## 1. Panel Redesign

**Kapsam:** `views/public/dashboard.ejs`

### Faz 1 — Renk/buton tutarlılığı (plan hazır, ayrı dosyada)
`--warning` değişkeni, 13 ham hex rengin değişkenlere bağlanması, 26 sınıfsız butonun `.btn` sistemine alınması, "+ Yeni Çalışan" butonunun bağlamsallaştırılması. Detay: `2026-07-10-panel-redesign-faz1.md` (5 görev).

### Faz 2 — Emoji → SVG ikon seti
- Task 1: Mevcut altın/koyu temaya uyan, tek çizgi kalınlıklı bir ikon seti belirle/oluştur (ör. Heroicons outline tarzı, inline SVG olarak — dış CDN bağımlılığı yok).
- Task 2: Panelde 22 emoji kullanımını (empty-state ikonları, buton önekleri, durum işaretleri) karşılık gelen SVG ile değiştir.
- Task 3: Tarayıcıda tüm sekmelerde görsel doğrulama.

### Faz 3 — Buton hiyerarşisi + rozet tasarımı
- Task 1: Az kullanılan aksiyonlar (ör. "Kaldır") için üçüncü seviye `.btn-link` (sade metin) sınıfı ekle, ilgili butonlara uygula.
- Task 2: `.badge` bileşenini pill-shape yerine status-dot + metin olarak yeniden tasarla (`badge-aktif`/`badge-pasif`/onay bekliyor durumları dahil).
- Task 3: Tarayıcıda doğrulama.

### Faz 4 — Yükleniyor durumu
- Task 1: Form submit butonlarına tıklanınca kısa süreli "Kaydediliyor..." durumu gösteren ortak bir JS yardımcı fonksiyonu (`formYukleniyorGoster`) ekle.
- Task 2: Excel yükleme, foto yükleme gibi süre alan formlara uygula.
- Task 3: Tarayıcıda doğrulama (gerçek bir form submit ile).

### Faz 5 — Açık tema
- Task 1: `:root` içindeki renk değişkenlerini `[data-theme="dark"]` altına taşı, `[data-theme="light"]` için ikinci bir set tanımla.
- Task 2: Nav'a tema anahtarı (toggle) ekle, `localStorage`'da tercih sakla, sayfa yüklenirken uygula (flash-of-wrong-theme'i önlemek için `<head>` içinde erken bir inline script).
- Task 3: Her iki temada da tüm sekmelerde kontrast/okunabilirlik kontrolü (tarayıcıda).

### Faz 6 — Sekme gruplama + imza an
- Task 1: Backend: `tab` query param mantığını 4 ana gruba göre yeniden düzenle (Çalışanlar/Eczane Ağı/İçerik/Saha Raporları), alt-sekme state'i ekle.
- Task 2: `dashboard.ejs`'te iki seviyeli sekme UI'ı (ana grup + alt sekme).
- Task 3: KPI kartlarına ince altın parıltı (glow) efekti — "imza an" detayı.
- Task 4: Tam test + tarayıcıda tüm sekme kombinasyonlarını doğrulama + deploy.

---

## 2. Arama/Sayfalama + Rol Ayrımı

**Kapsam:** `app.js`, `views/public/dashboard.ejs`, (rol ayrımı için) yeni auth katmanı.

### Faz 1 — Çalışan listesi arama + sayfalama
- Task 1: `app.js`'teki `calisanlarResult` sorgusuna `ILIKE` arama (ad/soyad/email) + `LIMIT`/`OFFSET` ekle, `sayfa`/`ara` query paramları.
- Task 2: `dashboard.ejs` Çalışanlar sekmesine arama kutusu + sayfalama kontrolleri (Önceki/Sonraki).
- Task 3: Test (`tests/kurumsal.test.js` veya yeni dosya) — arama filtreleme, sayfalama sınırları.
- Task 4: Tarayıcıda doğrulama.

### Faz 2 — Eczane listesi arama + sayfalama
Aynı desen, `eczaneler` sorgusuna ve Raf Kartları sekmesine uygulanır.

### Faz 3 — Rol ayrımı (büyük mimari iş, ayrı detaylı plan gerektirir)
- Task 1: `firma_kullanicilari` tablosu (email, şifre hash, rol: `tam_yetkili`/`sadece_calisan`/`sadece_saha`, firma_id).
- Task 2: Panel girişini bu tabloyu da kontrol edecek şekilde genişlet (mevcut `firmalar.yetkili_email` akışıyla birlikte çalışmalı, geriye dönük uyumluluk).
- Task 3: Rol bazlı route koruması (middleware) — `sadece_calisan` rolü Raf Kartları/İndirim/Saha Raporları route'larına erişemez, vb.
- Task 4: Firma sahibinin panelden yeni kullanıcı davet edebileceği UI.
- Task 5: Tam test + deploy.

**Not:** Faz 3 kendi başına Faz 1-2'den çok daha büyük — sıraya geldiğinde ayrı, tam detaylı bir TDD planı yazılacak.

---

## 3. İşlem Geçmişi (Audit Log)

**Kapsam:** `scripts/migrate.js`, yeni `utils/islemGecmisi.js`, `routes/kurumsal.js`, `views/public/dashboard.ejs`.

- Task 1: DB migration — `islem_gecmisi` tablosu (spec'teki şema).
- Task 2: `utils/islemGecmisi.js` — `islemKaydet(firmaId, islem, hedefTip, hedefId, aciklama)` yardımcı fonksiyonu (test edilir).
- Task 3: Riskli route'lara entegrasyon — çalışan/eczane sil, pasife-al, toplu-işlem, indirim-ayar, giriş bilgisi değişikliği (her biri için tek satırlık `islemKaydet(...)` çağrısı).
- Task 4: Yeni panel sekmesi/sayfası — ters kronolojik liste.
- Task 5: Tam test + deploy + prod doğrulama.

---

## 4. Profesyonel Analitik

**Kapsam:** `app.js`, `views/public/dashboard.ejs`, `routes/kurumsal.js` (Excel/PDF uçları).

### Faz 1 — Genel Bakış ekranı + trend göstergeleri
- Task 1: Yeni "Genel Bakış" sekmesi/varsayılan sekme.
- Task 2: KPI sorgularına önceki dönemle karşılaştırma (`% değişim`) ekle.
- Task 3: Sparkline mini-grafik (Chart.js, küçük boyutlu).
- Task 4: Tarayıcıda doğrulama.

### Faz 2 — Görselleştirme çeşitliliği
- Task 1: Aktivite ısı haritası (CSS grid, son 90 gün).
- Task 2: Tıklama dağılımı → Chart.js donut grafiği.
- Task 3: Liderlik tablosu (en aktif temsilciler/eczaneler).

### Faz 3 — Gelişmiş Excel raporu
- Task 1: Stil kütüphanesi kararı (mevcut `xlsx` sınırlı, `exceljs` değerlendirmesi).
- Task 2: Çok sayfalı workbook (Ziyaretler, Eczane Özeti, Temsilci Özeti, İndirim Kullanımı).

### Faz 4 — PDF özet raporu
- Task 1: HTML şablonu (bugünkü sunum PDF'i deseniyle aynı).
- Task 2: Chart.js grafiklerini canvas→PNG olarak PDF'e gömme.
- Task 3: "Haftalık/Aylık Özet İndir" endpoint'i + buton.

---

## 5. Toplu Şifre Gönderme

**⚠️ ÖN KOŞUL — BLOKE:** SMTP bilgileri (host/port/kullanıcı/şifre) kullanıcıdan alınmadan bu madde başlayamaz.

- Task 1: `nodemailer` bağımlılığı + `.env`'e `SMTP_HOST/PORT/USER/PASS`.
- Task 2: `utils/eposta.js` — mail gönderme yardımcı fonksiyonu.
- Task 3: `utils/sifreUret.js` — okunaklı rastgele şifre üretimi (TDD).
- Task 4: `POST /kurumsal/calisan/sifre-gonder` ucu (spec'teki mail-önce-gönder-sonra-kaydet mantığı).
- Task 5: Panel UI — checkbox + "Seçilenlere Gönder"/"Giriş Bilgisi Olmayan Herkese Gönder" butonları.
- Task 6: Tam test + deploy + prod doğrulama.

---

## Önerilen Uygulama Sırası

1. Panel Redesign Faz 1 (plan zaten hazır, en hızlı başlangıç)
2. Arama/Sayfalama Faz 1-2 (rol ayrımı hariç — hızlı, yüksek etki)
3. İşlem Geçmişi (bağımsız, orta boy)
4. Panel Redesign Faz 2-6 (kalan tasarım işleri)
5. Profesyonel Analitik (en büyük, çok fazlı)
6. Rol Ayrımı (Madde 2 Faz 3 — büyük mimari iş, ayrı plan)
7. Toplu Şifre Gönderme (SMTP bilgisi geldiğinde)

Her madde/faz başlamadan önce onay istenecek, implementasyona geçilmeyecek.
