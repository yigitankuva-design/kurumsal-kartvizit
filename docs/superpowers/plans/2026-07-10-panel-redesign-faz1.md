# Panel Redesign — Faz 1: Renk/Buton Tutarlılığı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `views/public/dashboard.ejs`'teki tasarım sistemi tutarsızlıklarını (ham hex renkler, sınıfsız butonlar, bağlamsız üst buton) düzeltmek — mevcut CSS değişken sistemine tam uyum.

**Architecture:** Salt CSS/EJS değişikliği, backend mantığı değişmiyor (Task 4 hariç, o da basit bir EJS koşulu). Bu, panel redesign'ın "hızlı, düşük risk" olarak işaretlenen ilk fazı — emoji→ikon, rozet tasarımı, açık tema ve sekme gruplaması ayrı, sonraki fazlarda ele alınacak.

**Tech Stack:** EJS + vanilla CSS (mevcut yığın korunuyor).

**Referans:** `docs/superpowers/specs/2026-07-10-panel-redesign-oneri.md` (Bulgu #2 ve #3)

---

### Task 1: `--warning` CSS değişkeni ve `.btn-warning-sm` sınıfı ekle

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] **Step 1: `:root` bloğuna warning değişkenlerini ekle**

**NOT:** Bu iki satır çalışma ağacında ZATEN eklenmiş (önceki oturumda), ama commit edilmemiş durumda (`git status` `M views/public/dashboard.ejs` gösterir). Dosyada `--warning` satırlarının varlığını kontrol et — varsa bu adımı atla, doğrudan Step 2'ye geç. Yoksa `--danger-dim: rgba(239,68,68,0.1);` satırından hemen sonra ekle:

```css
      --warning: #f59e0b;
      --warning-dim: rgba(245,158,11,0.1);
```

- [ ] **Step 2: `.btn-danger-sm` kural bloğundan sonra `.btn-warning-sm` ekle**

```css
    .btn-warning-sm { background: var(--warning-dim); color: var(--warning); border: 1px solid rgba(245,158,11,0.2); }
    .btn-warning-sm:hover { background: rgba(245,158,11,0.18); }
```

- [ ] **Step 3: Tarayıcıda doğrula**

Yerel sunucuyu başlat, panelin herhangi bir sayfasını aç, sayfanın hâlâ hatasız render edildiğini (CSS parse hatası yok) doğrula.

- [ ] **Step 4: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "$(cat <<'EOF'
Panel CSS'ine warning renk değişkeni ve buton sınıfı ekle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Ham hex renkleri CSS değişkenlerine bağla

**Files:**
- Modify: `views/public/dashboard.ejs`

Aşağıdaki 13 satırın her biri, belirtilen tam eşleşme ile değiştirilir (satır numaraları Task 1 sonrası dosya durumuna göre yaklaşık — gerçek konumu içerikten bul):

- [ ] **Step 1: "Onay Bekliyor" etiketleri (2 yer, çalışan ve eczane listelerinde) — `#b45309` → `var(--warning)`**

```
Eski: <span style="color:#b45309;font-size:12px">⏳ Onay Bekliyor</span>
Yeni: <span style="color:var(--warning);font-size:12px">⏳ Onay Bekliyor</span>
```
(İki ayrı yerde birebir aynı satır var — ikisini de değiştir.)

- [ ] **Step 2: "📷 Fotoğraf Ekle" butonları (2 yer) — inline warning stilini `.btn-warning-sm` sınıfına taşı**

```
Eski: <button class="btn btn-sm" style="background:#b45309;color:#fff;border:none" onclick='openSlideEdit(<%- JSON.stringify(c) %>)'>📷 Fotoğraf Ekle</button>
Yeni: <button class="btn btn-warning-sm btn-sm" onclick='openSlideEdit(<%- JSON.stringify(c) %>)'>📷 Fotoğraf Ekle</button>
```
(İki ayrı yerde birebir aynı satır var — ikisini de değiştir.)

- [ ] **Step 3: "✓ Yazıldı" etiketleri (3 yer: çalışan listesi, eczane müşteri kartı, eczane eczacı kartı) — `#2e7d32` → `var(--success)`**

