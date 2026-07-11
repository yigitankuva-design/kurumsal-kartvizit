require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Rol bazlı tab erişim kısıtlaması', () => {
  let firmaId;
  const sahibiEmail = 'tabkisitlama-sahibi@example.com';

  beforeAll(async () => {
    const hash = await bcrypt.hash('sahibi1234', 12);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Tab Kisitlama Firma', 'tab-kisitlama-firma', $1, $2, 'kurumsal') RETURNING id`,
      [sahibiEmail, hash]
    );
    firmaId = f.rows[0].id;
    const altHash = await bcrypt.hash('alt1234', 12);
    await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Calisan Rolu', 'tabkisitlama-calisan@example.com', $2, 'sadece_calisan')`,
      [firmaId, altHash]
    );
    await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Saha Rolu', 'tabkisitlama-saha@example.com', $2, 'sadece_saha')`,
      [firmaId, altHash]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('sadece_calisan rolü ?tab=raf isteğinde calisanlar tabına düşürülür', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: 'tabkisitlama-calisan@example.com', sifre: 'alt1234' });
    const res = await agent.get('/?tab=raf');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Yeni Eczane Ekle');
  });

  test('sadece_saha rolü ?tab=calisanlar isteğinde genel bakışa düşürülür', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: 'tabkisitlama-saha@example.com', sifre: 'alt1234' });
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('td-actions');
  });

  test('firma sahibi Kullanıcılar sekmesinde eklenen kullanıcıları görür', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: sahibiEmail, sifre: 'sahibi1234' });
    const res = await agent.get('/?tab=kullanicilar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Calisan Rolu');
    expect(res.text).toContain('Saha Rolu');
  });

  test('sadece_calisan rolü Kullanıcılar sekmesine erişemez', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: 'tabkisitlama-calisan@example.com', sifre: 'alt1234' });
    const res = await agent.get('/?tab=kullanicilar');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Calisan Rolu');
  });
});
