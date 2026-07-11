require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('POST /firma/panel/tema', () => {
  let firmaId, agent;
  const firmaEmail = 'tema-ayari@example.com';

  beforeAll(async () => {
    const hash = await bcrypt.hash('test1234', 8);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Tema Ayari Firma', 'tema-ayari-firma', $1, $2, 'kurumsal') RETURNING id`,
      [firmaEmail, hash]
    );
    firmaId = f.rows[0].id;
    agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: firmaEmail, sifre: 'test1234' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('geçerli hex ve ışık seviyesi kaydedilir', async () => {
    const res = await agent.post('/firma/panel/tema').send({ renk: '#5b8ff2', isikSeviyesi: '70' });
    expect(res.statusCode).toBe(200);
    const r = await pool.query('SELECT tema_renk, tema_isik_seviyesi FROM firmalar WHERE id = $1', [firmaId]);
    expect(r.rows[0].tema_renk).toBe('#5b8ff2');
    expect(r.rows[0].tema_isik_seviyesi).toBe(70);
  });

  test('geçersiz hex reddedilir', async () => {
    const res = await agent.post('/firma/panel/tema').send({ renk: 'kirmizi', isikSeviyesi: '50' });
    expect(res.statusCode).toBe(400);
    const r = await pool.query('SELECT tema_renk FROM firmalar WHERE id = $1', [firmaId]);
    expect(r.rows[0].tema_renk).toBe('#5b8ff2'); // önceki geçerli değer korunur
  });

  test('0-100 dışındaki ışık seviyesi reddedilir', async () => {
    const res = await agent.post('/firma/panel/tema').send({ renk: '#5b8ff2', isikSeviyesi: '150' });
    expect(res.statusCode).toBe(400);
  });

  test('giriş yapmamış istek 302 ile yönlendirilir', async () => {
    const anonim = request.agent(app);
    const res = await anonim.post('/firma/panel/tema').send({ renk: '#5b8ff2', isikSeviyesi: '50' });
    expect(res.statusCode).toBe(302);
  });
});
