# Android Faz 3: NFC Yaz/Kilitle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çalışanlar (kart) listesindeki her profil için "Karta Yaz" seçeneği eklemek —
üretilen profil URL'ini telefonun NFC'siyle boş bir NTAG karta NDEF URI kaydı olarak
yazmak. Yazma başarılı olduktan sonra opsiyonel "Kilitle" (salt-okunur yapma, **geri
alınamaz**, onay ekranı zorunlu) özelliği.

**Architecture:** `MainActivity`, `NfcAdapter` foreground dispatch kurar (activity
foreground'dayken NFC tag algılama uygulamaya yönlendirilir). Algılanan `Tag`, basit bir
paylaşılan `MutableStateFlow<Tag?>` (`NfcOlayYayini`) üzerinden Compose tarafına iletilir.
`KartaYazEkrani` bu akışı dinler; tag geldiğinde saf bir yardımcı fonksiyon (`NfcYazici.kt`)
ile NDEF yazma/kilitleme işlemini yapar. Kilitleme, ayrı bir onay adımından sonra ayrı bir
"tekrar kartı yaklaştır" bekleme durumuyla tetiklenir — yanlışlıkla kilitlemeyi önlemek için.

**Tech Stack:** Android'in yerleşik `android.nfc` paketi (ek bağımlılık gerekmez).
`kotlinx.coroutines.flow.MutableStateFlow` (zaten coroutines bağımlılığı var).

---

## Dosya Yapısı

- Modify: `app/src/main/AndroidManifest.xml` — NFC izni + feature, `MainActivity`'ye
  `launchMode="singleTop"`
- Modify: `app/src/main/java/com/nfckartify/bayi/MainActivity.kt` — foreground dispatch
  kurulumu + `onNewIntent`
- Create: `app/src/main/java/com/nfckartify/bayi/data/NfcOlayYayini.kt` — paylaşılan
  `MutableStateFlow<Tag?>`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/NfcYazici.kt` — `tagaUrlYaz`,
  `tagiKilitle` fonksiyonları (Android NFC framework tipleri kullanır)
- Create: `app/src/main/java/com/nfckartify/bayi/ui/KartaYazViewModel.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/KartaYazEkrani.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/CalisanlarViewModel.kt` — `firmaSlug`
  expose edilir
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/CalisanlarEkrani.kt` — "Karta Yaz"
  butonu her kart satırına eklenir
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt` — yeni rota

---

### Task 1: NFC izinleri + paylaşılan tag akışı

**Files:**
- Modify: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/com/nfckartify/bayi/data/NfcOlayYayini.kt`

- [ ] **Step 1: Manifest'e NFC izni/feature ekle, MainActivity'yi singleTop yap**

`AndroidManifest.xml`'deki `<uses-permission android:name="android.permission.INTERNET" />`
satırının altına ekle:

```xml
    <uses-permission android:name="android.permission.NFC" />
    <uses-feature android:name="android.hardware.nfc" android:required="false" />
```

`<activity android:name=".MainActivity" ...>` etiketine `android:launchMode="singleTop"`
ekle:

```xml
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:label="NFCKartify Bayi">
```

- [ ] **Step 2: `NfcOlayYayini.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.data

import android.nfc.Tag
import kotlinx.coroutines.flow.MutableStateFlow

object NfcOlayYayini {
    val algilananTag = MutableStateFlow<Tag?>(null)

    fun yayinla(tag: Tag) {
        algilananTag.value = tag
    }

    fun temizle() {
        algilananTag.value = null
    }
}
```

- [ ] **Step 3: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add app/src/main/AndroidManifest.xml app/src/main/java/com/nfckartify/bayi/data/NfcOlayYayini.kt
git commit -m "NFC izinleri + paylaşılan tag akışını ekle"
```

---

### Task 2: MainActivity — foreground dispatch

**Files:**
- Modify: `app/src/main/java/com/nfckartify/bayi/MainActivity.kt`

- [ ] **Step 1: `MainActivity.kt`'i foreground dispatch ile güncelle**

```kotlin
package com.nfckartify.bayi

import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.google.android.libraries.places.api.Places
import com.nfckartify.bayi.data.NfcOlayYayini
import com.nfckartify.bayi.ui.NfcKartifyApp

class MainActivity : ComponentActivity() {
    private var nfcAdapter: NfcAdapter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!Places.isInitialized()) {
            Places.initialize(applicationContext, "AIzaSyC-WqG5R-mdNYQZ8lrOnZ6WgwTQCAc_YWw")
        }
        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    NfcKartifyApp()
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        val adapter = nfcAdapter ?: return
        val bayrak = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE
        } else {
            0
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), bayrak,
        )
        val ndefFiltre = IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED)
        val tagFiltre = IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED)
        adapter.enableForegroundDispatch(this, pendingIntent, arrayOf(ndefFiltre, tagFiltre), null)
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val tag: Tag? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG, Tag::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
        }
        tag?.let { NfcOlayYayini.yayinla(it) }
    }
}
```

- [ ] **Step 2: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/MainActivity.kt
git commit -m "MainActivity: NFC foreground dispatch kurulumu"
```

