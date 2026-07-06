# Bildirim Sistemi (Katalog Bildirimi + Ziyaret Uyarısı) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firma yeni katalog yüklediğinde mümessillerin mobilde banner görmesi + firma yetkilisinin panelde 60+ gündür ziyaret edilmeyen eczaneleri görmesi.

**Architecture:** Backend'de iki yeni zaman damgası kolonu (`firmalar.katalog_guncelleme_tarihi`, `calisanlar.son_gorulen_katalog_tarihi`) ile kişi bazlı "gördü mü" takibi; 60 gün uyarısı için yeni kolon gerekmez, mevcut `ziyaretler` tablosundan dinamik hesaplanır. Android tarafında mevcut `viewModel { ... (tokenDeposu) }` + `LaunchedEffect` deseni tekrar kullanılır.

**Tech Stack:** Node.js/Express/PostgreSQL (backend), Kotlin/Jetpack Compose/Retrofit (Android).

---

### Task 1: DB migration — katalog zaman damgaları

**Files:**
- Modify: `scripts/migrate.js`

- [ ] **Step 1: Migration dizisine ekle**

`scripts/migrate.js`'in migration dizisinin en sonuna (Analitik migration'larından hemen sonra, dizinin kapanışından önce) ekle:

```javascript
    `ALTER TABLE firmalar ADD COLUMN IF NOT EXISTS katalog_guncelleme_tarihi TIMESTAMP`,
    `ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS son_gorulen_katalog_tarihi TIMESTAMP`,
```

- [ ] **Step 2: Migration'ı yerel veritabanında çalıştır**

Run: `cd /c/Users/muham/kurumsal-kartvizit && node scripts/migrate.js`
Expected: Yeni iki satır için `OK`.

- [ ] **Step 3: Doğrula**

Run:
```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const a = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='firmalar' AND column_name='katalog_guncelleme_tarihi'\");
  const b = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='calisanlar' AND column_name='son_gorulen_katalog_tarihi'\");
  console.log('firmalar.katalog_guncelleme_tarihi:', a.rows.length ? 'VAR' : 'YOK');
  console.log('calisanlar.son_gorulen_katalog_tarihi:', b.rows.length ? 'VAR' : 'YOK');
  await pool.end();
})();
"
```
Expected: İkisi de "VAR".

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.js
git commit -m "Bildirim sistemi T1: katalog zaman damgasi kolonlari"
```

---

### Task 2: `POST /kurumsal/katalog` — güncelleme tarihini set et

**Files:**
- Modify: `routes/kurumsal.js:139-153`
- Test: `tests/kurumsal.test.js`

**Bağlam:** Mevcut test dosyasında `/kurumsal/katalog` testleri satır 81-88 civarında. Test dosyasının kendi yorumu ("dev ortamında location null olsa da 302 döner") ve `.env`'de `RAILWAY_STORAGE_BUCKET` boş olması doğrulandı — **bu test ortamında dosya yükleme her zaman `req.file.location = null` ile sonuçlanır**, S3'e gerçek yükleme hiçbir zaman gerçekleşmez. Bu, codebase'in tüm dosya-yükleme testlerinin (logo/katalog/eczaci-pdf) ortak, bilinen kısıtıdır — hiçbiri "başarılı yükleme" yolunu HTTP üzerinden test etmiyor. Bu yüzden yeni test, `katalog_guncelleme_tarihi`'nin **başarısız yüklemede set edilmediğini** doğrular (regresyon koruması); başarılı yüklemedeki doğru davranış Task 5'te production'da gerçek bir dosyayla doğrulanacak.

- [ ] **Step 1: Write the failing test**

`tests/kurumsal.test.js`'te, mevcut katalog testinin (satır 81-88) hemen altına ekle:

```javascript
  test('yükleme başarısız olduğunda (location null) katalog_guncelleme_tarihi set edilmez', async () => {
    const res = await kurumsalAgent
      .post('/kurumsal/katalog')
      .attach('katalog', Buffer.from('%PDF-1.4 test'), { filename: 'katalog.pdf', contentType: 'application/pdf' });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT katalog_guncelleme_tarihi FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].katalog_guncelleme_tarihi).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Bu adım aslında bu spesifik test için RED üretmeyecek çünkü kod değişikliğinden önce de `katalog_guncelleme_tarihi` hep `null`'dur (kolon yeni ama hiç set edilmiyor). **Bunun yerine**, Step 3'teki kod değişikliğini yanlışlıkla "her zaman set et" şeklinde yazıp yazmadığını doğrulamak için testi kodu değiştirdikten SONRA çalıştırıp GREEN kalması gerektiğini doğrulayacağız — yani bu adımda gerçek bir RED/GREEN döngüsü yerine, testi Step 4'te (implementasyondan sonra) çalıştırıp hâlâ PASS olduğunu (regresyon olmadığını) doğrula. Bu istisna, dosya depolamasına bağımlı davranışın bu test ortamında tam TDD döngüsüyle doğrulanamamasından kaynaklanıyor (yukarıdaki Bağlam notuna bkz.).

