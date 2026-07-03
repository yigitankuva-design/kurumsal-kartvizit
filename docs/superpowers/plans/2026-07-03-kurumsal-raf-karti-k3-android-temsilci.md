# Kurumsal Raf Kartı — K3 (Android Temsilci Modu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nfckartify-bayi-android` uygulamasına temsilci giriş modu, NFC ile ziyaret kaydetme ve ziyaret geçmişi ekranları eklemek — K2'de hazırlanan backend uçlarını gerçek NFC okumaya bağlamak.

**Architecture:** Mevcut uygulamaya (bayi rolü) ikinci bir rol eklenir: giriş ekranına Bayi/Temsilci seçici konur, temsilci girişi ayrı bir token (`temsilciToken`) ile saklanır. Ziyaret kaydı, K1'in `KartaYazEkrani`/`KartaYazViewModel` state-machine deseni tekrar kullanılarak NFC foreground dispatch üzerinden okutulan karttaki URL'den eczane kodu çıkarılıp backend'e gönderilir. Backend'e tek yeni uç (`GET /api/mobil/ziyaretlerim`) ve mevcut `ziyaret-kaydet` yanıtına bir alan (`eczaneAdi`) eklenir.

**Tech Stack:** Node.js/Express (backend), Kotlin/Jetpack Compose (Android, mevcut proje), Retrofit + kotlinx.serialization, MockWebServer (Android unit test), Jest + Supertest (backend test).

---

### Task 1: Backend — `/ziyaretlerim` ucu + `ziyaret-kaydet` yanıtına eczane adı

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\mobilApi.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\mobilApi.test.js`

- [ ] **Step 1: Başarısız testleri yaz**

`tests/mobilApi.test.js` içinde `describe('Mobil API — /api/mobil/ziyaret-kaydet', ...)` bloğundaki ilk test'i (`'geçerli eczane_kod ile 201 döner ve ziyaretler tablosuna kayıt düşer'`) güncelle:

```js
  test('geçerli eczane_kod ile 201 döner, eczane adıyla birlikte ve ziyaretler tablosuna kayıt düşer', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'ziyarkod' });
    expect(res.statusCode).toBe(201);
    expect(res.body.eczaneAdi).toBe('Ziyaret Eczanesi');
    const z = await pool.query('SELECT * FROM ziyaretler WHERE calisan_id = $1 AND eczane_id = $2', [calisanId, eczaneId]);
    expect(z.rows.length).toBe(1);
  });
```

Aynı dosyanın sonuna (`describe('Mobil API — /api/mobil/ziyaret-kaydet', ...)` bloğundan hemen sonra) yeni bir describe bloğu ekle:

```js

