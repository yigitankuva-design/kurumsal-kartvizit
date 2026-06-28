const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');

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

function uploadMiddleware(klasor) {
  // Object Storage env eksikse memory storage'a düş (development)
  if (!process.env.RAILWAY_STORAGE_BUCKET) {
    return multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: mimeKontrol,
    });
  }

  const s3 = buildS3Client();
  return multer({
    storage: multerS3({
      s3,
      bucket: process.env.RAILWAY_STORAGE_BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      acl: 'public-read',
      key: (req, file, cb) => {
        const ext = file.originalname.split('.').pop();
        cb(null, `${klasor}/${Date.now()}.${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: mimeKontrol,
  });
}

function mimeKontrol(req, file, cb) {
  const izinli = ['image/jpeg', 'image/png', 'image/webp'];
  if (izinli.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Sadece JPEG, PNG veya WebP yüklenebilir.'));
  }
}

module.exports = { uploadMiddleware };
