# İşlem Geçmişi (Audit Log) — Tasarım

**Tarih:** 2026-07-10
**Durum:** Onaylandı, implementasyona alınmadı — yapılacaklar listesinde bekliyor.

## Amaç

Panelde kim, ne zaman, hangi işlemi yaptı sorusuna cevap verebilmek. Şu an hiçbir işlem kaydı tutulmuyor — bir çalışan veya eczane silindiğinde/değiştirildiğinde geriye dönük bilgi yok.

## Veri Modeli

```sql
CREATE TABLE islem_gecmisi (
  id          SERIAL PRIMARY KEY,
  firma_id    INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
  islem       TEXT NOT NULL,        -- ör. 'calisan_silindi', 'eczane_pasife_alindi'
  hedef_tip   TEXT,                 -- ör. 'calisan', 'eczane'
  hedef_id    INTEGER,
  aciklama    TEXT,                 -- ör. 'Ahmet Yılmaz'
  created_at  TIMESTAMP DEFAULT NOW()
);
```

(İleride birden fazla panel kullanıcısı/rol eklenince `aktor_id`/`aktor_tipi` kolonları eklenir — şimdilik tek firma sahibi hesabı olduğu için "kim" zaten firma_id ile belli.)

## Kapsam — Sadece Riskli İşlemler Kaydedilir

Kaydedilecekler:
- Çalışan/eczane silme
- Çalışan/eczane pasife alma, toplu işlemler
- İndirim kampanyası ayar değişikliği
- Çalışan giriş bilgisi (şifre) değişikliği

Kaydedilmeyecekler: görüntüleme, sekme değiştirme gibi zararsız/sık işlemler — liste anlamsız kalabalıklaşmasın diye.

## UI

Panelde yeni "İşlem Geçmişi" sekmesi/sayfası — ters kronolojik basit liste: "10 Temmuz 14:32 — Ahmet Yılmaz silindi". İlk sürümde filtre/arama yok.

## Bilinçli Sınırlama (İlk Sürüm)

Değişikliğin öncesi/sonrası detaylı diff'i (ör. "yüzde 5'ten 10'a değişti") ilk sürümde tutulmuyor — sadece "ne yapıldı, ne zaman". İstenirse sonraki bir iterasyonda detaylandırılır.

## İlişkili

Rol ayrımı özelliğiyle ([2026-07-10-olcek-sorunlari-design.md](2026-07-10-olcek-sorunlari-design.md)) birlikte asıl değerini gösterir, ama ondan bağımsız da yapılabilir/çalışır.
