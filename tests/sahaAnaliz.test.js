const { hiyerarsiAgaciKur } = require('../utils/sahaAnaliz');

describe('hiyerarsiAgaciKur', () => {
  const kisiler = [
    { id: 1, ad: 'Genel', soyad: 'Müdür', unvan: 'Genel Müdür', amiri_id: null, ekip_yoneticisi: true },
    { id: 2, ad: 'Bölge', soyad: 'A', unvan: 'Bölge Müdürü', amiri_id: 1, ekip_yoneticisi: true },
    { id: 3, ad: 'Mümessil', soyad: 'X', unvan: 'Tıbbi Mümessil', amiri_id: 2, ekip_yoneticisi: false },
    { id: 4, ad: 'Mümessil', soyad: 'Y', unvan: 'Tıbbi Mümessil', amiri_id: 2, ekip_yoneticisi: false },
  ];
  const ziyaret = { 1: 0, 2: 5, 3: 10, 4: 7 };

  test('tek kök (amiri_id null) döner', () => {
    const kokler = hiyerarsiAgaciKur(kisiler, ziyaret);
    expect(kokler).toHaveLength(1);
    expect(kokler[0].id).toBe(1);
  });

  test('iç içe çocuklar doğru bağlanır', () => {
    const [gm] = hiyerarsiAgaciKur(kisiler, ziyaret);
    expect(gm.cocuklar).toHaveLength(1);
    expect(gm.cocuklar[0].id).toBe(2);
    expect(gm.cocuklar[0].cocuklar.map(c => c.id).sort()).toEqual([3, 4]);
  });

  test('ekipZiyaret = kendi + tüm alt ağaç', () => {
    const [gm] = hiyerarsiAgaciKur(kisiler, ziyaret);
    expect(gm.ekipZiyaret).toBe(22); // 0+5+10+7
    expect(gm.cocuklar[0].ekipZiyaret).toBe(22); // bölge: 5+10+7
    expect(gm.cocuklar[0].cocuklar.find(c => c.id === 3).kendiZiyaret).toBe(10);
  });

  test('kopuk amiri_id (var olmayan) güvenli — o kişi köke düşmez, yok sayılır', () => {
    const bozuk = [...kisiler, { id: 9, ad: 'Kopuk', soyad: 'Z', unvan: 'Tıbbi Mümessil', amiri_id: 999, ekip_yoneticisi: false }];
    const kokler = hiyerarsiAgaciKur(bozuk, { ...ziyaret, 9: 3 });
    const tumIdler = [];
    const gez = n => { tumIdler.push(n.id); n.cocuklar.forEach(gez); };
    kokler.forEach(gez);
    expect(tumIdler).not.toContain(9);
  });
});
