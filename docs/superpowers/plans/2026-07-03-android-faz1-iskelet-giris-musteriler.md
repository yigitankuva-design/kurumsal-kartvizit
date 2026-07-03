# Android Faz 1: Uygulama İskeleti + Giriş + Müşteri Listesi/Detay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `C:\Users\muham\nfckartify-bayi-android` altında, `kurumsal-kartvizit` backend'indeki `/api/mobil/*` uçlarını kullanan, gezinilebilir bir Android iskeleti kurmak: Giriş → Müşteri Listesi → Müşteri Detay (Çalışanlar). Foto/adres/biyografi formu ve NFC yaz/kilitle bu fazın **dışında** — ayrı fazlarda yapılacak.

**Architecture:** Kotlin + Jetpack Compose (tek Activity, Compose Navigation). Retrofit+OkHttp ile ağ katmanı, ViewModel+StateFlow ile ekran durumu, JWT token `EncryptedSharedPreferences`'ta saklanır. Basit MVVM — bu fazda sadece 3 ekran olduğu için ekstra katman (repository interface soyutlaması vb.) eklenmiyor, YAGNI.

**Tech Stack:** Kotlin 2.0.21, Android Gradle Plugin 8.7.2, Gradle 8.11.1 (bu makinede zaten önbellekte), compileSdk/targetSdk 35, minSdk 26, Jetpack Compose (BOM 2024.12.01), Retrofit 2.11.0 + kotlinx-serialization, androidx.security-crypto 1.1.0-alpha06.

---

## Dosya Yapısı

Proje kökü: `C:\Users\muham\nfckartify-bayi-android` (ayrı git deposu — farklı build sistemi
olduğu için `kurumsal-kartvizit` reposundan bağımsız).

- `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties` — kök proje ayarları
- `gradle/wrapper/gradle-wrapper.properties` — Gradle 8.11.1 sarmalayıcı (bu makinede zaten
  önbellekte olan dağıtımı kullanır, internet gerekmez)
- `app/build.gradle.kts` — modül bağımlılıkları
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/com/nfckartify/bayi/MainActivity.kt` — tek Activity, Compose içeriği
- `app/src/main/java/com/nfckartify/bayi/data/Models.kt` — API request/response veri sınıfları
- `app/src/main/java/com/nfckartify/bayi/data/ApiService.kt` — Retrofit arayüzü
- `app/src/main/java/com/nfckartify/bayi/data/ApiClient.kt` — Retrofit/OkHttp kurulumu
- `app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt` — JWT'yi şifreli saklama
- `app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt` — Navigation host
- `app/src/main/java/com/nfckartify/bayi/ui/GirisEkrani.kt` + `GirisViewModel.kt`
- `app/src/main/java/com/nfckartify/bayi/ui/MusterilerEkrani.kt` + `MusterilerViewModel.kt`
- `app/src/main/java/com/nfckartify/bayi/ui/CalisanlarEkrani.kt` + `CalisanlarViewModel.kt`
- `app/src/test/java/com/nfckartify/bayi/` — birim testleri (MockWebServer ile ağ katmanı,
  Robolectric olmadan saf Kotlin testleri ile ViewModel mantığı)

---

### Task 1: Gradle proje iskeleti + boş Compose ekranı

**Files:**
- Create: `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`
- Create: `app/build.gradle.kts`
- Create: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/com/nfckartify/bayi/MainActivity.kt`
- Create: `app/src/main/res/values/strings.xml`, `app/src/main/res/values/themes.xml`

- [ ] **Step 1: Gradle wrapper'ı bu makinedeki önbellekten oluştur**

Bu makinede Gradle 8.11.1 zaten indirilmiş durumda (`C:\Users\muham\.gradle\wrapper\dists`).
O dağıtımı doğrudan çalıştırıp proje köküne wrapper dosyalarını ürettir:

Run (proje kökünde, `C:\Users\muham\nfckartify-bayi-android`):
```bash
"C:/Users/muham/.gradle/wrapper/dists/gradle-8.11.1-bin/bpt9gzteqjrbo1mjrsomdt32c/gradle-8.11.1/bin/gradle.bat" wrapper --gradle-version 8.11.1
```
Expected: `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`,
`gradle/wrapper/gradle-wrapper.properties` dosyaları oluşur.

