require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');
const { bayiTokenDogrula } = require('../utils/jwt');

describe('Mobil API — /api/mobil/giris', () => {
  let bayiId;
  const email = 'mobilapi-test-bayi@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, kullanici_adi, sifre_hash, aktif)
       VALUES ('Mobil Api Test Bayi', 'mobilapi-test-bayi', $1, 'mobilapitestbayi', $2, true)
       RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('doğru bilgilerle token döner', async () => {
    const res = await request(app)
      .post('/api/mobil/giris')
      .send({ giris_bilgisi: email, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    const payload = bayiTokenDogrula(res.body.token);
    expect(payload.bayiId).toBe(bayiId);
  });

  test('yanlış şifreyle 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/giris')
      .send({ giris_bilgisi: email, sifre: 'yanlis-sifre' });
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('eksik alanla 400 döner', async () => {
    const res = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email });
    expect(res.statusCode).toBe(400);
  });
});

describe('Mobil API — /api/mobil/musteriler', () => {
  let bayiId;
  let token;
  let firmaId;
  const email = 'mobilapi-musteri-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const bayiSonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, aktif)
       VALUES ('Mobil Musteri Test Bayi', 'mobil-musteri-test-bayi', $1, $2, true) RETURNING id`,
      [email, hash]
    );
    bayiId = bayiSonuc.rows[0].id;

    const girisRes = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email, sifre });
    token = girisRes.body.token;

    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, bayi_id)
       VALUES ('Test Musteri Firma', 'test-musteri-firma-mobil', 'x@x.com', 'x', $1) RETURNING id`,
      [bayiId]
    );
    firmaId = firmaSonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('token olmadan 401 döner', async () => {
    const res = await request(app).get('/api/mobil/musteriler');
    expect(res.statusCode).toBe(401);
  });

  test('geçerli token ile sadece kendi müşterilerini listeler', async () => {
    const res = await request(app)
      .get('/api/mobil/musteriler')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.musteriler.some(m => m.id === firmaId)).toBe(true);
  });
});
