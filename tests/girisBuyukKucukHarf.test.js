require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Web /giris — büyük/küçük harf duyarsızlık', () => {
  let firmaId;
  const email = 'buyukkucuk-firma@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const r = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Buyuk Kucuk Firma', 'buyuk-kucuk-firma', $1, $2, 'kurumsal') RETURNING id`,
      [email, hash]
    );
    firmaId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('e-posta büyük harfle girilse de giriş yapılabilir', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: email.toUpperCase(), sifre });
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Hoş geldiniz');
  });
});

describe('Web /bayi/giris — büyük/küçük harf duyarsızlık', () => {
  let bayiId;
  const email = 'buyukkucuk-bayi@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const r = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, kullanici_adi, sifre_hash, aktif)
       VALUES ('Buyuk Kucuk Bayi', 'buyuk-kucuk-bayi', $1, 'buyukkucukbayi', $2, true) RETURNING id`,
      [email, hash]
    );
    bayiId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  test('e-posta büyük harfle girilse de giriş yapılabilir', async () => {
    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ giris_bilgisi: email.toUpperCase(), sifre });
    const res = await agent.post('/bayi/panel/firma-ekle').send({ ad_soyad: 'Harf Test Firma', kvkk: 'on' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('firma=');
  });
});
