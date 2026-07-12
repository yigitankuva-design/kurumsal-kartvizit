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

const { trendliTarih } = require('../scripts/seedYardimcilar');

describe('trendliTarih', () => {
  test('son gunSayisi gün içinde bir tarih döndürür', () => {
    const simdi = Date.now();
    for (let i = 0; i < 200; i++) {
      const t = trendliTarih(150).getTime();
      expect(t).toBeLessThanOrEqual(simdi);
      expect(t).toBeGreaterThanOrEqual(simdi - 151 * 86400000);
    }
  });
  test('ortalama sona (bugüne) yakın — artan trend', () => {
    const simdi = Date.now();
    let toplamGun = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) toplamGun += (simdi - trendliTarih(150).getTime()) / 86400000;
    expect(toplamGun / N).toBeLessThan(70);
  });
});
