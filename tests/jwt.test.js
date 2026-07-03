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
