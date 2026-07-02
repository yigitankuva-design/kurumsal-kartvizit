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
        .send({ giris_bilgisi: 'olmayan@test.com', sifre: 'yanlis' });
    }
    expect(sonIstek.statusCode).toBe(302);
    expect(sonIstek.headers.location).toBe('/');
  }, 20000);
});

describe('POST /bayi/giris rate limit', () => {
  test('15 dakikada 10 denemeden sonra 11. istek engellenir', async () => {
    let sonIstek;
    for (let i = 0; i < 11; i++) {
      sonIstek = await request(app)
        .post('/bayi/giris')
        .send({ giris_bilgisi: 'olmayan@test.com', sifre: 'yanlis' });
    }
    expect(sonIstek.statusCode).toBe(302);
    expect(sonIstek.headers.location).toBe('/bayi/giris');
  }, 20000);
});

describe('POST /superadmin/giris rate limit', () => {
  test('15 dakikada 10 denemeden sonra 11. istek engellenir', async () => {
    let sonIstek;
    for (let i = 0; i < 11; i++) {
      sonIstek = await request(app)
        .post('/superadmin/giris')
        .send({ sifre: 'yanlis-sifre' });
    }
    expect(sonIstek.statusCode).toBe(302);
    expect(sonIstek.headers.location).toBe('/superadmin/giris');
  }, 20000);
});
