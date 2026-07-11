# Panel Görünüm Yenileme Implementasyon Planı

**Goal:** Yönetici panelinin (dashboard.ejs) görsel çıtasını profesyonel yazılım araçları (Linear/Stripe) seviyesine çıkarmak, çalışan listesine tıkla-aç detay paneli eklemek ve firma sahibinin panel vurgu rengini + ışık derecesini kendi seçip kaydedebildiği bir özelleştirme eklemek.

**Kapsam kararı:** Kullanıcı onayladığı mockup (panel-ornek-5) referans alınarak, MEVCUT sekme yapısı (`?tab=X` route'ları, tüm form/upload/onay mantığı) korunur — sadece görsel chrome (renkler, kart/tablo stilleri, buton stilleri) ve Çalışanlar tablosuna satır-tıkla detay paneli eklenir. Tam sidebar mimarisine geçiş şu an yapılmıyor (mevcut ~1200 satırlık, üretimde test edilmiş çok sayıda özelliği barındıran dashboard.ejs için çok yüksek risk).

---

### Task 1: DB migration — tema_renk + tema_isik_seviyesi

**Files:**
- Modify: `scripts/migrate.js`

- [ ] `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS tema_renk TEXT DEFAULT '#c8a84b'` ekle
- [ ] `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS tema_isik_seviyesi INTEGER DEFAULT 50` ekle
- [ ] `node scripts/migrate.js` ile local DB'de çalıştır, doğrula

### Task 2: POST /firma/panel/tema ucu (TDD)

**Files:**
- Modify: `routes/panel.js`
- Test: `tests/temaAyari.test.js`

- [ ] Test: geçerli hex + 0-100 arası ışık seviyesi kaydedilir
- [ ] Test: geçersiz hex reddedilir (validasyon)
- [ ] Test: ışık seviyesi 0-100 dışında ise reddedilir
- [ ] `router.post('/tema', ...)` — `req.session.firmaId` ile günceller, `req.session.rol` kısıtlaması yok (herkes kendi firmasının temasını değiştirebilir — kozmetik, riskli değil)

### Task 3: dashboard.ejs — Görünüm renk seçici popover

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] Nav'a panel-ornek-5'teki SV kare + hue strip + ışık kaydırıcı popover'ı ekle (vanilla JS, mevcut `<script>` bloklarına)
- [ ] Sayfa yüklenirken `firma.tema_renk` ve `firma.tema_isik_seviyesi` değerlerinden `--gold` ve arka plan tonlarını inline `<style>` ile uygula
- [ ] Popover'daki değişiklik `fetch('/firma/panel/tema', {method:'POST', ...})` ile kaydedilir (debounce ile, her sürüklemede değil bırakınca)

### Task 4: Çalışanlar tablosuna satır-tıkla detay paneli

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] Mevcut `td-actions` butonlarını koruyarak, satıra tıklanınca (buton hariç) sağdan/altdan bir özet panel açılır (e-posta, telefon, görüntülenme) — mevcut `openSlideEdit` formunu TETİKLEMEZ, salt-okunur hızlı bakış

### Task 5: Görsel chrome iyileştirme

**Files:**
- Modify: `views/public/dashboard.ejs` (CSS bloğu)

- [ ] Kart/tablo/badge stilleri panel-ornek-5 estetiğine yaklaştırılır (ince kenarlıklar, mono sayılar, restrained vurgu rengi kullanımı) — mevcut class isimleri ve DOM yapısı korunarak sadece CSS güncellenir

### Task 6: Tam test + deploy + prod doğrulama

- [ ] `npx jest` — tüm paket yeşil
- [ ] `git push` + `railway up`
- [ ] Marker firma ile prod'da renk kaydetme + tekrar yükleme testi
- [ ] Marker veri temizliği