```
Eski: <span style="color:#2e7d32;font-weight:600">✓ Yazıldı<%= c.kart_kilitli ? ' 🔒' : '' %></span>
Yeni: <span style="color:var(--success);font-weight:600">✓ Yazıldı<%= c.kart_kilitli ? ' 🔒' : '' %></span>
```
```
Eski: <span style="color:#2e7d32;font-weight:600">✓<%= e.musteri_kart_kilitli ? '🔒' : '' %></span>
Yeni: <span style="color:var(--success);font-weight:600">✓<%= e.musteri_kart_kilitli ? '🔒' : '' %></span>
```
```
Eski: <span style="color:#2e7d32;font-weight:600">✓<%= e.eczaci_kart_kilitli ? '🔒' : '' %></span>
Yeni: <span style="color:var(--success);font-weight:600">✓<%= e.eczaci_kart_kilitli ? '🔒' : '' %></span>
```

- [ ] **Step 4: "○ Yazılmadı" etiketleri (3 yer) — `#9ca3af` → `var(--text-faint)`**

```
Eski: <span style="color:#9ca3af">○ Yazılmadı</span>
Yeni: <span style="color:var(--text-faint)">○ Yazılmadı</span>
```
```
Eski: <span style="color:#9ca3af">○</span>
Yeni: <span style="color:var(--text-faint)">○</span>
```
(İkinci desen 2 ayrı yerde aynı — ikisini de değiştir. Toplam bu adımda 3 değişiklik.)

- [ ] **Step 5: İndirim yüzdesi label'ı — `#6b7280` → `var(--text-muted)`**

```
Eski: <label style="font-size:13px;color:#6b7280">
Yeni: <label style="font-size:13px;color:var(--text-muted)">
```

- [ ] **Step 6: "🗑 Toplu Sil" butonu — `#b91c1c` → `var(--danger)`**

