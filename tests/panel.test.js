require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

async function firmaOlustur(email) {
  const hash = await bcrypt.hash('test1234', 8);
  const r = await pool.query(
    `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
     VALUES ($1, $2, $3, $4, 'kurumsal') RETURNING id`,
    [`Firma ${email}`, `firma-${email.split('@')[0]}`, email, hash]
  );
  return r.rows[0].id;
}

async function girisYap(email) {
  const agent = request.agent(app);
  await agent.post('/giris').send({ giris_bilgisi: email, sifre: 'test1234' });
  return agent;
}

describe('routes/panel — temsilci giriş bilgisi', () => {
  let firmaId;
  const firmaEmail = 'panelk2@example.com';

  beforeAll(async () => {
    firmaId = await firmaOlustur(firmaEmail);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('giris_email + giris_sifre ile çalışan eklenince hash DB\'de saklanır', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Ali', soyad: 'Veli', kvkk: 'on',
      giris_email: 'ali.veli@example.com', giris_sifre: 'gizli123',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com']);
    expect(c.rows.length).toBe(1);
    expect(await bcrypt.compare('gizli123', c.rows[0].giris_sifre_hash)).toBe(true);
  });

  test('giris_email verilip giris_sifre verilmezse çalışan eklenmez', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Şifresiz', soyad: 'Kişi', kvkk: 'on',
      giris_email: 'sifresiz@example.com',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['sifresiz@example.com']);
    expect(c.rows.length).toBe(0);
  });

  test('aynı giriş e-postasıyla ikinci çalışan eklenemez', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Ikinci', soyad: 'Kisi', kvkk: 'on',
      giris_email: 'ali.veli@example.com', giris_sifre: 'baskasifre',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com']);
    expect(c.rows.length).toBe(1); // hala sadece ilk çalışan
  });

  test('çalışan düzenlenirken giriş e-postası boşa çekilirse giriş devre dışı kalır', async () => {
    const agent = await girisYap(firmaEmail);
    const mevcut = (await pool.query('SELECT id FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com'])).rows[0];
    const res = await agent.post(`/firma/panel/${mevcut.id}/duzenle`).send({
      ad: 'Ali', soyad: 'Veli', giris_email: '',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT giris_email, giris_sifre_hash FROM calisanlar WHERE id = $1', [mevcut.id]);
    expect(c.rows[0].giris_email).toBeNull();
    expect(c.rows[0].giris_sifre_hash).toBeNull();
  });
});
