require('dotenv').config();
const request = require('supertest');
const crypto = require('crypto');
const app = require('../app');
const { pool } = require('../db');

function paytrCallbackHashUret(merchantOid, status, totalAmount) {
  const salt = process.env.PAYTR_MERCHANT_SALT || 'test-salt';
  const key = process.env.PAYTR_MERCHANT_KEY || 'test-key';
  return crypto
    .createHmac('sha256', key)
    .update(`${merchantOid}${salt}${status}${totalAmount}`)
    .digest('base64');
}

describe('POST /bayi/odeme/paytr-callback', () => {
  let bayiId;
  const merchantOid = `TESTOID${Date.now()}`;

  beforeAll(async () => {
    const bayiSonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, kredi_bakiyesi)
       VALUES ('Odeme Test Bayi', 'odeme-test-bayi-${Date.now()}', 'odeme-test-${Date.now()}@test.com', 'x', 0)
       RETURNING id`
    );
    bayiId = bayiSonuc.rows[0].id;
    await pool.query(
      `INSERT INTO odemeler (bayi_id, paytr_merchant_oid, kredi_miktari, tutar, durum)
       VALUES ($1, $2, 25, 1000, 'beklemede')`,
      [bayiId, merchantOid]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  test('geçersiz hash için 400 döner ve hiçbir şey güncellenmez', async () => {
    const res = await request(app)
      .post('/bayi/odeme/paytr-callback')
      .send({ merchant_oid: merchantOid, status: 'success', total_amount: '1000', hash: 'gecersiz-hash' });

    expect(res.statusCode).toBe(400);

    const odemeSonuc = await pool.query('SELECT durum FROM odemeler WHERE paytr_merchant_oid = $1', [merchantOid]);
    expect(odemeSonuc.rows[0].durum).toBe('beklemede');
  });

  test('geçerli hash ve success durumu için kredi eklenir', async () => {
    const hash = paytrCallbackHashUret(merchantOid, 'success', '1000');
    const res = await request(app)
      .post('/bayi/odeme/paytr-callback')
      .send({ merchant_oid: merchantOid, status: 'success', total_amount: '1000', hash });

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('OK');

    const odemeSonuc = await pool.query('SELECT durum FROM odemeler WHERE paytr_merchant_oid = $1', [merchantOid]);
    expect(odemeSonuc.rows[0].durum).toBe('basarili');

    const bayiSonuc = await pool.query('SELECT kredi_bakiyesi FROM bayiler WHERE id = $1', [bayiId]);
    expect(bayiSonuc.rows[0].kredi_bakiyesi).toBe(25);

    const hareketSonuc = await pool.query(
      `SELECT * FROM kredi_hareketleri WHERE bayi_id = $1 AND tip = 'yukleme'`,
      [bayiId]
    );
    expect(hareketSonuc.rows.length).toBe(1);
    expect(hareketSonuc.rows[0].miktar).toBe(25);
  });

  test('aynı ödeme için ikinci kez callback gelirse kredi tekrar eklenmez (idempotency)', async () => {
    const hash = paytrCallbackHashUret(merchantOid, 'success', '1000');
    await request(app)
      .post('/bayi/odeme/paytr-callback')
      .send({ merchant_oid: merchantOid, status: 'success', total_amount: '1000', hash });

    const bayiSonuc = await pool.query('SELECT kredi_bakiyesi FROM bayiler WHERE id = $1', [bayiId]);
    expect(bayiSonuc.rows[0].kredi_bakiyesi).toBe(25); // hâlâ 25, tekrar eklenmedi
  });
});
