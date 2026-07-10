const { indirimKoduUret } = require('../utils/indirimKod');

describe('indirimKoduUret', () => {
  test('6 haneli sayısal kod üretir', () => {
    const kod = indirimKoduUret();
    expect(kod).toHaveLength(6);
    expect(kod).toMatch(/^[0-9]{6}$/);
  });

  test('ardışık çağrılar farklı kod üretir', () => {
    const kodlar = new Set(Array.from({ length: 30 }, () => indirimKoduUret()));
    expect(kodlar.size).toBeGreaterThan(25);
  });
});
