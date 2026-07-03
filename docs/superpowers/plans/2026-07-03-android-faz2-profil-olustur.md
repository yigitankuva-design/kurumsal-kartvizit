# Android Faz 2: Profil Oluşturma Formu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nfckartify-bayi-android` uygulamasına, web'deki "Profil Oluştur" formunun tam
karşılığını eklemek: temel bilgiler, sosyal medya linkleri, biçimlendirilebilir biyografi,
Google Places adres otomatik tamamlama, fotoğraf seçme+kırpma/yakınlaştırma, ve
`POST /api/mobil/profil-olustur`'a gönderme. Kullanıcı kararları: **önizleme adımı YOK**
(form dolup direkt "Oluştur"a basılır), adres için **Google Places** kullanılacak, **aynı
paylaşılan** `GOOGLE_MAPS_API_KEY` kısıtlamasız kullanılacak.

**Architecture:** Müşteriler ekranına "+ Profil Oluştur" butonu eklenir, yeni bir
`profilOlustur` navigasyon rotasına gider. Form tek ekranda, `ProfilOlusturViewModel` tüm
alan durumunu tutar. Biyografi biçimlendirme, seçili metne HTML etiketi ekleyen saf
fonksiyonlarla yapılır (backend zaten `<b>`, `<i>`, `<p style="text-align:center">`
etiketlerini `biyografiTemizle` ile temizliyor — bkz. `utils/sanitize.js`). Fotoğraf
kırpıcı, `Canvas`/`Matrix` ile 600×600 JPEG üreten özel bir composable.

**Tech Stack:** Mevcut Faz 1 bağımlılıklarına ek: `androidx.activity:activity-compose`
(zaten var, `rememberLauncherForActivityResult` için), Google Places SDK
(`com.google.android.libraries.places:places:3.5.0`), `androidx.compose.material:material-icons-extended`
(opsiyonel simgeler için — kullanılmayacaksa eklenmez, YAGNI).

---

## Dosya Yapısı

- Modify: `app/src/main/AndroidManifest.xml` — Places API anahtarı meta-data + internet
  (zaten var)
- Modify: `app/build.gradle.kts` — Places SDK bağımlılığı
- Create: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturViewModel.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/BiyografiBicimlendirme.kt` — saf
  fonksiyonlar (etiket ekleme/kaldırma), Android framework'süz, JUnit ile test edilebilir
- Create: `app/src/main/java/com/nfckartify/bayi/ui/FotoKirpici.kt` — kırpma/yakınlaştırma
  composable'ı + final bitmap üretme fonksiyonu
- Create: `app/src/main/java/com/nfckartify/bayi/data/ApiService.kt` — `profilOlustur`
  ucu eklenir (Modify)
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt` — yeni rota
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/MusterilerEkrani.kt` — "+ Profil
  Oluştur" butonu
- Test: `app/src/test/java/com/nfckartify/bayi/ui/BiyografiBicimlendirmeTest.kt`

---

### Task 1: Temel form alanları (ad soyad, işletme, sektör, iletişim, KVKK)

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturViewModel.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/MusterilerEkrani.kt`

- [ ] **Step 1: `ProfilOlusturViewModel.kt`'i temel alanlarla yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.TextFieldValue
import androidx.lifecycle.ViewModel

val SEKTORLER = listOf(
    "diger" to "Diğer",
    "teknoloji" to "Teknoloji",
    "saglik" to "Sağlık",
    "finans" to "Finans",
    "egitim" to "Eğitim",
    "insaat" to "İnşaat",
)

class ProfilOlusturViewModel : ViewModel() {
    var adSoyad by mutableStateOf("")
    var isletmeAdi by mutableStateOf("")
    var sektor by mutableStateOf(SEKTORLER.first().first)
    var telefon by mutableStateOf("")
    var email by mutableStateOf("")
    var adres by mutableStateOf("")
    var kvkkOnaylandi by mutableStateOf(false)

    var linkedin by mutableStateOf("")
    var instagram by mutableStateOf("")
    var twitter by mutableStateOf("")
    var youtube by mutableStateOf("")
    var website by mutableStateOf("")
    var whatsapp by mutableStateOf("")
    var tiktok by mutableStateOf("")
    var sahibinden by mutableStateOf("")
    var hurriyetEmlak by mutableStateOf("")
    var googleYorumLink by mutableStateOf("")

    var biyografi by mutableStateOf(TextFieldValue(""))

    var yukleniyor by mutableStateOf(false)
    var hataMesaji by mutableStateOf<String?>(null)
    var basariliUrl by mutableStateOf<String?>(null)

