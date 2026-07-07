require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('routes/bayi — çalışan durum değiştirme (?_method=PATCH)', () => {
  let bayiId, firmaId, calisanId;
  const email = 'bayidurum-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const bayi = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash) VALUES ('Durum Test Bayi', 'durum-test-bayi', $1, $2) RETURNING id`,
      [email, hash]
    );
    bayiId = bayi.rows[0].id;

    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ giris_bilgisi: email, sifre });
    const firmaRes = await agent.post('/bayi/panel/firma-ekle').send({ ad_soyad: 'Durum Test Firma', kvkk: 'on' });
    firmaId = Number(new URL(firmaRes.headers.location, 'http://localhost').searchParams.get('firma'));

    const calisanRes = await agent.post(`/bayi/panel/${firmaId}/calisan-ekle`).send({ ad: 'Durum', soyad: 'Calisan', kvkk: 'on' });
    expect(calisanRes.statusCode).toBe(302);
    const c = await pool.query('SELECT id FROM calisanlar WHERE firma_id = $1', [firmaId]);
    calisanId = c.rows[0].id;
  }, 20000);

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  test('bayi query string ile (?_method=PATCH) çalışanı pasife alabilir', async () => {
    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ giris_bilgisi: email, sifre });

    const res = await agent
      .post(`/bayi/panel/${firmaId}/calisan/${calisanId}/durum?_method=PATCH`)
      .send({ durum: 'pasif' });

    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT durum FROM calisanlar WHERE id = $1', [calisanId]);
    expect(c.rows[0].durum).toBe('pasif');
  });
});
