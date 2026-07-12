# Orzax Demo/Test Veri Simülasyonu — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orzax firmasını baz alan, 1000 eczane + 59 kişilik hiyerarşi + gerçekçi aktivite içeren tek idempotent seed script üretmek (demo + ölçek testi).

**Architecture:** Saf yardımcı fonksiyonlar (`scripts/seedYardimcilar.js`) jest ile birim test edilir. Ana orkestrasyon script'i (`scripts/seed-orzax.js`) tek transaction içinde: onay → `firmalar` temizle (bayi/mali korunur) → Orzax + hiyerarşi + eczaneler + ürünler + aktivite + indirim → giriş bilgileri dosyası. Toplu (multi-row) INSERT.

**Tech Stack:** Node.js, `pg`, `bcrypt` (hepsi mevcut), jest (mevcut). Ek bağımlılık yok.

**Referans spec:** `docs/superpowers/specs/2026-07-12-orzax-demo-simulasyonu-design.md`

**Doğrulanmış kod gerçekleri:**
- Kurumsal özellikleri açan paket değeri: `'kurumsal'` (`middleware/authMiddleware.js:29`).
- Kod üretimi: `utils/eczaneKod.js` → `eczaneKodUret(8)`, alfabe `abcdefghjkmnpqrstuvwxyz23456789`.
- `raf_tiklamalar.tip` geçerli değerler: `katalog, website, instagram, linkedin, twitter, youtube, tiktok, whatsapp` (`routes/public.js:12`).
- `eczaci_tiklamalar.tip`: `'pdf'` (`routes/public.js:160`).
- Firma paneli girişi: `firmalar.yetkili_email` VEYA `kullanici_adi` + bcrypt(`yetkili_sifre_hash`) (`routes/auth.js:59-69`). `kullanici_adi` NOT NULL UNIQUE.
- Mümessil/yönetici app girişi: `calisanlar.giris_email` + bcrypt(`giris_sifre_hash`).

---

## Dosya yapısı