- [ ] **Step 2: Kök `settings.gradle.kts`'i yaz**

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "NFCKartifyBayi"
include(":app")
```

- [ ] **Step 3: Kök `build.gradle.kts`'i yaz**

```kotlin
plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
}
```

- [ ] **Step 4: `gradle.properties`'i yaz**

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
```

- [ ] **Step 5: `app/build.gradle.kts`'i yaz**

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.nfckartify.bayi"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nfckartify.bayi"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
```

- [ ] **Step 6: `AndroidManifest.xml`'i yaz**

`app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:label="NFCKartify Bayi"
        android:theme="@style/Theme.NfcKartifyBayi">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:label="NFCKartify Bayi">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 7: `strings.xml` ve `themes.xml`'i yaz**

`app/src/main/res/values/strings.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">NFCKartify Bayi</string>
</resources>
```

`app/src/main/res/values/themes.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.NfcKartifyBayi" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
```

- [ ] **Step 8: `MainActivity.kt`'i boş bir "Merhaba" ekranıyla yaz**

`app/src/main/java/com/nfckartify/bayi/MainActivity.kt`:

```kotlin
package com.nfckartify.bayi

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    Text("NFCKartify Bayi")
                }
            }
        }
    }
}
```

- [ ] **Step 9: Derlemeyi doğrula**

Run (proje kökünde):
```bash
./gradlew.bat assembleDebug
```
Expected: `BUILD SUCCESSFUL`. Hata çıkarsa (bağımlılık sürüm uyuşmazlığı, sözdizimi hatası)
düzelt ve tekrar çalıştır — bu bir Kotlin/Gradle projesi olduğu için sürüm numaraları
küçük düzeltmeler gerektirebilir, bu normal.

- [ ] **Step 10: Git'e commit et**

```bash
git add -A
git commit -m "Android proje iskeleti: Gradle + boş Compose ekranı"
```

---

### Task 2: Ağ katmanı — veri modelleri + Retrofit servisi

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/data/Models.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/data/ApiService.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/data/ApiClient.kt`
- Test: `app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt`

- [ ] **Step 1: Veri modellerini yaz**

`app/src/main/java/com/nfckartify/bayi/data/Models.kt`:

```kotlin
package com.nfckartify.bayi.data

import kotlinx.serialization.Serializable

@Serializable
data class GirisCevap(
    val ok: Boolean,
    val token: String? = null,
    val bayi: BayiOzet? = null,
    val error: String? = null,
)

@Serializable
data class BayiOzet(
    val id: Int,
    val ad: String,
)

@Serializable
data class Musteri(
    val id: Int,
    val ad: String,
    val slug: String,
    val calisan_sayisi: String,
)

@Serializable
data class MusterilerCevap(
    val ok: Boolean,
    val musteriler: List<Musteri> = emptyList(),
    val error: String? = null,
)

@Serializable
data class Calisan(
    val id: Int,
    val ad: String,
    val soyad: String,
    val unvan: String? = null,
    val slug: String,
    val durum: String,
)

@Serializable
data class MusteriDetayCevap(
    val ok: Boolean,
    val firma: Musteri? = null,
    val calisanlar: List<Calisan> = emptyList(),
    val error: String? = null,
)
```

- [ ] **Step 2: Retrofit servis arayüzünü yaz**

`app/src/main/java/com/nfckartify/bayi/data/ApiService.kt`:

```kotlin
package com.nfckartify.bayi.data

import retrofit2.Response
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface ApiService {
    @FormUrlEncoded
    @POST("api/mobil/giris")
    suspend fun girisYap(
        @Field("giris_bilgisi") girisBilgisi: String,
        @Field("sifre") sifre: String,
    ): Response<GirisCevap>

    @GET("api/mobil/musteriler")
    suspend fun musterileriGetir(
        @Header("Authorization") yetki: String,
    ): Response<MusterilerCevap>

    @GET("api/mobil/musteriler/{firmaId}/calisanlar")
    suspend fun musteriDetayGetir(
        @Header("Authorization") yetki: String,
        @Path("firmaId") firmaId: Int,
    ): Response<MusteriDetayCevap>
}
```

- [ ] **Step 3: Retrofit/OkHttp istemcisini kur**

`app/src/main/java/com/nfckartify/bayi/data/ApiClient.kt`:

```kotlin
package com.nfckartify.bayi.data

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