    fun formGecerliMi(): String? {
        if (adSoyad.isBlank()) return "Ad soyad zorunlu."
        if (adSoyad.trim().split(Regex("\\s+")).size < 2) return "Lütfen ad ve soyadı birlikte yazın."
        if (!kvkkOnaylandi) return "Devam etmek için KVKK onayı gerekiyor."
        return null
    }
}
```

- [ ] **Step 2: `ProfilOlusturEkrani.kt`'i temel alanlarla yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ProfilOlusturEkrani(viewModel: ProfilOlusturViewModel, olusturuldu: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text("Profil Oluştur", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(8.dp))

        OutlinedTextField(
            value = viewModel.adSoyad,
            onValueChange = { viewModel.adSoyad = it },
            label = { Text("Ad Soyad *") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.padding(4.dp))

        OutlinedTextField(
            value = viewModel.isletmeAdi,
            onValueChange = { viewModel.isletmeAdi = it },
            label = { Text("İşletme Adı (opsiyonel)") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.padding(4.dp))

        var sektorMenuAcik by remember { mutableStateOf(false) }
        val sektorEtiketi = SEKTORLER.first { it.first == viewModel.sektor }.second
        ExposedDropdownMenuBox(
            expanded = sektorMenuAcik,
            onExpandedChange = { sektorMenuAcik = it },
        ) {
            OutlinedTextField(
                value = sektorEtiketi,
                onValueChange = {},
                readOnly = true,
                label = { Text("Sektör") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = sektorMenuAcik) },
                modifier = Modifier.fillMaxWidth().androidx.compose.material3.menuAnchor(),
            )
            androidx.compose.material3.ExposedDropdownMenu(
                expanded = sektorMenuAcik,
                onDismissRequest = { sektorMenuAcik = false },
            ) {
                SEKTORLER.forEach { (deger, etiket) ->
                    DropdownMenuItem(
                        text = { Text(etiket) },
                        onClick = {
                            viewModel.sektor = deger
                            sektorMenuAcik = false
                        },
                    )
                }
            }
        }
        Spacer(modifier = Modifier.padding(4.dp))

        OutlinedTextField(
            value = viewModel.telefon,
            onValueChange = { viewModel.telefon = it },
            label = { Text("Telefon") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.padding(4.dp))

        OutlinedTextField(
            value = viewModel.email,
            onValueChange = { viewModel.email = it },
            label = { Text("E-posta") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.padding(4.dp))

        OutlinedTextField(
            value = viewModel.adres,
            onValueChange = { viewModel.adres = it },
            label = { Text("Adres") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.padding(12.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = viewModel.kvkkOnaylandi,
                onCheckedChange = { viewModel.kvkkOnaylandi = it },
            )
            Text("KVKK metnini okudum, onaylıyorum. *")
        }
        Spacer(modifier = Modifier.padding(12.dp))

        if (viewModel.hataMesaji != null) {
            Text(viewModel.hataMesaji ?: "", color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.padding(6.dp))
        }

        if (viewModel.yukleniyor) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = {
                    val hata = viewModel.formGecerliMi()
                    if (hata != null) {
                        viewModel.hataMesaji = hata
                    } else {
                        viewModel.hataMesaji = null
                        // Gönderme mantığı Task 6'da eklenecek
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Oluştur")
            }
        }
    }
}
```

Not: `ExposedDropdownMenuBox`/`menuAnchor` Compose Material3'te deneysel bir API
(`@OptIn(ExperimentalMaterial3Api::class)` gerektirir) — derleme hatası verirse dosyanın
başına `@file:OptIn(ExperimentalMaterial3Api::class)` eklenecek, bu normal bir düzeltme.

- [ ] **Step 3: Navigasyona rotayı ekle**

