const { eczaneKodUret } = require('../utils/eczaneKod');

describe('eczaneKodUret', () => {
  test('8 karakterlik, izinli alfabede kod üretir', () => {
    const kod = eczaneKodUret();
    expect(kod).toHaveLength(8);
    expect(kod).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
  });

  test('ardışık çağrılar farklı kod üretir', () => {
    const kodlar = new Set(Array.from({ length: 50 }, () => eczaneKodUret()));
    expect(kodlar.size).toBe(50);
  });
});
