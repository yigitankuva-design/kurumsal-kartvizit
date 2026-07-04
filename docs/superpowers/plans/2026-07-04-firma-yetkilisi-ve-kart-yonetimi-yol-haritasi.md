# Yol Haritası — Firma Yetkilisi Mobil Erişimi & Kart Yönetimi

> Bu bir **üst düzey yol haritasıdır**, detaylı uygulama planı değil. Dört iş paketi
> sırayla, her biri kendi spec → plan → uygulama döngüsünden geçecek. Bağımlılık
> sırası korunmalı: İP-1 temeldir, diğerleri onun üzerine kurulur.

## Amaç

Kurumsal firmaya verilen kullanıcı adı/şifre ile firma yetkilisinin **doğrudan mobil
uygulamadan** kart basabilmesi (çalışan + müşteri/raf + eczacı); ayrıca hangi kartın
yazıldığını/kilitlendiğini görünür kılmak, toplu profil oluşturmayı hızlandırmak ve
QR yedeğini garantiye almak.

## Ortak Mimari Notu

- **Yeni auth deseni İP-1'de kurulur**, sonraki paketler bunu yeniden kullanır.
- Mevcut desenler birebir kopyalanır (uydurma yok):
  - `utils/jwt.js` → `bayiTokenUret`/`calisanTokenUret` yanına `firmaTokenUret/Dogrula`
  - `middleware/tokenAuth.js` → `requireBayiToken`/`requireCalisanToken` yanına `requireFirmaToken`
  - `routes/mobilApi.js` → `/giris`, `/temsilci-giris` deseniyle `/firma-giris`
  - `firmalar` tablosunun MEVCUT alanları kullanılır: `yetkili_email`, `kullanici_adi`,
    `yetkili_sifre_hash` — yeni kimlik tablosu YOK.

---

## İP-1 — Firma Yetkilisi Mobil Girişi (TEMEL)

**Amaç:** Firma yetkilisi, web panel kullanıcı adı/şifresiyle mobile girip kendi
firmasının çalışan, eczane ve eczacı kartlarını yazabilsin.

**Backend (3 yeni uç):**
- `POST /api/mobil/firma-giris` — `firmalar.yetkili_email`/`kullanici_adi` +
  `yetkili_sifre_hash` doğrular, `firmaToken` döner (`/temsilci-giris` deseni).
- `GET /api/mobil/firma/calisanlarimiz` — `requireFirmaToken`, firmanın kendi
  çalışan listesi (`calisanlar WHERE firma_id = req.firmaId`).
- `GET /api/mobil/firma/eczanelerimiz` — firmanın kendi eczane listesi
  (`eczanelerim` deseni, `eczaci_kod` dahil).

**Backend yardımcıları:** `firmaTokenUret/Dogrula` (jwt.js), `requireFirmaToken`
(tokenAuth.js).