```
Eski: <button type="button" id="eczaneTopluSilBtn" disabled onclick="eczaneTopluIslem('sil')" style="color:#b91c1c">🗑 Toplu Sil</button>
Yeni: <button type="button" id="eczaneTopluSilBtn" disabled class="btn btn-danger-sm" onclick="eczaneTopluIslem('sil')">🗑 Toplu Sil</button>
```
(Not: Bu satır hem renk hem sınıf eksikliği taşıyor, Task 3'ü beklemeden burada birlikte düzeltiliyor çünkü aynı satır.)

- [ ] **Step 7: Saha İstatistikleri "Not girildi" satırı — `#9ca3af` → `var(--text-faint)`**

```
Eski: <span style="color:#9ca3af;font-style:italic">Not girildi (içerik sadece bağlı olduğu yöneticiye mobilde görünür)</span>
Yeni: <span style="color:var(--text-faint);font-style:italic">Not girildi (içerik sadece bağlı olduğu yöneticiye mobilde görünür)</span>
```

- [ ] **Step 8: Tarayıcıda doğrula**

Çalışanlar, Raf Kartları ve Saha İstatistikleri sekmelerini aç; "Onay Bekliyor", "Yazıldı"/"Yazılmadı", "Toplu Sil" renklerinin görsel olarak öncekiyle aynı (yeşil/turuncu/kırmızı/gri) göründüğünü, sadece kaynağın değişken olduğunu doğrula.

- [ ] **Step 9: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "$(cat <<'EOF'
Ham hex renkleri CSS değişkenlerine bağla

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Sınıfsız butonlara `.btn` uygula

**Files:**
- Modify: `views/public/dashboard.ejs`

Not: `✕` modal kapatma butonları (Ürün Düzenle modalı ve Eczane Detay modalı — konum bağımsız, minimal ikon butonları) bilinçli olarak **değiştirilmiyor**, zaten doğru amaçla stilsiz/şeffaf tasarlanmışlar.

- [ ] **Step 1: İçerik sekmesi form butonları (4 adet) — standalone `.btn .btn-gold` yap**

```
Eski: <button type="submit">Logoyu Yükle</button>
Yeni: <button type="submit" class="btn btn-gold">Logoyu Yükle</button>
```
```
Eski: <button type="submit">Kataloğu Yükle</button>
Yeni: <button type="submit" class="btn btn-gold">Kataloğu Yükle</button>
```
```
Eski: <button type="submit">Dokümanı Yükle</button>
Yeni: <button type="submit" class="btn btn-gold">Dokümanı Yükle</button>
```
"Linkler" formundaki ve "Eczacı Sayfası" formundaki iki ayrı `<button type="submit">Kaydet</button>` de aynı şekilde `class="btn btn-gold"` alır (toplam bu adımda 5 buton).

- [ ] **Step 2: Ürünler sekmesi "Ekle" butonu ve Ürün Düzenle modalı "Kaydet" butonu**

```
Eski: <button type="submit">Ekle</button>   (Yeni Ürün Ekle formunda)
Yeni: <button type="submit" class="btn btn-gold">Ekle</button>
```
```
Eski: <button type="submit">Kaydet</button>   (Ürün Düzenle modalı içinde, #urunDuzenleForm)
Yeni: <button type="submit" class="btn btn-gold">Kaydet</button>
```
(Not: `.btn-submit` KULLANMA — o sınıf `flex:1` içeriyor ve modal formu `flex-direction:column` olduğu için butonu dikeyde anormal uzatır. Diğer form submit'leriyle tutarlı `.btn btn-gold` kullan.)
```
```

- [ ] **Step 3: İndirim sekmesi "Kaydet" butonu**

```
Eski: <button type="submit">Kaydet</button>   (İndirim Kampanyası formunda)
Yeni: <button type="submit" class="btn btn-gold">Kaydet</button>
```

- [ ] **Step 4: Raf Kartları sekmesi "Ekle" butonu (Yeni Eczane Ekle formu)**

```
Eski: <button type="submit">Ekle</button>
Yeni: <button type="submit" class="btn btn-gold">Ekle</button>
```

- [ ] **Step 5: Eczane toplu işlem butonları (Onayla/Pasife Al, "Toplu Sil" Task 2'de zaten yapıldı)**

```
Eski: <button type="button" id="eczaneTopluOnaylaBtn" disabled onclick="eczaneTopluIslem('onayla')">✓ Toplu Onayla</button>
Yeni: <button type="button" id="eczaneTopluOnaylaBtn" disabled class="btn btn-border btn-sm" onclick="eczaneTopluIslem('onayla')">✓ Toplu Onayla</button>
```
```
Eski: <button type="button" id="eczaneTopluPasifBtn" disabled onclick="eczaneTopluIslem('pasife-al')">⏸ Toplu Pasife Al</button>
Yeni: <button type="button" id="eczaneTopluPasifBtn" disabled class="btn btn-border btn-sm" onclick="eczaneTopluIslem('pasife-al')">⏸ Toplu Pasife Al</button>
```
(Her iki butonda da `onclick` zaten var, sadece `class` ekleniyor — mevcut `onclick`'i SİLME, birleştir.)

- [ ] **Step 6: Çalışan listesi satır aksiyonları (Kaldır, Yazıldı işaretle)**

```
Eski: <button type="submit">Kaldır</button>   (karta_yazildi=true durumundaki form içinde)
Yeni: <button type="submit" class="btn btn-border btn-sm">Kaldır</button>
```
```
Eski: <button type="submit">Yazıldı işaretle</button>
Yeni: <button type="submit" class="btn btn-border btn-sm">Yazıldı işaretle</button>
```

- [ ] **Step 7: Eczane listesi satır aksiyonları (Kaldır×2, İşaretle×2, Onayla, Detay, Pasife Al, Sil, Aktif Yap, Kod Üret)**

```
Eski: <button type="submit">Kaldır</button>   (musteri kart formu içinde)
Yeni: <button type="submit" class="btn btn-border btn-sm">Kaldır</button>
```
```
Eski: <button type="submit">İşaretle</button>   (musteri kart formu içinde)
Yeni: <button type="submit" class="btn btn-border btn-sm">İşaretle</button>
```
```
Eski: <button type="submit">Kaldır</button>   (eczaci kart formu içinde)
Yeni: <button type="submit" class="btn btn-border btn-sm">Kaldır</button>
```
```
Eski: <button type="submit">İşaretle</button>   (eczaci kart formu içinde)
Yeni: <button type="submit" class="btn btn-border btn-sm">İşaretle</button>
```
```
Eski: <button type="submit">Kod Üret</button>
Yeni: <button type="submit" class="btn btn-border btn-sm">Kod Üret</button>
```
```
Eski: <button type="button" onclick="eczaneDetayGoster(<%= e.id %>, '<%= e.ad.replace(/'/g, "\\'") %>')" style="margin-right:6px">Detay</button>
Yeni: <button type="button" class="btn btn-border btn-sm" onclick="eczaneDetayGoster(<%= e.id %>, '<%= e.ad.replace(/'/g, "\\'") %>')" style="margin-right:6px">Detay</button>
```
```
Eski: <button type="button" onclick="eczaneTekIslem(<%= e.id %>, 'pasife-al')" style="margin-right:6px">Pasife Al</button>
Yeni: <button type="button" class="btn btn-border btn-sm" onclick="eczaneTekIslem(<%= e.id %>, 'pasife-al')" style="margin-right:6px">Pasife Al</button>
```
```
Eski: <button type="submit">Sil</button>   (eczane sil formu içinde)
Yeni: <button type="submit" class="btn btn-danger-sm btn-sm">Sil</button>
```
```
Eski: <button type="button" onclick="eczaneTekIslem(<%= e.id %>, 'onayla')">Onayla</button>
Yeni: <button type="button" class="btn btn-border btn-sm" onclick="eczaneTekIslem(<%= e.id %>, 'onayla')">Onayla</button>
```
```
Eski: <button type="button" onclick="eczaneTekIslem(<%= e.id %>, 'aktif-yap')">Aktif Yap</button>
Yeni: <button type="button" class="btn btn-border btn-sm" onclick="eczaneTekIslem(<%= e.id %>, 'aktif-yap')">Aktif Yap</button>
```

- [ ] **Step 8: Tam test paketini çalıştır**

Run: `npx jest tests/kurumsal.test.js tests/panel.test.js`
Expected: Tüm testler PASS — bu testler metin içeriğini kontrol ediyor (`res.text.toContain(...)`), CSS class eklemek metin içeriğini bozmaz, ama yine de doğrulanmalı.

- [ ] **Step 9: Tarayıcıda doğrula**

Çalışanlar ve Raf Kartları sekmelerini aç, tüm butonların artık tutarlı (altın dolu, kenarlıklı, veya kırmızı) göründüğünü, hiçbirinin tarayıcı varsayılan gri kutu olarak kalmadığını doğrula. Toplu seçim butonlarının (Onayla/Pasife Al/Sil) hâlâ `disabled` durumunda doğru göründüğünü kontrol et.

- [ ] **Step 10: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "$(cat <<'EOF'
Sınıfsız butonlara tutarlı .btn stilleri uygula

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: "+ Yeni Çalışan" butonunu bağlamsallaştır

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] **Step 1: Header butonunu sadece Çalışanlar sekmesinde göster**

```html
Eski:
  <div class="dash-header">
    <div>
      <div class="dash-title">Hoş geldiniz</div>
      <div class="dash-subtitle"><%= firma.yetkili_email %></div>
    </div>
    <button class="btn btn-gold" onclick="openSlide()">+ Yeni Çalışan</button>
  </div>

Yeni:
  <div class="dash-header">
    <div>
      <div class="dash-title">Hoş geldiniz</div>
      <div class="dash-subtitle"><%= firma.yetkili_email %></div>
    </div>
    <% if (tab === 'calisanlar') { %>
    <button class="btn btn-gold" onclick="openSlide()">+ Yeni Çalışan</button>
    <% } %>
  </div>
```

- [ ] **Step 2: Tarayıcıda doğrula**

Çalışanlar sekmesinde butonun göründüğünü, İçerik/Raf Kartları/İndirim gibi diğer sekmelerde görünmediğini doğrula.

- [ ] **Step 3: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "$(cat <<'EOF'
Yeni Çalışan butonunu sadece Çalışanlar sekmesinde göster

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tam test + deploy + production doğrulama

**Files:** Yok (sadece komutlar)

- [ ] **Step 1: Tüm test paketini çalıştır**

Run: `npx jest`
Expected: Tüm testler PASS.

- [ ] **Step 2: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

`railway status` ile "Online" olduğunu doğrula, ardından yeni bir uçtan curl/tarayıcı isteğiyle production'da panelin (herhangi bir kurumsal test firmasıyla giriş yapılarak) doğru render edildiğini doğrula.

- [ ] **Step 3: git status temiz olduğunu doğrula**

Run: `git status --short`
Expected: Boş çıktı.