---

### Task 3: NFC yazma/kilitleme mantığı

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/ui/NfcYazici.kt`

- [ ] **Step 1: `NfcYazici.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import android.nfc.FormatException
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.Tag
import android.nfc.TagLostException
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import java.io.IOException

sealed class NfcSonuc {
    data object Basarili : NfcSonuc()
    data class Hata(val mesaj: String) : NfcSonuc()
}

fun tagaUrlYaz(tag: Tag, url: String): NfcSonuc {
    val mesaj = NdefMessage(arrayOf(NdefRecord.createUri(url)))

    val ndef = Ndef.get(tag)
    if (ndef != null) {
        return try {
            ndef.connect()
            if (!ndef.isWritable) {
                return NfcSonuc.Hata("Bu kart salt-okunur, yazılamıyor.")
            }
            if (mesaj.toByteArray().size > ndef.maxSize) {
                return NfcSonuc.Hata("Link kartın kapasitesi için çok uzun.")
            }
            ndef.writeNdefMessage(mesaj)
            NfcSonuc.Basarili
        } catch (e: TagLostException) {
            NfcSonuc.Hata("Kart erken çekildi, tekrar deneyin.")
        } catch (e: IOException) {
            NfcSonuc.Hata("Yazma hatası: ${e.message}")
        } catch (e: FormatException) {
            NfcSonuc.Hata("Kart formatı desteklenmiyor.")
        } finally {
            try { ndef.close() } catch (e: IOException) { /* yoksay */ }
        }
    }

    val formatlanabilir = NdefFormatable.get(tag)
    if (formatlanabilir != null) {
        return try {
            formatlanabilir.connect()
            formatlanabilir.format(mesaj)
            NfcSonuc.Basarili
        } catch (e: TagLostException) {
            NfcSonuc.Hata("Kart erken çekildi, tekrar deneyin.")
        } catch (e: IOException) {
            NfcSonuc.Hata("Yazma hatası: ${e.message}")
        } finally {
            try { formatlanabilir.close() } catch (e: IOException) { /* yoksay */ }
        }
    }

    return NfcSonuc.Hata("Bu kart NDEF formatını desteklemiyor.")
}

fun tagiKilitle(tag: Tag): NfcSonuc {
    val ndef = Ndef.get(tag) ?: return NfcSonuc.Hata("Bu kart NDEF formatını desteklemiyor.")
    return try {
        ndef.connect()
        if (!ndef.canMakeReadOnly()) {
            return NfcSonuc.Hata("Bu kart kilitlemeyi desteklemiyor.")
        }
        val basarili = ndef.makeReadOnly()
        if (basarili) NfcSonuc.Basarili else NfcSonuc.Hata("Kilitleme başarısız oldu.")
    } catch (e: TagLostException) {
        NfcSonuc.Hata("Kart erken çekildi, tekrar deneyin.")
    } catch (e: IOException) {
        NfcSonuc.Hata("Kilitleme hatası: ${e.message}")
    } finally {
        try { ndef.close() } catch (e: IOException) { /* yoksay */ }
    }
}
```

- [ ] **Step 2: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`. NFC framework API'lerinde (özellikle `NdefFormatable`,
`canMakeReadOnly`) küçük sürüm farkları çıkarsa düzelt.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui/NfcYazici.kt
git commit -m "NFC yazma/kilitleme mantığını ekle"
```

---

### Task 4: Karta Yaz ekranı + ViewModel

**Files:**
- Create: `app/src/main/java/com/nfckartify/bayi/ui/KartaYazViewModel.kt`
- Create: `app/src/main/java/com/nfckartify/bayi/ui/KartaYazEkrani.kt`

- [ ] **Step 1: `KartaYazViewModel.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import android.nfc.Tag
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

enum class KartaYazDurumu {
    YAZMA_BEKLENIYOR, YAZILIYOR, YAZILDI, YAZMA_HATASI,
    KILITLEME_ONAYI, KILITLEME_BEKLENIYOR, KILITLENIYOR, KILITLENDI, KILITLEME_HATASI,
}

class KartaYazViewModel : ViewModel() {
    var durum by mutableStateOf(KartaYazDurumu.YAZMA_BEKLENIYOR)
        private set
    var hataMesaji by mutableStateOf<String?>(null)
        private set

