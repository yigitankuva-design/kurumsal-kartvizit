require('dotenv').config();
const { bayiTokenUret, bayiTokenDogrula, calisanTokenUret, calisanTokenDogrula } = require('../utils/jwt');

describe('utils/jwt', () => {
  test('üretilen token doğrulanınca doğru bayiId döner', () => {
    const token = bayiTokenUret(42);
    const payload = bayiTokenDogrula(token);
    expect(payload.bayiId).toBe(42);
  });

  test('bozuk token doğrulanamaz', () => {
    expect(() => bayiTokenDogrula('gecersiz.token.deger')).toThrow();
  });
});

describe('utils/jwt — temsilci', () => {
  test('üretilen calisan token doğrulanınca doğru calisanId döner', () => {
    const token = calisanTokenUret(99);
    const payload = calisanTokenDogrula(token);
    expect(payload.calisanId).toBe(99);
  });

  test('bozuk calisan token doğrulanamaz', () => {
    expect(() => calisanTokenDogrula('gecersiz.token.deger')).toThrow();
  });
});

describe('utils/jwt — firma', () => {
  test('üretilen firma token doğrulanınca doğru firmaId döner', () => {
    const { firmaTokenUret, firmaTokenDogrula } = require('../utils/jwt');
    const token = firmaTokenUret(77);
    const payload = firmaTokenDogrula(token);
    expect(payload.firmaId).toBe(77);
  });

  test('bozuk firma token doğrulanamaz', () => {
    const { firmaTokenDogrula } = require('../utils/jwt');
    expect(() => firmaTokenDogrula('gecersiz.token.deger')).toThrow();
  });
});
