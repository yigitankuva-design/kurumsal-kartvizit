# Google Yorum Linki — İşletme Arama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profil oluşturma formunda kullanıcının işletmesini Google Places'ten arayıp seçebilmesini, seçim sonrası doğru Google değerlendirme linkinin otomatik oluşup "Google Yorum Linki" alanına yazılmasını sağlamak.

**Architecture:** `AdresAlani.kt`'nin doğrudan `PlacesClient.findAutocompletePredictions()` + Compose `DropdownMenu` deseni yeni bir composable'da (`IsletmeAramaAlani.kt`) tekrarlanır — farkı, seçilen önerinin `place_id`'sini de dışarı vermesi. Ayrı, saf bir fonksiyon (`googleYorumLinkiOlustur`) `place_id`'den linki üretir. `ProfilOlusturEkrani.kt`'de bu arama kutusu mevcut metin alanının üstüne eklenir.

**Tech Stack:** Kotlin/Jetpack Compose, Google Places SDK (zaten proje bağımlılığı, yeni paket eklenmiyor).

---

### Task 1: `googleYorumLinkiOlustur` saf fonksiyonu

**Files:**
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\GoogleYorumLinki.kt`
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\test\java\com\nfckartify\bayi\ui\GoogleYorumLinkiTest.kt`

- [ ] **Step 1: Başarısız testi yaz**

```kotlin
package com.nfckartify.bayi.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class GoogleYorumLinkiTest {
    @Test
    fun `verilen place id ile dogru link olusturur`() {
        val link = googleYorumLinkiOlustur("ChIJN1t_tDeuEmsRUsoyG83frY4")
        assertEquals(
            "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
            link,
        )
    }
}
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run (PowerShell, JAVA_HOME set):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd C:\Users\muham\nfckartify-bayi-android
.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.ui.GoogleYorumLinkiTest"
```

Expected: FAIL — derleme hatası, `googleYorumLinkiOlustur` tanımlı değil

- [ ] **Step 3: `GoogleYorumLinki.kt`'yi oluştur**

```kotlin
package com.nfckartify.bayi.ui

fun googleYorumLinkiOlustur(placeId: String): String =
    "https://search.google.com/local/writereview?placeid=$placeId"
```

- [ ] **Step 4: Testi çalıştırıp başarılı olduğunu doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat testDebugUnitTest --tests "com.nfckartify.bayi.ui.GoogleYorumLinkiTest"`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
cd /c/Users/muham/nfckartify-bayi-android
git add app/src/main/java/com/nfckartify/bayi/ui/GoogleYorumLinki.kt app/src/test/java/com/nfckartify/bayi/ui/GoogleYorumLinkiTest.kt
git commit -m "Google yorum linki uretme fonksiyonu"
```

---

### Task 2: `IsletmeAramaAlani` composable

**Files:**
- Create: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\IsletmeAramaAlani.kt`

Bu dosya Context/Places SDK'ya bağımlı olduğu için (AdresAlani.kt'de de olduğu gibi)
unit testi yok, derleme kontrolü yeterli — gerçek doğrulama Task 4'te cihazda yapılır.

- [ ] **Step 1: `IsletmeAramaAlani.kt`'yi oluştur**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.google.android.libraries.places.api.Places
import com.google.android.libraries.places.api.model.AutocompleteSessionToken
import com.google.android.libraries.places.api.net.FindAutocompletePredictionsRequest

@Composable
fun IsletmeAramaAlani(
    yerSecildi: (placeId: String, ad: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val placesClient = remember { Places.createClient(context) }
    val sessionToken = remember { AutocompleteSessionToken.newInstance() }
    var aramaMetni by remember { mutableStateOf("") }
    var oneriler by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var menuAcik by remember { mutableStateOf(false) }

    Column(modifier = modifier) {
        OutlinedTextField(
            value = aramaMetni,
            onValueChange = { yeniDeger ->
                aramaMetni = yeniDeger
                if (yeniDeger.length < 3) {
                    oneriler = emptyList()
                    menuAcik = false
                    return@OutlinedTextField
                }
                val istek = FindAutocompletePredictionsRequest.builder()
                    .setSessionToken(sessionToken)
                    .setCountries(listOf("TR"))
                    .setQuery(yeniDeger)
                    .build()
                placesClient.findAutocompletePredictions(istek)
                    .addOnSuccessListener { cevap ->
                        oneriler = cevap.autocompletePredictions.map {
                            it.placeId to it.getFullText(null).toString()
                        }
                        menuAcik = oneriler.isNotEmpty()
                    }
                    .addOnFailureListener {
                        oneriler = emptyList()
                        menuAcik = false
                    }
            },
            label = { Text("İşletme Ara (Google Yorum için)") },
            modifier = Modifier.fillMaxWidth(),
        )
        DropdownMenu(expanded = menuAcik, onDismissRequest = { menuAcik = false }) {
            oneriler.forEach { (placeId, metin) ->
                DropdownMenuItem(
                    text = { Text(metin) },
                    onClick = {
                        yerSecildi(placeId, metin)
                        aramaMetni = ""
                        oneriler = emptyList()
                        menuAcik = false
                    },
                )
            }
        }
    }
}
```