describe('Mobil API — /api/mobil/ziyaretlerim', () => {
  let firmaId, calisanId, eczaneId, token;
  const email = 'ziyaretlerim-test-temsilci@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Ziyaretlerim Test Firma', 'ziyaretlerim-test-firma', 'zl1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;

    const hash = await bcrypt.hash(sifre, 12);
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, giris_email, giris_sifre_hash)
       VALUES ($1, 'Ziyaretlerim', 'Temsilci', 'ziyaretlerim-temsilci', $2, $3) RETURNING id`,
      [firmaId, email, hash]
    );
    calisanId = calisanSonuc.rows[0].id;

    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Ziyaretlerim Eczanesi', 'zlkod1') RETURNING id`,
      [firmaId]
    );
    eczaneId = eczaneSonuc.rows[0].id;

    await pool.query('INSERT INTO ziyaretler (calisan_id, eczane_id) VALUES ($1, $2)', [calisanId, eczaneId]);

    const girisRes = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('kendi ziyaretlerini eczane adıyla döner', async () => {
    const res = await request(app)
      .get('/api/mobil/ziyaretlerim')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ziyaretler.length).toBe(1);
    expect(res.body.ziyaretler[0].eczane_adi).toBe('Ziyaretlerim Eczanesi');
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/ziyaretlerim');
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Testleri çalıştırıp başarısız olduğunu doğrula**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js --verbose`
Expected: FAIL — `res.body.eczaneAdi` `undefined`, `GET /api/mobil/ziyaretlerim` `404`

- [ ] **Step 3: `routes/mobilApi.js`'i güncelle**

`router.post('/ziyaret-kaydet', ...)` içindeki eczane sorgusunu ve yanıtı güncelle:

```js
    const eczaneResult = await pool.query('SELECT id, firma_id, ad FROM eczaneler WHERE kod = $1', [eczane_kod]);
    if (!eczaneResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Eczane bulunamadı.' });
    }
    const eczane = eczaneResult.rows[0];
    if (eczane.firma_id !== calisanResult.rows[0].firma_id) {
      return res.status(403).json({ ok: false, error: 'Bu eczaneye ziyaret kaydedemezsiniz.' });
    }
    await pool.query('INSERT INTO ziyaretler (calisan_id, eczane_id) VALUES ($1, $2)', [req.calisanId, eczane.id]);
    res.status(201).json({ ok: true, eczaneAdi: eczane.ad });
```

Dosyanın sonuna, `module.exports = router;` satırından hemen önce ekle:

```js

router.get('/ziyaretlerim', requireCalisanToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.ad AS eczane_adi, z.created_at
       FROM ziyaretler z JOIN eczaneler e ON e.id = z.eczane_id
       WHERE z.calisan_id = $1
       ORDER BY z.created_at DESC`,
      [req.calisanId]
    );
    res.json({ ok: true, ziyaretler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testleri çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js --verbose`
Expected: PASS (tüm testler)

- [ ] **Step 5: Tam test paketini çalıştır, commit, push, deploy, production doğrulaması**

```bash
npx jest
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "K3: /ziyaretlerim ucu + ziyaret-kaydet yanitina eczane adi"
git push origin master
railway up --service app --detach
```

Yeni deploy'un canlı olduğunu poll et (K3'e özgü marker: `/api/mobil/ziyaretlerim` artık 404 değil 401 dönmeli):

```bash
curl -s -o /dev/null -w "%{http_code}" https://www.nfckartify.com.tr/api/mobil/ziyaretlerim
```

Expected: `401` (deploy tamamlanana kadar birkaç kez tekrar dene, `404` görürsen deploy henüz bitmemiştir)

---

### Task 2: Android — `TokenDeposu.kt` temsilci token saklama

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\TokenDeposu.kt`

Bu dosyada mevcut unit test yok (Android tarafında Context gerektiren sınıflar instrumented test ister, proje bu fazda instrumented test kurmuyor — mevcut Faz1-3 deseniyle aynı, doğrulama derleme + cihazda manuel akışla yapılır, Task 10'da).

- [ ] **Step 1: `TokenDeposu.kt`'i güncelle**

Tüm dosyayı şu hale getir:

```kotlin
package com.nfckartify.bayi.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class TokenDeposu(context: Context) {
    private val tercihler: SharedPreferences by lazy {
        val anaAnahtar = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "nfckartify_bayi_token",
            anaAnahtar,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun tokenKaydet(token: String, bayiAdi: String) {
        tercihler.edit()
            .putString("token", token)
            .putString("bayi_adi", bayiAdi)
            .apply()
    }

    fun tokenAl(): String? = tercihler.getString("token", null)

    fun bayiAdiAl(): String? = tercihler.getString("bayi_adi", null)

    fun temsilciTokenKaydet(token: String, temsilciAdi: String) {
        tercihler.edit()
            .putString("temsilci_token", token)
            .putString("temsilci_adi", temsilciAdi)
            .apply()
    }

    fun temsilciTokenAl(): String? = tercihler.getString("temsilci_token", null)

    fun temsilciAdiAl(): String? = tercihler.getString("temsilci_adi", null)

    fun cikisYap() {
        tercihler.edit().clear().apply()
    }
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt
git commit -m "K3: temsilci token saklama alanlari"
```

---

### Task 3: Android — `Models.kt` yeni veri sınıfları

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\Models.kt`

- [ ] **Step 1: `Models.kt`'in sonuna ekle**

```kotlin

@Serializable
data class TemsilciOzet(
    val id: Int,
    val ad: String,
    val soyad: String,
    val firmaId: Int,
)

@Serializable
data class TemsilciGirisCevap(
    val ok: Boolean,
    val token: String? = null,
    val calisan: TemsilciOzet? = null,
    val error: String? = null,
)

@Serializable
data class ZiyaretKaydetCevap(
    val ok: Boolean,
    val eczaneAdi: String? = null,
    val error: String? = null,
)

@Serializable
data class ZiyaretKaydi(
    val eczane_adi: String,
    val created_at: String,
)

@Serializable
data class ZiyaretlerimCevap(
    val ok: Boolean,
    val ziyaretler: List<ZiyaretKaydi> = emptyList(),
    val error: String? = null,
)
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/data/Models.kt
git commit -m "K3: temsilci/ziyaret veri siniflari"
```

---

### Task 4: Android — `ApiService.kt` yeni uçlar + testler

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\ApiService.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\test\java\com\nfckartify\bayi\data\ApiServiceTest.kt`

- [ ] **Step 1: Başarısız testleri yaz**

`ApiServiceTest.kt`'in sonuna, kapanış `}` satırından önce ekle:

```kotlin

    @Test
    fun `temsilciGiris basarili cevabi token ile doner`() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"ok":true,"token":"tem.tok.en","calisan":{"id":9,"ad":"Ali","soyad":"Veli","firmaId":3}}"""
            ).setResponseCode(200)
        )

        val cevap = servis.temsilciGiris("ali@example.com", "sifre123")

        assertTrue(cevap.isSuccessful)
        assertEquals("tem.tok.en", cevap.body()?.token)
        assertEquals("Ali", cevap.body()?.calisan?.ad)
    }

    @Test
    fun `ziyaretKaydet basarili cevabi eczane adiyla doner`() = runBlocking {
        server.enqueue(
            MockResponse().setBody("""{"ok":true,"eczaneAdi":"Merkez Eczane"}""").setResponseCode(201)
        )

        val cevap = servis.ziyaretKaydet("Bearer test-token", "abc123kd")

        assertTrue(cevap.isSuccessful)
        assertEquals("Merkez Eczane", cevap.body()?.eczaneAdi)
    }

    @Test
    fun `ziyaretlerim listeyi doner`() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"ok":true,"ziyaretler":[{"eczane_adi":"Merkez Eczane","created_at":"2026-07-03T10:00:00.000Z"}]}"""
            ).setResponseCode(200)
        )

        val cevap = servis.ziyaretlerim("Bearer test-token")

        assertTrue(cevap.isSuccessful)
        assertEquals(1, cevap.body()?.ziyaretler?.size)
        assertEquals("Merkez Eczane", cevap.body()?.ziyaretler?.first()?.eczane_adi)
    }