`NfcKartifyApp.kt`'deki `musteriler` composable bloğunu güncelle — `MusterilerEkrani`
çağrısına yeni bir `profilOlusturTiklandi` parametresi eklenecek (Step 4'te), ve yeni bir
`composable("profilOlustur") { ... }` bloğu ekle:

```kotlin
        composable("profilOlustur") {
            val vm = ProfilOlusturViewModel()
            ProfilOlusturEkrani(vm) {
                navController.popBackStack()
            }
        }
```

Bunu `NavHost` içindeki `composable("musteriler") { ... }` bloğundan hemen sonra ekle.

- [ ] **Step 4: `MusterilerEkrani.kt`'e "+ Profil Oluştur" butonu ekle**

`MusterilerEkrani` fonksiyon imzasını güncelle:

```kotlin
@Composable
fun MusterilerEkrani(
    viewModel: MusterilerViewModel,
    musteriSecildi: (Musteri) -> Unit,
    profilOlusturTiklandi: () -> Unit,
) {
```

`Text("Müşterilerim", ...)` satırının hemen altına, `Spacer`den önce ekle:

```kotlin
        androidx.compose.material3.Button(
            onClick = profilOlusturTiklandi,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("+ Profil Oluştur")
        }
```

`NfcKartifyApp.kt`'deki `musteriler` composable çağrısını güncelle:

```kotlin
        composable("musteriler") {
            val vm = MusterilerViewModel(tokenDeposu)
            MusterilerEkrani(
                viewModel = vm,
                musteriSecildi = { musteri -> navController.navigate("calisanlar/${musteri.id}") },
                profilOlusturTiklandi = { navController.navigate("profilOlustur") },
            )
        }
```

- [ ] **Step 5: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`. `ExposedDropdownMenuBox` deneysel API uyarısı/hatası
çıkarsa Step 2'deki nottaki `@OptIn` eklemesini yap ve tekrar dene.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt app/src/main/java/com/nfckartify/bayi/ui/MusterilerEkrani.kt
git commit -m "Profil Oluştur formu: temel alanlar + navigasyon"
```

---

### Task 2: Sosyal medya alanları

**Files:**
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt`

- [ ] **Step 1: Genişletilebilir "Sosyal Medya" bölümü ekle**

`ProfilOlusturEkrani.kt`'de KVKK satırından hemen önce (adres alanından sonra) ekle:

```kotlin
        var sosyalAcik by remember { mutableStateOf(false) }
        androidx.compose.material3.TextButton(onClick = { sosyalAcik = !sosyalAcik }) {
            Text(if (sosyalAcik) "Sosyal Medya (gizle)" else "Sosyal Medya (göster)")
        }
        if (sosyalAcik) {
            listOf(
                "LinkedIn" to viewModel::linkedin,
                "Instagram" to viewModel::instagram,
            )
            OutlinedTextField(viewModel.linkedin, { viewModel.linkedin = it }, label = { Text("LinkedIn") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.instagram, { viewModel.instagram = it }, label = { Text("Instagram") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.twitter, { viewModel.twitter = it }, label = { Text("Twitter / X") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.youtube, { viewModel.youtube = it }, label = { Text("YouTube") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.website, { viewModel.website = it }, label = { Text("Website") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.whatsapp, { viewModel.whatsapp = it }, label = { Text("WhatsApp") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.tiktok, { viewModel.tiktok = it }, label = { Text("TikTok") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.sahibinden, { viewModel.sahibinden = it }, label = { Text("Sahibinden") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.hurriyetEmlak, { viewModel.hurriyetEmlak = it }, label = { Text("Hürriyet Emlak") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.googleYorumLink, { viewModel.googleYorumLink = it }, label = { Text("Google Yorum Linki") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.padding(8.dp))
        }
```

Not: Yukarıdaki geçici `listOf(...)` satırı bir taslak kalıntısıdır, **silinmeli** — asıl
alanlar zaten altındaki `OutlinedTextField` çağrılarıyla tek tek yazılıyor. Bu satırı
dosyaya eklemeden çıkar.

- [ ] **Step 2: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt
git commit -m "Profil Oluştur formuna sosyal medya alanlarını ekle"
```

---

### Task 3: Biyografi biçimlendirme (Kalın/İtalik/Ortala)

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/ui/BiyografiBicimlendirme.kt`
- Test: `app/src/test/java/com/nfckartify/bayi/ui/BiyografiBicimlendirmeTest.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt`

- [ ] **Step 1: Başarısız testi yaz**

`app/src/test/java/com/nfckartify/bayi/ui/BiyografiBicimlendirmeTest.kt`:

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import org.junit.Assert.assertEquals
import org.junit.Test

class BiyografiBicimlendirmeTest {

    @Test
    fun `secili metne kalin etiketi ekler`() {
        val deger = TextFieldValue("Merhaba dünya", TextRange(0, 7))
        val sonuc = seciliMetneEtiketEkle(deger, "<b>", "</b>")
        assertEquals("<b>Merhaba</b> dünya", sonuc.text)
    }

    @Test
    fun `secim yoksa imlec konumuna bos etiket ekler`() {
        val deger = TextFieldValue("Merhaba", TextRange(7))
        val sonuc = seciliMetneEtiketEkle(deger, "<i>", "</i>")
        assertEquals("Merhaba<i></i>", sonuc.text)
        assertEquals(TextRange(10), sonuc.selection)
    }

    @Test
    fun `ortala uygulanmamis metni sarar`() {
        val deger = TextFieldValue("Merhaba dünya")
        val sonuc = ortalaUygula(deger)
        assertEquals("<p style=\"text-align:center\">Merhaba dünya</p>", sonuc.text)
    }

    @Test
    fun `ortala zaten uygulanmis metinden kaldirir`() {
        val deger = TextFieldValue("<p style=\"text-align:center\">Merhaba dünya</p>")
        val sonuc = ortalaUygula(deger)
        assertEquals("Merhaba dünya", sonuc.text)
    }
}
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `./gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.ui.BiyografiBicimlendirmeTest"`
Expected: FAIL — `seciliMetneEtiketEkle`/`ortalaUygula` tanımlı değil

- [ ] **Step 3: `BiyografiBicimlendirme.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue

fun seciliMetneEtiketEkle(deger: TextFieldValue, acilis: String, kapanis: String): TextFieldValue {
    val secim = deger.selection
    val metin = deger.text
    return if (secim.collapsed) {
        val yeniMetin = metin.substring(0, secim.start) + acilis + kapanis + metin.substring(secim.start)
        TextFieldValue(yeniMetin, TextRange(secim.start + acilis.length))
    } else {
        val bas = minOf(secim.start, secim.end)
        val son = maxOf(secim.start, secim.end)
        val yeniMetin = metin.substring(0, bas) + acilis + metin.substring(bas, son) + kapanis + metin.substring(son)
        TextFieldValue(yeniMetin, TextRange(bas + acilis.length, son + acilis.length))
    }
}

private const val ORTALA_ACILIS = "<p style=\"text-align:center\">"
private const val ORTALA_KAPANIS = "</p>"

fun ortalaUygula(deger: TextFieldValue): TextFieldValue {
    val metin = deger.text
    val yeniMetin = if (metin.startsWith(ORTALA_ACILIS) && metin.endsWith(ORTALA_KAPANIS)) {
        metin.removePrefix(ORTALA_ACILIS).removeSuffix(ORTALA_KAPANIS)
    } else {
        "$ORTALA_ACILIS$metin$ORTALA_KAPANIS"
    }
    return TextFieldValue(yeniMetin, TextRange(yeniMetin.length))
}
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `./gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.ui.BiyografiBicimlendirmeTest"`
Expected: `BUILD SUCCESSFUL`, 4 test geçti.

- [ ] **Step 5: Biyografi alanını + araç çubuğunu forma ekle**

`ProfilOlusturEkrani.kt`'de sosyal medya bölümünden sonra, KVKK'dan önce ekle:

```kotlin
        Text("Biyografi", style = MaterialTheme.typography.titleMedium)
        Row {
            androidx.compose.material3.TextButton(
                onClick = { viewModel.biyografi = seciliMetneEtiketEkle(viewModel.biyografi, "<b>", "</b>") },
            ) { Text("Kalın") }
            androidx.compose.material3.TextButton(
                onClick = { viewModel.biyografi = seciliMetneEtiketEkle(viewModel.biyografi, "<i>", "</i>") },
            ) { Text("İtalik") }
            androidx.compose.material3.TextButton(
                onClick = { viewModel.biyografi = ortalaUygula(viewModel.biyografi) },
            ) { Text("Ortala") }
        }
        OutlinedTextField(
            value = viewModel.biyografi,
            onValueChange = { viewModel.biyografi = it },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
        )
        Spacer(modifier = Modifier.padding(12.dp))
```

- [ ] **Step 6: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/BiyografiBicimlendirme.kt app/src/test/java/com/nfckartify/bayi/ui/BiyografiBicimlendirmeTest.kt app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt
git commit -m "Biyografi kalın/italik/ortala biçimlendirmesini ekle"
```

---

### Task 4: Google Places adres otomatik tamamlama

**Files:**
- Modify: `app/build.gradle.kts`
- Modify: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/AdresAlani.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/MainActivity.kt` (veya bir `Application`
  sınıfı — Places SDK başlatma noktası)

- [ ] **Step 1: Places SDK bağımlılığını ekle**

`app/build.gradle.kts`'deki `dependencies` bloğuna ekle:

```kotlin
    implementation("com.google.android.libraries.places:places:3.5.0")
```

- [ ] **Step 2: API anahtarını manifest'e ekle**

`app/src/main/AndroidManifest.xml`'deki `<application>` etiketinin içine, `<activity>`
etiketinden önce ekle:

```xml
        <meta-data
            android:name="com.google.android.geo.API_KEY"
            android:value="AIzaSyD4GlF9-Dt2dPlrQBTpp5sZRnyEQ85DZNo" />
```

Not: Bu, `kurumsal-kartvizit` backend'inin `.env` dosyasındaki `GOOGLE_MAPS_API_KEY` ile
**aynı** paylaşılan anahtar — kullanıcı onayıyla, kısıtlamasız kullanılıyor.

- [ ] **Step 3: `MainActivity.kt`'de Places SDK'yı başlat**

`MainActivity.kt`'deki `onCreate` fonksiyonunun başına (`super.onCreate` satırından hemen
sonra, `setContent`'ten önce) ekle:

```kotlin
        if (!com.google.android.libraries.places.api.Places.isInitialized()) {
            com.google.android.libraries.places.api.Places.initialize(
                applicationContext,
                "AIzaSyD4GlF9-Dt2dPlrQBTpp5sZRnyEQ85DZNo",
            )
        }
```

- [ ] **Step 4: `AdresAlani.kt`'i yaz**

Places SDK'nın Compose'a hazır bir bileşeni olmadığı için, `AutocompleteSupportFragment`'i
`AndroidView` ile Compose'a gömüyoruz:

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.fragment.app.FragmentActivity
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.widget.AutocompleteSupportFragment
import com.google.android.libraries.places.widget.listener.PlaceSelectionListener

@Composable
fun AdresAlani(deger: String, degisti: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val activity = context as? FragmentActivity

    if (activity == null) {
        // Fragment barındıramayan bir bağlamdaysak (ör. önizleme), düz metin alanına düş
        OutlinedTextField(value = deger, onValueChange = degisti, label = { Text("Adres") }, modifier = modifier)
        return
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val fragmentContainerId = androidx.core.view.ViewCompat.generateViewId()
            val frameLayout = android.widget.FrameLayout(ctx).apply { id = fragmentContainerId }

            val mevcut = activity.supportFragmentManager.findFragmentById(fragmentContainerId)
            if (mevcut == null) {
                val fragment = AutocompleteSupportFragment.newInstance()
                fragment.setPlaceFields(listOf(Place.Field.ADDRESS))
                fragment.setCountries(listOf("TR"))
                fragment.setOnPlaceSelectedListener(object : PlaceSelectionListener {
                    override fun onPlaceSelected(place: Place) {
                        degisti(place.address ?: "")
                    }
                    override fun onError(status: com.google.android.gms.common.api.Status) {
                        // Kullanıcı seçim yapmadan geri çıkarsa hata olabilir, sessizce yoksay
                    }
                })
                activity.supportFragmentManager.beginTransaction()
                    .add(fragmentContainerId, fragment)
                    .commitNow()
            }
            frameLayout
        },
    )
}
```

- [ ] **Step 5: `MainActivity`'nin `FragmentActivity`'den türediğinden emin ol**

`ComponentActivity` zaten `FragmentActivity`'yi miras alır (AndroidX'te
`ComponentActivity -> ... -> FragmentActivity` zinciri vardır) — bu yüzden `MainActivity`
değişikliği gerekmez. Derleme sırasında `activity as? FragmentActivity` başarısız
olursa (olası değil ama), `MainActivity : ComponentActivity()` yerine
`MainActivity : androidx.fragment.app.FragmentActivity()` yapılacak.

- [ ] **Step 6: Formda düz metin adres alanını `AdresAlani` ile değiştir**

`ProfilOlusturEkrani.kt`'deki:

```kotlin
        OutlinedTextField(
            value = viewModel.adres,
            onValueChange = { viewModel.adres = it },
            label = { Text("Adres") },
            modifier = Modifier.fillMaxWidth(),
        )
```

satırlarını şununla değiştir:

```kotlin
        AdresAlani(
            deger = viewModel.adres,
            degisti = { viewModel.adres = it },
            modifier = Modifier.fillMaxWidth(),
        )
```

- [ ] **Step 7: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`. Places SDK'nın `AutocompleteSupportFragment` API'si sürüm
sürüm değişebiliyor — hata çıkarsa (ör. `setCountries` yerine `setCountry` gerekebilir)
düzelt ve tekrar dene.

- [ ] **Step 8: Commit**

```bash
git add app/build.gradle.kts app/src/main/AndroidManifest.xml app/src/main/java/com/nfckartify/bayi
git commit -m "Google Places ile adres otomatik tamamlamayı ekle"
```

---

### Task 5: Fotoğraf seçme + kırpma/yakınlaştırma

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/ui/FotoKirpici.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturViewModel.kt`

- [ ] **Step 1: `ProfilOlusturViewModel.kt`'e fotoğraf durumu ekle**

`ProfilOlusturViewModel` sınıfına ekle:

```kotlin
    var secilenFotoUri by mutableStateOf<android.net.Uri?>(null)
    var kaydirmaX by mutableStateOf(0f)
    var kaydirmaY by mutableStateOf(0f)
    var yakinlastirmaIndeksi by mutableStateOf(0)
```

- [ ] **Step 2: `FotoKirpici.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp

val YAKINLASTIRMA_SEVIYELERI = listOf(1f, 1.33f, 1.66f, 2f)
const val KIRPICI_HEDEF_BOYUT = 600

@Composable
fun FotoKirpici(
    kaynakBitmap: Bitmap,
    kaydirmaX: Float,
    kaydirmaY: Float,
    yakinlastirmaIndeksi: Int,
    kaydirmaDegisti: (Float, Float) -> Unit,
    yakinlastirmaIndeksiDegisti: (Int) -> Unit,
) {
    val gorunumBoyutuDp = 240.dp

    Column {
        Box(
            modifier = Modifier
                .size(gorunumBoyutuDp)
                .pointerInput(Unit) {
                    detectDragGestures { _, surukleme ->
                        kaydirmaDegisti(kaydirmaX + surukleme.x, kaydirmaY + surukleme.y)
                    }
                },
        ) {
            Image(
                bitmap = kaynakBitmap.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(gorunumBoyutuDp)
                    .androidx.compose.ui.draw.clip(androidx.compose.foundation.shape.CircleShape.let { androidx.compose.foundation.shape.RoundedCornerShape(0.dp) })
                    .androidx.compose.ui.graphics.graphicsLayer(
                        scaleX = YAKINLASTIRMA_SEVIYELERI[yakinlastirmaIndeksi],
                        scaleY = YAKINLASTIRMA_SEVIYELERI[yakinlastirmaIndeksi],
                        translationX = kaydirmaX,
                        translationY = kaydirmaY,
                    ),
            )
        }
        Row {
            YAKINLASTIRMA_SEVIYELERI.forEachIndexed { index, seviye ->
                Button(onClick = { yakinlastirmaIndeksiDegisti(index) }) {
                    Text("${seviye}x")
                }
            }
        }
    }
}

fun kirpilmisBitmapUret(
    kaynak: Bitmap,
    gorunumBoyutuPx: Int,
    kaydirmaX: Float,
    kaydirmaY: Float,
    yakinlastirma: Float,
): Bitmap {
    val hedef = Bitmap.createBitmap(KIRPICI_HEDEF_BOYUT, KIRPICI_HEDEF_BOYUT, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(hedef)

    val olcek = gorunumBoyutuPx.toFloat() / minOf(kaynak.width, kaynak.height)
    val matrix = Matrix()

    val hedefOlcek = KIRPICI_HEDEF_BOYUT.toFloat() / gorunumBoyutuPx

    matrix.postScale(olcek * yakinlastirma, olcek * yakinlastirma)
    val olcekliGenislik = kaynak.width * olcek * yakinlastirma
    val olcekliYukseklik = kaynak.height * olcek * yakinlastirma
    val ortalamaKaydirmaX = (gorunumBoyutuPx - olcekliGenislik) / 2f + kaydirmaX
    val ortalamaKaydirmaY = (gorunumBoyutuPx - olcekliYukseklik) / 2f + kaydirmaY
    matrix.postTranslate(ortalamaKaydirmaX, ortalamaKaydirmaY)

    matrix.postScale(hedefOlcek, hedefOlcek)

    canvas.drawBitmap(kaynak, matrix, null)
    return hedef
}
```

- [ ] **Step 3: Formda fotoğraf seçici + kırpıcıyı bağla**

`ProfilOlusturEkrani.kt`'nin başına (biyografi bölümünden önce, sosyal medyadan sonra
veya başlıktan hemen sonra — konum önemli değil) ekle. Önce importlara:

```kotlin
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import android.graphics.BitmapFactory
```

Sonra `ProfilOlusturEkrani` composable'ının içine, en üste (Text("Profil Oluştur")'dan
hemen sonra) ekle:

```kotlin
        val context = LocalContext.current
        var kaynakBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
        val fotoSeciciBaslat = rememberLauncherForActivityResult(
            ActivityResultContracts.GetContent(),
        ) { uri ->
            viewModel.secilenFotoUri = uri
            if (uri != null) {
                context.contentResolver.openInputStream(uri)?.use { girisAkisi ->
                    kaynakBitmap = BitmapFactory.decodeStream(girisAkisi)
                }
            }
        }

        Button(onClick = { fotoSeciciBaslat.launch("image/*") }, modifier = Modifier.fillMaxWidth()) {
            Text(if (kaynakBitmap == null) "Fotoğraf Seç" else "Fotoğrafı Değiştir")
        }
        Spacer(modifier = Modifier.padding(8.dp))

        kaynakBitmap?.let { bitmap ->
            FotoKirpici(
                kaynakBitmap = bitmap,
                kaydirmaX = viewModel.kaydirmaX,
                kaydirmaY = viewModel.kaydirmaY,
                yakinlastirmaIndeksi = viewModel.yakinlastirmaIndeksi,
                kaydirmaDegisti = { x, y -> viewModel.kaydirmaX = x; viewModel.kaydirmaY = y },
                yakinlastirmaIndeksiDegisti = { viewModel.yakinlastirmaIndeksi = it },
            )
            Spacer(modifier = Modifier.padding(8.dp))
        }
```

- [ ] **Step 4: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`. `FotoKirpici.kt`'deki iç içe yazılmış `androidx.compose...`
tam-nitelikli çağrılar (özellikle `clip`/`graphicsLayer` satırı) muhtemelen sözdizimi
hatası verecek — o satırı şu şekilde sadeleştir ve dosyanın importlarına
`import androidx.compose.ui.draw.graphicsLayer` ekle:

```kotlin
            Image(
                bitmap = kaynakBitmap.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(gorunumBoyutuDp)
                    .graphicsLayer(
                        scaleX = YAKINLASTIRMA_SEVIYELERI[yakinlastirmaIndeksi],
                        scaleY = YAKINLASTIRMA_SEVIYELERI[yakinlastirmaIndeksi],
                        translationX = kaydirmaX,
                        translationY = kaydirmaY,
                    ),
            )
```

Bu tür küçük API/import düzeltmeleri, Kotlin/Compose sürüm farkları nedeniyle bu görevde
normal — derleyici hatasını oku, düzelt, tekrar derle.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/FotoKirpici.kt app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturViewModel.kt
git commit -m "Fotoğraf seçme + kırpma/yakınlaştırma özelliğini ekle"
```

---

### Task 6: Formu gönderme (multipart POST)

**Files:**
- Modify: `app/src/main/java/com/nfckartify/bayi/data/ApiService.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturViewModel.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt`

- [ ] **Step 1: `ApiService.kt`'e multipart ucu ekle**

`ApiService.kt`'nin üstündeki importlara ekle:

```kotlin
import okhttp3.MultipartBody
import retrofit2.http.Multipart
import retrofit2.http.Part
import retrofit2.http.PartMap
```

Arayüze ekle:

```kotlin
    @Multipart
    @POST("api/mobil/profil-olustur")
    suspend fun profilOlustur(
        @Header("Authorization") yetki: String,
        @PartMap alanlar: Map<String, okhttp3.RequestBody>,
        @Part foto: MultipartBody.Part?,
    ): Response<ProfilOlusturCevap>
```

`Models.kt`'ye ekle:

```kotlin
@Serializable
data class ProfilOlusturCevap(
    val ok: Boolean,
    val firmaId: Int? = null,
    val url: String? = null,
    val error: String? = null,
)
```

- [ ] **Step 2: `ProfilOlusturViewModel.kt`'e gönderme fonksiyonunu ekle**

Sınıfın importlarına ekle:

```kotlin
import androidx.lifecycle.viewModelScope
import com.nfckartify.bayi.data.ApiClient
import com.nfckartify.bayi.data.TokenDeposu
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
```

`ProfilOlusturViewModel` sınıf tanımını `(private val tokenDeposu: TokenDeposu) : ViewModel()`
alacak şekilde güncelle (constructor parametresi ekleniyor), ve sınıfın sonuna ekle:

```kotlin
    fun gonder(fotoDosyasi: java.io.File?) {
        val hata = formGecerliMi()
        if (hata != null) {
            hataMesaji = hata
            return
        }
        val token = tokenDeposu.tokenAl() ?: run {
            hataMesaji = "Oturum bulunamadı."
            return
        }
        yukleniyor = true
        hataMesaji = null
        viewModelScope.launch {
            try {
                fun metinParcasi(deger: String) = deger.toRequestBody("text/plain".toMediaTypeOrNull())
                val alanlar = mutableMapOf(
                    "ad_soyad" to metinParcasi(adSoyad),
                    "isletme_adi" to metinParcasi(isletmeAdi),
                    "sektor" to metinParcasi(sektor),
                    "telefon" to metinParcasi(telefon),
                    "email" to metinParcasi(email),
                    "adres" to metinParcasi(adres),
                    "biyografi" to metinParcasi(biyografi.text),
                    "linkedin" to metinParcasi(linkedin),
                    "instagram" to metinParcasi(instagram),
                    "twitter" to metinParcasi(twitter),
                    "youtube" to metinParcasi(youtube),
                    "website" to metinParcasi(website),
                    "whatsapp" to metinParcasi(whatsapp),
                    "tiktok" to metinParcasi(tiktok),
                    "sahibinden" to metinParcasi(sahibinden),
                    "hurriyet_emlak" to metinParcasi(hurriyetEmlak),
                    "google_yorum_link" to metinParcasi(googleYorumLink),
                    "kvkk" to metinParcasi("on"),
                )
                val fotoPart = fotoDosyasi?.let {
                    MultipartBody.Part.createFormData(
                        "foto", it.name, it.asRequestBody("image/jpeg".toMediaTypeOrNull()),
                    )
                }
                val cevap = ApiClient.servis.profilOlustur("Bearer $token", alanlar, fotoPart)
                val govde = cevap.body()
                if (cevap.isSuccessful && govde?.ok == true) {
                    basariliUrl = govde.url
                } else {
                    hataMesaji = govde?.error ?: "Profil oluşturulamadı."
                }
            } catch (e: Exception) {
                hataMesaji = "Bağlantı hatası: ${e.message}"
            } finally {
                yukleniyor = false
            }
        }
    }
```

- [ ] **Step 3: Ekrandaki "Oluştur" butonunu gönderme fonksiyonuna bağla**

`ProfilOlusturEkrani.kt`'deki `Button(onClick = { ... Gönderme mantığı Task 6'da
eklenecek })` bloğunu şununla değiştir:

```kotlin
            Button(
                onClick = {
                    val hata = viewModel.formGecerliMi()
                    if (hata != null) {
                        viewModel.hataMesaji = hata
                    } else {
                        val fotoDosyasi = kaynakBitmap?.let { bitmap ->
                            val kirpilmis = kirpilmisBitmapUret(
                                bitmap, 240, viewModel.kaydirmaX, viewModel.kaydirmaY,
                                YAKINLASTIRMA_SEVIYELERI[viewModel.yakinlastirmaIndeksi],
                            )
                            val dosya = java.io.File(context.cacheDir, "profil_foto.jpg")
                            java.io.FileOutputStream(dosya).use { cikisAkisi ->
                                kirpilmis.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, cikisAkisi)
                            }
                            dosya
                        }
                        viewModel.gonder(fotoDosyasi)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Oluştur")
            }
```

Ayrıca `LaunchedEffect(viewModel.basariliUrl)` ekleyerek başarı durumunda geri dönmeyi
sağla — `Column(...)` bloğunun hemen başına ekle:

```kotlin
        androidx.compose.runtime.LaunchedEffect(viewModel.basariliUrl) {
            viewModel.basariliUrl?.let { olusturuldu(it) }
        }
```

`ProfilOlusturViewModel` artık `TokenDeposu` parametresi aldığı için, `NfcKartifyApp.kt`'deki
`ProfilOlusturViewModel()` çağrısını `ProfilOlusturViewModel(tokenDeposu)` olarak güncelle.

- [ ] **Step 4: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi
git commit -m "Profil Oluştur formunu backend'e (multipart POST) bağla"
```

---

### Task 7: Tam test + cihazda uçtan uca doğrulama

**Files:** Yok (doğrulama adımı)

- [ ] **Step 1: Tüm birim testlerini çalıştır**

Run: `./gradlew.bat test`
Expected: `BUILD SUCCESSFUL`, `BiyografiBicimlendirmeTest`'teki 4 test dahil hepsi geçer.

- [ ] **Step 2: Cihaza kur**

Run:
```bash
"C:/Users/muham/AppData/Local/Android/Sdk/platform-tools/adb.exe" devices
./gradlew.bat installDebug
```
Telefon bağlı değilse kullanıcıdan bağlamasını iste, otomatik atlanamaz.

- [ ] **Step 3: Uygulamayı başlat ve gerçek bayi hesabıyla test et**

Run: `"C:/Users/muham/AppData/Local/Android/Sdk/platform-tools/adb.exe" shell am start -n com.nfckartify.bayi/.MainActivity`

Kullanıcıdan telefonda: giriş yapıp "+ Profil Oluştur"a basmasını, ad soyad + KVKK ile
(fotoğrafsız/fotoğraflı) bir profil oluşturmasını, işlemin başarıyla tamamlanıp müşteri
listesine dönüldüğünü doğrulamasını iste. Backend'de gerçekten oluşan test profilini
(`node -e` ile `kurumsal-kartvizit` reposundan) temizle.

- [ ] **Step 4: Logcat'te hata olmadığını doğrula**

Run: `"C:/Users/muham/AppData/Local/Android/Sdk/platform-tools/adb.exe" logcat -d --pid=$(adb shell pidof com.nfckartify.bayi) | grep -iE "exception|fatal"`
Expected: Boş çıktı (hata yok).

---

## Sonraki Adım

Bu faz bitince: **Faz 3 — NFC Yaz/Kilitle**. Ayrı bir plan dokümanı olarak, bu faz
bittikten sonra yazılacak.
