# Fotoğraf İşleme (sharp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Çalışan/firma fotoğraf yüklemelerini `sharp` ile işlemek — EXIF yönünü düzeltmek ve yüz odaklı 600×600 kareye kırpmak — böylece profil sayfasındaki avatar her zaman tutarlı boyutta ve doğru yönde görünür.

**Architecture:** `middleware/upload.js` artık multer'ı her zaman `memoryStorage()` ile çalıştırır (prod'da da), ardından ayrı bir middleware adımında buffer `sharp` ile işlenir ve işlenmiş JPEG buffer `@aws-sdk/lib-storage`'ın `Upload` sınıfıyla Object Storage'a yazılır (multer-s3'ün otomatik akışı yerine — artık ara işleme adımı olduğu için). `uploadMiddleware(klasor).single(alanAdi)` artık bir multer middleware'i + bir işleme middleware'i içeren bir dizi döner; bu, Express route tanımlarında (`router.post(path, fotoUpload.single('foto'), handler)`) hiçbir değişiklik gerektirmez çünkü Express middleware dizilerini otomatik açar.

**Not — Bağımlılık:** Bu plan, `middleware/upload.js`'i Güvenlik & Altyapı planından (`2026-07-01-guvenlik-altyapi.md`, `MAX_FOTO_BOYUTU` sabitini ekleyen) bağımsız olarak da çalışacak şekilde tasarlandı — bu plandaki Task 1 dosyanın tamamını yeniden yazdığı için hangi sırayla uygulanırsa uygulansın sonuç tutarlı olur.

**Tech Stack:** sharp, @aws-sdk/lib-storage, @aws-sdk/client-s3, multer, Jest

---

## Task 1: Bağımlılığı Ekle ve `fotoIsle` Fonksiyonunu Yaz

**Files:**
- Modify: `package.json`
- Modify: `middleware/upload.js`
- Modify: `tests/upload.test.js` (yoksa oluşturulur)

- [x] **Step 1: Paketleri yükle**

```bash
npm install sharp @aws-sdk/lib-storage
```

(`@aws-sdk/lib-storage` zaten `@aws-sdk/client-s3`'e bağımlı bir paket olarak `package.json`'da varsa `npm install` bunu no-op geçer; yoksa ekler.)

- [x] **Step 2: Failing test yaz**

`tests/upload.test.js` dosyasının **tam içeriğini** şu şekilde oluştur (dosya zaten varsa üzerine yaz, `MAX_FOTO_BOYUTU` testi de dahil edilmiş durumda):

```javascript
const sharp = require('sharp');
const { fotoIsle, MAX_FOTO_BOYUTU } = require('../middleware/upload');

describe('MAX_FOTO_BOYUTU', () => {
  test('15MB olarak tanımlı', () => {
    expect(MAX_FOTO_BOYUTU).toBe(15 * 1024 * 1024);
  });
});

describe('fotoIsle', () => {
  test('yatay görüntüyü 600x600 kareye kırpar', async () => {
    const testGorsel = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 50, b: 50 } },
    }).jpeg().toBuffer();

    const islenmis = await fotoIsle(testGorsel);
    const meta = await sharp(islenmis).metadata();

    expect(meta.width).toBe(600);
    expect(meta.height).toBe(600);
    expect(meta.format).toBe('jpeg');
  });

  test('dikey görüntüyü de 600x600 kareye kırpar', async () => {
    const testGorsel = await sharp({
      create: { width: 400, height: 900, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).jpeg().toBuffer();

    const islenmis = await fotoIsle(testGorsel);
    const meta = await sharp(islenmis).metadata();

    expect(meta.width).toBe(600);
    expect(meta.height).toBe(600);
  });

  test('PNG girdi bile JPEG çıktı üretir', async () => {
    const testGorsel = await sharp({
      create: { width: 500, height: 500, channels: 4, background: { r: 0, g: 100, b: 200, alpha: 1 } },
    }).png().toBuffer();

    const islenmis = await fotoIsle(testGorsel);
    const meta = await sharp(islenmis).metadata();

    expect(meta.format).toBe('jpeg');
  });
});
```

- [x] **Step 3: Testin başarısız olduğunu doğrula**

Run: `npx jest tests/upload.test.js`
Expected: FAIL (`fotoIsle` henüz export edilmiyor)

- [x] **Step 4: middleware/upload.js'i güncelle**

Dosyanın **tam içeriğini** şu şekilde değiştir:

```javascript
const multer = require('multer');
const sharp = require('sharp');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const MAX_FOTO_BOYUTU = 15 * 1024 * 1024;
const IZINLI_MIME = ['image/jpeg', 'image/png', 'image/webp'];

function mimeKontrol(req, file, cb) {
  if (IZINLI_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Sadece JPEG, PNG veya WebP yüklenebilir.'));
  }
}

function buildS3Client() {
  return new S3Client({
    endpoint: process.env.RAILWAY_STORAGE_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.RAILWAY_STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.RAILWAY_STORAGE_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

async function fotoIsle(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(600, 600, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 88 })
    .toBuffer();
}

function uploadMiddleware(klasor) {
  const multerUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FOTO_BOYUTU },
    fileFilter: mimeKontrol,
  });

  function single(alanAdi) {
    return [
      multerUpload.single(alanAdi),
      async (req, res, next) => {
        if (!req.file) return next();
        try {
          const islenmisBuffer = await fotoIsle(req.file.buffer);

          if (!process.env.RAILWAY_STORAGE_BUCKET) {
            // Object Storage env eksikse (development): dosyayı işlenmiş haliyle
            // memory'de tut ama URL üretme (mevcut dev-fallback davranışıyla tutarlı).
            req.file.buffer = islenmisBuffer;
            req.file.location = null;
            return next();
          }

          const anahtar = `${klasor}/${Date.now()}.jpg`;
          const s3 = buildS3Client();
          const yukleme = new Upload({
            client: s3,
            params: {
              Bucket: process.env.RAILWAY_STORAGE_BUCKET,
              Key: anahtar,
              Body: islenmisBuffer,
              ContentType: 'image/jpeg',
              ACL: 'public-read',
            },
          });
          await yukleme.done();

          req.file.location = `${process.env.RAILWAY_STORAGE_ENDPOINT}/${process.env.RAILWAY_STORAGE_BUCKET}/${anahtar}`;
          next();
        } catch (err) {
          next(err);
        }
      },
    ];
  }

  return { single };
}

module.exports = { uploadMiddleware, fotoIsle, MAX_FOTO_BOYUTU };
```

- [x] **Step 5: Testi çalıştır ve geçtiğini doğrula**

Run: `npx jest tests/upload.test.js`
Expected: PASS (4 test)

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json middleware/upload.js tests/upload.test.js
git commit -m "feat: sharp ile foto isleme (EXIF duzeltme + yuz odakli kirpma)"
```

---

## Task 2: Route Hata Yönetimini Doğrula

Yeni middleware zincirinde `sharp` veya S3 yükleme hatası `next(err)` ile Express'in varsayılan hata işleyicisine düşer — mevcut route'larda (`routes/panel.js`, `routes/bayi.js`) `fotoUpload.single('foto')` kullanan handler'larda özel bir hata middleware'i yok, bu da hatalı bir foto yüklemesinde kullanıcının çirkin bir stack-trace sayfası görmesine yol açar. Bu task her iki panelin foto yükleme route'larına tutarlı bir hata yakalama ekler.

**Files:**
- Modify: `routes/panel.js`
- Modify: `routes/bayi.js`

- [x] **Step 1: routes/panel.js'teki `/:id/duzenle` POST route'unu güncelle**

Mevcut:

```javascript
router.post('/:id/duzenle', fotoUpload.single('foto'), async (req, res) => {
```

satırını, hemen üstüne bir hata yakalama sarmalayıcı ekleyerek şu şekilde değiştir — dosyanın en üstüne (diğer route'lardan önce, `const fotoUpload = uploadMiddleware('calisanlar');` satırından hemen sonra) ekle:

```javascript
function fotoHatasiYakala(req, res, next) {
  return (err) => {
    if (err) {
      console.error(err);
      req.flash('error', err.message || 'Fotoğraf yüklenemedi.');
      return res.redirect(`/firma/panel/${req.params.id}/duzenle`);
    }
    next();
  };
}
```

`router.post('/:id/duzenle', fotoUpload.single('foto'), async (req, res) => {` satırını şu şekilde değiştir:

```javascript
router.post('/:id/duzenle', (req, res, next) => {
  const middlewares = fotoUpload.single('foto');
  middlewares[0](req, res, (err) => {
    if (err) return fotoHatasiYakala(req, res, next)(err);
    middlewares[1](req, res, fotoHatasiYakala(req, res, next));
  });
}, async (req, res) => {
```

- [x] **Step 2: routes/bayi.js'teki iki foto-upload route'unu aynı şekilde güncelle**

`routes/bayi.js` dosyasının başına (`const fotoUpload = uploadMiddleware('calisanlar');` satırından hemen sonra) ekle:

```javascript
function fotoHatasiYakala(redirectYolu) {
  return (req, res, next) => (err) => {
    if (err) {
      console.error(err);
      req.flash('error', err.message || 'Fotoğraf yüklenemedi.');
      return res.redirect(redirectYolu(req));
    }
    next();
  };
}

function fotoMiddlewareSarmalayici(redirectYolu) {
  return (req, res, next) => {
    const middlewares = fotoUpload.single('foto');
    middlewares[0](req, res, (err) => {
      if (err) return fotoHatasiYakala(redirectYolu)(req, res, next)(err);
      middlewares[1](req, res, fotoHatasiYakala(redirectYolu)(req, res, next));
    });
  };
}
```

`router.post('/panel/:firmaId/calisan-ekle', requireBayi, fotoUpload.single('foto'), async (req, res) => {` satırını şu şekilde değiştir:

```javascript
router.post('/panel/:firmaId/calisan-ekle', requireBayi,
  fotoMiddlewareSarmalayici((req) => `/bayi/panel/${req.params.firmaId}/calisan-ekle`),
  async (req, res) => {
```

`router.post('/panel/:firmaId/calisan/:id/duzenle', requireBayi, fotoUpload.single('foto'), async (req, res) => {` satırını şu şekilde değiştir:

```javascript
router.post('/panel/:firmaId/calisan/:id/duzenle', requireBayi,
  fotoMiddlewareSarmalayici((req) => `/bayi/panel/${req.params.firmaId}/calisan/${req.params.id}/duzenle`),
  async (req, res) => {
```

- [x] **Step 3: Tüm testleri çalıştır**

Run: `npx jest`
Expected: PASS

- [x] **Step 4: Manuel test — geçersiz dosya tipi**

```bash
npm run dev
```

`/firma/panel/:id/duzenle` sayfasından bir `.pdf` veya `.gif` dosyası "Fotoğraf" alanına yüklemeyi dene. Beklenen: sayfa çökmeden, flash hata mesajıyla (`Sadece JPEG, PNG veya WebP yüklenebilir.`) aynı forma geri dönmeli.

- [x] **Step 5: Manuel test — geçerli fotoğraf**

Aynı formdan gerçek bir `.jpg` fotoğraf yükle (yatay, dikdörtgen bir fotoğraf tercih et). Kaydettikten sonra panelde ve public profil sayfasında (`/:firmaSlug/:calisanSlug`) fotoğrafın kare (600×600 oranında) ve doğru yönde göründüğünü doğrula.

- [x] **Step 6: Commit**

```bash
git add routes/panel.js routes/bayi.js
git commit -m "fix: foto yukleme middleware zincirinde hata yakalama ekle"
```