    fun tagAlgilandi(tag: Tag, url: String) {
        when (durum) {
            KartaYazDurumu.YAZMA_BEKLENIYOR, KartaYazDurumu.YAZMA_HATASI -> {
                durum = KartaYazDurumu.YAZILIYOR
                when (val sonuc = tagaUrlYaz(tag, url)) {
                    is NfcSonuc.Basarili -> {
                        durum = KartaYazDurumu.YAZILDI
                        hataMesaji = null
                    }
                    is NfcSonuc.Hata -> {
                        durum = KartaYazDurumu.YAZMA_HATASI
                        hataMesaji = sonuc.mesaj
                    }
                }
            }
            KartaYazDurumu.KILITLEME_BEKLENIYOR, KartaYazDurumu.KILITLEME_HATASI -> {
                durum = KartaYazDurumu.KILITLENIYOR
                when (val sonuc = tagiKilitle(tag)) {
                    is NfcSonuc.Basarili -> {
                        durum = KartaYazDurumu.KILITLENDI
                        hataMesaji = null
                    }
                    is NfcSonuc.Hata -> {
                        durum = KartaYazDurumu.KILITLEME_HATASI
                        hataMesaji = sonuc.mesaj
                    }
                }
            }
            else -> { /* yazma/kilitleme sürüyor veya zaten tamamlandı, yoksay */ }
        }
    }

    fun kilitlemeOnayiIste() {
        durum = KartaYazDurumu.KILITLEME_ONAYI
    }

    fun kilitlemeVazgec() {
        durum = KartaYazDurumu.YAZILDI
    }

    fun kilitlemeyeBaslat() {
        durum = KartaYazDurumu.KILITLEME_BEKLENIYOR
    }

    fun tekrarDene() {
        durum = KartaYazDurumu.YAZMA_BEKLENIYOR
        hataMesaji = null
    }
}
```

- [ ] **Step 2: `KartaYazEkrani.kt`'i yaz**

```kotlin
package com.nfckartify.bayi.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nfckartify.bayi.data.NfcOlayYayini

