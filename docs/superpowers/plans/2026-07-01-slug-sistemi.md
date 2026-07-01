# Çalışan Slug Sistemi Değişikliği Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yeni oluşturulan çalışanlar için slug'ı rastgele `nanoid(8)` yerine ad-soyad temelli, Türkçe normalize edilmiş, çakışmada `-2/-3` sıralı numaralı ve 80 karakter sınırlı hale getirmek. Mevcut (zaten oluşturulmuş, muhtemelen NFC kartlara yazılmış) çalışan slug'ları değiştirilmez.

**Architecture:** `utils/slug.js`'teki Türkçe normalize mantığı ortak bir `normalizeSlug()` fonksiyonuna çıkarılır; hem firma hem çalışan slug üretimi bunu kullanır. Çakışma kontrolü gerektiren `benzersizCalisanSlugOlustur()` fonksiyonu DB'ye bağlı olarak `utils/slug.js` içine eklenir (mevcut projede `db/index.js`'teki `pool` zaten başka yardımcı modüllerce de import edilebilir bir singleton). `routes/panel.js` ve `routes/bayi.js`'teki var olan 5-denemelik rastgele retry döngüleri bu yeni fonksiyonla değiştirilir.

**Tech Stack:** Node.js, PostgreSQL (`pg`), Jest (gerçek DB'ye karşı entegrasyon testleri — mevcut `tests/auth.test.js` deseniyle aynı)

---

## Task 1: Ortak Normalize Fonksiyonu ve Ad-Soyad Tabanlı Slug Üretimi

**Files:**
- Modify: `utils/slug.js`
- Test: `tests/slug.test.js` (yeni dosya — mevcut `tests/utils.test.js`'teki slug testleri buraya taşınacak)

- [ ] **Step 1: Failing testleri yaz**

`tests/slug.test.js` oluştur:

```javascript
const { normalizeSlug, firmaSlugOlustur, calisanSlugTabanOlustur } = require('../utils/slug');

describe('normalizeSlug', () => {
  test('Türkçe karakterleri normalize eder', () => {
    expect(normalizeSlug('Pfizer Türkiye')).toBe('pfizer-turkiye');
  });

  test('özel karakterleri kaldırır', () => {
    expect(normalizeSlug('ABC & Co.')).toBe('abc-co');
  });

  test('80 karakteri aşan girdiyi keser', () => {
    const uzunMetin = 'kelime '.repeat(20).trim();
    const sonuc = normalizeSlug(uzunMetin);
    expect(sonuc.length).toBeLessThanOrEqual(80);
    expect(sonuc.endsWith('-')).toBe(false);
  });
});

describe('firmaSlugOlustur', () => {
  test('normalizeSlug ile aynı sonucu üretir', () => {
    expect(firmaSlugOlustur('Pfizer Türkiye')).toBe('pfizer-turkiye');
  });
});

describe('calisanSlugTabanOlustur', () => {
  test('ad-soyad formatında slug üretir', () => {
    expect(calisanSlugTabanOlustur('Ali', 'Yılmaz')).toBe('ali-yilmaz');
  });

  test('Türkçe karakterli ad-soyad normalize edilir', () => {
    expect(calisanSlugTabanOlustur('Ömer', 'Çağlar')).toBe('omer-caglar');
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx jest tests/slug.test.js`
Expected: FAIL (`normalizeSlug` ve `calisanSlugTabanOlustur` henüz export edilmiyor)

- [ ] **Step 3: utils/slug.js'i güncelle**

`utils/slug.js` dosyasının tamamını şu içerikle değiştir:

```javascript
const TURKCE_HARITA = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c' };

function normalizeSlug(metin) {
  const temiz = metin
    .toLowerCase()
    .replace(/[ğüşıöç]/g, (ch) => TURKCE_HARITA[ch])
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return temiz.slice(0, 80).replace(/-+$/, '');
}

function firmaSlugOlustur(ad) {
  return normalizeSlug(ad);
}

function calisanSlugTabanOlustur(ad, soyad) {
  return normalizeSlug(`${ad} ${soyad}`);
}

async function benzersizCalisanSlugOlustur(firmaId, ad, soyad) {
  const { pool } = require('../db');
  const taban = calisanSlugTabanOlustur(ad, soyad);
  let slug = taban;
  let sayac = 2;
  while (true) {
    const sonuc = await pool.query(
      'SELECT id FROM calisanlar WHERE firma_id = $1 AND slug = $2',
      [firmaId, slug]
    );
    if (!sonuc.rows.length) return slug;
    slug = `${taban}-${sayac}`.slice(0, 80).replace(/-+$/, '');
    sayac++;
  }
}

module.exports = { normalizeSlug, firmaSlugOlustur, calisanSlugTabanOlustur, benzersizCalisanSlugOlustur };
```

**Not:** `require('../db')` fonksiyon içine alındı (dosya tepesine değil) — döngüsel import riskini önlemek için (`db/index.js` şu an `utils/`'a bağımlı değil ama ileride olursa diye).

- [ ] **Step 4: Testi çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/slug.test.js`
Expected: PASS (6 test)

- [ ] **Step 5: Eski tests/utils.test.js'teki slug testlerini kaldır**

`tests/utils.test.js` dosyasını aç. `describe('slug utils', ...)` bloğunun tamamını (satır 1'deki `firmaSlugOlustur, calisanSlugOlustur` import'undan, bloğun kapanışına kadar) sil — bu testler artık `tests/slug.test.js`'te. Dosyanın en üstündeki import satırını:

```javascript
const { firmaSlugOlustur, calisanSlugOlustur } = require('../utils/slug');
```

şu şekilde değiştir (artık slug import'una gerek yok, satırı tamamen sil):

Kalan dosya sadece `vcf utils` describe bloğunu ve onun import'unu (`const { vcfOlustur } = require('../utils/vcf');`) içermeli.

- [ ] **Step 6: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS, `calisanSlugOlustur` artık hiçbir yerde tanımlı olmadığı için henüz onu çağıran route'lar hata verecektir — bu beklenen, Task 2'de düzeltilecek. (Eğer bu noktada `routes/panel.js` veya `routes/bayi.js` testleri FAIL oluyorsa bu normal, bir sonraki task'ta giderilecek.)

- [ ] **Step 7: Commit**

```bash
git add utils/slug.js tests/slug.test.js tests/utils.test.js
git commit -m "feat: ad-soyad tabanli calisan slug uretimi ve ortak normalize fonksiyonu"
```

---

## Task 2: Çakışma Numaralandırmasını Doğrulayan Entegrasyon Testi

**Files:**
- Test: `tests/slug.test.js` (genişletilir)

- [ ] **Step 1: Failing testleri ekle**

`tests/slug.test.js` dosyasının başına, diğer import'ların yanına ekle:

```javascript
require('dotenv').config();
const { pool } = require('../db');
const { benzersizCalisanSlugOlustur } = require('../utils/slug');
```

Dosyanın sonuna ekle:

```javascript
describe('benzersizCalisanSlugOlustur', () => {
  let firmaId;

  beforeAll(async () => {
    const sonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash)
       VALUES ('Test Firma Slug Kontrol', 'test-firma-slug-kontrol', 'test-slug-kontrol@test.com', 'x')
       RETURNING id`
    );
    firmaId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('çakışma yoksa taban slug döner', async () => {
    const slug = await benzersizCalisanSlugOlustur(firmaId, 'Ali', 'Yilmaz');
    expect(slug).toBe('ali-yilmaz');
  });

  test('çakışma varsa -2 eklenir', async () => {
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Ali', 'Yilmaz', 'ali-yilmaz')`,
      [firmaId]
    );
    const slug = await benzersizCalisanSlugOlustur(firmaId, 'Ali', 'Yilmaz');
    expect(slug).toBe('ali-yilmaz-2');
  });

  test('art arda iki çakışma varsa -3 eklenir', async () => {
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Ali', 'Yilmaz', 'ali-yilmaz-2')`,
      [firmaId]
    );
    const slug = await benzersizCalisanSlugOlustur(firmaId, 'Ali', 'Yilmaz');
    expect(slug).toBe('ali-yilmaz-3');
  });
});
```

**Not:** Bu test gerçek `DATABASE_URL`'e bağlanır (mevcut `tests/auth.test.js` ve `tests/public.test.js` ile aynı desen) ve kullandığı test firmasını `afterAll`'da siler (CASCADE ile ilişkili çalışanlar da silinir).

- [ ] **Step 2: Testleri çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/slug.test.js`
Expected: PASS (9 test toplam)

- [ ] **Step 3: Commit**

```bash
git add tests/slug.test.js
git commit -m "test: cakisma numaralandirmasi icin entegrasyon testleri"
```

---

## Task 3: routes/panel.js'i Yeni Slug Fonksiyonuna Geçir

**Files:**
- Modify: `routes/panel.js`

- [ ] **Step 1: Import satırını güncelle**

`routes/panel.js` dosyasının başındaki:

```javascript
const { calisanSlugOlustur } = require('../utils/slug');
```

satırını şu şekilde değiştir:

```javascript
const { benzersizCalisanSlugOlustur } = require('../utils/slug');
```

- [ ] **Step 2: `/ekle` POST route'unu güncelle**

Mevcut:

```javascript
let slug = calisanSlugOlustur();
for (let i = 0; i < 5; i++) {
  const check = await pool.query('SELECT id FROM calisanlar WHERE firma_id = $1 AND slug = $2', [req.session.firmaId, slug]);
  if (!check.rows.length) break;
  slug = calisanSlugOlustur();
}
```

satırlarını şu şekilde değiştir:

```javascript
const slug = await benzersizCalisanSlugOlustur(req.session.firmaId, ad, soyad);
```

- [ ] **Step 3: `/toplu-yukle` POST route'unu güncelle**

Mevcut:

```javascript
const slug = calisanSlugOlustur();
```

satırını (Excel toplu yükleme döngüsü içindeki) şu şekilde değiştir:

```javascript
const slug = await benzersizCalisanSlugOlustur(req.session.firmaId, c.ad, c.soyad);
```

- [ ] **Step 4: tests/auth.test.js ve tests/public.test.js'in hâlâ geçtiğini doğrula**

Run: `npx jest`
Expected: PASS

- [ ] **Step 5: Manuel test**

```bash
npm run dev
```

`/firma/panel/ekle`'den iki farklı çalışanı **aynı ad-soyadla** ekle (örn. "Test Kullanıcı" iki kez). İkinci eklenenin profil URL'sinin `.../test-kullanici-2` şeklinde bittiğini panelde doğrula.

- [ ] **Step 6: Commit**

```bash
git add routes/panel.js
git commit -m "feat: firma panelinde ad-soyad tabanli slug uretimine gec"
```

---

## Task 4: routes/bayi.js'i Yeni Slug Fonksiyonuna Geçir

**Files:**
- Modify: `routes/bayi.js`

- [ ] **Step 1: Import satırını güncelle**

Mevcut:

```javascript
const { firmaSlugOlustur, calisanSlugOlustur } = require('../utils/slug');
```

satırını şu şekilde değiştir:

```javascript
const { firmaSlugOlustur, benzersizCalisanSlugOlustur } = require('../utils/slug');
```

- [ ] **Step 2: `/panel/:firmaId/calisan-ekle` POST route'unu güncelle**

Mevcut:

```javascript
let slug = calisanSlugOlustur();
for (let i = 0; i < 5; i++) {
  const check = await pool.query(
    'SELECT id FROM calisanlar WHERE firma_id = $1 AND slug = $2',
    [req.params.firmaId, slug]
  );
  if (!check.rows.length) break;
  slug = calisanSlugOlustur();
}
```

satırlarını şu şekilde değiştir:

```javascript
const slug = await benzersizCalisanSlugOlustur(req.params.firmaId, ad, soyad);
```

- [ ] **Step 3: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [ ] **Step 4: Manuel test**

```bash
npm run dev
```

Bir bayi hesabıyla giriş yap, bir müşteri firma altında iki çalışanı aynı ad-soyadla ekle, ikincisinin slug'ının `-2` ile bittiğini doğrula.

- [ ] **Step 5: Commit**

```bash
git add routes/bayi.js
git commit -m "feat: bayi panelinde ad-soyad tabanli slug uretimine gec"
```

---

## Task 5: Kullanılmayan nanoid Bağımlılığını Kaldır

**Files:**
- Modify: `package.json`

- [ ] **Step 1: nanoid'in başka hiçbir yerde kullanılmadığını doğrula**

Run: `grep -rn "nanoid" --include="*.js" . --exclude-dir=node_modules`
Expected: Hiçbir sonuç dönmemeli (Task 1-4 sonrası `utils/slug.js`, `routes/panel.js`, `routes/bayi.js` içinde `nanoid` referansı kalmamış olmalı)

- [ ] **Step 2: Paketi kaldır**

```bash
npm uninstall nanoid
```

- [ ] **Step 3: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: kullanilmayan nanoid bagimliligini kaldir"
```