```

- [ ] **Step 2: Testleri çalıştırıp başarısız olduğunu doğrula**

Run: `cd /c/Users/muham/nfckartify-bayi-android && ./gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: FAIL — derleme hatası, `servis.temsilciGiris`/`ziyaretKaydet`/`ziyaretlerim` tanımlı değil

- [ ] **Step 3: `ApiService.kt`'i güncelle**

Import'lara `FormUrlEncoded` zaten var. Interface'in sonuna, kapanış `}` satırından önce ekle:

```kotlin

    @FormUrlEncoded
    @POST("api/mobil/temsilci-giris")
    suspend fun temsilciGiris(
        @Field("giris_email") girisEmail: String,
        @Field("sifre") sifre: String,
    ): Response<TemsilciGirisCevap>

    @FormUrlEncoded
    @POST("api/mobil/ziyaret-kaydet")
    suspend fun ziyaretKaydet(
        @Header("Authorization") yetki: String,
        @Field("eczane_kod") eczaneKod: String,
    ): Response<ZiyaretKaydetCevap>

    @GET("api/mobil/ziyaretlerim")
    suspend fun ziyaretlerim(
        @Header("Authorization") yetki: String,
    ): Response<ZiyaretlerimCevap>
```

- [ ] **Step 4: Testleri çalıştırıp başarılı olduğunu doğrula**

Run: `./gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: PASS (5 test: mevcut 2 + yeni 3)

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/data/ApiService.kt app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt
git commit -m "K3: temsilci-giris/ziyaret-kaydet/ziyaretlerim Retrofit uclari"
```

---

### Task 5: Android — `NfcYazici.kt` karttan URL okuma

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\NfcYazici.kt`

Bu fonksiyon Context/Android framework'e bağımlı olduğu için (gerçek `Tag` nesnesi JVM unit testte oluşturulamaz — Faz3'te de bu fonksiyonlar test edilmedi, cihazda gerçek kartla doğrulandı), doğrulama Task 10'da gerçek cihazla yapılır.

- [ ] **Step 1: `NfcYazici.kt`'in sonuna ekle**

```kotlin