object ApiClient {
    const val TABAN_URL = "https://www.nfckartify.com.tr/"

    private val json = Json { ignoreUnknownKeys = true }

    val servis: ApiService by lazy {
        val logInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(logInterceptor)
            .build()

        Retrofit.Builder()
            .baseUrl(TABAN_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
    }
}
```

- [ ] **Step 4: Başarısız testi yaz (MockWebServer ile)**

`app/src/test/java/com/nfckartify/bayi/data/ApiServiceTest.kt`:

```kotlin
package com.nfckartify.bayi.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit

class ApiServiceTest {
    private lateinit var server: MockWebServer
    private lateinit var servis: ApiService

    @Before
    fun kur() {
        server = MockWebServer()
        server.start()
        val json = Json { ignoreUnknownKeys = true }
        servis = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
    }

    @After
    fun kapat() {
        server.shutdown()
    }

    @Test
    fun `girisYap basarili cevabi token ile doner`() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"ok":true,"token":"abc.def.ghi","bayi":{"id":1,"ad":"Test Bayi"}}"""
            ).setResponseCode(200)
        )

        val cevap = servis.girisYap("test@example.com", "sifre123")

        assertTrue(cevap.isSuccessful)
        assertEquals("abc.def.ghi", cevap.body()?.token)
        assertEquals("Test Bayi", cevap.body()?.bayi?.ad)
    }

    @Test
    fun `musterileriGetir listeyi doner`() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"ok":true,"musteriler":[{"id":5,"ad":"Ahmet","slug":"ahmet","calisan_sayisi":"2"}]}"""
            ).setResponseCode(200)
        )

        val cevap = servis.musterileriGetir("Bearer test-token")

        assertTrue(cevap.isSuccessful)
        assertEquals(1, cevap.body()?.musteriler?.size)
        assertEquals("Ahmet", cevap.body()?.musteriler?.first()?.ad)
    }
}
```

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Run: `./gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.data.ApiServiceTest"`
Expected: `BUILD SUCCESSFUL`, 2 test geçti.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/data app/src/test
git commit -m "Ağ katmanı: veri modelleri + Retrofit servisi + MockWebServer testleri"
```

---

### Task 3: Token saklama

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt`

- [ ] **Step 1: `TokenDeposu.kt`'i yaz**

Not: `EncryptedSharedPreferences` gerçek cihaz/emülatör (Android Keystore) gerektirdiği için
JVM birim testinde çalıştırılamaz — bu sınıf için birim testi yazmak yerine gerçek cihazda
Task 7'de (giriş akışı) uçtan uca doğrulanacak.

`app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt`:

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

    fun cikisYap() {
        tercihler.edit().clear().apply()
    }
}
```

- [ ] **Step 2: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/data/TokenDeposu.kt
git commit -m "JWT token için EncryptedSharedPreferences sarmalayıcısı ekle"
```

---

### Task 4: Giriş ekranı

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/ui/GirisViewModel.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/GirisEkrani.kt`

- [ ] **Step 1: `GirisViewModel.kt`'i yaz**

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

class GirisViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
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
                val cevap = ApiClient.servis.girisYap(girisBilgisi, sifre)
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true && govde.token != null) {
                    tokenDeposu.tokenKaydet(govde.token, govde.bayi?.ad ?: "")
                    girisBasarili = true
                } else {
                    hataMesaji = govde?.error ?: "Giriş başarısız."
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

- [ ] **Step 2: `GirisEkrani.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun GirisEkrani(viewModel: GirisViewModel, girisBasarili: () -> Unit) {
    LaunchedEffect(viewModel.girisBasarili) {
        if (viewModel.girisBasarili) girisBasarili()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("NFCKartify Bayi Girişi", style = MaterialTheme.typography.headlineSmall)
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(12.dp))

        OutlinedTextField(
            value = viewModel.girisBilgisi,
            onValueChange = viewModel::girisBilgisiDegisti,
            label = { Text("E-posta / Kullanıcı Adı") },
            modifier = Modifier.fillMaxWidth(),
        )
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(6.dp))

        OutlinedTextField(
            value = viewModel.sifre,
            onValueChange = viewModel::sifreDegisti,
            label = { Text("Şifre") },
            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(12.dp))

        if (viewModel.hataMesaji != null) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(6.dp))
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

