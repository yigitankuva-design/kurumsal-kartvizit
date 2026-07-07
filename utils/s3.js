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

module.exports = { buildS3Client };
