require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Bayi abonelik kontrolü — firma ekleme', () => {
  let bayiId;
  const email = 'abonelik-test-bayi@test.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash)
       VALUES ('Abonelik Test Bayi', 'abonelik-test-bayi', $1, $2) RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  test('abonelik süresi dolmuşsa firma eklenemez', async () => {
    await pool.query("UPDATE bayiler SET abonelik_bitis_tarihi = '2020-01-01' WHERE id = $1", [bayiId]);

    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ giris_bilgisi: email, sifre });

    const oncekiFirmaSayisi = (await pool.query('SELECT COUNT(*) FROM firmalar WHERE bayi_id = $1', [bayiId])).rows[0].count;

    const res = await agent.post('/bayi/panel/firma-ekle').send({ ad_soyad: 'Abonelik Test', kvkk: 'on' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');

    const sonrakiFirmaSayisi = (await pool.query('SELECT COUNT(*) FROM firmalar WHERE bayi_id = $1', [bayiId])).rows[0].count;
    expect(sonrakiFirmaSayisi).toBe(oncekiFirmaSayisi);
  });

  test('abonelik süresi dolmamışsa firma eklenir, kredi harcanmaz', async () => {
    await pool.query("UPDATE bayiler SET abonelik_bitis_tarihi = '2099-01-01' WHERE id = $1", [bayiId]);

    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ giris_bilgisi: email, sifre });

    const res = await agent.post('/bayi/panel/firma-ekle').send({ ad_soyad: 'Abonelik Test2', kvkk: 'on' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/\?firma=\d+$/);

    await pool.query('DELETE FROM firmalar WHERE bayi_id = $1', [bayiId]);
  });

  test('abonelik tanımlı değilse (null) firma eklenebilir', async () => {
    await pool.query('UPDATE bayiler SET abonelik_bitis_tarihi = NULL WHERE id = $1', [bayiId]);

    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ giris_bilgisi: email, sifre });

    const res = await agent.post('/bayi/panel/firma-ekle').send({ ad_soyad: 'Abonelik Test3', kvkk: 'on' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/\?firma=\d+$/);

    await pool.query('DELETE FROM firmalar WHERE bayi_id = $1', [bayiId]);
  });
});
