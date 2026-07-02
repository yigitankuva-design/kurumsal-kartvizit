require('dotenv').config();
const { bayiTokenUret, bayiTokenDogrula } = require('../utils/jwt');

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
