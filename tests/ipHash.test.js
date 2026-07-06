require('dotenv').config();
const { ipHashOlustur } = require('../utils/ipHash');

describe('ipHashOlustur', () => {
  test('aynı IP her zaman aynı hash\'i üretir', () => {
    const h1 = ipHashOlustur('1.2.3.4');
    const h2 = ipHashOlustur('1.2.3.4');
    expect(h1).toBe(h2);
  });

  test('farklı IP farklı hash üretir', () => {
    const h1 = ipHashOlustur('1.2.3.4');
    const h2 = ipHashOlustur('5.6.7.8');
    expect(h1).not.toBe(h2);
  });

  test('hash ham IP\'yi içermez, 64 karakterlik hex string döner', () => {
    const h = ipHashOlustur('192.168.1.1');
    expect(h).not.toContain('192.168.1.1');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
