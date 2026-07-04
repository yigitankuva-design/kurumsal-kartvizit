# İP-1 — Firma Yetkilisi Mobil Girişi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurumsal firma yetkilisi, web panel kullanıcı adı/şifresiyle mobil uygulamaya girip kendi firmasının çalışan, müşteri/raf ve eczacı kartlarını yazabilsin.

**Architecture:** Mevcut bayi ve temsilci (calisan) JWT auth desenleri üçüncü kez — firma için — tekrarlanır. `firmalar` tablosunun mevcut `yetkili_email`/`kullanici_adi`/`yetkili_sifre_hash` alanları kullanılır, yeni tablo yok. Mobilde giriş ekranına üçüncü rol eklenir; mevcut `CalisanlarEkrani` ve `EczanelerimEkrani` Composable'ları, ViewModel'lerine eklenen bir `firmaModu` bayrağıyla firma token verisine bağlanarak aynen yeniden kullanılır.

**Tech Stack:** Backend: Node/Express, PostgreSQL, jsonwebtoken, bcrypt, Jest+supertest. Android: Kotlin, Jetpack Compose, Retrofit, kotlinx.serialization.

**İki repo:**
- Backend: `C:\Users\muham\kurumsal-kartvizit` (git + GitHub remote, Railway deploy)
- Android: `C:\Users\muham\nfckartify-bayi-android` (git, remote YOK)

**Android komutları (PowerShell, her oturumda JAVA_HOME set edilmeli):**
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat <görev>
```

---

## BÖLÜM A — BACKEND

### Task 1: `firmaToken` üretme/doğrulama (utils/jwt.js)

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\utils\jwt.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\jwt.test.js`

- [ ] **Step 1: Başarısız testi yaz** — `tests/jwt.test.js` sonuna ekle:

```javascript
describe('utils/jwt — firma', () => {
  test('üretilen firma token doğrulanınca doğru firmaId döner', () => {
    const { firmaTokenUret, firmaTokenDogrula } = require('../utils/jwt');
    const token = firmaTokenUret(77);
    const payload = firmaTokenDogrula(token);
    expect(payload.firmaId).toBe(77);
  });

  test('bozuk firma token doğrulanamaz', () => {
    const { firmaTokenDogrula } = require('../utils/jwt');
    expect(() => firmaTokenDogrula('gecersiz.token.deger')).toThrow();
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/jwt.test.js`
Expected: FAIL — `firmaTokenUret is not a function`

- [ ] **Step 3: `utils/jwt.js`'e fonksiyonları ekle** — `calisanTokenDogrula`'dan sonra, `module.exports`'tan önce:

```javascript
function firmaTokenUret(firmaId) {
  return jwt.sign({ firmaId }, secretAl(), { expiresIn: '30d' });
}

function firmaTokenDogrula(token) {
  return jwt.verify(token, secretAl());
}
```

Ve `module.exports` satırını şu hale getir:

```javascript
module.exports = { bayiTokenUret, bayiTokenDogrula, calisanTokenUret, calisanTokenDogrula, firmaTokenUret, firmaTokenDogrula };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/jwt.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /c/Users/muham/kurumsal-kartvizit
git add utils/jwt.js tests/jwt.test.js
git commit -m "IP-1: firmaToken uret/dogrula"
```

---

### Task 2: `requireFirmaToken` middleware (middleware/tokenAuth.js)

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\middleware\tokenAuth.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\tokenAuth.test.js`

- [ ] **Step 1: Mevcut test dosyasını oku** — desenini görmek için:

Run: `cat /c/Users/muham/kurumsal-kartvizit/tests/tokenAuth.test.js`

- [ ] **Step 2: Başarısız testi yaz** — `tests/tokenAuth.test.js` sonuna ekle:

```javascript
describe('requireFirmaToken', () => {
  const { requireFirmaToken } = require('../middleware/tokenAuth');
  const { firmaTokenUret } = require('../utils/jwt');

  function sahteResponse() {
    return {
      kod: null, govde: null,
      status(k) { this.kod = k; return this; },
      json(g) { this.govde = g; return this; },
    };
  }

  test('geçerli token ile req.firmaId set edilir ve next çağrılır', () => {
    const token = firmaTokenUret(55);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = sahteResponse();
    let nextCagrildi = false;
    requireFirmaToken(req, res, () => { nextCagrildi = true; });
    expect(nextCagrildi).toBe(true);
    expect(req.firmaId).toBe(55);
  });

  test('token yoksa 401 döner', () => {
    const req = { headers: {} };
    const res = sahteResponse();
    requireFirmaToken(req, res, () => {});
    expect(res.kod).toBe(401);
  });
});
```

- [ ] **Step 3: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/tokenAuth.test.js`
Expected: FAIL — `requireFirmaToken is not a function`

