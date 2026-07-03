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

const MAX_PDF_BOYUTU = 20 * 1024 * 1024;

function pdfUploadMiddleware(klasor) {
  const multerUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PDF_BOYUTU },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true);
      else cb(new Error('Sadece PDF yüklenebilir.'));
    },
  });

  function single(alanAdi) {
    return [
      multerUpload.single(alanAdi),
      async (req, res, next) => {
        if (!req.file) return next();
        try {
          if (!process.env.RAILWAY_STORAGE_BUCKET) {
            req.file.location = null;
            return next();
          }
          const anahtar = `${klasor}/${Date.now()}.pdf`;
          const s3 = buildS3Client();
          const yukleme = new Upload({
            client: s3,
            params: {
              Bucket: process.env.RAILWAY_STORAGE_BUCKET,
              Key: anahtar,
              Body: req.file.buffer,
              ContentType: 'application/pdf',
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

module.exports = { uploadMiddleware, pdfUploadMiddleware, fotoIsle, MAX_FOTO_BOYUTU };