- **Create:** `scripts/seedYardimcilar.js` — saf yardımcılar + veri dizileri (isim/şehir/ürün). DB'ye dokunmaz (sadece `eczaneKodUret`'i import eder).
- **Create:** `tests/seedYardimcilar.test.js` — saf yardımcıların jest birim testleri (DB gerektirmez).
- **Create:** `scripts/seed-orzax.js` — ana orkestrasyon (DB, transaction, INSERT'ler, çıktı).
- **Modify:** `.gitignore` — `docs/orzax-demo-giris-bilgileri.md` satırı (demo şifreleri).

---

### Task 1: Yardımcı modül — veri dizileri + basit seçiciler

**Files:**
- Create: `scripts/seedYardimcilar.js`

- [ ] **Step 1: Modülü veri dizileri ve `rastgele` ile oluştur**

```js
// scripts/seedYardimcilar.js
const { eczaneKodUret } = require('../utils/eczaneKod');

const ADLAR = ['Ahmet','Mehmet','Mustafa','Ali','Hüseyin','Hasan','İbrahim','Ömer','Yusuf','Murat','Emre','Burak','Serkan','Fatih','Kemal','Volkan','Onur','Tolga','Cem','Barış','Ayşe','Fatma','Emine','Hatice','Zeynep','Elif','Meryem','Şerife','Sultan','Merve','Büşra','Esra','Gamze','Derya','Seda','Pınar','Ebru','Gül','Aslı','Deniz'];
const SOYADLAR = ['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir','Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özkan','Şimşek','Polat','Korkmaz','Çakır','Erdoğan','Yavuz','Güneş','Aksoy','Bulut','Keskin','Türk','Acar','Bozkurt','Taş','Ateş','Duman','Tekin','Uzun','Güler','Yalçın','Aktaş'];
const MAHALLELER = ['Merkez','Cumhuriyet','Atatürk','Yeni','Fatih','Bahçelievler','Yıldız','Gazi','İstiklal','Hürriyet','Barbaros','Kültür','Çamlık','Güzelyalı','Karşıyaka'];

const BOLGELER = [
  { ad:'Marmara', sehirler:[{ad:'İstanbul',lat:41.0082,lng:28.9784},{ad:'Bursa',lat:40.1826,lng:29.0665},{ad:'Kocaeli',lat:40.7654,lng:29.9408},{ad:'Tekirdağ',lat:40.9780,lng:27.5110},{ad:'Balıkesir',lat:39.6484,lng:27.8826}] },
  { ad:'Ege', sehirler:[{ad:'İzmir',lat:38.4237,lng:27.1428},{ad:'Aydın',lat:37.8560,lng:27.8416},{ad:'Manisa',lat:38.6191,lng:27.4289},{ad:'Muğla',lat:37.2153,lng:28.3636},{ad:'Denizli',lat:37.7765,lng:29.0864}] },
  { ad:'İç Anadolu', sehirler:[{ad:'Ankara',lat:39.9334,lng:32.8597},{ad:'Konya',lat:37.8746,lng:32.4932},{ad:'Kayseri',lat:38.7312,lng:35.4787},{ad:'Eskişehir',lat:39.7767,lng:30.5206},{ad:'Sivas',lat:39.7477,lng:37.0179}] },
  { ad:'Akdeniz', sehirler:[{ad:'Antalya',lat:36.8969,lng:30.7133},{ad:'Adana',lat:37.0000,lng:35.3213},{ad:'Mersin',lat:36.8121,lng:34.6415},{ad:'Hatay',lat:36.4018,lng:36.3498},{ad:'Isparta',lat:37.7648,lng:30.5566}] },
  { ad:'Karadeniz', sehirler:[{ad:'Samsun',lat:41.2867,lng:36.3300},{ad:'Trabzon',lat:41.0015,lng:39.7178},{ad:'Ordu',lat:40.9839,lng:37.8764},{ad:'Rize',lat:41.0201,lng:40.5234},{ad:'Zonguldak',lat:41.4564,lng:31.7987}] },
];

const URUNLER = ['Ocean A Vitamini','Ocean E Vitamini Kapsül','Ocean Daily One Energy Tablet','Ocean Gummies D3K2','Ocean Gummies Multivitamin Adult','Ocean Vitamin C 1000mg Tablet','Ocean Gummies Vitamin D3','Ocean Vitamin C-SR Tablet','Ocean B Complex Kapsül','Ocean Methyl B12 500 µg 5 ml Sprey','Ocean Methyl B12 1000 µg 5 ml Sprey','Ocean Methyl B12 1000 µg 10 ml Sprey','Ocean Microfer Kapsül','Ocean VM Arginin PS Likit','Ocean Microfer Likit','Ocean Methyl Folat Tablet','Ocean Biotin Kapsül','Efervit Sambucus Nigra Kara Mürver 20 Efervesan Tablet','Efervit Defence 20 Efervesan Tablet','Ocean VM Vitamin-Mineral Likit','Ocean Microfer Tablet','Efervit Vitamin C 1000 mg 20 Efervesan Tablet','Efervit Multivitamin Mineral 20 Efervesan Tablet','Ocean Multi Likit'];

const RAF_TIP = ['katalog','website','instagram','linkedin','twitter','youtube','tiktok','whatsapp'];

function rastgele(dizi) { return dizi[Math.floor(Math.random() * dizi.length)]; }

module.exports = { ADLAR, SOYADLAR, MAHALLELER, BOLGELER, URUNLER, RAF_TIP, rastgele };
```

- [ ] **Step 2: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seedYardimcilar.js && git commit -m "Orzax seed: yardimci modul veri dizileri"
```

---

### Task 2: `agirlikliIndeks` (ağırlıklı rastgele seçim)

**Files:**
- Modify: `scripts/seedYardimcilar.js`
- Test: `tests/seedYardimcilar.test.js`

- [ ] **Step 1: Testi yaz**

```js
// tests/seedYardimcilar.test.js
const { agirlikliIndeks } = require('../scripts/seedYardimcilar');

describe('agirlikliIndeks', () => {
  test('sıfır ağırlıklı öğe asla seçilmez, tek pozitif seçilir', () => {
    for (let i = 0; i < 100; i++) {
      expect(agirlikliIndeks([0, 5, 0])).toBe(1);
    }
  });

  test('yüksek ağırlıklı öğe çoğunlukla seçilir', () => {
    let sifir = 0;
    for (let i = 0; i < 1000; i++) if (agirlikliIndeks([90, 10]) === 0) sifir++;
    expect(sifir).toBeGreaterThan(750); // ~%90 beklenir
  });
});
```

- [ ] **Step 2: Testi çalıştır — kırmızı olduğunu gör**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t agirlikliIndeks`
Expected: FAIL — "agirlikliIndeks is not a function".

- [ ] **Step 3: Uygula**

`scripts/seedYardimcilar.js` içinde, `module.exports` satırından ÖNCE ekle:

```js
function agirlikliIndeks(agirliklar) {
  const toplam = agirliklar.reduce((a, b) => a + b, 0);
  let r = Math.random() * toplam;
  for (let i = 0; i < agirliklar.length; i++) {
    r -= agirliklar[i];
    if (r < 0) return i;
  }
  return agirliklar.length - 1;
}
```

Ve `module.exports`'a `agirlikliIndeks` ekle.

- [ ] **Step 4: Testi çalıştır — yeşil**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t agirlikliIndeks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seedYardimcilar.js tests/seedYardimcilar.test.js && git commit -m "Orzax seed: agirlikliIndeks + test"
```

---

### Task 3: `trendliTarih` (sona doğru artan tarih dağılımı)

**Files:**
- Modify: `scripts/seedYardimcilar.js`
- Test: `tests/seedYardimcilar.test.js`

- [ ] **Step 1: Testi yaz** (dosyanın sonuna ekle)

```js
const { trendliTarih } = require('../scripts/seedYardimcilar');

describe('trendliTarih', () => {
  test('son gunSayisi gün içinde bir tarih döndürür', () => {
    const simdi = Date.now();
    for (let i = 0; i < 200; i++) {
      const t = trendliTarih(150).getTime();
      expect(t).toBeLessThanOrEqual(simdi);
      expect(t).toBeGreaterThanOrEqual(simdi - 151 * 86400000);
    }
  });

  test('ortalama sona (bugüne) yakın — artan trend', () => {
    const simdi = Date.now();
    let toplamGun = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) toplamGun += (simdi - trendliTarih(150).getTime()) / 86400000;
    expect(toplamGun / N).toBeLessThan(70); // düz dağılımda ~75 olurdu
  });
});
```

- [ ] **Step 2: Testi çalıştır — kırmızı**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t trendliTarih`
Expected: FAIL — "trendliTarih is not a function".

- [ ] **Step 3: Uygula** (`module.exports`'tan önce ekle, exports'a da ekle)

```js
function trendliTarih(gunSayisi = 150) {
  // carpik: [0,1] sona (bugüne) ağırlıklı. msGeri her zaman >= 0 olduğu için sonuç
  // asla gelecekte olmaz; rastgele gün-içi saat de ms farkından doğal olarak gelir.
  const carpik = Math.sqrt(Math.random());
  const msGeri = Math.floor((1 - carpik) * gunSayisi * 86400000);
  return new Date(Date.now() - msGeri);
}
```

- [ ] **Step 4: Testi çalıştır — yeşil**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t trendliTarih`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seedYardimcilar.js tests/seedYardimcilar.test.js && git commit -m "Orzax seed: trendliTarih + test"
```