fun tagdanUrlOku(tag: Tag): String? {
    val ndef = Ndef.get(tag) ?: return null
    return try {
        ndef.connect()
        val mesaj = ndef.cachedNdefMessage ?: ndef.ndefMessage
        val kayit = mesaj?.records?.firstOrNull() ?: return null
        String(kayit.payload, 1, kayit.payload.size - 1, Charsets.UTF_8)
    } catch (e: Exception) {
        null
    } finally {
        try { ndef.close() } catch (e: IOException) { /* yoksay */ }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/NfcYazici.kt
git commit -m "K3: karttan URL okuma fonksiyonu"
```

---

### Task 6: Android — `GirisEkrani`/`GirisViewModel` Bayi/Temsilci seçici

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\GirisViewModel.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\GirisEkrani.kt`

- [ ] **Step 1: `GirisViewModel.kt`'i güncelle**

Tüm dosyayı şu hale getir:

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

enum class GirisRolu { BAYI, TEMSILCI }

class GirisViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var rol by mutableStateOf(GirisRolu.BAYI)
        private set
    var girisBilgisi by mutableStateOf("")
        private set
    var sifre by mutableStateOf("")
        private set
    var yukleniyor by mutableStateOf(false)
        private set
    var hataMesaji by mutableStateOf<String?>(null)
        private set
    var girisBasarili by mutableStateOf(false)
        private set
    var temsilciGirisBasarili by mutableStateOf(false)
        private set

    fun rolSecildi(yeniRol: GirisRolu) {
        rol = yeniRol
        hataMesaji = null
    }

    fun girisBilgisiDegisti(deger: String) { girisBilgisi = deger }
    fun sifreDegisti(deger: String) { sifre = deger }

    fun girisYap() {
        if (girisBilgisi.isBlank() || sifre.isBlank()) {
            hataMesaji = "E-posta/kullanıcı adı ve şifre zorunlu."
            return
        }
        yukleniyor = true
        hataMesaji = null
        viewModelScope.launch {
            try {
                if (rol == GirisRolu.BAYI) {
                    val cevap = ApiClient.servis.girisYap(girisBilgisi, sifre)
                    val govde = cevap.body()
                    if (cevap.isSuccessful && govde?.ok == true && govde.token != null) {
                        tokenDeposu.tokenKaydet(govde.token, govde.bayi?.ad ?: "")
                        girisBasarili = true
                    } else {
                        hataMesaji = govde?.error ?: "Giriş başarısız."
                    }
                } else {
                    val cevap = ApiClient.servis.temsilciGiris(girisBilgisi, sifre)
                    val govde = cevap.body()
                    if (cevap.isSuccessful && govde?.ok == true && govde.token != null) {
                        val adSoyad = "${govde.calisan?.ad ?: ""} ${govde.calisan?.soyad ?: ""}".trim()
                        tokenDeposu.temsilciTokenKaydet(govde.token, adSoyad)
                        temsilciGirisBasarili = true
                    } else {
                        hataMesaji = govde?.error ?: "Giriş başarısız."
                    }
                }
            } catch (e: Exception) {
                hataMesaji = "Bağlantı hatası: ${e.message}"
            } finally {
                yukleniyor = false
            }
        }
    }
}
```

- [ ] **Step 2: `GirisEkrani.kt`'i güncelle**

Tüm dosyayı şu hale getir:

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun GirisEkrani(viewModel: GirisViewModel, girisBasarili: () -> Unit, temsilciGirisBasarili: () -> Unit) {
    LaunchedEffect(viewModel.girisBasarili) {
        if (viewModel.girisBasarili) girisBasarili()
    }
    LaunchedEffect(viewModel.temsilciGirisBasarili) {
        if (viewModel.temsilciGirisBasarili) temsilciGirisBasarili()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("NFCKartify Girişi", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(12.dp))

        Row(modifier = Modifier.fillMaxWidth()) {
            val bayiSecili = viewModel.rol == GirisRolu.BAYI
            Button(
                onClick = { viewModel.rolSecildi(GirisRolu.BAYI) },
                modifier = Modifier.weight(1f),
            ) { Text("Bayi") }
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedButton(
                onClick = { viewModel.rolSecildi(GirisRolu.TEMSILCI) },
                modifier = Modifier.weight(1f),
            ) { Text(if (bayiSecili) "Temsilci" else "Temsilci ✓") }
        }
        Spacer(modifier = Modifier.padding(12.dp))

        OutlinedTextField(
            value = viewModel.girisBilgisi,
            onValueChange = viewModel::girisBilgisiDegisti,
            label = { Text(if (viewModel.rol == GirisRolu.BAYI) "E-posta / Kullanıcı Adı" else "Giriş E-postası") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.padding(6.dp))

        OutlinedTextField(
            value = viewModel.sifre,
            onValueChange = viewModel::sifreDegisti,
            label = { Text("Şifre") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.padding(12.dp))

        if (viewModel.hataMesaji != null) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.padding(6.dp))
        }

        if (viewModel.yukleniyor) {
            CircularProgressIndicator()
        } else {
            Button(onClick = viewModel::girisYap, modifier = Modifier.fillMaxWidth()) {
                Text("Giriş Yap")
            }
        }
    }
}
```

Not: `Button`/`OutlinedButton` ile aktif rolü göstermek basit bir çözüm (K1/K2'de de benzer şekilde asgari-viable UI tercih edildi, örn. K1'in raf kartı listesindeki sade tablo). Daha gelişmiş bir segmented-control gerekmiyor.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/GirisViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/GirisEkrani.kt
git commit -m "K3: giris ekranina Bayi/Temsilci secici eklendi"
```

---

### Task 7: Android — Ziyaret Kaydet ekranı ve ViewModel

**Files:**
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\ZiyaretKaydetViewModel.kt`
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\ZiyaretKaydetEkrani.kt`

- [ ] **Step 1: `ZiyaretKaydetViewModel.kt`'i oluştur**

```kotlin
package com.nfckartify.bayi.ui

import android.nfc.Tag
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.TokenDeposu
import kotlinx.coroutines.launch

enum class ZiyaretKaydetDurumu { KART_BEKLENIYOR, KAYDEDILIYOR, KAYDEDILDI, HATA }

private val ECZANE_KOD_DESENI = Regex("/raf/([a-z0-9]+)")

class ZiyaretKaydetViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var durum by mutableStateOf(ZiyaretKaydetDurumu.KART_BEKLENIYOR)
        private set
    var hataMesaji by mutableStateOf<String?>(null)
        private set
    var oturumSuresiDoldu by mutableStateOf(false)
        private set
    var kaydedilenEczaneAdi by mutableStateOf<String?>(null)
        private set

    fun tagAlgilandi(tag: Tag) {
        if (durum == ZiyaretKaydetDurumu.KAYDEDILIYOR) return
        val url = tagdanUrlOku(tag)
        val kod = url?.let { ECZANE_KOD_DESENI.find(it)?.groupValues?.get(1) }
        if (kod == null) {
            durum = ZiyaretKaydetDurumu.HATA
            oturumSuresiDoldu = false
            hataMesaji = "Bu kart bir eczane raf kartı değil."
            return
        }
        ziyaretiKaydet(kod)
    }

    private fun ziyaretiKaydet(eczaneKod: String) {
        val token = tokenDeposu.temsilciTokenAl() ?: run {
            durum = ZiyaretKaydetDurumu.HATA
            oturumSuresiDoldu = true
            hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
            return
        }
        durum = ZiyaretKaydetDurumu.KAYDEDILIYOR
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.ziyaretKaydet("Bearer $token", eczaneKod)
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    kaydedilenEczaneAdi = govde.eczaneAdi
                    durum = ZiyaretKaydetDurumu.KAYDEDILDI
                    oturumSuresiDoldu = false
                    hataMesaji = null
                } else if (cevap.code() == 401) {
                    durum = ZiyaretKaydetDurumu.HATA
                    oturumSuresiDoldu = true
                    hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
                } else {
                    durum = ZiyaretKaydetDurumu.HATA
                    oturumSuresiDoldu = false
                    hataMesaji = govde?.error ?: "Ziyaret kaydedilemedi."
                }
            } catch (e: Exception) {
                durum = ZiyaretKaydetDurumu.HATA
                oturumSuresiDoldu = false
                hataMesaji = "Bağlantı hatası: ${e.message}"
            }
        }
    }

    fun tekrarDene() {
        durum = ZiyaretKaydetDurumu.KART_BEKLENIYOR
        hataMesaji = null
        oturumSuresiDoldu = false
        kaydedilenEczaneAdi = null
    }
}
```

- [ ] **Step 2: `ZiyaretKaydetEkrani.kt`'i oluştur**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nfckartify.bayi.data.NfcOlayYayini

@Composable
fun ZiyaretKaydetEkrani(viewModel: ZiyaretKaydetViewModel, girisEkraninaDon: () -> Unit) {
    val algilananTag by NfcOlayYayini.algilananTag.collectAsState()

    LaunchedEffect(algilananTag) {
        val tag = algilananTag ?: return@LaunchedEffect
        viewModel.tagAlgilandi(tag)
        NfcOlayYayini.temizle()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Ziyaret Kaydet", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(24.dp))

        when (viewModel.durum) {
            ZiyaretKaydetDurumu.KART_BEKLENIYOR -> {
                Text("Eczanedeki raf kartını telefonun arkasına yaklaştırın.")
            }
            ZiyaretKaydetDurumu.KAYDEDILIYOR -> {
                CircularProgressIndicator()
                Text("Kaydediliyor, kartı telefondan çekmeyin...")
            }
            ZiyaretKaydetDurumu.KAYDEDILDI -> {
                Text(
                    "Ziyaret kaydedildi: ${viewModel.kaydedilenEczaneAdi ?: ""}",
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(modifier = Modifier.padding(16.dp))
                Button(onClick = { viewModel.tekrarDene() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Başka Kart Okut")
                }
            }
            ZiyaretKaydetDurumu.HATA -> {
                Text(viewModel.hataMesaji ?: "Kaydedilemedi.", color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.padding(16.dp))
                if (viewModel.oturumSuresiDoldu) {
                    Button(onClick = girisEkraninaDon, modifier = Modifier.fillMaxWidth()) {
                        Text("Giriş Ekranına Dön")
                    }
                } else {
                    Button(onClick = { viewModel.tekrarDene() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Tekrar Dene")
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/ZiyaretKaydetEkrani.kt
git commit -m "K3: Ziyaret Kaydet ekrani ve ViewModel"
```