- [ ] **Step 3: `routes/kurumsal.js`'teki `/katalog` ucunu güncelle**

`routes/kurumsal.js:139-153`'teki şu anki hali:

```javascript
// Katalog PDF yükle
router.post('/katalog', guvenliUpload(katalogUpload, 'katalog', '/?tab=icerik'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE firmalar SET katalog_url=$1 WHERE id=$2', [req.file.location, req.session.firmaId]);
      req.flash('success', 'Katalog güncellendi.');
    } else {
      // dev ortamında storage yok — location null; kullanıcıya yine bilgi ver
      req.flash('error', 'Dosya kaydedilemedi (depolama yapılandırılmamış).');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Katalog yüklenemedi.');
  }
  res.redirect('/?tab=icerik');
});
```

Şununla değiştir:

```javascript
// Katalog PDF yükle
router.post('/katalog', guvenliUpload(katalogUpload, 'katalog', '/?tab=icerik'), async (req, res) => {
  try {
    if (req.file?.location) {
      await pool.query('UPDATE firmalar SET katalog_url=$1, katalog_guncelleme_tarihi=NOW() WHERE id=$2', [req.file.location, req.session.firmaId]);
      req.flash('success', 'Katalog güncellendi.');
    } else {
      // dev ortamında storage yok — location null; kullanıcıya yine bilgi ver
      req.flash('error', 'Dosya kaydedilemedi (depolama yapılandırılmamış).');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Katalog yüklenemedi.');
  }
  res.redirect('/?tab=icerik');
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/kurumsal.test.js`
Expected: Tüm testler PASS (yeni test dahil) — yeni test, kod değişikliğinden önce de sonra da PASS olur (regresyon testi), çünkü bu ortamda `req.file.location` hep `null`'dur ve kod değişikliği sadece `if (req.file?.location)` bloğunun İÇİNE yeni bir kolon güncellemesi ekler, `else` dalını etkilemez. Asıl "başarılı yüklemede kolon gerçekten set ediliyor mu" doğrulaması Task 5 Step 4'te production'da gerçek bir dosyayla yapılacak.

