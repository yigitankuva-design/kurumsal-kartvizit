const { MAX_FOTO_BOYUTU } = require('../middleware/upload');

describe('upload limiti', () => {
  test('MAX_FOTO_BOYUTU 15MB olarak tanımlı', () => {
    expect(MAX_FOTO_BOYUTU).toBe(15 * 1024 * 1024);
  });
});