---

### Task 8: Android — Ziyaretlerim ekranı ve ViewModel

**Files:**
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\ZiyaretlerimViewModel.kt`
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\ZiyaretlerimEkrani.kt`

- [ ] **Step 1: `ZiyaretlerimViewModel.kt`'i oluştur**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.TokenDeposu
import com.nfckartify.bayi.data.ZiyaretKaydi
import kotlinx.coroutines.launch

class ZiyaretlerimViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var ziyaretler by mutableStateOf<List<ZiyaretKaydi>>(emptyList())
        private set
    var yukleniyor by mutableStateOf(false)
        private set
    var hataMesaji by mutableStateOf<String?>(null)
        private set
    var oturumSuresiDoldu by mutableStateOf(false)
        private set

    fun yukle() {
        val token = tokenDeposu.temsilciTokenAl() ?: run {
            oturumSuresiDoldu = true
            hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
            return
        }
        yukleniyor = true
        hataMesaji = null
        oturumSuresiDoldu = false
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.ziyaretlerim("Bearer $token")
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    ziyaretler = govde.ziyaretler
                } else if (cevap.code() == 401) {
                    oturumSuresiDoldu = true
                    hataMesaji = "Oturumunuz sona erdi, tekrar giriş yapın."
                } else {
                    hataMesaji = govde?.error ?: "Ziyaretler alınamadı."
                }
            } catch (e: Exception) {
                hataMesaji = "Bağlantı hatası: ${e.message}"
            } finally {
                yukleniyor = false
            }
        }
    }
}
```

- [ ] **Step 2: `ZiyaretlerimEkrani.kt`'i oluştur**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nfckartify.bayi.data.ZiyaretKaydi

@Composable
fun ZiyaretlerimEkrani(viewModel: ZiyaretlerimViewModel, girisEkraninaDon: () -> Unit) {
    LaunchedEffect(Unit) { viewModel.yukle() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Ziyaretlerim", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(8.dp))

        if (viewModel.yukleniyor) {
            CircularProgressIndicator()
        } else if (viewModel.oturumSuresiDoldu) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.padding(8.dp))
            Button(onClick = girisEkraninaDon, modifier = Modifier.fillMaxWidth()) {
                Text("Giriş Ekranına Dön")
            }
        } else if (viewModel.hataMesaji != null) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
        } else if (viewModel.ziyaretler.isEmpty()) {
            Text("Henüz ziyaret kaydınız yok.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(viewModel.ziyaretler) { ziyaret: ZiyaretKaydi ->
                    Card(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
                        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                            Text(ziyaret.eczane_adi, style = MaterialTheme.typography.titleMedium)
                            Text(ziyaret.created_at.take(16).replace("T", " "))
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/ZiyaretlerimViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/ZiyaretlerimEkrani.kt
git commit -m "K3: Ziyaretlerim ekrani ve ViewModel"
```