**Mobil:**
- Giriş ekranına üçüncü rol: **"Firma Yetkilisi"** (`GirisRolu` enum'a `FIRMA`).
- Yeni ana ekran: "Çalışanlarımız" + "Eczanelerimiz" iki buton + Çıkış.
- Liste ekranları YENİDEN KULLANILIR: `CalisanlarEkrani` ve `EczanelerimEkrani`
  aynen; sadece veriyi firma token'dan çeken yeni ViewModel'lerle beslenir.
  Her ikisinde "Kart Yaz" zaten mevcut.

**Yeni DB:** Yok.
**Bağımlılık:** Yok (temel paket).
**Büyüklük:** Orta.

---

## İP-2 — Kart Durum Rozetleri & Envanter Özeti

**Amaç:** Yetkili, listede hangi kartın **yazıldığını/yazılmadığını** ve
**kilitli/kilitsiz** olduğunu görsün; "kaç kart yazıldı, kaç bekliyor" özeti olsun.

> **Fiziksel not (KURAL #1):** NFC kartın kendisi renk değiştiremez (pasif çip).
> "Renk değişimi" YAZILIM tarafında listedeki rozetle sağlanır — gri "Yazılmadı",
> yeşil "Yazıldı", ayrı işaret "Kilitli".

**Yeni DB (migration):**
- `calisanlar` ve `eczaneler`: `karta_yazildi BOOLEAN DEFAULT false`,
  `kart_kilitli BOOLEAN DEFAULT false`, `kart_yazma_tarihi TIMESTAMP`.

**Backend:**
- Kart yazımı başarılı olunca çağrılacak uç: `POST /api/mobil/kart-yazildi`
  (tip: calisan/eczane/eczaci, id) → ilgili satırı `karta_yazildi=true` (+ kilitliyse
  `kart_kilitli=true`) yapar, tenant-scoped.
- `calisanlarimiz`/`eczanelerimiz` (ve web panel sorguları) bu alanları döndürür.
- Özet: mevcut listelerden `COUNT(*) FILTER (WHERE karta_yazildi)` ile hesaplanır.

**Mobil:** Liste satırlarına renkli rozet + üstte "X/Y yazıldı" özeti. Kart yazma
akışı başarıyla bitince `kart-yazildi` çağrısı yapılır.

**Web:** Panel Raf Kartları / İstatistik sekmelerinde aynı rozet + özet.

**Bağımlılık:** İP-1 (firma listelerinin var olması).
**Büyüklük:** Orta.

---

## İP-3 — Toplu Excel İçe Aktarım & Onay Akışı

**Amaç:** Yetkili, tarayıcıdan Excel ile toplu çalışan/eczane yükleyip hızlı profil
oluştursun; onay verdikten sonra bu profiller mobilde görünsün.

**Not:** `xlsx` paketi projede zaten var (`routes/kurumsal.js` dışa aktarımda
kullanıyor) — yeni bağımlılık yok.

**Yeni DB (migration):**
- `calisanlar`/`eczaneler`: `onayli BOOLEAN DEFAULT true` (mevcut kayıtlar etkilenmez).
  Toplu içe aktarılanlar `onayli=false` başlar; onaylanınca `true`.

**Backend:**
- Şablon indirme + yükleme uçları: kolon doğrulama, slug çakışması tekilleştirme
  (mevcut `firmaSlugOlustur`/benzersizleştirme desenleri), satır satır hata raporu.
- Toplu ekleme transaction içinde; kısmi başarı raporlanır.
- Mobil/panel firma listeleri `onayli=true` filtresiyle döner (onaysızlar gizli).
- Panelde "onayla" (tekil/toplu) ucu.

**Web:** Yükleme ekranı, önizleme/hata tablosu, onay butonu.
**Mobil:** Değişiklik minimal — sadece `onayli` filtresi zaten backend'de.

**Bağımlılık:** İP-1 (mobil görünürlük mantığı), İP-2 ile çakışmaz.
**Büyüklük:** Büyük.

---

## İP-4 — QR Kod Her Zaman Yedek

**Amaç:** NFC okumayan/kapalı cihazlarda satış kesilmesin — her kart/eczane için QR
karşılığı garanti bulunsun.

**Ön adım:** MEVCUT durum kontrol edilecek — public profil/raf/eczaci sayfalarında
QR şu an var mı, yoksa nerede eksik? (Spec öncesi tespit.)

**Olası kapsam:**
- Public sayfalarda (`profil`, `raf`, `eczaci`) indirilebilir/gösterilebilir QR.
- Panelde her satır için "QR indir".
- Mobil kart yazma ekranında QR önizleme (opsiyonel).

**Bağımlılık:** Bağımsız; en sona bırakıldı çünkü kapsam tespite bağlı.
**Büyüklük:** Küçük–Orta (tespit sonrası netleşir).

---

## Uygulama Sırası

1. **İP-1** — Firma Yetkilisi mobil girişi (temel, diğerleri bağlı)
2. **İP-2** — Durum rozetleri + envanter özeti
3. **İP-3** — Toplu Excel + onay akışı
4. **İP-4** — QR yedek (önce mevcut durum tespiti)

## Sonraki Adım

İP-1 için `brainstorming` → `writing-plans` döngüsüne geçilecek; spec ve detaylı TDD
planı ayrıca yazılıp onaylanacak. Bu harita yalnızca kapsamı ve sırayı sabitler.
