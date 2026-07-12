const { agirlikliIndeks } = require('../scripts/seedYardimcilar');

describe('agirlikliIndeks', () => {
  test('sıfır ağırlıklı öğe asla seçilmez, tek pozitif seçilir', () => {
    for (let i = 0; i < 100; i++) {
      expect(agirlikliIndeks([0, 5, 0])).toBe(1);
    }
  });
  test('yüksek ağırlıklı öğe çoğunlukla seçilir', () => {
    let sifir = 0;
    for (let i = 0; i < 1000; i++) if (agirlikliIndeks([90, 10]) === 0) sifir++;
    expect(sifir).toBeGreaterThan(750);
  });
});
