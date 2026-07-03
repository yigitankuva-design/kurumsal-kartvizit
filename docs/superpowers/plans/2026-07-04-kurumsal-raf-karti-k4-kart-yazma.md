# Kurumsal Raf Kartı — K4 (Uygulama İçi Raf Kartı Yazma) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Temsilcinin, uygulama içinden firmasının eczane listesini görüp boş bir NFC kartına `/raf/:kod` URL'sini yazabilmesini (ve opsiyonel kilitleyebilmesini) sağlamak.

**Architecture:** Backend'e tek yeni uç (`GET /api/mobil/eczanelerim`). Android'de yeni bir liste ekranı (`EczanelerimEkrani`, K3'ün `ZiyaretlerimEkrani` deseniyle) ve mevcut `KartaYazEkrani`/`KartaYazViewModel`'in metinleri parametreleştirilerek yeniden kullanımı. Navigasyondaki `kartaYaz` route'una opsiyonel `tip` argümanı (`calisan` | `raf`) eklenir.

**Tech Stack:** Node.js/Express + Jest/Supertest (backend), Kotlin/Jetpack Compose + Retrofit + MockWebServer (Android).

---

### Task 1: Backend — `GET /api/mobil/eczanelerim`

**Files:**
- Modify: `C:\Users\muham\kurumsal-kartvizit\routes\mobilApi.js`
- Modify: `C:\Users\muham\kurumsal-kartvizit\tests\mobilApi.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`tests/mobilApi.test.js`'in sonuna (son `});`'den sonra) şu describe bloğunu ekle:

```js

