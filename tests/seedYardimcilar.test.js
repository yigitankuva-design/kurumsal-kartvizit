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

const { benzersizKodlar } = require('../scripts/seedYardimcilar');

describe('benzersizKodlar', () => {
  test('istenen adette, hepsi benzersiz ve 8 karakter', () => {
    const kodlar = benzersizKodlar(500);
    expect(kodlar).toHaveLength(500);
    expect(new Set(kodlar).size).toBe(500);
    expect(kodlar.every(k => k.length === 8)).toBe(true);
  });
  test('mevcut set ile çakışmaz', () => {
    const mevcut = new Set(benzersizKodlar(100));
    const yeni = benzersizKodlar(100, mevcut);
    expect(yeni.some(k => mevcut.has(k))).toBe(false);
  });
});

const { hiyerarsiKur } = require('../scripts/seedYardimcilar');

describe('hiyerarsiKur', () => {
  const k = hiyerarsiKur();
  test('toplam 59 kişi', () => { expect(k).toHaveLength(59); });
  test('1 genel müdür, amiri yok', () => {
    const gm = k.filter(p => p.unvan === 'Genel Müdür');
    expect(gm).toHaveLength(1);
    expect(gm[0].amiri).toBeNull();
  });
  test('3 fonksiyon müdürü, amiri genel müdür', () => {
    const gmIndex = k.findIndex(p => p.unvan === 'Genel Müdür');
    const mudurler = k.filter(p => ['Satış Müdürü','Ürün Müdürü','Ticaret Müdürü'].includes(p.unvan));
    expect(mudurler).toHaveLength(3);
    expect(mudurler.every(m => m.amiri === gmIndex)).toBe(true);
  });
  test('5 bölge müdürü (2+2+1 dağıtımı) ekip yöneticisi', () => {
    const bm = k.filter(p => p.unvan === 'Bölge Müdürü');
    expect(bm).toHaveLength(5);
    expect(bm.every(p => p.ekip_yoneticisi === true)).toBe(true);
    const sayim = {};
    bm.forEach(p => { sayim[p.amiri] = (sayim[p.amiri] || 0) + 1; });
    expect(Object.values(sayim).sort()).toEqual([1, 2, 2]);
  });
  test('50 mümessil, ekip yöneticisi değil, amiri bir bölge müdürü', () => {
    const mumessiller = k.filter(p => p.unvan === 'Tıbbi Mümessil');
    expect(mumessiller).toHaveLength(50);
    const bmIndexleri = k.map((p, i) => p.unvan === 'Bölge Müdürü' ? i : -1).filter(i => i >= 0);
    expect(mumessiller.every(m => m.ekip_yoneticisi === false && bmIndexleri.includes(m.amiri))).toBe(true);
  });
  test('her bölge müdürünün tam 10 mümessili', () => {
    const bmIndexleri = k.map((p, i) => p.unvan === 'Bölge Müdürü' ? i : -1).filter(i => i >= 0);
    bmIndexleri.forEach(bi => {
      const alt = k.filter(p => p.unvan === 'Tıbbi Mümessil' && p.amiri === bi);
      expect(alt).toHaveLength(10);
    });
  });
});

const { eczaneleriUret } = require('../scripts/seedYardimcilar');

describe('eczaneleriUret', () => {
  const kisiler = hiyerarsiKur();
  const eczaneler = eczaneleriUret(kisiler, 1000);
  test('1000 eczane, her bölgede 200', () => {
    expect(eczaneler).toHaveLength(1000);
    for (let b = 0; b < 5; b++) expect(eczaneler.filter(e => e.bolge === b)).toHaveLength(200);
  });
  test('her eczane kendi bölgesindeki bir mümessile atanmış', () => {
    eczaneler.forEach(e => {
      const mumessil = kisiler[e.mumessilIndex];
      expect(mumessil.unvan).toBe('Tıbbi Mümessil');
      expect(mumessil.bolge).toBe(e.bolge);
    });
  });
  test('benzersiz kod ve eczaci_kod', () => {
    expect(new Set(eczaneler.map(e => e.kod)).size).toBe(1000);
    expect(new Set(eczaneler.map(e => e.eczaci_kod)).size).toBe(1000);
  });
  test('lat/lng dolu ve makul aralıkta (Türkiye)', () => {
    eczaneler.forEach(e => {
      expect(e.lat).toBeGreaterThan(35); expect(e.lat).toBeLessThan(43);
      expect(e.lng).toBeGreaterThan(25); expect(e.lng).toBeLessThan(45);
    });
  });
});