- [ ] **Step 4: `middleware/tokenAuth.js`'i güncelle** — 1. satırdaki import'u şu hale getir:

```javascript
const { bayiTokenDogrula, calisanTokenDogrula, firmaTokenDogrula } = require('../utils/jwt');
```

`requireCalisanToken`'dan sonra, `module.exports`'tan önce ekle:

```javascript
function requireFirmaToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [tip, token] = header.split(' ');
  if (tip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  try {
    const payload = firmaTokenDogrula(token);
    req.firmaId = payload.firmaId;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
}
```

`module.exports` satırını şu hale getir:

```javascript
module.exports = { requireBayiToken, requireCalisanToken, requireFirmaToken };
```

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/tokenAuth.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add middleware/tokenAuth.js tests/tokenAuth.test.js
git commit -m "IP-1: requireFirmaToken middleware"
```

---

### Task 3: `POST /api/mobil/firma-giris` ucu

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\mobilApi.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\mobilApi.test.js`

- [ ] **Step 1: Başarısız test bloğunu yaz** — `tests/mobilApi.test.js`'te `describe('Mobil API — /api/mobil/eczanelerim' ...)` bloğundan ÖNCE (yani son bloktan önce) ekle. Not: `pool.end()` yalnızca dosyanın EN SON `describe` bloğunun `afterAll`'unda olmalı; bu blok sonuncu değilse `pool.end()` KOYMA.