- [ ] **Step 3: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/GirisViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/GirisEkrani.kt
git commit -m "Giriş ekranı ve ViewModel'i ekle"
```

---

### Task 5: Müşteri listesi ekranı

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/ui/MusterilerViewModel.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/MusterilerEkrani.kt`

- [ ] **Step 1: `MusterilerViewModel.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.Musteri
import com.nfckartify.bayi.data.TokenDeposu
import kotlinx.coroutines.launch

class MusterilerViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var musteriler by mutableStateOf<List<Musteri>>(emptyList())
        private set
    var yukleniyor by mutableStateOf(false)
        private set
    var hataMesaji by mutableStateOf<String?>(null)
        private set

    fun yukle() {
        val token = tokenDeposu.tokenAl() ?: run {
            hataMesaji = "Oturum bulunamadı."
            return
        }
        yukleniyor = true
        hataMesaji = null
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.musterileriGetir("Bearer $token")
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    musteriler = govde.musteriler
                } else {
                    hataMesaji = govde?.error ?: "Müşteriler alınamadı."
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

- [ ] **Step 2: `MusterilerEkrani.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nfckartify.bayi.data.Musteri

@Composable
fun MusterilerEkrani(viewModel: MusterilerViewModel, musteriSecildi: (Musteri) -> Unit) {
    LaunchedEffect(Unit) { viewModel.yukle() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Müşterilerim", style = MaterialTheme.typography.headlineSmall)
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(8.dp))

        if (viewModel.yukleniyor) {
            CircularProgressIndicator()
        } else if (viewModel.hataMesaji != null) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
        } else if (viewModel.musteriler.isEmpty()) {
            Text("Henüz müşteri eklenmemiş.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(viewModel.musteriler) { musteri ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(4.dp),
                    ) {
                        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                            Text(musteri.ad, style = MaterialTheme.typography.titleMedium)
                            Text("${musteri.calisan_sayisi} kart")
                        }
                    }
                }
            }
        }
    }
}
```

Not: Bu görevde satır tıklama davranışı (kart üstüne basınca `musteriSecildi` çağrılması)
Task 6'da navigasyonla birlikte bağlanacak — şimdilik parametre alıp kullanılmıyor
görünmesi (derleyici uyarısı verebilir) normal, Task 6'da `Card`'a `clickable` eklenecek.

- [ ] **Step 3: `MusterilerEkrani.kt`'e tıklama davranışını hemen ekle (uyarıyı önlemek için)**

Bir önceki adımdaki `Card(...)` çağrısını şu şekilde güncelle (tıklanabilir yap):

```kotlin
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(4.dp)
                            .then(Modifier.clickable { musteriSecildi(musteri) }),
                    ) {
```

Dosyanın importlarına ekle: `import androidx.compose.foundation.clickable`

- [ ] **Step 4: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/MusterilerViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/MusterilerEkrani.kt
git commit -m "Müşteri listesi ekranını ekle"
```

---

### Task 6: Müşteri detay (çalışanlar) ekranı + navigasyon

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/ui/CalisanlarViewModel.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/CalisanlarEkrani.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/MainActivity.kt`

- [ ] **Step 1: `CalisanlarViewModel.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.Calisan
import com.nfckartify.bayi.data.TokenDeposu
import kotlinx.coroutines.launch

class CalisanlarViewModel(private val tokenDeposu: TokenDeposu) : ViewModel() {
    var firmaAdi by mutableStateOf("")
        private set
    var calisanlar by mutableStateOf<List<Calisan>>(emptyList())
        private set
    var yukleniyor by mutableStateOf(false)
        private set
    var hataMesaji by mutableStateOf<String?>(null)
        private set

    fun yukle(firmaId: Int) {
        val token = tokenDeposu.tokenAl() ?: run {
            hataMesaji = "Oturum bulunamadı."
            return
        }
        yukleniyor = true
        hataMesaji = null
        viewModelScope.launch {
            try {
                val cevap = ApiClient.servis.musteriDetayGetir("Bearer $token", firmaId)
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    firmaAdi = govde.firma?.ad ?: ""
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
}
```

- [ ] **Step 2: `CalisanlarEkrani.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun CalisanlarEkrani(viewModel: CalisanlarViewModel, firmaId: Int) {
    LaunchedEffect(firmaId) { viewModel.yukle(firmaId) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            viewModel.firmaAdi.ifBlank { "Müşteri" },
            style = MaterialTheme.typography.headlineSmall,
        )
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(8.dp))

        if (viewModel.yukleniyor) {
            CircularProgressIndicator()
        } else if (viewModel.hataMesaji != null) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
        } else if (viewModel.calisanlar.isEmpty()) {
            Text("Henüz kart eklenmemiş.")
        } else {
            LazyColumn {
                items(viewModel.calisanlar) { calisan ->
                    Card(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "${calisan.ad} ${calisan.soyad}",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            if (calisan.unvan != null) Text(calisan.unvan)
                            Text("Durum: ${calisan.durum}")
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Navigation host'u yaz**

`app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt`:

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

    val baslangicRota = if (tokenDeposu.tokenAl() != null) "musteriler" else "giris"

    NavHost(navController = navController, startDestination = baslangicRota) {
        composable("giris") {
            val vm = GirisViewModel(tokenDeposu)
            GirisEkrani(vm) {
                navController.navigate("musteriler") {
                    popUpTo("giris") { inclusive = true }
                }
            }
        }
        composable("musteriler") {
            val vm = MusterilerViewModel(tokenDeposu)
            MusterilerEkrani(vm) { musteri ->
                navController.navigate("calisanlar/${musteri.id}")
            }
        }
        composable(
            "calisanlar/{firmaId}",
            arguments = listOf(navArgument("firmaId") { type = NavType.IntType }),
        ) { backStackEntry ->
            val firmaId = backStackEntry.arguments?.getInt("firmaId") ?: 0
            val vm = CalisanlarViewModel(tokenDeposu)
            CalisanlarEkrani(vm, firmaId)
        }
    }
}
```

- [ ] **Step 4: `MainActivity.kt`'i navigasyonu kullanacak şekilde güncelle**

```kotlin
package com.nfckartify.bayi

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import com.nfckartify.bayi.ui.NfcKartifyApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    NfcKartifyApp()
                }
            }
        }
    }
}
```

- [ ] **Step 5: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi
git commit -m "Müşteri detay ekranı ve navigasyonu ekle — Giriş→Müşteriler→Çalışanlar akışı tamam"
```

---

### Task 7: Tam birim test paketi + gerçek cihazda kurulum (kullanıcı telefonu bağlandığında)

**Files:** Yok (doğrulama adımı)

- [ ] **Step 1: Tüm birim testlerini çalıştır**

Run: `./gradlew.bat test`
Expected: `BUILD SUCCESSFUL`, `ApiServiceTest`'teki 2 test dahil hepsi geçer.

- [ ] **Step 2: Kullanıcının telefonu bağlı mı kontrol et**

Run: `"C:/Users/muham/AppData/Local/Android/Sdk/platform-tools/adb.exe" devices`
Expected: En az bir cihaz `device` durumunda listelenir. Telefon USB ile bağlı değilse
ve "Geliştirici Seçenekleri → USB Hata Ayıklama" açık değilse, bu adım kullanıcıdan
telefonunu bağlamasını isteyip bekler — otomatik olarak atlanamaz.

- [ ] **Step 3: Cihaza kur ve başlat**

Run:
```bash
./gradlew.bat installDebug
"C:/Users/muham/AppData/Local/Android/Sdk/platform-tools/adb.exe" shell am start -n com.nfckartify.bayi/.MainActivity
```
Expected: Telefonda "NFCKartify Bayi" uygulaması açılır, Giriş ekranı görünür.

- [ ] **Step 4: Gerçek bir bayi hesabıyla uçtan uca test**

Kullanıcıdan mevcut bir test bayi hesabı bilgisi iste (veya `kurumsal-kartvizit` reposunda
daha önce kullanılan yöntemle `node -e` ile geçici bir test bayisi oluştur), telefonda
giriş yap, müşteri listesinin (boşsa "Henüz müşteri eklenmemiş." mesajının) göründüğünü
doğrula. Test bayisi geçiciyse iş bitince veritabanından sil.

---

## Sonraki Adım

Bu faz bitince: **Faz 2 — Profil Oluşturma Formu** (foto kırpma/yakınlaştırma, adres,
sosyal medya, biyografi biçimlendirme, `POST /api/mobil/profil-olustur` ile tam entegrasyon).
Ayrı bir plan dokümanı olarak, bu faz bittikten sonra yazılacak.