---

### Task 9: Android — Temsilci Ana Ekranı ve navigasyon

**Files:**
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\TemsilciAnaEkrani.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\NfcKartifyApp.kt`

- [ ] **Step 1: `TemsilciAnaEkrani.kt`'i oluştur**

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
fun TemsilciAnaEkrani(
    ziyaretKaydetTiklandi: () -> Unit,
    ziyaretlerimTiklandi: () -> Unit,
    cikisTiklandi: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Temsilci Paneli", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(24.dp))

        Button(onClick = ziyaretKaydetTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Ziyaret Kaydet")
        }
        Spacer(modifier = Modifier.padding(8.dp))
        Button(onClick = ziyaretlerimTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Ziyaretlerim")
        }
        Spacer(modifier = Modifier.padding(24.dp))
        OutlinedButton(onClick = cikisTiklandi, modifier = Modifier.fillMaxWidth()) {
            Text("Çıkış")
        }
    }
}
```

- [ ] **Step 2: `NfcKartifyApp.kt`'i güncelle**

Tüm dosyayı şu hale getir:

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.nfckartify.bayi.data.TokenDeposu

@Composable
fun NfcKartifyApp() {
    val context = LocalContext.current
    val tokenDeposu = TokenDeposu(context)
    val navController = rememberNavController()

    val baslangicRota = when {
        tokenDeposu.tokenAl() != null -> "musteriler"
        tokenDeposu.temsilciTokenAl() != null -> "temsilciAna"
        else -> "giris"
    }

    NavHost(navController = navController, startDestination = baslangicRota) {
        composable("giris") {
            val vm: GirisViewModel = viewModel { GirisViewModel(tokenDeposu) }
            GirisEkrani(
                viewModel = vm,
                girisBasarili = {
                    navController.navigate("musteriler") {
                        popUpTo("giris") { inclusive = true }
                    }
                },
                temsilciGirisBasarili = {
                    navController.navigate("temsilciAna") {
                        popUpTo("giris") { inclusive = true }
                    }
                },
            )
        }
        composable("temsilciAna") {
            TemsilciAnaEkrani(
                ziyaretKaydetTiklandi = { navController.navigate("ziyaretKaydet") },
                ziyaretlerimTiklandi = { navController.navigate("ziyaretlerim") },
                cikisTiklandi = {
                    tokenDeposu.cikisYap()
                    navController.navigate("giris") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
        composable("ziyaretKaydet") {
            val vm: ZiyaretKaydetViewModel = viewModel { ZiyaretKaydetViewModel(tokenDeposu) }
            ZiyaretKaydetEkrani(vm) {
                tokenDeposu.cikisYap()
                navController.navigate("giris") {
                    popUpTo(0) { inclusive = true }
                }
            }
        }
        composable("ziyaretlerim") {
            val vm: ZiyaretlerimViewModel = viewModel { ZiyaretlerimViewModel(tokenDeposu) }
            ZiyaretlerimEkrani(vm) {
                tokenDeposu.cikisYap()
                navController.navigate("giris") {
                    popUpTo(0) { inclusive = true }
                }
            }
        }
        composable("musteriler") {
            val vm: MusterilerViewModel = viewModel { MusterilerViewModel(tokenDeposu) }
            MusterilerEkrani(
                viewModel = vm,
                musteriSecildi = { musteri -> navController.navigate("calisanlar/${musteri.id}") },
                profilOlusturTiklandi = { navController.navigate("profilOlustur") },
            )
        }
        composable("profilOlustur") {
            val vm: ProfilOlusturViewModel = viewModel { ProfilOlusturViewModel(tokenDeposu) }
            ProfilOlusturEkrani(vm) {
                navController.popBackStack()
            }
        }
        composable(
            "calisanlar/{firmaId}",
            arguments = listOf(navArgument("firmaId") { type = NavType.IntType }),
        ) { backStackEntry ->
            val firmaId = backStackEntry.arguments?.getInt("firmaId") ?: 0
            val vm: CalisanlarViewModel = viewModel { CalisanlarViewModel(tokenDeposu) }
            CalisanlarEkrani(vm, firmaId) { adSoyad, url ->
                val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                val kodlanmisAd = java.net.URLEncoder.encode(adSoyad, "UTF-8")
                navController.navigate("kartaYaz/$kodlanmisAd/$kodlanmisUrl")
            }
        }
        composable(
            "kartaYaz/{adSoyad}/{url}",
            arguments = listOf(
                navArgument("adSoyad") { type = NavType.StringType },
                navArgument("url") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val adSoyad = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("adSoyad") ?: "", "UTF-8")
            val url = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("url") ?: "", "UTF-8")
            val vm: KartaYazViewModel = viewModel { KartaYazViewModel() }
            KartaYazEkrani(vm, adSoyad, url)
        }
    }
}
```

Not: `baslangicRota` mantığı, aynı cihazda hem bayi hem temsilci token'ı varsa bayi'yi önceliklendirir (pratikte bir cihazda tek rol kullanılır, K3 spesifikasyonunun kapsamı dışı olan çoklu-rol senaryosu için ekstra karmaşıklık eklenmiyor — YAGNI).

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/TemsilciAnaEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt
git commit -m "K3: Temsilci Ana Ekrani ve navigasyon"
```

---

### Task 10: Tam derleme + cihazda kurulum + gerçek kartla uçtan uca test

**Files:** Yok (sadece komutlar + manuel/ADB doğrulama)

- [ ] **Step 1: Tam derleme**

Run: `cd /c/Users/muham/nfckartify-bayi-android && ./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 2: Tüm unit testleri çalıştır**

Run: `./gradlew.bat test`
Expected: `BUILD SUCCESSFUL`, tüm testler (mevcut + Task 4'te eklenenler) PASS

- [ ] **Step 3: Cihaza kur**

```bash
export MSYS_NO_PATHCONV=1
./gradlew.bat installDebug
```

- [ ] **Step 4: Gerçek K2 backend'iyle test verisi oluştur**

`kurumsal-kartvizit` reposunda, önceki fazlarda kurulan `node -e` deseniyle: kurumsal paketli bir test firması + `giris_email`/`giris_sifre_hash` alanlı bir temsilci + bir eczane (`kod` alanı gerçek fiziksel bir NFC karta yazılabilecek şekilde) oluştur. K1'de zaten fiziksel bir kart yazma akışı var — bu eczanenin `/raf/:kod` URL'sini K1'in "Karta Yaz" akışıyla (bayi modunda, mevcut `KartaYazEkrani`) gerçek bir NFC karta yaz.

- [ ] **Step 5: Uygulamada temsilci girişi yap (ADB otomasyonu)**

Faz1-3'te kurulan `adb shell uiautomator dump` + tap/text deseniyle: uygulamayı aç, "Temsilci" sekmesine geç, oluşturulan `giris_email`/şifre ile giriş yap, Temsilci Ana Ekranı'nın göründüğünü doğrula.

- [ ] **Step 6: Ziyaret Kaydet ile gerçek kartı okut**

"Ziyaret Kaydet"e dokun, Step 4'te yazılan gerçek NFC kartı telefona okut, "Ziyaret kaydedildi: <eczane adı>" mesajının göründüğünü doğrula.

- [ ] **Step 7: Backend'de ziyaretin kaydedildiğini doğrula**

```bash
cd /c/Users/muham/kurumsal-kartvizit
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const r = await pool.query('SELECT * FROM ziyaretler WHERE calisan_id = \$1 ORDER BY created_at DESC LIMIT 1', [TEMSILCI_ID]);
  console.log(r.rows);
  await pool.end();
})();
"
```

(`TEMSILCI_ID` Step 4'te oluşturulan gerçek id ile değiştirilir.)

- [ ] **Step 8: Ziyaretlerim ekranını doğrula**

Geri dön, "Ziyaretlerim"e dokun, Step 6'da kaydedilen ziyaretin listede (eczane adı + tarih) göründüğünü doğrula.

- [ ] **Step 9: "Başka firmanın kartı" senaryosunu doğrula**

`kurumsal-kartvizit`'te başka bir test firmasına ait ikinci bir eczane + gerçek bir ikinci NFC kart oluştur (K1'in Karta Yaz akışıyla yaz). Temsilci bu ikinci kartı "Ziyaret Kaydet" ekranında okuttuğunda backend'in 403 döndüğünü ve ekranda "Bu eczaneye ziyaret kaydedemezsiniz." hatasının göründüğünü doğrula.

- [ ] **Step 10: Test verisini temizle**

```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  await pool.query('DELETE FROM firmalar WHERE id = ANY(\$1)', [[TEST_FIRMA_ID_1, TEST_FIRMA_ID_2]]);
  await pool.end();
})();
"
```

- [ ] **Step 11: Son commit ve durum kontrolü**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git status --short
cd /c/Users/muham/kurumsal-kartvizit
git status --short
```

Expected: Her iki repoda da boş çıktı (tüm değişiklikler zaten commitlendi).
