require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('routes/kullanicilar', () => {
  let firmaId, sahibiAgent;
  const sahibiEmail = 'kullanicilar-sahibi@example.com';

  beforeAll(async () => {
    const hash = await bcrypt.hash('sahibi1234', 12);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Kullanicilar Firma', 'kullanicilar-firma', $1, $2, 'kurumsal') RETURNING id`,
      [sahibiEmail, hash]
    );
    firmaId = f.rows[0].id;
    sahibiAgent = request.agent(app);
    await sahibiAgent.post('/giris').send({ giris_bilgisi: sahibiEmail, sifre: 'sahibi1234' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('firma sahibi yeni kullanıcı ekleyebilir, şifre hash olarak saklanır', async () => {
    const res = await sahibiAgent.post('/firma/kullanicilar/ekle').send({
      ad: 'Test Calisani', email: 'yeni-kullanici@example.com', sifre: 'gizli1234', rol: 'sadece_calisan'
    });
    expect(res.statusCode).toBe(302);
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE firma_id = $1 AND email = $2', [firmaId, 'yeni-kullanici@example.com']);
    expect(kayit.rows.length).toBe(1);
    expect(kayit.rows[0].sifre_hash).not.toBe('gizli1234');
    expect(await bcrypt.compare('gizli1234', kayit.rows[0].sifre_hash)).toBe(true);
    expect(kayit.rows[0].rol).toBe('sadece_calisan');
  });

  test('geçersiz rol değeri reddedilir', async () => {
    const res = await sahibiAgent.post('/firma/kullanicilar/ekle').send({
      ad: 'Gecersiz Rol', email: 'gecersiz-rol@example.com', sifre: 'gizli1234', rol: 'olmayan_rol'
    });
    expect(res.statusCode).toBe(302);
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE email = $1', ['gecersiz-rol@example.com']);
    expect(kayit.rows.length).toBe(0);
  });

  test('sadece_calisan rolü kullanıcı ekleme uçlarına erişemez', async () => {
    const altHash = await bcrypt.hash('alt1234', 12);
    await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Alt', $2, $3, 'sadece_calisan')`,
      [firmaId, 'kullanicilar-alt@example.com', altHash]
    );
    const altAgent = request.agent(app);
    await altAgent.post('/giris').send({ giris_bilgisi: 'kullanicilar-alt@example.com', sifre: 'alt1234' });
    const res = await altAgent.post('/firma/kullanicilar/ekle').send({
      ad: 'Yetkisiz Ekleme', email: 'yetkisiz@example.com', sifre: 'gizli1234', rol: 'sadece_calisan'
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE email = $1', ['yetkisiz@example.com']);
    expect(kayit.rows.length).toBe(0);
  });

  test('firma sahibi kullanıcıyı silebilir', async () => {
    const hash = await bcrypt.hash('silinecek1234', 12);
    const k = await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Silinecek', $2, $3, 'sadece_saha') RETURNING id`,
      [firmaId, 'silinecek@example.com', hash]
    );
    const res = await sahibiAgent.post(`/firma/kullanicilar/${k.rows[0].id}/sil`);
    expect(res.statusCode).toBe(302);
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE id = $1', [k.rows[0].id]);
    expect(kayit.rows.length).toBe(0);
  });

  test('başka firmanın kullanıcısı silinemez', async () => {
    const digerHash = await bcrypt.hash('x', 12);
    const digerFirma = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash) VALUES ('Diger Firma KA', 'diger-firma-ka', 'diger-ka@example.com', $1) RETURNING id`,
      [digerHash]
    );
    const digerKullanici = await pool.query(
      `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, 'Diger Kullanici', 'diger-kullanici-ka@example.com', $2, 'sadece_saha') RETURNING id`,
      [digerFirma.rows[0].id, digerHash]
    );
    const res = await sahibiAgent.post(`/firma/kullanicilar/${digerKullanici.rows[0].id}/sil`);
    expect(res.statusCode).toBe(302);
    const kayit = await pool.query('SELECT * FROM firma_kullanicilari WHERE id = $1', [digerKullanici.rows[0].id]);
    expect(kayit.rows.length).toBe(1); // silinmedi
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirma.rows[0].id]);
  });
});
