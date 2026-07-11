require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Rol bazlı giriş — firma_kullanicilari', () => {
  let firmaId, kullaniciId;
  const sahibiEmail = 'rolgirisi-sahibi@example.com';
  const altKullaniciEmail = 'rolgirisi-alt@example.com';

  beforeAll(async () => {
    const sahibiHash = await bcrypt.hash('sahibi1234', 12);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Rol Girisi Firma', 'rol-girisi-firma', $1, $2, 'kurumsal') RETURNING id`,
      [sahibiEmail, sahibiHash]
    );
    firmaId = f.rows[0].id;

    const altHash = await bcrypt.hash('alt1234', 12);
    const k = await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol)
       VALUES ($1, 'Alt Kullanici', $2, $3, 'sadece_calisan') RETURNING id`,
      [firmaId, altKullaniciEmail, altHash]
    );
    kullaniciId = k.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firma_kullanicilari WHERE id = $1', [kullaniciId]);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('firma sahibi girişinde session.rol set edilmez (tam yetki)', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: sahibiEmail, sifre: 'sahibi1234' });
    const res = await agent.get('/kurumsal/rapor-excel');
    expect(res.statusCode).not.toBe(302); // requireRolIzni tarafından engellenmedi (200 veya farklı bir akış)
  });

  test('firma_kullanicilari üzerinden doğru şifreyle giriş yapılabilir', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/giris').send({ giris_bilgisi: altKullaniciEmail, sifre: 'alt1234' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('sadece_calisan rolü /kurumsal altına erişemez, ana sayfaya yönlendirilir', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: altKullaniciEmail, sifre: 'alt1234' });
    const res = await agent.get('/kurumsal/rapor-excel');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('sadece_calisan rolü /firma/panel altına erişebilir', async () => {
    const agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: altKullaniciEmail, sifre: 'alt1234' });
    const res = await agent.get('/firma/panel/excel-sablon');
    expect(res.statusCode).toBe(200);
  });

  test('yanlış şifreyle firma_kullanicilari girişi reddedilir', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/giris').send({ giris_bilgisi: altKullaniciEmail, sifre: 'yanlis-sifre' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const dashRes = await agent.get('/');
    expect(dashRes.text).not.toContain('Rol Girisi Firma');
  });
});
