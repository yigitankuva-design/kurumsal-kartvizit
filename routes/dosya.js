const express = require('express');
const router = express.Router();
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { buildS3Client } = require('../utils/s3');

router.get('/:klasor/:dosya', async (req, res) => {
  try {
    const s3 = buildS3Client();
    const anahtar = `${req.params.klasor}/${req.params.dosya}`;
    const sonuc = await s3.send(new GetObjectCommand({
      Bucket: process.env.RAILWAY_STORAGE_BUCKET,
      Key: anahtar,
    }));
    const bytes = await sonuc.Body.transformToByteArray();
    res.set('Content-Type', sonuc.ContentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(bytes));
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).send('Dosya bulunamadı.');
    }
    console.error(err);
    res.status(500).send('Dosya alınamadı.');
  }
});

module.exports = router;
