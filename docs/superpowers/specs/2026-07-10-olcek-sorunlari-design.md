# 300 Kişi Ölçeğinde Kritik Sorunlar — Tasarım

**Tarih:** 2026-07-10
**Durum:** Onaylandı, implementasyona alınmadı — yapılacaklar listesinde bekliyor.

## 1. Çalışan/Eczane Listelerinde Arama ve Sayfalama Yok

**Sorun:** `app.js`'teki `calisanlarResult` sorgusu (`SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC`) hiç `LIMIT` içermiyor — panel her açıldığında firmanın tüm çalışanları tek seferde yükleniyor ve render ediliyor. Aynı durum eczaneler listesinde de var. Arama kutusu da yok. 300 çalışanlı bir firmada panel yavaşlıyor ve istenen kişiyi bulmak elle kaydırma gerektiriyor.

**Öneri:**
- Çalışanlar ve Eczaneler tablolarına isim/e-posta bazlı arama kutusu eklenir (basit `ILIKE` sorgusu).
- Sayfalama eklenir (ör. 50'şer kayıt, "Sonraki/Önceki" butonları veya sonsuz kaydırma).
- Arama sırasında tab state (mevcut `tab` query param deseni) korunur.

## 2. Panelde Rol Ayrımı Yok — Tek Şifre Paylaşımı

**Sorun:** Panele giriş tek bir `firmalar.yetkili_email` / `yetkili_sifre_hash` üzerinden yapılıyor. İK'nın sadece çalışan ekleyebilmesi, saha müdürünün sadece ziyaret/eczane verisine erişebilmesi gibi bir ayrım mümkün değil.

**Öneri (ileride detaylandırılacak, şimdilik yön):** `firma_kullanicilari` gibi yeni bir tablo — firma sahibinin panelden ek kullanıcı davet edebilmesi, her birine bir rol (`tam_yetkili`, `sadece_calisan`, `sadece_saha`) atanabilmesi. Mevcut oturum/yetkilendirme mimarisine (`requireFirma` middleware) ek bir yetki katmanı gerektirir — ayrı, daha büyük bir iş.

## Öncelik

Arama/sayfalama düşük risk, hızlı, hemen yapılabilir. Rol ayrımı daha büyük bir mimari değişiklik — önce arama/sayfalama, sonra rol ayrımı planlanmalı.