describe('Mobil API — /api/mobil/eczanelerim', () => {
  let firmaId, digerFirmaId, calisanId, token;
  const email = 'eczanelerim-test-temsilci@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Eczanelerim Test Firma', 'eczanelerim-test-firma', 'ecz1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;

    const digerFirmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Eczanelerim Diğer Firma', 'eczanelerim-diger-firma', 'ecz2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    digerFirmaId = digerFirmaSonuc.rows[0].id;

    const hash = await bcrypt.hash(sifre, 12);
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, giris_email, giris_sifre_hash)
       VALUES ($1, 'Eczaneler', 'Temsilci', 'eczanelerim-temsilci', $2, $3) RETURNING id`,
      [firmaId, email, hash]
    );
    calisanId = calisanSonuc.rows[0].id;

    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, adres, kod) VALUES ($1, 'Kendi Eczanem', 'Merkez Mah.', 'eczkend1')`,
      [firmaId]
    );
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Baskasinin Eczanesi', 'eczdigr1')`,
      [digerFirmaId]
    );

    const girisRes = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = ANY($1)', [[firmaId, digerFirmaId]]);
  });

  test('sadece kendi firmasının eczanelerini döner', async () => {
    const res = await request(app)
      .get('/api/mobil/eczanelerim')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.eczaneler.length).toBe(1);
    expect(res.body.eczaneler[0].ad).toBe('Kendi Eczanem');
    expect(res.body.eczaneler[0].kod).toBe('eczkend1');
    expect(res.body.eczaneler[0].adres).toBe('Merkez Mah.');
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/eczanelerim');
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/mobilApi.test.js --verbose`
Expected: FAIL — `GET /api/mobil/eczanelerim` 404 döner (uç yok)

- [ ] **Step 3: `routes/mobilApi.js`'e ucu ekle**

`router.get('/ziyaretlerim', ...)` bloğundan sonra, `module.exports = router;` satırından hemen önce ekle:

```js

router.get('/eczanelerim', requireCalisanToken, async (req, res) => {
  try {
    const calisanResult = await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [req.calisanId]);
    if (!calisanResult.rows.length) {
      return res.status(401).json({ ok: false, error: 'Çalışan bulunamadı.' });
    }
    const result = await pool.query(
      `SELECT id, ad, adres, kod FROM eczaneler WHERE firma_id = $1 ORDER BY created_at DESC`,
      [calisanResult.rows[0].firma_id]
    );
    res.json({ ok: true, eczaneler: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run: `npx jest tests/mobilApi.test.js --verbose`
Expected: PASS (tüm testler)

- [ ] **Step 5: Tam test, commit, push, deploy, production doğrulaması**

```bash
npx jest
git add routes/mobilApi.js tests/mobilApi.test.js
git commit -m "K4: GET /api/mobil/eczanelerim ucu"
git push origin master
railway up --service app --detach
```

Yeni deploy markeri — `/api/mobil/eczanelerim` tokensiz 401 dönmeli (K4 öncesi 404):

```bash
curl -s -o /dev/null -w "%{http_code}" https://www.nfckartify.com.tr/api/mobil/eczanelerim
```

Expected: `401` (404 görürsen deploy bitmemiştir, tekrar dene)

---

### Task 2: Android — Model + ApiService ucu + test

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\Models.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\data\ApiService.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\test\java\com\nfckartify\bayi\data\ApiServiceTest.kt`

- [ ] **Step 1: Başarısız testi yaz**

`ApiServiceTest.kt`'in sonuna, kapanış `}` satırından önce ekle:

```kotlin

    @Test
    fun `eczanelerim listeyi doner`() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"ok":true,"eczaneler":[{"id":4,"ad":"Merkez Eczane","adres":"Ana Cad. 5","kod":"abc12345"}]}"""
            ).setResponseCode(200)
        )

        val cevap = servis.eczanelerim("Bearer test-token")

        assertTrue(cevap.isSuccessful)
        assertEquals(1, cevap.body()?.eczaneler?.size)
        assertEquals("abc12345", cevap.body()?.eczaneler?.first()?.kod)
    }
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

PowerShell'de (JAVA_HOME gerekli):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"
```

Expected: FAIL — derleme hatası, `servis.eczanelerim` tanımlı değil

- [ ] **Step 3: `Models.kt`'in sonuna ekle**

```kotlin

@Serializable
data class EczaneOzet(
    val id: Int,
    val ad: String,
    val adres: String? = null,
    val kod: String,
)

@Serializable
data class EczanelerimCevap(
    val ok: Boolean,
    val eczaneler: List<EczaneOzet> = emptyList(),
    val error: String? = null,
)
```

- [ ] **Step 4: `ApiService.kt` interface'inin sonuna, kapanış `}` öncesine ekle**

```kotlin

    @GET("api/mobil/eczanelerim")
    suspend fun eczanelerim(
        @Header("Authorization") yetki: String,
    ): Response<EczanelerimCevap>
```

- [ ] **Step 5: Testi çalıştırıp başarılı olduğunu doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: BUILD SUCCESSFUL (6 test)

- [ ] **Step 6: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/data/Models.kt app/src/main/java/com/nfckartify/bayi/data/ApiService.kt app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt
git commit -m "K4: eczanelerim Retrofit ucu ve modelleri"
```

---

### Task 3: Android — `KartaYazEkrani` metin parametreleştirme

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\KartaYazEkrani.kt`

- [ ] **Step 1: Composable imzasını ve iki metni güncelle**

`KartaYazEkrani` fonksiyonunun imzasını şu hale getir (varsayılanlar mevcut çalışan-kartı metinleri, böylece mevcut çağrı yeri değişmeden çalışır):

```kotlin
@Composable
fun KartaYazEkrani(
    viewModel: KartaYazViewModel,
    adSoyad: String,
    url: String,
    goruntuleButonMetni: String = "Profili Görüntüle",
    bekleMesaji: String = "Profili kontrol ettiysen: boş bir NFC kartı telefonun arkasına yaklaştırın.",
) {
```

Gövdede iki sabit metni parametrelerle değiştir:

```kotlin
        OutlinedButton(
            onClick = { onizlemeAcik = true },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(goruntuleButonMetni)
        }
```

ve `YAZMA_BEKLENIYOR` dalında:

```kotlin
            KartaYazDurumu.YAZMA_BEKLENIYOR -> {
                Text(bekleMesaji)
            }
```

- [ ] **Step 2: Derlemeyi doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/KartaYazEkrani.kt
git commit -m "K4: KartaYazEkrani metinleri parametrelestirildi"
```

---

### Task 4: Android — Eczanelerim ekranı ve ViewModel

**Files:**
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\EczanelerimViewModel.kt`
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\EczanelerimEkrani.kt`

- [ ] **Step 1: `EczanelerimViewModel.kt`'i oluştur**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.EczaneOzet
import com.nfckartify.bayi.data.TokenDeposu
import com.nfckartify.bayi.data.hataMesajiAl
import kotlinx.coroutines.launch

class EczanelerimViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var eczaneler by mutableStateOf<List<EczaneOzet>>(emptyList())
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
                val cevap = ApiClient.servis.eczanelerim("Bearer $token")
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
}
```

- [ ] **Step 2: `EczanelerimEkrani.kt`'i oluştur**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.clickable
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
import com.nfckartify.bayi.data.EczaneOzet

@Composable
fun EczanelerimEkrani(
    viewModel: EczanelerimViewModel,
    eczaneSecildi: (EczaneOzet) -> Unit,
    girisEkraninaDon: () -> Unit,
) {
    LaunchedEffect(Unit) { viewModel.yukle() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Raf Kartı Yaz", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(4.dp))
        Text("Kart yazılacak eczaneyi seçin.", style = MaterialTheme.typography.bodyMedium)
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
        } else if (viewModel.eczaneler.isEmpty()) {
            Text("Henüz eczane eklenmemiş. Eczaneler web panelden eklenir.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(viewModel.eczaneler) { eczane: EczaneOzet ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(4.dp)
                            .clickable { eczaneSecildi(eczane) },
                    ) {
                        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                            Text(eczane.ad, style = MaterialTheme.typography.titleMedium)
                            if (eczane.adres != null) {
                                Text(eczane.adres, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Derlemeyi doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/EczanelerimViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/EczanelerimEkrani.kt
git commit -m "K4: Eczanelerim (raf karti yazma) ekrani ve ViewModel"
```

---

### Task 5: Android — Navigasyon (route + Temsilci Ana Ekranı butonu)

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\TemsilciAnaEkrani.kt`
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\NfcKartifyApp.kt`

- [ ] **Step 1: `TemsilciAnaEkrani.kt`'e üçüncü buton ekle**

İmzaya `rafKartiYazTiklandi: () -> Unit` parametresi ekle ve "Ziyaretlerim" butonundan sonra yeni buton koy. Fonksiyonun tamamı şu hale gelir:

```kotlin
@Composable
fun TemsilciAnaEkrani(
    ziyaretKaydetTiklandi: () -> Unit,
    ziyaretlerimTiklandi: () -> Unit,
    rafKartiYazTiklandi: () -> Unit,
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

- [ ] **Step 2: `NfcKartifyApp.kt`'de route'ları güncelle**

(a) `temsilciAna` composable'ına yeni callback ekle:

```kotlin
        composable("temsilciAna") {
            TemsilciAnaEkrani(
                ziyaretKaydetTiklandi = { navController.navigate("ziyaretKaydet") },
                ziyaretlerimTiklandi = { navController.navigate("ziyaretlerim") },
                rafKartiYazTiklandi = { navController.navigate("eczanelerim") },
                cikisTiklandi = {
                    tokenDeposu.cikisYap()
                    navController.navigate("giris") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
```

(b) `ziyaretlerim` composable'ından sonra yeni route ekle:

```kotlin
        composable("eczanelerim") {
            val vm: EczanelerimViewModel = viewModel { EczanelerimViewModel(tokenDeposu) }
            EczanelerimEkrani(
                viewModel = vm,
                eczaneSecildi = { eczane ->
                    val url = "https://www.nfckartify.com.tr/raf/${eczane.kod}"
                    val kodlanmisUrl = java.net.URLEncoder.encode(url, "UTF-8")
                    val kodlanmisAd = java.net.URLEncoder.encode(eczane.ad, "UTF-8")
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

(c) Mevcut `kartaYaz/{adSoyad}/{url}` composable'ını opsiyonel `tip` argümanıyla güncelle (tamamını şu hale getir):

```kotlin
        composable(
            "kartaYaz/{adSoyad}/{url}?tip={tip}",
            arguments = listOf(
                navArgument("adSoyad") { type = NavType.StringType },
                navArgument("url") { type = NavType.StringType },
                navArgument("tip") { type = NavType.StringType; defaultValue = "calisan" },
            ),
        ) { backStackEntry ->
            val adSoyad = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("adSoyad") ?: "", "UTF-8")
            val url = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("url") ?: "", "UTF-8")
            val tip = backStackEntry.arguments?.getString("tip") ?: "calisan"
            val vm: KartaYazViewModel = viewModel { KartaYazViewModel() }
            if (tip == "raf") {
                KartaYazEkrani(
                    viewModel = vm,
                    adSoyad = adSoyad,
                    url = url,
                    goruntuleButonMetni = "Sayfayı Görüntüle",
                    bekleMesaji = "Sayfayı kontrol ettiysen: boş bir NFC kartı telefonun arkasına yaklaştırın.",
                )
            } else {
                KartaYazEkrani(vm, adSoyad, url)
            }
        }
```

- [ ] **Step 3: Derlemeyi doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/TemsilciAnaEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt
git commit -m "K4: Raf Karti Yaz navigasyonu (eczanelerim + kartaYaz tip argümani)"
```

---

### Task 6: Tam test + cihazda gerçek kartla uçtan uca doğrulama

**Files:** Yok (komutlar + ADB/fiziksel doğrulama)

- [ ] **Step 1: Tüm Android unit testleri çalıştır**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Cihaza kur**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat installDebug`
Expected: `Installed on 1 device.`

- [ ] **Step 3: Test verisi oluştur**

`kurumsal-kartvizit`'te `node -e` ile: kurumsal firma + giriş bilgili temsilci + bir eczane oluştur (K3 T10'daki desenle; dönen id'leri ve `kod`'u not et).

- [ ] **Step 4: ADB ile temsilci girişi → Raf Kartı Yaz → eczane seç**

`adb shell uiautomator dump` + tap/text deseniyle: uygulamada temsilci girişi yap ("Temsilci" toggle → email/şifre → Giriş Yap), "Raf Kartı Yaz"a dokun, listede oluşturulan eczanenin göründüğünü doğrula, eczaneye dokun — `KartaYazEkrani`'nın "Sayfayı Görüntüle" butonu ve raf bekleme mesajıyla açıldığını doğrula.

- [ ] **Step 5: Gerçek boş NFC karta yaz**

Kullanıcıdan boş/yazılabilir bir NFC kartı telefona okutmasını iste. "Kart başarıyla yazıldı." mesajını doğrula. (Kilitleme butonu görünmeli ama fiziksel kilitleme testi yapılmaz — kart yeniden kullanılabilir kalsın.)

- [ ] **Step 6: Yazılan kartı doğrula**

Uygulamadan çıkıp kartı telefona okut — tarayıcıda `https://www.nfckartify.com.tr/raf/<kod>` sayfasının açıldığını ve eczane adının göründüğünü doğrula. Ayrıca DB'de `raf_okutmalar`'a satır düştüğünü `node -e` ile kontrol et.

- [ ] **Step 7: Test verisini temizle**

`DELETE FROM firmalar WHERE id = <testFirmaId>` (CASCADE ile eczane/okutma kayıtları da silinir).

- [ ] **Step 8: Son durum kontrolü**

Her iki repoda `git status --short` boş olmalı.