---

### Task 4: `benzersizKodlar` (bellekte N benzersiz kod)

**Files:**
- Modify: `scripts/seedYardimcilar.js`
- Test: `tests/seedYardimcilar.test.js`

Not: `utils/eczaneKod.js`'teki `benzersizEczaneKoduUret` her kod için DB sorgusu atar; 2000 kod için yavaş. Seed'de kodları bellekte bir `Set` ile üretiriz (aynı alfabe/uzunluk, DB'siz).

- [ ] **Step 1: Testi yaz** (sonuna ekle)

```js
const { benzersizKodlar } = require('../scripts/seedYardimcilar');

describe('benzersizKodlar', () => {
  test('istenen adette, hepsi benzersiz ve 8 karakter', () => {
    const kodlar = benzersizKodlar(500);
    expect(kodlar).toHaveLength(500);
    expect(new Set(kodlar).size).toBe(500);
    expect(kodlar.every(k => k.length === 8)).toBe(true);
  });

  test('mevcut set ile çakışmaz', () => {
    const mevcut = new Set(benzersizKodlar(100));
    const yeni = benzersizKodlar(100, mevcut);
    expect(yeni.some(k => mevcut.has(k))).toBe(false);
  });
});
```

- [ ] **Step 2: Testi çalıştır — kırmızı**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t benzersizKodlar`
Expected: FAIL — "benzersizKodlar is not a function".

- [ ] **Step 3: Uygula** (exports'a ekle)

```js
function benzersizKodlar(adet, mevcut = new Set()) {
  const set = new Set();
  while (set.size < adet) {
    const k = eczaneKodUret(8);
    if (!mevcut.has(k) && !set.has(k)) set.add(k);
  }
  return [...set];
}
```

- [ ] **Step 4: Testi çalıştır — yeşil**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t benzersizKodlar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seedYardimcilar.js tests/seedYardimcilar.test.js && git commit -m "Orzax seed: benzersizKodlar + test"
```

---

### Task 5: `hiyerarsiKur` (59 kişilik yapı, amiri zinciri)

**Files:**
- Modify: `scripts/seedYardimcilar.js`
- Test: `tests/seedYardimcilar.test.js`

- [ ] **Step 1: Testi yaz** (sonuna ekle)

```js
const { hiyerarsiKur } = require('../scripts/seedYardimcilar');

describe('hiyerarsiKur', () => {
  const k = hiyerarsiKur();

  test('toplam 59 kişi', () => { expect(k).toHaveLength(59); });

  test('1 genel müdür, amiri yok', () => {
    const gm = k.filter(p => p.unvan === 'Genel Müdür');
    expect(gm).toHaveLength(1);
    expect(gm[0].amiri).toBeNull();
  });

  test('3 fonksiyon müdürü, amiri genel müdür', () => {
    const gmIndex = k.findIndex(p => p.unvan === 'Genel Müdür');
    const mudurler = k.filter(p => ['Satış Müdürü','Ürün Müdürü','Ticaret Müdürü'].includes(p.unvan));
    expect(mudurler).toHaveLength(3);
    expect(mudurler.every(m => m.amiri === gmIndex)).toBe(true);
  });

  test('5 bölge müdürü (2+2+1 dağıtımı) ekip yöneticisi', () => {
    const bm = k.filter(p => p.unvan === 'Bölge Müdürü');
    expect(bm).toHaveLength(5);
    expect(bm.every(p => p.ekip_yoneticisi === true)).toBe(true);
    // amir dağılımı: iki müdürde 2'şer, birinde 1
    const sayim = {};
    bm.forEach(p => { sayim[p.amiri] = (sayim[p.amiri] || 0) + 1; });
    expect(Object.values(sayim).sort()).toEqual([1, 2, 2]);
  });

  test('50 mümessil, ekip yöneticisi değil, amiri bir bölge müdürü', () => {
    const mumessiller = k.filter(p => p.unvan === 'Tıbbi Mümessil');
    expect(mumessiller).toHaveLength(50);
    const bmIndexleri = k.map((p, i) => p.unvan === 'Bölge Müdürü' ? i : -1).filter(i => i >= 0);
    expect(mumessiller.every(m => m.ekip_yoneticisi === false && bmIndexleri.includes(m.amiri))).toBe(true);
  });

  test('her bölge müdürünün tam 10 mümessili', () => {
    const bmIndexleri = k.map((p, i) => p.unvan === 'Bölge Müdürü' ? i : -1).filter(i => i >= 0);
    bmIndexleri.forEach(bi => {
      const alt = k.filter(p => p.unvan === 'Tıbbi Mümessil' && p.amiri === bi);
      expect(alt).toHaveLength(10);
    });
  });
});
```

- [ ] **Step 2: Testi çalıştır — kırmızı**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t hiyerarsiKur`
Expected: FAIL — "hiyerarsiKur is not a function".

- [ ] **Step 3: Uygula** (exports'a ekle)

```js
function hiyerarsiKur() {
  const k = [];
  const kullanilan = new Set();
  const isim = () => {
    let a, s, key;
    do { a = rastgele(ADLAR); s = rastgele(SOYADLAR); key = a + s; } while (kullanilan.has(key));
    kullanilan.add(key);
    return { ad: a, soyad: s };
  };
  const ekle = (unvan, ekipYon, amiri, bolge) => {
    const n = isim();
    k.push({ ad: n.ad, soyad: n.soyad, unvan, ekip_yoneticisi: ekipYon, amiri, bolge });
    return k.length - 1;
  };

  const gm = ekle('Genel Müdür', true, null, null);
  const satis = ekle('Satış Müdürü', true, gm, null);
  const urun = ekle('Ürün Müdürü', true, gm, null);
  const ticaret = ekle('Ticaret Müdürü', true, gm, null);

  const bolgeMudurAmiri = [satis, satis, urun, urun, ticaret]; // 2+2+1
  const bolgeMudurleri = [];
  for (let b = 0; b < 5; b++) bolgeMudurleri.push(ekle('Bölge Müdürü', true, bolgeMudurAmiri[b], b));

  for (let b = 0; b < 5; b++) {
    for (let m = 0; m < 10; m++) ekle('Tıbbi Mümessil', false, bolgeMudurleri[b], b);
  }
  return k;
}
```

- [ ] **Step 4: Testi çalıştır — yeşil**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t hiyerarsiKur`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seedYardimcilar.js tests/seedYardimcilar.test.js && git commit -m "Orzax seed: hiyerarsiKur + test"
```

---

### Task 6: `eczaneleriUret` (1000 eczane, bölge dağıtımı + mümessil eşleme)

**Files:**
- Modify: `scripts/seedYardimcilar.js`
- Test: `tests/seedYardimcilar.test.js`

- [ ] **Step 1: Testi yaz** (sonuna ekle)

```js
const { eczaneleriUret } = require('../scripts/seedYardimcilar');

describe('eczaneleriUret', () => {
  const kisiler = hiyerarsiKur();
  const eczaneler = eczaneleriUret(kisiler, 1000);

  test('1000 eczane, her bölgede 200', () => {
    expect(eczaneler).toHaveLength(1000);
    for (let b = 0; b < 5; b++) {
      expect(eczaneler.filter(e => e.bolge === b)).toHaveLength(200);
    }
  });

  test('her eczane kendi bölgesindeki bir mümessile atanmış', () => {
    eczaneler.forEach(e => {
      const mumessil = kisiler[e.mumessilIndex];
      expect(mumessil.unvan).toBe('Tıbbi Mümessil');
      expect(mumessil.bolge).toBe(e.bolge);
    });
  });

  test('benzersiz kod ve eczaci_kod', () => {
    expect(new Set(eczaneler.map(e => e.kod)).size).toBe(1000);
    expect(new Set(eczaneler.map(e => e.eczaci_kod)).size).toBe(1000);
  });

  test('lat/lng dolu ve makul aralıkta (Türkiye)', () => {
    eczaneler.forEach(e => {
      expect(e.lat).toBeGreaterThan(35); expect(e.lat).toBeLessThan(43);
      expect(e.lng).toBeGreaterThan(25); expect(e.lng).toBeLessThan(45);
    });
  });
});
```

- [ ] **Step 2: Testi çalıştır — kırmızı**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t eczaneleriUret`
Expected: FAIL — "eczaneleriUret is not a function".

- [ ] **Step 3: Uygula** (exports'a ekle)

```js
function eczaneleriUret(kisiler, adet = 1000) {
  const kodlar = benzersizKodlar(adet);
  const eczaciKodlar = benzersizKodlar(adet, new Set(kodlar));
  // Her bölgedeki mümessil indekslerini topla
  const bolgeMumessilleri = [[], [], [], [], []];
  kisiler.forEach((p, i) => { if (p.unvan === 'Tıbbi Mümessil') bolgeMumessilleri[p.bolge].push(i); });

  const eczaneler = [];
  const bolgeBasi = adet / 5; // 200
  let idx = 0;
  for (let b = 0; b < 5; b++) {
    const sehirler = BOLGELER[b].sehirler;
    const mumessiller = bolgeMumessilleri[b];
    for (let j = 0; j < bolgeBasi; j++) {
      const sehir = rastgele(sehirler);
      const mahalle = rastgele(MAHALLELER);
      const soyad = rastgele(SOYADLAR);
      eczaneler.push({
        bolge: b,
        ad: `${mahalle} ${soyad} Eczanesi`,
        adres: `${mahalle} Mah., ${sehir.ad}`,
        kod: kodlar[idx],
        eczaci_kod: eczaciKodlar[idx],
        lat: sehir.lat + (Math.random() - 0.5) * 0.1,
        lng: sehir.lng + (Math.random() - 0.5) * 0.1,
        mumessilIndex: mumessiller[j % mumessiller.length],
      });
      idx++;
    }
  }
  return eczaneler;
}
```

- [ ] **Step 4: Testi çalıştır — yeşil**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js -t eczaneleriUret`
Expected: PASS.

- [ ] **Step 5: Tüm yardımcı testleri çalıştır**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js`
Expected: PASS (tüm describe blokları yeşil).

- [ ] **Step 6: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seedYardimcilar.js tests/seedYardimcilar.test.js && git commit -m "Orzax seed: eczaneleriUret + test"
```

---

### Task 7: Ana script — bağlan, onay, temizlik (transaction iskeleti)

**Files:**
- Create: `scripts/seed-orzax.js`
- Modify: `.gitignore`

- [ ] **Step 1: `.gitignore`'a giriş bilgileri dosyasını ekle**

`.gitignore` dosyasının sonuna ekle:

```
docs/orzax-demo-giris-bilgileri.md
```

- [ ] **Step 2: Ana script iskeletini yaz**

```js
// scripts/seed-orzax.js
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const H = require('./seedYardimcilar');

const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ORTAK_SIFRE = 'orzax2026';

async function uyariBekle() {
  console.log('\n⚠️  UYARI: Bu script TÜM firmalari (ve bagli tum veriyi) SILIP Orzax demo verisini yeniden olusturur.');
  console.log('   Bayi/superadmin girisleri ve mali kayitlar KORUNUR.');
  console.log('   Iptal icin 3 saniye icinde Ctrl+C.\n');
  await new Promise(r => setTimeout(r, 3000));
}

async function main() {
  await uyariBekle();
  const client = await pool.connect();
  try {
    // Orzax'i baglamak icin mevcut bir bayi bul
    const bayiSonuc = await client.query('SELECT id FROM bayiler WHERE aktif = true ORDER BY id LIMIT 1');
    if (!bayiSonuc.rows.length) throw new Error('Aktif bayi bulunamadi — yanlislikla bos DB. Iptal.');
    const bayiId = bayiSonuc.rows[0].id;

    await client.query('BEGIN');
    await client.query('DELETE FROM firmalar'); // CASCADE: calisanlar/eczaneler/ziyaretler/tiklamalar/urunler/indirim/...
    console.log('Eski firma verisi temizlendi.');

    // (Sonraki task'larda burasi doldurulacak)

    await client.query('COMMIT');
    console.log('\n✅ Seed tamamlandi.');
    console.log(`Bagli bayi id: ${bayiId}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('HATA — rollback yapildi:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
```

- [ ] **Step 3: Söz dizimi kontrolü (DB'ye çalıştırmadan)**

Run: `cd ~/kurumsal-kartvizit && node -c scripts/seed-orzax.js`
Expected: Hata yok (çıktı boş).

- [ ] **Step 4: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seed-orzax.js .gitignore && git commit -m "Orzax seed: ana script iskeleti (baglanti/onay/temizlik)"
```

---

### Task 8: Ana script — Orzax firma + rol kullanıcıları

**Files:**
- Modify: `scripts/seed-orzax.js`

- [ ] **Step 1: Firma + firma_kullanicilari ekleme kodunu yaz**

`scripts/seed-orzax.js` içinde, `// (Sonraki task'larda burasi doldurulacak)` yorumunu ŞUNUNLA değiştir:

```js
    const yetkiliHash = await bcrypt.hash(ORTAK_SIFRE, 8);
    const katalogGuncelleme = new Date(Date.now() - 3 * 86400000); // 3 gün önce
    const firmaSonuc = await client.query(
      `INSERT INTO firmalar
        (ad, slug, sektor, marka_rengi, yetkili_email, kullanici_adi, yetkili_sifre_hash, paket, bayi_id,
         website, instagram, linkedin, twitter, whatsapp,
         katalog_guncelleme_tarihi, eczaci_baslik, eczaci_metin,
         indirim_aktif, indirim_yuzdesi, tema_renk, tema_isik_seviyesi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'kurumsal',$8,
         'www.orzax.com','orzaxturkiye','https://www.linkedin.com/company/orzaksilac/','orzaxturkiye','05075847646',
         $9,'Eczacılara Özel Orzax İçeriği','Orzax ürün ailesi ve eczacı desteği hakkında bilgi.',
         true,5,'#c8a84b',50)
       RETURNING id`,
      ['Orzax', 'orzax', 'saglik', '#c8a84b', 'panel@orzax.com', 'orzax', yetkiliHash, bayiId, katalogGuncelleme]
    );
    const firmaId = firmaSonuc.rows[0].id;

    // Rol kullanicilari (rol ayrimi demosu)
    const roller = [
      { ad: 'Tam Yetkili', email: 'tam@orzax.com', rol: 'tam_yetkili' },
      { ad: 'Saha Yöneticisi', email: 'saha@orzax.com', rol: 'sadece_saha' },
      { ad: 'Çalışan Sorumlusu', email: 'calisan@orzax.com', rol: 'sadece_calisan' },
    ];
    for (const r of roller) {
      await client.query(
        `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1,$2,$3,$4,$5)`,
        [firmaId, r.ad, r.email, yetkiliHash, r.rol]
      );
    }
    console.log('Orzax firma + 3 rol kullanicisi olusturuldu.');
```

- [ ] **Step 2: Söz dizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -c scripts/seed-orzax.js`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seed-orzax.js && git commit -m "Orzax seed: firma + rol kullanicilari"
```

---

### Task 9: Ana script — hiyerarşi (59 çalışan) toplu ekleme + amiri bağlama

**Files:**
- Modify: `scripts/seed-orzax.js`

Not: `amiri_id` kendi tablosuna referans olduğu için iki geçiş: önce herkes eklenir (id'ler alınır), sonra `amiri_id` UPDATE ile bağlanır. `slug` benzersiz (firma içinde), `giris_email` benzersiz (global) olmalı.

- [ ] **Step 1: Kodu yaz** (Task 8'de eklenen `console.log('Orzax firma...')` satırından SONRA ekle)

```js
    const kisiler = H.hiyerarsiKur();
    const girisHash = await bcrypt.hash(ORTAK_SIFRE, 8);
    const kisiIdler = []; // gecici index -> gercek calisan id

    for (let i = 0; i < kisiler.length; i++) {
      const p = kisiler[i];
      const slug = `orzax-${i + 1}-${p.ad}-${p.soyad}`.toLowerCase()
        .replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u')
        .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
      const girisEmail = `${slug}@orzax.com`;
      const kartaYazildi = p.unvan === 'Tıbbi Mümessil' ? Math.random() < 0.7 : false;
      const r = await client.query(
        `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, slug, giris_email, giris_sifre_hash, ekip_yoneticisi, karta_yazildi, onayli)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id`,
        [firmaId, p.ad, p.soyad, p.unvan, slug, girisEmail, girisHash, p.ekip_yoneticisi, kartaYazildi]
      );
      kisiIdler.push(r.rows[0].id);
    }
    // amiri_id bagla
    for (let i = 0; i < kisiler.length; i++) {
      if (kisiler[i].amiri !== null) {
        await client.query('UPDATE calisanlar SET amiri_id=$1 WHERE id=$2', [kisiIdler[kisiler[i].amiri], kisiIdler[i]]);
      }
    }
    console.log(`${kisiler.length} calisan (hiyerarsi) olusturuldu.`);
```

- [ ] **Step 2: Söz dizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -c scripts/seed-orzax.js`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seed-orzax.js && git commit -m "Orzax seed: hiyerarsi 59 calisan + amiri baglama"
```

---

### Task 10: Ana script — 1000 eczane + kart durumları (toplu INSERT)

**Files:**
- Modify: `scripts/seed-orzax.js`

Not: Toplu INSERT için çok-satırlı `VALUES` üreten bir yardımcı gerekir. Bunu ana script içinde küçük bir `topluEkle(client, sql, satirlar, sutunSayisi)` fonksiyonuyla yaparız (chunk 500).

- [ ] **Step 1: `topluEkle` yardımcısını `main()`'in ÜSTÜNE ekle**

```js
// Chunk'lar halinde cok-satirli INSERT. satirlar: dizi-of-dizi (her satir sutun degerleri).
async function topluEkle(client, tabloVeSutunlar, satirlar, sutunSayisi, donenId = false) {
  const CHUNK = 500;
  const idler = [];
  for (let i = 0; i < satirlar.length; i += CHUNK) {
    const dilim = satirlar.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    dilim.forEach((satir, j) => {
      const yer = [];
      satir.forEach((deger, k) => { params.push(deger); yer.push(`$${j * sutunSayisi + k + 1}`); });
      values.push(`(${yer.join(',')})`);
    });
    const ek = donenId ? ' RETURNING id' : '';
    const r = await client.query(`INSERT INTO ${tabloVeSutunlar} VALUES ${values.join(',')}${ek}`, params);
    if (donenId) r.rows.forEach(row => idler.push(row.id));
  }
  return idler;
}
```

- [ ] **Step 2: Eczane ekleme kodunu yaz** (Task 9'daki `console.log('...calisan...')`'dan SONRA)

```js
    const eczaneler = H.eczaneleriUret(kisiler, 1000);
    const eczaneSatirlari = eczaneler.map(e => {
      const musteriYazildi = Math.random() < 0.8;
      const musteriKilitli = musteriYazildi && Math.random() < 0.3;
      const eczaciYazildi = Math.random() < 0.7;
      const eczaciKilitli = eczaciYazildi && Math.random() < 0.25;
      const durum = Math.random() < 0.05 ? 'pasif' : 'aktif';
      return [
        firmaId, e.ad, e.adres, e.kod, e.eczaci_kod,
        musteriYazildi, musteriKilitli, musteriYazildi ? H.trendliTarih() : null,
        eczaciYazildi, eczaciKilitli, eczaciYazildi ? H.trendliTarih() : null,
        durum,
      ];
    });
    const eczaneIdler = await topluEkle(
      client,
      `eczaneler (firma_id, ad, adres, kod, eczaci_kod, musteri_karta_yazildi, musteri_kart_kilitli, musteri_kart_yazma_tarihi, eczaci_karta_yazildi, eczaci_kart_kilitli, eczaci_kart_yazma_tarihi, durum)`,
      eczaneSatirlari, 12, true
    );
    // gecici index -> gercek eczane id
    eczaneler.forEach((e, i) => { e.id = eczaneIdler[i]; });
    console.log(`${eczaneler.length} eczane olusturuldu.`);
```

- [ ] **Step 3: Söz dizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -c scripts/seed-orzax.js`
Expected: Hata yok.

- [ ] **Step 4: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seed-orzax.js && git commit -m "Orzax seed: 1000 eczane + kart durumlari + topluEkle yardimcisi"
```

---

### Task 11: Ana script — 24 ürün

**Files:**
- Modify: `scripts/seed-orzax.js`

- [ ] **Step 1: Ürün ekleme kodunu yaz** (Task 10'daki `console.log('...eczane...')`'dan SONRA)

```js
    const urunSatirlari = H.URUNLER.map((ad, i) => [firmaId, ad, `${ad} — Orzax ürün ailesi.`, i, true]);
    const urunIdler = await topluEkle(
      client, `urunler (firma_id, ad, aciklama, sira, aktif)`, urunSatirlari, 5, true
    );
    console.log(`${urunIdler.length} urun olusturuldu.`);
```

- [ ] **Step 2: Söz dizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -c scripts/seed-orzax.js`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seed-orzax.js && git commit -m "Orzax seed: 24 urun"
```

---

### Task 12: Ana script — aktivite (okutma / tıklama / ziyaret / ürün tıklama)

**Files:**
- Modify: `scripts/seed-orzax.js`

Mantık: her eczane için ağırlıklı hacim (bazı eczaneler popüler). Ürün tıklamalarında ilk 3 ürün açık ara ağırlıklı. Ziyaretler mümessil↔eczane eşlemesine göre; mümessillerin ~%15'i "geride" (son ziyaret 60-120 gün önce), ~%10'u "yıldız" (yüksek hacim). Tüm `created_at` = `trendliTarih()`.

- [ ] **Step 1: Aktivite kodunu yaz** (Task 11'deki `console.log('...urun...')`'dan SONRA)

```js
    const crypto = require('crypto');
    const ipHash = () => crypto.createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 32);

    // Eczane popülerlik ağırlığı (1..5)
    const eczanePop = eczaneler.map(() => 1 + Math.floor(Math.random() * 5));

    // raf_okutmalar (~8000) — ip_hash'li
    const rafOkutma = [];
    eczaneler.forEach((e, i) => {
      const adet = eczanePop[i] * (1 + Math.floor(Math.random() * 3)); // ~ort 8
      for (let n = 0; n < adet; n++) rafOkutma.push([e.id, H.trendliTarih(), ipHash()]);
    });
    await topluEkle(client, `raf_okutmalar (eczane_id, created_at, ip_hash)`, rafOkutma, 3);

    // raf_tiklamalar (~5000)
    const rafTikla = [];
    eczaneler.forEach((e, i) => {
      const adet = Math.floor(eczanePop[i] * (0.5 + Math.random() * 1.5));
      for (let n = 0; n < adet; n++) rafTikla.push([e.id, H.rastgele(H.RAF_TIP), H.trendliTarih()]);
    });
    await topluEkle(client, `raf_tiklamalar (eczane_id, tip, created_at)`, rafTikla, 3);

    // eczaci_okutmalar (~4000) — sadece eczaci karti yazili eczanelere
    const eczaciOkutma = [];
    eczaneler.forEach((e, i) => {
      const adet = 2 + Math.floor(Math.random() * eczanePop[i]);
      for (let n = 0; n < adet; n++) eczaciOkutma.push([e.id, H.trendliTarih()]);
    });
    await topluEkle(client, `eczaci_okutmalar (eczane_id, created_at)`, eczaciOkutma, 2);

    // eczaci_tiklamalar (~2500) — tip 'pdf'
    const eczaciTikla = [];
    eczaneler.forEach((e, i) => {
      const adet = 1 + Math.floor(Math.random() * eczanePop[i]);
      for (let n = 0; n < adet; n++) eczaciTikla.push([e.id, 'pdf', H.trendliTarih()]);
    });
    await topluEkle(client, `eczaci_tiklamalar (eczane_id, tip, created_at)`, eczaciTikla, 3);

    // urun_tiklamalar (~6000) — ilk 3 urun agirlikli
    const urunAgirlik = urunIdler.map((_, i) => (i < 3 ? 10 : 1));
    const urunTikla = [];
    eczaneler.forEach((e, i) => {
      const adet = Math.floor(eczanePop[i] * (0.8 + Math.random() * 1.5));
      for (let n = 0; n < adet; n++) {
        const ui = H.agirlikliIndeks(urunAgirlik);
        urunTikla.push([urunIdler[ui], e.id, H.trendliTarih()]);
      }
    });
    await topluEkle(client, `urun_tiklamalar (urun_id, eczane_id, created_at)`, urunTikla, 3);

    // ziyaretler — mümessil bazlı; performans farkı
    const NOTLAR = ['Stok kontrolü yapıldı.', 'Yeni ürün tanıtıldı.', 'Eczacı ilgili, tekrar ziyaret planlandı.', 'Kampanya bilgisi verildi.', 'Raf düzenlemesi önerildi.', 'Sipariş alındı.', null, null];
    // mümessil index -> eczane id listesi
    const mumessilEczane = {};
    eczaneler.forEach(e => { (mumessilEczane[e.mumessilIndex] ??= []).push(e); });
    const mumessilIndexleri = kisiler.map((p, i) => (p.unvan === 'Tıbbi Mümessil' ? i : -1)).filter(i => i >= 0);
    const ziyaretler = [];
    mumessilIndexleri.forEach((mi, sira) => {
      const kendiEczaneleri = mumessilEczane[mi] || [];
      const geride = sira % 7 === 0;   // ~%15 geride
      const yildiz = sira % 10 === 0;  // ~%10 yildiz
      kendiEczaneleri.forEach(e => {
        const ziyaretSayisi = yildiz ? 4 + Math.floor(Math.random() * 4) : geride ? Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3);
        for (let n = 0; n < ziyaretSayisi; n++) {
          let tarih;
          if (geride) { const g = 60 + Math.floor(Math.random() * 60); tarih = new Date(Date.now() - g * 86400000); }
          else tarih = H.trendliTarih();
          ziyaretler.push([kisiIdler[mi], e.id, H.rastgele(NOTLAR), e.lat, e.lng, tarih]);
        }
      });
    });
    await topluEkle(client, `ziyaretler (calisan_id, eczane_id, temsilci_notu, lat, lng, created_at)`, ziyaretler, 6);

    console.log(`Aktivite: ${rafOkutma.length} raf okutma, ${rafTikla.length} raf tik, ${eczaciOkutma.length} eczaci okutma, ${eczaciTikla.length} eczaci tik, ${urunTikla.length} urun tik, ${ziyaretler.length} ziyaret.`);
```

- [ ] **Step 2: Söz dizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -c scripts/seed-orzax.js`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seed-orzax.js && git commit -m "Orzax seed: aktivite (okutma/tiklama/ziyaret/urun) trend+performans"
```

---

### Task 13: Ana script — 600 eczanede %5 indirim + katalog "görüldü" durumu

**Files:**
- Modify: `scripts/seed-orzax.js`

- [ ] **Step 1: İndirim + katalog görülme kodunu yaz** (Task 12'deki aktivite `console.log`'undan SONRA)

```js
    // 600 eczanede %5 indirim kodu
    const karisik = [...eczaneler].sort(() => Math.random() - 0.5).slice(0, 600);
    const indirimKodlar = H.benzersizKodlar(600);
    const indirimSatirlari = karisik.map((e, i) => {
      const kullanildi = Math.random() < 0.4;
      return [
        firmaId, e.id, indirimKodlar[i], 5,
        crypto.createHash('sha256').update('cerez' + Math.random()).digest('hex').slice(0, 24),
        kullanildi, kullanildi ? H.trendliTarih() : null,
      ];
    });
    await topluEkle(client, `indirim_kodlari (firma_id, eczane_id, kod, yuzde, cerez_id, kullanildi, kullanilma_tarihi)`, indirimSatirlari, 7);
    console.log(`600 eczanede %5 indirim kodu olusturuldu.`);

    // Katalog bildirimi: mümessillerin ~yarısı yeni katalogu görmüş
    for (let i = 0; i < kisiler.length; i++) {
      if (kisiler[i].unvan === 'Tıbbi Mümessil' && Math.random() < 0.5) {
        await client.query('UPDATE calisanlar SET son_gorulen_katalog_tarihi=$1 WHERE id=$2',
          [new Date(Date.now() - 1 * 86400000), kisiIdler[i]]); // katalog güncellemesinden (3 gün önce) sonra
      }
    }
    console.log('Katalog gorulme durumlari ayarlandi.');
```

- [ ] **Step 2: Söz dizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -c scripts/seed-orzax.js`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seed-orzax.js && git commit -m "Orzax seed: 600 indirim + katalog gorulme"
```

---

### Task 14: Ana script — giriş bilgileri dosyası + sayım çıktısı

**Files:**
- Modify: `scripts/seed-orzax.js`

- [ ] **Step 1: Çıktı üretimini yaz** (Task 13'teki `console.log('Katalog...')`'dan SONRA, `await client.query('COMMIT')`'ten ÖNCE)

```js
    // Giriş bilgileri özeti
    const yoneticiler = kisiler.map((p, i) => ({ ...p, id: kisiIdler[i], index: i }))
      .filter(p => p.ekip_yoneticisi);
    const ornekMumessiller = kisiler.map((p, i) => ({ ...p, index: i }))
      .filter(p => p.unvan === 'Tıbbi Mümessil').slice(0, 3);
    const emailUret = (p, i) => `orzax-${i + 1}-${p.ad}-${p.soyad}`.toLowerCase()
      .replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') + '@orzax.com';

    let md = `# Orzax Demo — Giriş Bilgileri\n\nOrtak şifre: \`${ORTAK_SIFRE}\`\n\n`;
    md += `## Firma Paneli\n- Kullanıcı adı: \`orzax\` (veya \`panel@orzax.com\`)\n- Şifre: \`${ORTAK_SIFRE}\`\n\n`;
    md += `## Rol Kullanıcıları (firma paneli)\n- \`tam@orzax.com\` — tam yetkili\n- \`saha@orzax.com\` — sadece saha\n- \`calisan@orzax.com\` — sadece çalışan\n\n`;
    md += `## Yöneticiler (mobil uygulama — giriş e-postası)\n`;
    yoneticiler.forEach(p => { md += `- ${p.unvan}: \`${emailUret(p, p.index)}\`\n`; });
    md += `\n## Örnek Mümessiller\n`;
    ornekMumessiller.forEach(p => { md += `- ${p.ad} ${p.soyad}: \`${emailUret(p, p.index)}\`\n`; });
    md += `\n## Örnek Raf/Eczacı Kartı URL'leri\n`;
    eczaneler.slice(0, 3).forEach(e => {
      md += `- ${e.ad}: raf → \`/raf/${e.kod}\` , eczacı → \`/eczaci/${e.eczaci_kod}\`\n`;
    });

    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'orzax-demo-giris-bilgileri.md'), md, 'utf8');
    console.log('Giris bilgileri: docs/orzax-demo-giris-bilgileri.md');
```

- [ ] **Step 2: Söz dizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -c scripts/seed-orzax.js`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
cd ~/kurumsal-kartvizit && git add scripts/seed-orzax.js && git commit -m "Orzax seed: giris bilgileri dosyasi + ozet cikti"
```

---

### Task 15: Çalıştır + doğrula (canlı DB + panel/mobil smoke)

**Files:** (yok — çalıştırma ve doğrulama)

- [ ] **Step 1: Tüm birim testleri çalıştır**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/seedYardimcilar.test.js`
Expected: PASS.

- [ ] **Step 2: Seed script'ini çalıştır**

Run: `cd ~/kurumsal-kartvizit && node scripts/seed-orzax.js`
Expected: 3 sn uyarı → "Eski firma verisi temizlendi" → firma/hiyerarşi/eczane/ürün/aktivite/indirim log'ları → "✅ Seed tamamlandi". Hata/rollback YOK.

- [ ] **Step 3: Sayımları doğrula**

Run:
```bash
cd ~/kurumsal-kartvizit && node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{ for(const t of ['firmalar','calisanlar','eczaneler','urunler','ziyaretler','raf_okutmalar','indirim_kodlari']){ const r=await p.query('SELECT COUNT(*) FROM '+t); console.log(t, r.rows[0].count);} await p.end(); })()"
```
Expected: `firmalar 1`, `calisanlar 59`, `eczaneler 1000`, `urunler 24`, `ziyaretler >0`, `raf_okutmalar >0`, `indirim_kodlari 600`.

- [ ] **Step 4: Panel smoke (tarayıcı)**

`docs/orzax-demo-giris-bilgileri.md`'deki firma bilgisiyle panele giriş → 1000 eczane listesi, hiyerarşi/çalışanlar, genel bakış grafikleri (son 5 ayda artan trend), saha istatistikleri görünüyor. En az bir "60+ gün ziyaret edilmedi" uyarısı görünüyor.

- [ ] **Step 5: Mobil smoke (cihaz)**

Bir bölge müdürünün `giris_email` + `orzax2026` ile mobil uygulamada giriş → ekip özeti (alt ekip ziyaretleri) görünüyor. Bir mümessil ile giriş → kendi eczaneleri + ziyaret geçmişi.

- [ ] **Step 6: Sonucu bildir**

Doğrulama sonuçlarını (sayımlar + panel/mobil gözlemi) özetle. Sorun varsa ilgili task'a dönüp düzelt.

---

## Notlar

- **İdempotentlik:** Script her çalıştığında `firmalar` silinip yeniden kurulur; demo'yu sıfırlamak için tekrar çalıştırılır.
- **Güvenlik:** `bayiler`, `session`, `odemeler`, `kredi_hareketleri` korunur (silinmez). Aktif bayi yoksa script durur.
- **Bağımlılık:** Yeni npm paketi yok; `pg`, `bcrypt`, `crypto`, `fs` (hepsi mevcut/yerleşik).
