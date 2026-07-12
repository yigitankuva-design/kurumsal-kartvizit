const { hiyerarsiAgaciKur, mumessilPerformansi } = require('../utils/sahaAnaliz');

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

describe('mumessilPerformansi', () => {
  const bugun = Date.now();
  const gunOnce = g => new Date(bugun - g * 86400000);
  const satirlar = [
    { id: 1, ad: 'A', soyad: 'A', unvan: 'Tıbbi Mümessil', ziyaret30: 20, ziyaret90: 50, sonZiyaret: gunOnce(1) },
    { id: 2, ad: 'B', soyad: 'B', unvan: 'Tıbbi Mümessil', ziyaret30: 2, ziyaret90: 6, sonZiyaret: gunOnce(80) },
    { id: 3, ad: 'C', soyad: 'C', unvan: 'Tıbbi Mümessil', ziyaret30: 0, ziyaret90: 0, sonZiyaret: null },
    { id: 4, ad: 'D', soyad: 'D', unvan: 'Tıbbi Mümessil', ziyaret30: 5, ziyaret90: 15, sonZiyaret: gunOnce(3) },
    { id: 5, ad: 'E', soyad: 'E', unvan: 'Tıbbi Mümessil', ziyaret30: 4, ziyaret90: 12, sonZiyaret: gunOnce(4) },
  ];

  test('60+ gün veya hiç ziyaret → geride', () => {
    const s = mumessilPerformansi(satirlar);
    expect(s.find(r => r.id === 2).durum).toBe('geride');
    expect(s.find(r => r.id === 3).durum).toBe('geride');
  });

  test('üst %20 (en yüksek ziyaret30) → yildiz', () => {
    const s = mumessilPerformansi(satirlar);
    expect(s.find(r => r.id === 1).durum).toBe('yildiz');
  });

  test('geride olanlar listenin başında', () => {
    const s = mumessilPerformansi(satirlar);
    const ilkIki = s.slice(0, 2).map(r => r.durum);
    expect(ilkIki.every(d => d === 'geride')).toBe(true);
  });
});