- [ ] **Step 5: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "Bildirim sistemi T2: katalog guncelleme tarihi set edilir"
```

---

### Task 3: Mobil uçlar — `GET /katalog-durumu` + `POST /katalog-gorundu`

**Files:**
- Modify: `routes/mobilApi.js`
- Test: `tests/mobilApi.test.js`

**Bağlam:** `routes/mobilApi.js`'te `requireCalisanToken` korumalı uçlar için desen zaten var (`/ziyaret-kaydet`, `/ziyaretlerim`, satır 218-258). `req.calisanId` middleware'den gelir.

- [ ] **Step 1: Write the failing test**

`tests/mobilApi.test.js`'in sonuna yeni bir `describe` bloğu ekle (dosyanın sonuna, son `describe` kapanışından sonra):

```javascript
describe('Mobil API — /api/mobil/katalog-durumu ve /katalog-gorundu', () => {
  let firmaId, calisanId, token;

  beforeAll(async () => {
    // Token doğrudan calisanTokenUret ile üretilir — /temsilci-giris login ucu
    // çağrılmaz. Bu, mevcut firma testlerinin (satır 442+) desenini izler ve
    // paylaşılan temsilciGirisLimiter (max 10/15dk) bütçesini tüketmez.
    const { calisanTokenUret } = require('../utils/jwt');
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Katalog Test Firma', 'katalog-test-firma', 'kt1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;

    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug)
       VALUES ($1, 'Katalog', 'Temsilci', 'katalog-temsilci') RETURNING id`,
      [firmaId]
    );
    calisanId = calisanSonuc.rows[0].id;
    token = calisanTokenUret(calisanId);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('firma hiç katalog yüklememişse yeni_katalog_var false döner', async () => {
    const res = await request(app)
      .get('/api/mobil/katalog-durumu')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.yeni_katalog_var).toBe(false);
  });

  test('firma katalog yükledikten sonra yeni_katalog_var true döner', async () => {
    await pool.query('UPDATE firmalar SET katalog_url=$1, katalog_guncelleme_tarihi=NOW() WHERE id=$2', ['https://ornek.com/k.pdf', firmaId]);
    const res = await request(app)
      .get('/api/mobil/katalog-durumu')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.yeni_katalog_var).toBe(true);
  });

  test('katalog-gorundu sonrası yeni_katalog_var tekrar false döner', async () => {
    await request(app)
      .post('/api/mobil/katalog-gorundu')
      .set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .get('/api/mobil/katalog-durumu')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.yeni_katalog_var).toBe(false);
  });

  test('token olmadan 401 döner', async () => {
    const res = await request(app).get('/api/mobil/katalog-durumu');
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js -t "katalog-durumu"`
Expected: FAIL — `/api/mobil/katalog-durumu` ucu henüz yok (404, `res.body.ok` tanımsız).

- [ ] **Step 3: `routes/mobilApi.js`'e yeni uçları ekle**

Dosyanın sonuna, `module.exports` satırından hemen önce ekle:

```javascript
router.get('/katalog-durumu', requireCalisanToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.katalog_guncelleme_tarihi, c.son_gorulen_katalog_tarihi
       FROM calisanlar c JOIN firmalar f ON f.id = c.firma_id
       WHERE c.id = $1`,
      [req.calisanId]
    );
    if (!result.rows.length) return res.status(401).json({ ok: false, error: 'Çalışan bulunamadı.' });
    const { katalog_guncelleme_tarihi, son_gorulen_katalog_tarihi } = result.rows[0];
    const yeniKatalogVar = katalog_guncelleme_tarihi !== null && (
      son_gorulen_katalog_tarihi === null ||
      new Date(katalog_guncelleme_tarihi) > new Date(son_gorulen_katalog_tarihi)
    );
    res.json({ ok: true, yeni_katalog_var: yeniKatalogVar, katalog_guncelleme_tarihi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

router.post('/katalog-gorundu', requireCalisanToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE calisanlar SET son_gorulen_katalog_tarihi = (SELECT katalog_guncelleme_tarihi FROM firmalar WHERE id = calisanlar.firma_id)
       WHERE id = $1`,
      [req.calisanId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js`
Expected: Tüm testler PASS (yeni testler dahil).

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "Bildirim sistemi T3: katalog-durumu ve katalog-gorundu mobil uclari"
```

---

### Task 4: Panel — 60+ gündür ziyaret edilmeyen eczaneler listesi

**Files:**
- Modify: `app.js:229-265` (Saha İstatistikleri sorgu bloğu)
- Modify: `views/public/dashboard.ejs:528-589` (Saha İstatistikleri sekmesi)
- Test: `tests/panel.test.js` veya `tests/kurumsal.test.js` (aşağıda `tests/kurumsal.test.js` kullanılacak, çünkü `/?tab=saha` render'ı zaten `firma.paket==='kurumsal'` gerektiriyor ve kurumsal fixture orada mevcut)

- [ ] **Step 1: Write the failing test**

`tests/kurumsal.test.js`'in sonuna, mevcut son `test(...)` bloğundan sonra (describe kapanışından önce) ekle:

```javascript
  test('Saha İstatistikleri sekmesinde 60+ gündür ziyaret edilmeyen eczaneler listelenir', async () => {
    const eskiEczane = await pool.query(
      "INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Eski Ziyaret Eczanesi', 'eskikod1', 'eskieczaci1') RETURNING id",
      [kurumsalId]
    );
    await pool.query(
      "INSERT INTO ziyaretler (calisan_id, eczane_id, created_at) VALUES (NULL, $1, NOW() - INTERVAL '90 days')",
      [eskiEczane.rows[0].id]
    );
    const hicEczane = await pool.query(
      "INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Hiç Ziyaret Edilmeyen Eczane', 'hickod1', 'hiceczaci1') RETURNING id",
      [kurumsalId]
    );

    const res = await kurumsalAgent.get('/?tab=saha');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Eski Ziyaret Eczanesi');
    expect(res.text).toContain('Hiç Ziyaret Edilmeyen Eczane');

    await pool.query('DELETE FROM eczaneler WHERE id = ANY($1)', [[eskiEczane.rows[0].id, hicEczane.rows[0].id]]);
  });
```

**Doğrulandı:** `ziyaretler.calisan_id` `NOT NULL` kısıtlaması yok (`scripts/migrate.js:29`, `INTEGER REFERENCES calisanlar(id) ON DELETE CASCADE`), yukarıdaki `NULL` değeri hatasız çalışır.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/kurumsal.test.js -t "60\\+ gündür"`
Expected: FAIL — sayfa metni bu eczane isimlerini içermiyor (henüz eklenmedi).

- [ ] **Step 3: `app.js`'teki Saha İstatistikleri sorgu bloğuna yeni sorgu ekle**

`app.js:229-265`'teki mevcut blok:

```javascript
    let sahaIstatistik = { gunlukZiyaret: [], temsilciZiyaret: [], eczaneOkutma: [], tiklamaDagilimi: [] };
    if (tab === 'saha' && firma.paket === 'kurumsal') {
```

Şununla değiştir (sadece ilk satır, obje literaline yeni alan eklenir):

```javascript
    let sahaIstatistik = { gunlukZiyaret: [], temsilciZiyaret: [], eczaneOkutma: [], tiklamaDagilimi: [], ziyaretEdilmeyenEczaneler: [] };
    if (tab === 'saha' && firma.paket === 'kurumsal') {
```

Sonra, `app.js:252-258`'deki (tiklamaResult sorgusundan hemen sonra, `sahaIstatistik = {` atamasından önce) şu satırı ekle:

```javascript
      const ziyaretEdilmeyenResult = await pool.query(
        `SELECT e.ad, MAX(z.created_at) as son_ziyaret
         FROM eczaneler e
         LEFT JOIN ziyaretler z ON z.eczane_id = e.id
         WHERE e.firma_id = $1
         GROUP BY e.id, e.ad
         HAVING MAX(z.created_at) IS NULL OR MAX(z.created_at) < NOW() - INTERVAL '60 days'
         ORDER BY son_ziyaret ASC NULLS FIRST`,
        [req.session.firmaId]
      );
```

Ve `sahaIstatistik = {` atamasına (`app.js:259-264`) yeni alanı ekle. Mevcut hali:

```javascript
      sahaIstatistik = {
        gunlukZiyaret: gunlukResult.rows.map(r => ({ gun: r.gun, sayi: Number(r.sayi) })),
        temsilciZiyaret: temsilciResult.rows.map(r => ({ ad: r.ad, soyad: r.soyad, sayi: Number(r.sayi) })),
        eczaneOkutma: eczaneIstatistikResult.rows.map(r => ({ ad: r.ad, sayi: Number(r.sayi) })),
        tiklamaDagilimi: tiklamaResult.rows.map(r => ({ tip: r.tip, sayi: Number(r.sayi) })),
      };
```

Şununla değiştir:

```javascript
      sahaIstatistik = {
        gunlukZiyaret: gunlukResult.rows.map(r => ({ gun: r.gun, sayi: Number(r.sayi) })),
        temsilciZiyaret: temsilciResult.rows.map(r => ({ ad: r.ad, soyad: r.soyad, sayi: Number(r.sayi) })),
        eczaneOkutma: eczaneIstatistikResult.rows.map(r => ({ ad: r.ad, sayi: Number(r.sayi) })),
        tiklamaDagilimi: tiklamaResult.rows.map(r => ({ tip: r.tip, sayi: Number(r.sayi) })),
        ziyaretEdilmeyenEczaneler: ziyaretEdilmeyenResult.rows.map(r => ({ ad: r.ad, sonZiyaret: r.son_ziyaret })),
      };
```

- [ ] **Step 4: `views/public/dashboard.ejs`'teki Saha İstatistikleri sekmesine yeni bölüm ekle**

`views/public/dashboard.ejs:528-530`'daki mevcut hali:

```html
  <!-- TAB: SAHA İSTATİSTİKLERİ -->
  <% } else if (tab === 'saha' && firma.paket === 'kurumsal') { %>
    <% if (!sahaIstatistik.gunlukZiyaret.length && !sahaIstatistik.eczaneOkutma.length && !sahaIstatistik.tiklamaDagilimi.length) { %>
```

Şununla değiştir (yeni bölüm en üste, boş-durum kontrolünden önce eklenir çünkü bu liste diğer istatistikler boşken bile gösterilmeli):

```html
  <!-- TAB: SAHA İSTATİSTİKLERİ -->
  <% } else if (tab === 'saha' && firma.paket === 'kurumsal') { %>
    <% if (sahaIstatistik.ziyaretEdilmeyenEczaneler.length) { %>
    <div class="table-wrap" style="padding:20px;margin-bottom:16px">
      <h3 style="margin-bottom:12px">⚠️ 60+ Gündür Ziyaret Edilmeyen Eczaneler</h3>
      <ul>
        <% sahaIstatistik.ziyaretEdilmeyenEczaneler.forEach(e => { %>
          <li>
            <%= e.ad %> —
            <% if (e.sonZiyaret) { %>
              Son ziyaret: <%= new Date(e.sonZiyaret).toLocaleDateString('tr-TR') %>
            <% } else { %>
              Hiç ziyaret edilmedi
            <% } %>
          </li>
        <% }) %>
      </ul>
    </div>
    <% } %>
    <% if (!sahaIstatistik.gunlukZiyaret.length && !sahaIstatistik.eczaneOkutma.length && !sahaIstatistik.tiklamaDagilimi.length) { %>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/kurumsal.test.js`
Expected: Tüm testler PASS (yeni test dahil).

- [ ] **Step 6: Commit**

```bash
git add app.js views/public/dashboard.ejs tests/kurumsal.test.js
git commit -m "Bildirim sistemi T4: panelde 60+ gun ziyaret edilmeyen eczaneler listesi"
```

---

### Task 5: Backend tam test + deploy + production doğrulama

**Files:** Yok (komutlar)

- [ ] **Step 1: Tüm backend testleri**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 2: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Prod migration**

Run: `node scripts/migrate.js`
Expected: `katalog_guncelleme_tarihi` ve `son_gorulen_katalog_tarihi` kolonları için `OK`.

- [ ] **Step 4: Marker firma+çalışan ile prod doğrulaması**

Daha önceki İP'lerde kullanılan marker deseniyle (bkz. `docs/superpowers/plans/2026-07-06-eczane-detayli-analitik.md` Task 7): bir marker firma (kurumsal paket, `yetkili_email`/`kullanici_adi`/`yetkili_sifre_hash` ile) + o firmaya bağlı, `giris_email`/`giris_sifre_hash` ile bir çalışan (temsilci) oluştur.

1. **Katalog yükleme (gerçek S3 ile başarı yolu):** Firma hesabıyla `/giris` üzerinden cookie ile giriş yap, `curl -F "katalog=@ornek.pdf;type=application/pdf"` ile `/kurumsal/katalog`'a gerçek bir PDF yükle. Sonra DB'den `SELECT katalog_url, katalog_guncelleme_tarihi FROM firmalar WHERE id=<marker_firma_id>` ile ikisinin de dolu olduğunu doğrula — bu, Task 2'nin test ortamında doğrulanamayan başarı yolunun tek gerçek kanıtı.
2. **Mobil uç:** `/api/mobil/temsilci-giris` ile token al, `curl` ile `/api/mobil/katalog-durumu`'nun 200 döndüğünü ve `yeni_katalog_var: true` içerdiğini doğrula (adım 1'deki yükleme sonrası).
3. **Panel:** Aynı firma hesabıyla `/?tab=saha`'yı çek, "60+ Gündür Ziyaret Edilmeyen Eczaneler" başlığının render edildiğini doğrula (marker firma için en az bir eczane + eski/hiç ziyaret olmayan bir kayıt oluşturarak).

Sonunda marker verisini (firma, çalışan, varsa eczane) temizle.

- [ ] **Step 5: git durumu**

Run: `git status --short`
Expected: Boş.

---

### Task 6: Android — Models.kt + ApiService.kt yeni uçlar

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\Models.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\ApiService.kt`

- [ ] **Step 1: `Models.kt`'e yeni veri sınıflarını ekle**

Dosyanın sonuna ekle:

```kotlin
@Serializable
data class KatalogDurumuCevap(
    val ok: Boolean,
    val yeni_katalog_var: Boolean = false,
    val katalog_guncelleme_tarihi: String? = null,
    val error: String? = null,
)

@Serializable
data class KatalogGorunduCevap(
    val ok: Boolean,
    val error: String? = null,
)
```

- [ ] **Step 2: `ApiService.kt`'e yeni uçları ekle**

Dosyanın sonuna (`kartYazildi` fonksiyonundan sonra, kapanış `}`'den önce) ekle:

```kotlin
    @GET("api/mobil/katalog-durumu")
    suspend fun katalogDurumu(
        @Header("Authorization") yetki: String,
    ): Response<KatalogDurumuCevap>

    @FormUrlEncoded
    @POST("api/mobil/katalog-gorundu")
    suspend fun katalogGorundu(
        @Header("Authorization") yetki: String,
        @Field("_") bos: String = "1",
    ): Response<KatalogGorunduCevap>
```

**Not:** `katalogGorundu` gövdesiz bir POST olsa da, Retrofit `@FormUrlEncoded` bir POST'un en az bir `@Field` içermesini gerektirir; bu yüzden kullanılmayan bir `_` alanı eklendi (backend bu alanı okumaz, zararsızdır).

- [ ] **Step 3: Derleme ile doğrula (test cihazı gerekmez)**

Run (PowerShell, JAVA_HOME ayarlanmış olarak):
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat compileDebugKotlin
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/data/Models.kt app/src/main/java/com/nfckartify/bayi/data/ApiService.kt
git commit -m "Bildirim sistemi T6: Models + ApiService katalog uclari"
```

---

### Task 7: Android — `KatalogDurumuViewModel`

**Files:**
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\KatalogDurumuViewModel.kt`

- [ ] **Step 1: Dosyayı oluştur**

`ZiyaretlerimViewModel.kt` (`C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\ZiyaretlerimViewModel.kt`) ile aynı desende:

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.TokenDeposu
import kotlinx.coroutines.launch

class KatalogDurumuViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var yeniKatalogVar by mutableStateOf(false)
        private set

    fun kontrolEt() {
        val token = tokenDeposu.temsilciTokenAl() ?: return
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.katalogDurumu("Bearer $token")
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    yeniKatalogVar = govde.yeni_katalog_var
                }
            } catch (e: Exception) {
                // Sessizce yut — banner sadece bir bilgilendirme, hata olursa gösterilmez.
            }
        }
    }

    fun gorulduIsaretle() {
        val token = tokenDeposu.temsilciTokenAl() ?: return
        yeniKatalogVar = false
        viewModelScope.launch {
            try {
                ApiClient.servis.katalogGorundu("Bearer $token")
            } catch (e: Exception) {
                // Sessizce yut — kullanıcı bir sonraki açılışta banner'ı tekrar görebilir, kritik değil.
            }
        }
    }
}
```

- [ ] **Step 2: Derleme ile doğrula**

Run (PowerShell):
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat compileDebugKotlin
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/ui/KatalogDurumuViewModel.kt
git commit -m "Bildirim sistemi T7: KatalogDurumuViewModel"
```

---

### Task 8: Android — `TemsilciAnaEkrani.kt` banner + navigasyon

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\TemsilciAnaEkrani.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\NfcKartifyApp.kt`

- [ ] **Step 1: `TemsilciAnaEkrani.kt`'i güncelle**

Dosyanın tam güncel hali:

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun TemsilciAnaEkrani(
    katalogDurumuViewModel: KatalogDurumuViewModel,
    ziyaretKaydetTiklandi: () -> Unit,
    ziyaretlerimTiklandi: () -> Unit,
    rafKartiYazTiklandi: () -> Unit,
    cikisTiklandi: () -> Unit,
) {
    LaunchedEffect(Unit) { katalogDurumuViewModel.kontrolEt() }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Temsilci Paneli", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(24.dp))

        if (katalogDurumuViewModel.yeniKatalogVar) {
            Card(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                    Text("📄 Yeni katalog yüklendi!", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.padding(4.dp))
                    Button(onClick = { katalogDurumuViewModel.gorulduIsaretle() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Gördüm")
                    }
                }
            }
        }

        Button(onClick = ziyaretKaydetTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Ziyaret Kaydet")
        }
        Spacer(modifier = Modifier.padding(8.dp))
        Button(onClick = ziyaretlerimTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Ziyaretlerim")
        }
        Spacer(modifier = Modifier.padding(8.dp))
        Button(onClick = rafKartiYazTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Raf Kartı Yaz")
        }
        Spacer(modifier = Modifier.padding(24.dp))
        OutlinedButton(onClick = cikisTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Çıkış")
        }
    }
}
```

- [ ] **Step 2: `NfcKartifyApp.kt`'teki çağrı sitesini güncelle**

`NfcKartifyApp.kt:48-56`'daki mevcut hali:

```kotlin
        composable("temsilciAna") {
            TemsilciAnaEkrani(
                ziyaretKaydetTiklandi = { navController.navigate("ziyaretKaydet") },
                ziyaretlerimTiklandi = { navController.navigate("ziyaretlerim") },
                rafKartiYazTiklandi = { navController.navigate("eczanelerim") },
                cikisTiklandi = {
```

Şununla değiştir:

```kotlin
        composable("temsilciAna") {
            val katalogDurumuVm: KatalogDurumuViewModel = viewModel { KatalogDurumuViewModel(tokenDeposu) }
            TemsilciAnaEkrani(
                katalogDurumuViewModel = katalogDurumuVm,
                ziyaretKaydetTiklandi = { navController.navigate("ziyaretKaydet") },
                ziyaretlerimTiklandi = { navController.navigate("ziyaretlerim") },
                rafKartiYazTiklandi = { navController.navigate("eczanelerim") },
                cikisTiklandi = {
```

**Not:** Bu `composable("temsilciAna")` bloğunun geri kalanı (kapanışa kadar, `cikisTiklandi = { ... }` içeriği ve `)` kapanışı) aynı kalır, sadece yukarıdaki iki satır (`val katalogDurumuVm = ...` eklenmesi ve `katalogDurumuViewModel = katalogDurumuVm,` parametresinin eklenmesi) değişir.

- [ ] **Step 3: Derleme ile doğrula**

Run (PowerShell):
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat compileDebugKotlin
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/ui/TemsilciAnaEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt
git commit -m "Bildirim sistemi T8: TemsilciAnaEkrani katalog banner"
```

---

### Task 9: Android tam derleme + cihazda gerçek test

**Files:** Yok (derleme + manuel test)

- [ ] **Step 1: Tam debug APK derle**

Run (PowerShell):
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat assembleDebug
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Cihaza kur**

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

- [ ] **Step 3: Uçtan uca manuel doğrulama**

1. Web panelden (kurumsal firma hesabıyla) `/?tab=icerik`'e git, bir katalog PDF yükle.
2. Mobil uygulamada, o firmanın bir temsilci/mümessil giriş bilgisiyle giriş yap, Temsilci Ana Ekranı'na gel.
3. "📄 Yeni katalog yüklendi!" banner'ının göründüğünü doğrula.
4. "Gördüm" butonuna bas, banner'ın kapandığını doğrula.
5. Uygulamadan çıkıp tekrar giriş yap (veya ekranı yeniden aç) — banner'ın **tekrar çıkmadığını** doğrula.
6. Panelde Saha İstatistikleri sekmesine git, "60+ Gündür Ziyaret Edilmeyen Eczaneler" bölümünün (varsa uygun test verisiyle) göründüğünü doğrula.

- [ ] **Step 4: Sonucu bildir**

Kullanıcıya cihazda doğrulamanın tamamlandığını bildir, herhangi bir sorun bulunursa (banner çıkmıyor, kapanmıyor, tekrar çıkıyor vb.) düzeltip Task 6-8'e dön.
