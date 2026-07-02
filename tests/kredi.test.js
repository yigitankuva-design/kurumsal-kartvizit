require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Bayi kredi kontrolü — firma ekleme', () => {
  let bayiId;
  const email = 'kredi-test-bayi@test.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, kredi_bakiyesi)
       VALUES ('Kredi Test Bayi', 'kredi-test-bayi', $1, $2, 0) RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  test('kredi 0 iken firma eklenemez', async () => {
    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ giris_bilgisi: email, sifre });

    const oncekiFirmaSayisi = (await pool.query('SELECT COUNT(*) FROM firmalar WHERE bayi_id = $1', [bayiId])).rows[0].count;

    const res = await agent.post('/bayi/panel/firma-ekle').send({ ad_soyad: 'Kredi Test', kvkk: 'on' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/bayi/panel/kredi-yukle');

    const sonrakiFirmaSayisi = (await pool.query('SELECT COUNT(*) FROM firmalar WHERE bayi_id = $1', [bayiId])).rows[0].count;
    expect(sonrakiFirmaSayisi).toBe(oncekiFirmaSayisi);
  });

  test('kredi varsa firma eklenir ve kredi 1 düşer', async () => {
    await pool.query('UPDATE bayiler SET kredi_bakiyesi = 3 WHERE id = $1', [bayiId]);

    const agent = request.agent(app);
    await agent.post('/bayi/giris').send({ giris_bilgisi: email, sifre });

    const res = await agent.post('/bayi/panel/firma-ekle').send({ ad_soyad: 'Kredi Test2', kvkk: 'on' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/\?firma=\d+$/);

    const bayiSonuc = await pool.query('SELECT kredi_bakiyesi FROM bayiler WHERE id = $1', [bayiId]);
    expect(bayiSonuc.rows[0].kredi_bakiyesi).toBe(2);

    const hareketSonuc = await pool.query(
      `SELECT * FROM kredi_hareketleri WHERE bayi_id = $1 AND tip = 'harcama' ORDER BY created_at DESC LIMIT 1`,
      [bayiId]
    );
    expect(hareketSonuc.rows.length).toBe(1);
    expect(hareketSonuc.rows[0].miktar).toBe(-1);

    await pool.query('DELETE FROM firmalar WHERE bayi_id = $1', [bayiId]);
  });
});
