const crypto = require('crypto');
const { tokenHashOlustur, callbackHashDogrula } = require('../utils/paytr');

describe('tokenHashOlustur', () => {
  const temelGirdi = {
    merchantId: '12345', userIp: '1.2.3.4', email: 'test@test.com',
    paymentAmount: 1000, userBasket: 'W10=', noInstallment: 0,
    maxInstallment: 0, currency: 'TL', testMode: 1,
    merchantSalt: 'salt123', merchantKey: 'key123',
  };

  test('aynı girdiler için aynı hash üretir (deterministik)', () => {
    const girdi = { ...temelGirdi, merchantOid: 'ORD1' };
    expect(tokenHashOlustur(girdi)).toBe(tokenHashOlustur(girdi));
  });

  test('farklı merchantOid farklı hash üretir', () => {
    const h1 = tokenHashOlustur({ ...temelGirdi, merchantOid: 'ORD1' });
    const h2 = tokenHashOlustur({ ...temelGirdi, merchantOid: 'ORD2' });
    expect(h1).not.toBe(h2);
  });

  test('base64 formatında string döner', () => {
    const h = tokenHashOlustur({ ...temelGirdi, merchantOid: 'ORD1' });
    expect(typeof h).toBe('string');
    expect(() => Buffer.from(h, 'base64')).not.toThrow();
  });
});

describe('callbackHashDogrula', () => {
  test('doğru hash için true döner', () => {
    const merchantOid = 'ORD1', status = 'success', totalAmount = '1000';
    const merchantSalt = 'salt123', merchantKey = 'key123';
    const dogruHash = crypto
      .createHmac('sha256', merchantKey)
      .update(`${merchantOid}${merchantSalt}${status}${totalAmount}`)
      .digest('base64');

    expect(callbackHashDogrula({ merchantOid, status, totalAmount, merchantSalt, merchantKey, gelenHash: dogruHash })).toBe(true);
  });

  test('yanlış hash için false döner', () => {
    expect(callbackHashDogrula({
      merchantOid: 'ORD1', status: 'success', totalAmount: '1000',
      merchantSalt: 'salt123', merchantKey: 'key123', gelenHash: 'yanlis-hash',
    })).toBe(false);
  });

  test('farklı tutar için hash uyuşmaz', () => {
    const merchantOid = 'ORD1', status = 'success';
    const merchantSalt = 'salt123', merchantKey = 'key123';
    const hash1000Icin = crypto
      .createHmac('sha256', merchantKey)
      .update(`${merchantOid}${merchantSalt}${status}1000`)
      .digest('base64');

    expect(callbackHashDogrula({
      merchantOid, status, totalAmount: '2000',
      merchantSalt, merchantKey, gelenHash: hash1000Icin,
    })).toBe(false);
  });
});
