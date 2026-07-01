require('dotenv').config();
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db');

afterAll(async () => {
  await pool.end();
});

describe('POST /firma/giris rate limit', () => {
  test('15 dakikada 10 denemeden sonra 11. istek engellenir', async () => {
    let sonIstek;
    for (let i = 0; i < 11; i++) {
      sonIstek = await request(app)
        .post('/firma/giris')
        .send({ yetkili_email: 'olmayan@test.com', sifre: 'yanlis' });
    }
    expect(sonIstek.statusCode).toBe(302);
    expect(sonIstek.headers.location).toBe('/');
  }, 20000);
});
