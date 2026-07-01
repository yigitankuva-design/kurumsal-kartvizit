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