```javascript
describe('Mobil API — /api/mobil/firma-giris', () => {
  let firmaId;
  const email = 'firma-giris-test@example.com';
  const kullaniciAdi = 'firmagiristest';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 12);
    const r = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, kullanici_adi, yetkili_sifre_hash, paket)
       VALUES ('Firma Giris Test', 'firma-giris-test', $1, $2, $3, 'kurumsal') RETURNING id`,
      [email, kullaniciAdi, hash]
    );
    firmaId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('e-posta ile doğru bilgilerle token döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: email, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.firma.id).toBe(firmaId);
  });

  test('kullanıcı adı ile de token döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: kullaniciAdi, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('yanlış şifreyle 401 döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: email, sifre: 'yanlis' });
    expect(res.statusCode).toBe(401);
  });

  test('eksik alanla 400 döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: email });
    expect(res.statusCode).toBe(400);
  });

  test('kayıtlı olmayan bilgi ile 401 döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: 'yok@example.com', sifre: 'x' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -t "firma-giris"`
Expected: FAIL — 404 (route yok)

- [ ] **Step 3: `routes/mobilApi.js`'i güncelle** — 5. satırdaki jwt import'unu şu hale getir:

```javascript
const { bayiTokenUret, calisanTokenUret, firmaTokenUret } = require('../utils/jwt');
```

7. satırdaki tokenAuth import'unu şu hale getir:

```javascript
const { requireBayiToken, requireCalisanToken, requireFirmaToken } = require('../middleware/tokenAuth');
```

`temsilci-giris` route'unun `});` kapanışından sonra ekle:

```javascript
const firmaGirisLimiter = createJsonLimiter('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');

router.post('/firma-giris', firmaGirisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    return res.status(400).json({ ok: false, error: 'E-posta/kullanıcı adı ve şifre zorunlu.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM firmalar WHERE yetkili_email = $1 OR kullanici_adi = $1',
      [giris_bilgisi]
    );
    if (!result.rows.length || !result.rows[0].yetkili_sifre_hash) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const firma = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, firma.yetkili_sifre_hash);
    if (!eslesme) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const token = firmaTokenUret(firma.id);
    res.json({ ok: true, token, firma: { id: firma.id, ad: firma.ad } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js -t "firma-giris"`
Expected: PASS (5 test)

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "IP-1: /api/mobil/firma-giris ucu"
```

---

### Task 4: `GET /api/mobil/firma/calisanlarimiz` ucu

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\mobilApi.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\mobilApi.test.js`

- [ ] **Step 1: Başarısız test bloğunu yaz** — `firma-giris` bloğundan sonra (son blok `eczanelerim`'den önce) ekle:

```javascript
describe('Mobil API — /api/mobil/firma/calisanlarimiz', () => {
  let firmaId, digerFirmaId, token;

  beforeAll(async () => {
    const { firmaTokenUret } = require('../utils/jwt');
    const r = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Firma Calisan Test', 'firma-calisan-test', 'fc1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = r.rows[0].id;
    token = firmaTokenUret(firmaId);
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Ali', 'Veli', 'ali-veli-fc')`,
      [firmaId]
    );
    const d = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Diger Firma FC', 'diger-firma-fc', 'fc2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    digerFirmaId = d.rows[0].id;
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Baska', 'Kisi', 'baska-kisi-fc')`,
      [digerFirmaId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirmaId]);
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/firma/calisanlarimiz');
    expect(res.statusCode).toBe(401);
  });

  test('yalnızca kendi firmasının çalışanları döner', async () => {
    const res = await request(app)
      .get('/api/mobil/firma/calisanlarimiz')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.firma.id).toBe(firmaId);
    const adlar = res.body.calisanlar.map((c) => c.ad);
    expect(adlar).toContain('Ali');
    expect(adlar).not.toContain('Baska');
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -t "firma/calisanlarimiz"`
Expected: FAIL — 404

- [ ] **Step 3: `routes/mobilApi.js`'e ekle** — `firma-giris` route'undan sonra:

```javascript
router.get('/firma/calisanlarimiz', requireFirmaToken, async (req, res) => {
  try {
    const firmaResult = await pool.query('SELECT id, ad, slug FROM firmalar WHERE id = $1', [req.firmaId]);
    if (!firmaResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Firma bulunamadı.' });
    }
    const calisanlarResult = await pool.query(
      'SELECT * FROM calisanlar WHERE firma_id = $1 ORDER BY created_at DESC',
      [req.firmaId]
    );
    res.json({ ok: true, firma: firmaResult.rows[0], calisanlar: calisanlarResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js -t "firma/calisanlarimiz"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "IP-1: /api/mobil/firma/calisanlarimiz ucu"
```

---

### Task 5: `GET /api/mobil/firma/eczanelerimiz` ucu

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\mobilApi.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\mobilApi.test.js`

- [ ] **Step 1: Başarısız test bloğunu yaz** — `firma/calisanlarimiz` bloğundan sonra ekle:

```javascript
describe('Mobil API — /api/mobil/firma/eczanelerimiz', () => {
  let firmaId, digerFirmaId, token;

  beforeAll(async () => {
    const { firmaTokenUret } = require('../utils/jwt');
    const r = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Firma Eczane Test', 'firma-eczane-test', 'fe1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = r.rows[0].id;
    token = firmaTokenUret(firmaId);
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Benim Eczanem', 'femus1', 'feecz1')`,
      [firmaId]
    );
    const d = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Diger Firma FE', 'diger-firma-fe', 'fe2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    digerFirmaId = d.rows[0].id;
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Baska Eczane', 'febaska1')`,
      [digerFirmaId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirmaId]);
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/firma/eczanelerimiz');
    expect(res.statusCode).toBe(401);
  });

  test('yalnızca kendi firmasının eczaneleri (eczaci_kod dahil) döner', async () => {
    const res = await request(app)
      .get('/api/mobil/firma/eczanelerimiz')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const adlar = res.body.eczaneler.map((e) => e.ad);
    expect(adlar).toContain('Benim Eczanem');
    expect(adlar).not.toContain('Baska Eczane');
    const benim = res.body.eczaneler.find((e) => e.ad === 'Benim Eczanem');
    expect(benim.eczaci_kod).toBe('feecz1');
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js -t "firma/eczanelerimiz"`
Expected: FAIL — 404

- [ ] **Step 3: `routes/mobilApi.js`'e ekle** — `firma/calisanlarimiz` route'undan sonra:

```javascript
router.get('/firma/eczanelerimiz', requireFirmaToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, ad, adres, kod, eczaci_kod FROM eczaneler WHERE firma_id = $1 ORDER BY created_at DESC`,
      [req.firmaId]
    );
    res.json({ ok: true, eczaneler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx jest tests/mobilApi.test.js -t "firma/eczanelerimiz"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "IP-1: /api/mobil/firma/eczanelerimiz ucu"
```

---

### Task 6: Tam backend testi + deploy + production doğrulama

**Files:** Yok (komutlar)

- [ ] **Step 1: Tüm backend testleri çalıştır**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 2: Push + Railway deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 3: Deploy'un canlıya çıkışını doğrula (yeni uca özgü marker)**

Geçici bir marker firma oluştur, canlıya `firma-giris` at, token bekle. Deploy öncesi uç 404, sonrası 200 döner (yeni uca özgü, yanlış-pozitif yok).

```bash
node -e "
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./db');
(async () => {
  const hash = await bcrypt.hash('marker1234', 12);
  const r = await pool.query(
    \`INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
     VALUES ('IP1 Marker', 'ip1-marker', 'ip1marker@example.com', \$1, 'kurumsal') RETURNING id\`,
    [hash]
  );
  console.log('firmaId', r.rows[0].id);
  await pool.end();
})();
"
```

Sonra üretim URL'sine at (200 + token gelene kadar birkaç kez dene):

```bash
curl -s -X POST https://www.nfckartify.com.tr/api/mobil/firma-giris \
  -H "Content-Type: application/json" \
  -d '{"giris_bilgisi":"ip1marker@example.com","sifre":"marker1234"}'
```

Expected: `{"ok":true,"token":"...","firma":{...}}`

- [ ] **Step 4: Marker firmayı temizle**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  await pool.query(\"DELETE FROM firmalar WHERE slug = 'ip1-marker'\");
  console.log('silindi');
  await pool.end();
})();
"
```

- [ ] **Step 5: git durumunu doğrula**

Run: `git status --short`
Expected: Boş.

---

## BÖLÜM B — ANDROID

### Task 7: Modeller + ApiService firma uçları

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\Models.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\ApiService.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\test\java\com\nfckartify\bayi\data\ApiServiceTest.kt`

- [ ] **Step 1: Mevcut ApiServiceTest'i oku** (desen için):

Run: `cat "/c/Users/muham/nfckartify-bayi-android/app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt"`

- [ ] **Step 2: Başarısız test yaz** — `ApiServiceTest.kt`'e, `FirmaGirisCevap` deserialize testi ekle (mevcut testlerin yanına, `json` yardımcısı dosyada mevcut değilse mevcut testlerin kullandığı deserialize yöntemini birebir uygula):

```kotlin
@Test
fun `firma giris cevabi dogru deserialize olur`() {
    val jsonMetin = """{"ok":true,"token":"abc","firma":{"id":7,"ad":"Test Firma"}}"""
    val cevap = Json { ignoreUnknownKeys = true }.decodeFromString<FirmaGirisCevap>(jsonMetin)
    assertTrue(cevap.ok)
    assertEquals("abc", cevap.token)
    assertEquals(7, cevap.firma?.id)
    assertEquals("Test Firma", cevap.firma?.ad)
}
```

Gerekli importlar dosyada yoksa ekle: `import kotlinx.serialization.json.Json`, `import kotlinx.serialization.decodeFromString`, `import org.junit.Assert.assertEquals`, `import org.junit.Assert.assertTrue`.

- [ ] **Step 3: Testi çalıştırıp başarısız olduğunu doğrula** (PowerShell)

Run: `.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: FAIL — `FirmaGirisCevap` çözümlenemedi (derleme hatası).

- [ ] **Step 4: `Models.kt`'e ekle** — dosya sonuna:

```kotlin
@Serializable
data class FirmaGirisOzet(
    val id: Int,
    val ad: String,
)

@Serializable
data class FirmaGirisCevap(
    val ok: Boolean,
    val token: String? = null,
    val firma: FirmaGirisOzet? = null,
    val error: String? = null,
)
```

- [ ] **Step 5: `ApiService.kt`'e uçları ekle** — `interface ApiService` içinde, son `eczanelerim` fonksiyonundan sonra:

```kotlin
    @FormUrlEncoded
    @POST("api/mobil/firma-giris")
    suspend fun firmaGiris(
        @Field("giris_bilgisi") girisBilgisi: String,
        @Field("sifre") sifre: String,
    ): Response<FirmaGirisCevap>

    @GET("api/mobil/firma/calisanlarimiz")
    suspend fun firmaCalisanlarimiz(
        @Header("Authorization") yetki: String,
    ): Response<MusteriDetayCevap>

    @GET("api/mobil/firma/eczanelerimiz")
    suspend fun firmaEczanelerimiz(
        @Header("Authorization") yetki: String,
    ): Response<EczanelerimCevap>
```

- [ ] **Step 6: Testi çalıştırıp geçtiğini doğrula**

Run: `.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/data/Models.kt app/src/main/java/com/nfckartify/bayi/data/ApiService.kt app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt
git commit -m "IP-1: firma giris/calisanlarimiz/eczanelerimiz model+servis"
```

---

### Task 8: TokenDeposu firma token

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\TokenDeposu.kt`

Bu dosya Android Context'e bağımlı (EncryptedSharedPreferences) — JVM unit testi yok, derleme + cihaz testi (Task 12) doğrular.

- [ ] **Step 1: `TokenDeposu.kt`'e ekle** — `temsilciAdiAl()`'dan sonra, `cikisYap()`'tan önce:

```kotlin
    fun firmaTokenKaydet(token: String, firmaAdi: String) {
        tercihler.edit()
            .putString("firma_token", token)
            .putString("firma_adi", firmaAdi)
            .apply()
    }

    fun firmaTokenAl(): String? = tercihler.getString("firma_token", null)

    fun firmaAdiAl(): String? = tercihler.getString("firma_adi", null)
```

- [ ] **Step 2: Derlemeyi doğrula**

Run: `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt
git commit -m "IP-1: TokenDeposu firma token"
```

---

### Task 9: GirisViewModel firma rolü

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\GirisViewModel.kt`

- [ ] **Step 1: `GirisViewModel.kt`'i güncelle** — enum satırını (13) şu hale getir:

```kotlin
enum class GirisRolu { BAYI, TEMSILCI, FIRMA }
```

`temsilciGirisBasarili` flag tanımından sonra ekle:

```kotlin
    var firmaGirisBasarili by mutableStateOf(false)
        private set
```

`girisYap()` içindeki `if (rol == GirisRolu.BAYI) { ... } else { ... }` bloğunu şu `when` yapısıyla DEĞİŞTİR:

```kotlin
                when (rol) {
                    GirisRolu.BAYI -> {
                        val cevap = ApiClient.servis.girisYap(girisBilgisi, sifre)
                        val govde = cevap.body()
                        if (cevap.isSuccessful && govde?.ok == true && govde.token != null) {
                            tokenDeposu.tokenKaydet(govde.token, govde.bayi?.ad ?: "")
                            girisBasarili = true
                        } else {
                            hataMesaji = govde?.error ?: "Giriş başarısız."
                        }
                    }
                    GirisRolu.TEMSILCI -> {
                        val cevap = ApiClient.servis.temsilciGiris(girisBilgisi, sifre)
                        val govde = cevap.body()
                        if (cevap.isSuccessful && govde?.ok == true && govde.token != null) {
                            val adSoyad = "${govde.calisan?.ad ?: ""} ${govde.calisan?.soyad ?: ""}".trim()
                            tokenDeposu.temsilciTokenKaydet(govde.token, adSoyad)
                            temsilciGirisBasarili = true
                        } else {
                            hataMesaji = govde?.error ?: hataMesajiAl(cevap.errorBody()) ?: "Giriş başarısız."
                        }
                    }
                    GirisRolu.FIRMA -> {
                        val cevap = ApiClient.servis.firmaGiris(girisBilgisi, sifre)
                        val govde = cevap.body()
                        if (cevap.isSuccessful && govde?.ok == true && govde.token != null) {
                            tokenDeposu.firmaTokenKaydet(govde.token, govde.firma?.ad ?: "")
                            firmaGirisBasarili = true
                        } else {
                            hataMesaji = govde?.error ?: hataMesajiAl(cevap.errorBody()) ?: "Giriş başarısız."
                        }
                    }
                }
```

- [ ] **Step 2: Derlemeyi doğrula**

Run: `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/GirisViewModel.kt
git commit -m "IP-1: GirisViewModel firma rolu"
```

---

### Task 10: GirisEkrani üç rol seçici

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\GirisEkrani.kt`

- [ ] **Step 1: `GirisEkrani.kt`'i güncelle** — fonksiyon imzasını (24) şu hale getir:

```kotlin
fun GirisEkrani(
    viewModel: GirisViewModel,
    girisBasarili: () -> Unit,
    temsilciGirisBasarili: () -> Unit,
    firmaGirisBasarili: () -> Unit,
) {
```

Mevcut iki `LaunchedEffect`'ten sonra ekle:

```kotlin
    LaunchedEffect(viewModel.firmaGirisBasarili) {
        if (viewModel.firmaGirisBasarili) firmaGirisBasarili()
    }
```

Rol seçici `Row` bloğunu (40-51) şu üç butonlu yapı ile DEĞİŞTİR:

```kotlin
        Row(modifier = Modifier.fillMaxWidth()) {
            val secili = viewModel.rol
            RolButonu("Bayi", secili == GirisRolu.BAYI, Modifier.weight(1f)) {
                viewModel.rolSecildi(GirisRolu.BAYI)
            }
            Spacer(modifier = Modifier.padding(3.dp))
            RolButonu("Temsilci", secili == GirisRolu.TEMSILCI, Modifier.weight(1f)) {
                viewModel.rolSecildi(GirisRolu.TEMSILCI)
            }
            Spacer(modifier = Modifier.padding(3.dp))
            RolButonu("Firma", secili == GirisRolu.FIRMA, Modifier.weight(1f)) {
                viewModel.rolSecildi(GirisRolu.FIRMA)
            }
        }
```

Alan etiketi satırını (label — "E-posta / Kullanıcı Adı" vs "Giriş E-postası") şu hale getir:

```kotlin
            label = { Text(if (viewModel.rol == GirisRolu.TEMSILCI) "Giriş E-postası" else "E-posta / Kullanıcı Adı") },
```

Dosya sonuna (fonksiyonun kapanış `}`'ından sonra) yardımcı composable ekle:

```kotlin
@Composable
private fun RolButonu(metin: String, secili: Boolean, modifier: Modifier, tiklandi: () -> Unit) {
    if (secili) {
        Button(onClick = tiklandi, modifier = modifier) { Text(metin) }
    } else {
        OutlinedButton(onClick = tiklandi, modifier = modifier) { Text(metin) }
    }
}
```

- [ ] **Step 2: Derlemeyi doğrula**

Run: `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/GirisEkrani.kt
git commit -m "IP-1: GirisEkrani uc rol secici"
```

---

### Task 11: ViewModel'lere firmaModu + FirmaAnaEkrani

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\CalisanlarViewModel.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\EczanelerimViewModel.kt`
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\FirmaAnaEkrani.kt`

- [ ] **Step 1: `CalisanlarViewModel.kt`'i güncelle** — sınıf imzasını şu hale getir:

```kotlin
class CalisanlarViewModel(
    private val tokenDeposu: TokenDeposu,
    private val firmaModu: Boolean = false,
) : ViewModel() {
```

`yukle(firmaId)` fonksiyonunun içini şu hale getir (firma modunda firma token + firmaCalisanlarimiz; değilse mevcut davranış):

```kotlin
    fun yukle(firmaId: Int) {
        val token = (if (firmaModu) tokenDeposu.firmaTokenAl() else tokenDeposu.tokenAl()) ?: run {
            hataMesaji = "Oturum bulunamadı."
            return
        }
        yukleniyor = true
        hataMesaji = null
        viewModelScope.launch {
            try {
                val cevap = if (firmaModu) {
                    ApiClient.servis.firmaCalisanlarimiz("Bearer $token")
                } else {
                    ApiClient.servis.musteriDetayGetir("Bearer $token", firmaId)
                }
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    firmaAdi = govde.firma?.ad ?: ""
                    firmaSlug = govde.firma?.slug ?: ""
                    calisanlar = govde.calisanlar
                } else {
                    hataMesaji = govde?.error ?: "Çalışanlar alınamadı."
                }
            } catch (e: Exception) {
                hataMesaji = "Bağlantı hatası: ${e.message}"
            } finally {
                yukleniyor = false
            }
        }
    }
```

- [ ] **Step 2: `EczanelerimViewModel.kt`'i güncelle** — sınıf imzasını şu hale getir:

```kotlin
class EczanelerimViewModel(
    private val tokenDeposu: TokenDeposu,
    private val firmaModu: Boolean = false,
) : ViewModel() {
```

`yukle()` içindeki token alma satırını ve API çağrısını şu hale getir:

```kotlin
    fun yukle() {
        val token = (if (firmaModu) tokenDeposu.firmaTokenAl() else tokenDeposu.temsilciTokenAl()) ?: run {
            oturumSuresiDoldu = true
            hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
            return
        }
        yukleniyor = true
        hataMesaji = null
        oturumSuresiDoldu = false
        viewModelScope.launch {
            try {
                val cevap = if (firmaModu) {
                    ApiClient.servis.firmaEczanelerimiz("Bearer $token")
                } else {
                    ApiClient.servis.eczanelerim("Bearer $token")
                }
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    eczaneler = govde.eczaneler
                } else if (cevap.code() == 401) {
                    oturumSuresiDoldu = true
                    hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
                } else {
                    hataMesaji = govde?.error ?: hataMesajiAl(cevap.errorBody()) ?: "Eczaneler alınamadı."
                }
            } catch (e: Exception) {
                hataMesaji = "Bağlantı hatası: ${e.message}"
            } finally {
                yukleniyor = false
            }
        }
    }
```

- [ ] **Step 3: `FirmaAnaEkrani.kt`'yi oluştur** (TemsilciAnaEkrani deseniyle):

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun FirmaAnaEkrani(
    calisanlarimizTiklandi: () -> Unit,
    eczanelerimizTiklandi: () -> Unit,
    cikisTiklandi: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Firma Paneli", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(24.dp))

        Button(onClick = calisanlarimizTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Çalışanlarımız")
        }
        Spacer(modifier = Modifier.padding(8.dp))
        Button(onClick = eczanelerimizTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Eczanelerimiz")
        }
        Spacer(modifier = Modifier.padding(24.dp))
        OutlinedButton(onClick = cikisTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Çıkış")
        }
    }
}
```

- [ ] **Step 4: Derlemeyi doğrula**

Run: `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/CalisanlarViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/EczanelerimViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/FirmaAnaEkrani.kt
git commit -m "IP-1: ViewModel firmaModu + FirmaAnaEkrani"
```

---

### Task 12: Navigasyon (NfcKartifyApp)

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\NfcKartifyApp.kt`

- [ ] **Step 1: Başlangıç rotasını güncelle** — `baslangicRota` bloğunu şu hale getir:

```kotlin
    val baslangicRota = when {
        tokenDeposu.tokenAl() != null -> "musteriler"
        tokenDeposu.temsilciTokenAl() != null -> "temsilciAna"
        tokenDeposu.firmaTokenAl() != null -> "firmaAna"
        else -> "giris"
    }
```

- [ ] **Step 2: GirisEkrani çağrısına firma callback ekle** — `GirisEkrani(...)` çağrısında `temsilciGirisBasarili` bloğundan sonra ekle:

```kotlin
                firmaGirisBasarili = {
                    navController.navigate("firmaAna") {
                        popUpTo("giris") { inclusive = true }
                    }
                },
```

- [ ] **Step 3: firmaAna + firma liste rotalarını ekle** — `composable("temsilciAna") { ... }` bloğundan sonra ekle:

```kotlin
        composable("firmaAna") {
            FirmaAnaEkrani(
                calisanlarimizTiklandi = { navController.navigate("firmaCalisanlar") },
                eczanelerimizTiklandi = { navController.navigate("firmaEczaneler") },
                cikisTiklandi = {
                    tokenDeposu.cikisYap()
                    navController.navigate("giris") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
        composable("firmaCalisanlar") {
            val vm: CalisanlarViewModel = viewModel { CalisanlarViewModel(tokenDeposu, firmaModu = true) }
            CalisanlarEkrani(vm, 0) { adSoyad, url ->
                val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                val kodlanmisAd = java.net.URLEncoder.encode(adSoyad, "UTF-8")
                navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl")
            }
        }
        composable("firmaEczaneler") {
            val vm: EczanelerimViewModel = viewModel { EczanelerimViewModel(tokenDeposu, firmaModu = true) }
            EczanelerimEkrani(
                viewModel = vm,
                musteriKartiTiklandi = { eczane ->
                    val url = "https://www.nfckartify.com.tr/raf/${eczane.kod}"
                    val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                    val kodlanmisAd = java.net.URLEncoder.encode(eczane.ad, "UTF-8")
                    navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl?tip=raf")
                },
                eczaciKartiTiklandi = { eczane ->
                    val url = "https://www.nfckartify.com.tr/eczaci/${eczane.eczaci_kod}"
                    val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                    val kodlanmisAd = java.net.URLEncoder.encode("${eczane.ad} (Eczacı)", "UTF-8")
                    navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl?tip=raf")
                },
                girisEkraninaDon = {
                    tokenDeposu.cikisYap()
                    navController.navigate("giris") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
```

- [ ] **Step 4: Derlemeyi doğrula**

Run: `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt
git commit -m "IP-1: firma navigasyonu"
```

---

### Task 13: Tam test + cihazda uçtan uca doğrulama

**Files:** Yok (komutlar + manuel/ADB)

- [ ] **Step 1: Tüm Android unit testleri**

Run (PowerShell): `.\gradlew.bat test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Cihaza kur**

Run (PowerShell): `.\gradlew.bat installDebug`
Expected: `Installed on 1 device.`

- [ ] **Step 3: Test firma hazırla** — backend repo'sunda (zaten "Test Firma" / `testfirma` / `test1234` mevcutsa onu kullan; değilse oluştur):

```bash
cd /c/Users/muham/kurumsal-kartvizit
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const r = await pool.query(\"SELECT id, ad FROM firmalar WHERE kullanici_adi = 'testfirma'\");
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
"
```

- [ ] **Step 4: ADB ile Firma girişi** — uygulamayı aç, giriş ekranında "Firma" seç, `testfirma` / `test1234` ile giriş yap. `FirmaAnaEkrani` (Çalışanlarımız / Eczanelerimiz / Çıkış) geldiğini `uiautomator dump` ile doğrula.

- [ ] **Step 5: Çalışan kartı akışı** — "Çalışanlarımız" → liste → bir çalışanda "Kart Yaz" → KartaYazEkrani açılır. (Firmanın çalışanı yoksa önce web panelden bir çalışan ekle.)

- [ ] **Step 6: Eczane kartı akışı** — "Eczanelerimiz" → liste → "Müşteri Kartı" ve "Eczacı Kartı" butonlarının çalıştığını doğrula (eczaci_kod olmayan eczanede "Eczacı Kartı" devre dışı görünmeli — mevcut EczanelerimEkrani davranışı).

- [ ] **Step 7: Gerçek NFC yazma** — boş bir NFC kartı telefona yaklaştırıp bir çalışan kartını yaz, sonra harici bir telefonla okutup doğru profil sayfasının açıldığını doğrula.

- [ ] **Step 8: Çıkış** — "Çıkış" → giriş ekranına döner, oturum temizlenir (tekrar açılışta giriş ekranı gelir).

- [ ] **Step 9: git durumunu doğrula**

Run: `cd /c/Users/muham/nfckartify-bayi-android && git status --short`
Expected: Boş.