@Composable
fun KartaYazEkrani(viewModel: KartaYazViewModel, adSoyad: String, url: String) {
    val algilananTag by NfcOlayYayini.algilananTag.collectAsState()

    LaunchedEffect(algilananTag) {
        val tag = algilananTag ?: return@LaunchedEffect
        viewModel.tagAlgilandi(tag, url)
        NfcOlayYayini.temizle()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Karta Yaz", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.padding(8.dp))
        Text(adSoyad, style = MaterialTheme.typography.titleMedium)
        Text(url, style = MaterialTheme.typography.bodySmall)
        Spacer(modifier = Modifier.padding(24.dp))

        when (viewModel.durum) {
            KartaYazDurumu.YAZMA_BEKLENIYOR -> {
                Text("Boş bir NFC kartı telefonun arkasına yaklaştırın.")
            }
            KartaYazDurumu.YAZILIYOR -> {
                CircularProgressIndicator()
                Text("Yazılıyor, kartı telefondan çekmeyin...")
            }
            KartaYazDurumu.YAZILDI -> {
                Text("Kart başarıyla yazıldı.", color = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.padding(16.dp))
                Button(onClick = { viewModel.kilitlemeOnayiIste() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Kilitle (opsiyonel)")
                }
            }
            KartaYazDurumu.YAZMA_HATASI -> {
                Text(viewModel.hataMesaji ?: "Yazma başarısız.", color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.padding(16.dp))
                Button(onClick = { viewModel.tekrarDene() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Tekrar Dene")
                }
            }
            KartaYazDurumu.KILITLEME_ONAYI -> {
                AlertDialog(
                    onDismissRequest = { viewModel.kilitlemeVazgec() },
                    title = { Text("Kartı kilitle?") },
                    text = { Text("Bu işlem GERİ ALINAMAZ. Kilitlendikten sonra karta bir daha yazılamaz. Emin misiniz?") },
                    confirmButton = {
                        Button(onClick = { viewModel.kilitlemeyeBaslat() }) { Text("Evet, Kilitle") }
                    },
                    dismissButton = {
                        OutlinedButton(onClick = { viewModel.kilitlemeVazgec() }) { Text("İptal") }
                    },
                )
            }
            KartaYazDurumu.KILITLEME_BEKLENIYOR -> {
                Text("Kilitlemek için AYNI kartı tekrar telefona yaklaştırın.")
            }
            KartaYazDurumu.KILITLENIYOR -> {
                CircularProgressIndicator()
                Text("Kilitleniyor, kartı telefondan çekmeyin...")
            }
            KartaYazDurumu.KILITLENDI -> {
                Text("Kart kilitlendi. Artık salt-okunur.", color = MaterialTheme.colorScheme.primary)
            }
            KartaYazDurumu.KILITLEME_HATASI -> {
                Text(viewModel.hataMesaji ?: "Kilitleme başarısız.", color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.padding(16.dp))
                Row {
                    Button(onClick = { viewModel.kilitlemeyeBaslat() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Tekrar Dene")
                    }
                }
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
git add app/src/main/java/com/nfckartify/bayi/ui/KartaYazViewModel.kt app/src/main/java/com/nfckartify/bayi/ui/KartaYazEkrani.kt
git commit -m "Karta Yaz ekranı ve ViewModel'i ekle"
```

---

### Task 5: Çalışanlar ekranına "Karta Yaz" butonu + navigasyon

**Files:**
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/CalisanlarViewModel.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/CalisanlarEkrani.kt`
- Modify: `app/src/main/java/com/nfckartify/bayi/ui/NfcKartifyApp.kt`

- [ ] **Step 1: `CalisanlarViewModel.kt`'e `firmaSlug` ekle**

`CalisanlarViewModel`'e ekle (`firmaAdi` alanının yanına):

```kotlin
    var firmaSlug by mutableStateOf("")
        private set
```

`yukle` fonksiyonundaki `firmaAdi = govde.firma?.ad ?: ""` satırının altına ekle:

```kotlin
                    firmaSlug = govde.firma?.slug ?: ""
```

- [ ] **Step 2: `CalisanlarEkrani.kt`'e "Karta Yaz" butonunu ekle**

Fonksiyon imzasını güncelle:

```kotlin
@Composable
fun CalisanlarEkrani(
    viewModel: CalisanlarViewModel,
    firmaId: Int,
    kartaYazTiklandi: (adSoyad: String, url: String) -> Unit,
) {
```

`Card` içindeki `Column`'a, `Text("Durum: ...")` satırından sonra ekle:

```kotlin
                            Spacer(modifier = Modifier.padding(4.dp))
                            androidx.compose.material3.Button(
                                onClick = {
                                    val url = "https://www.nfckartify.com.tr/${viewModel.firmaSlug}/${calisan.slug}"
                                    kartaYazTiklandi("${calisan.ad} ${calisan.soyad}", url)
                                },
                            ) {
                                Text("Karta Yaz")
                            }
```

İçe aktarımlara `import androidx.compose.foundation.layout.Spacer` ekle (yoksa).

- [ ] **Step 3: `NfcKartifyApp.kt`'ye rota ekle**

İçe aktarımlara ekle:

```kotlin
import androidx.navigation.NavType
import androidx.navigation.navArgument
```

(Zaten `NavType`/`navArgument` importları mevcut — tekrar eklemeye gerek yok, sadece
`calisanlar/{firmaId}` composable bloğunu güncelle.)

`composable("calisanlar/{firmaId}", ...)` bloğunu şu şekilde güncelle:

```kotlin
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
```

- [ ] **Step 4: Derlemeyi doğrula**

Run: `./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/nfckartify/bayi/ui
git commit -m "Çalışanlar ekranına Karta Yaz butonu ve navigasyonu ekle"
```

---

### Task 6: Gerçek kartla uçtan uca test

**Files:** Yok (doğrulama adımı)

- [ ] **Step 1: Cihaza kur, gerçek bir kartla test et**

Run:
```bash
./gradlew.bat installDebug
```

Kullanıcıdan: Müşterilerim → bir müşteri → bir kart → "Karta Yaz" → boş NTAG kartı
telefona yaklaştırmasını iste. "Kart başarıyla yazıldı" mesajını gördükten sonra, farklı
bir telefonla (veya aynı telefonla NFC Tools gibi bir uygulamayla) kartı okutup gerçekten
doğru URL'in yazıldığını doğrula.

- [ ] **Step 2: Kilitleme akışını test et**

"Kilitle (opsiyonel)" → onay diyaloğunda "Evet, Kilitle" → kartı tekrar yaklaştır →
"Kart kilitlendi" mesajını doğrula. Ardından NFC Tools gibi bir uygulamayla kartı tekrar
yazmayı deneyip gerçekten salt-okunur olduğunu doğrula (bu adım kartı kalıcı olarak
kilitler, sadece gerçekten test amaçlı bir kartla yapılmalı — üretim/müşteri kartı değil).

- [ ] **Step 3: Logcat'te hata olmadığını doğrula**

Run: `"C:/Users/muham/AppData/Local/Android/Sdk/platform-tools/adb.exe" logcat -d --pid=$(adb shell pidof com.nfckartify.bayi) | grep -iE "exception|fatal"`
Expected: Beklenmeyen hata yok.

---

## Sonraki Adım

Faz 3 bitince Android bayi uygulamasının MVP'si tamamlanmış olur: Giriş, Müşteri
Listesi/Detay, Profil Oluşturma (foto/adres/biyografi/önizleme), NFC Yaz/Kilitle. Sonraki
adımlar (Play Store yayını, Faz 4 fikirleri vb.) ayrıca konuşulacak.