- [ ] **Step 2: Derlemeyi doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/IsletmeAramaAlani.kt
git commit -m "Isletme arama alani (Google Places autocomplete)"
```

---

### Task 3: `ProfilOlusturEkrani.kt` entegrasyonu

**Files:**
- Modify: `C:\Users\muham\nfckartify-bayi-android\app\src\main\java\com\nfckartify\bayi\ui\ProfilOlusturEkrani.kt`

- [ ] **Step 1: `IsletmeAramaAlani`'yi "Google Yorum Linki" alanının üstüne ekle**

Mevcut şu satırı bul:

```kotlin
            OutlinedTextField(viewModel.googleYorumLink, { viewModel.googleYorumLink = it }, label = { Text("Google Yorum Linki") }, modifier = Modifier.fillMaxWidth())
```

Bunu şu hale getir (üstüne arama kutusu eklenmiş):

```kotlin
            IsletmeAramaAlani(
                yerSecildi = { placeId, _ -> viewModel.googleYorumLink = googleYorumLinkiOlustur(placeId) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(modifier = Modifier.padding(4.dp))
            OutlinedTextField(viewModel.googleYorumLink, { viewModel.googleYorumLink = it }, label = { Text("Google Yorum Linki") }, modifier = Modifier.fillMaxWidth())
```

- [ ] **Step 2: Derlemeyi doğrula**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/ProfilOlusturEkrani.kt
git commit -m "Profil formuna isletme arama ile google yorum linki doldurma eklendi"
```

---

### Task 4: Tam test + cihazda gerçek doğrulama

**Files:** Yok (komutlar + ADB/fiziksel doğrulama)

- [ ] **Step 1: Tüm Android unit testleri çalıştır**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Cihaza kur**

Run (PowerShell, JAVA_HOME set): `.\gradlew.bat installDebug`
Expected: `Installed on 1 device.`

- [ ] **Step 3: ADB ile profil oluşturma formunu aç, gerçek bir işletme ara**

`adb shell uiautomator dump` + tap/text deseniyle: Müşterilerim → "+ Profil Oluştur",
"Sosyal Medya (göster)"a dokun, yeni "İşletme Ara" kutusuna gerçek bir işletme adı
yaz (örn. kullanıcının bildiği gerçek bir yer), önerilerin çıktığını doğrula, birini
seç.

- [ ] **Step 4: Google Yorum Linki alanının otomatik dolduğunu doğrula**

`uiautomator dump` ile "Google Yorum Linki" alanının artık
`https://search.google.com/local/writereview?placeid=...` formatında bir değer
içerdiğini doğrula.

- [ ] **Step 5: Linkin gerçekten çalıştığını doğrula**

Bu URL'yi `adb shell am start -a android.intent.action.VIEW -d "<link>"` ile
tarayıcıda aç, Google'ın gerçekten o işletme için "yorum yaz" ekranını açtığını
gözle doğrula (ekran görüntüsü al). Açmıyorsa (ör. yer değerlendirmeye kapalıysa)
bunu kullanıcıya bildir, plan varsayımının yanlış çıkıp çıkmadığını netleştir.

- [ ] **Step 6: Son durum kontrolü**

Run: `git status --short`
Expected: Boş çıktı.
