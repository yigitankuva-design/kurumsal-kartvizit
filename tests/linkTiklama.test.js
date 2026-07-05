require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Çalışan profili link tıklama — kullanıcı adı normalleştirme', () => {
  let firmaId, calisanId;

  beforeAll(async () => {
    const hash = await bcrypt.hash('x', 4);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash)
       VALUES ('Link Test Firma', 'link-test-firma', 'linktest@example.com', $1) RETURNING id`,
      [hash]
    );
    firmaId = f.rows[0].id;
    const c = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, instagram, twitter, tiktok, linkedin, website, durum)
       VALUES ($1, 'Link', 'Test', 'link-test', '@kullaniciadi', '@kullaniciadi', '@kullaniciadi',
               'linkedin.com/in/ornek', 'ornek.com', 'aktif') RETURNING id`,
      [firmaId]
    );
    calisanId = c.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('Instagram kullanıcı adı girilmişse doğru linke yönlendirir', async () => {
    const res = await request(app).get('/link-test-firma/link-test/t/instagram');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://instagram.com/kullaniciadi');
  });

  test('Twitter kullanıcı adı girilmişse doğru linke yönlendirir', async () => {
    const res = await request(app).get('/link-test-firma/link-test/t/twitter');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://twitter.com/kullaniciadi');
  });

  test('TikTok kullanıcı adı girilmişse @ ile birlikte doğru linke yönlendirir', async () => {
    const res = await request(app).get('/link-test-firma/link-test/t/tiktok');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://tiktok.com/@kullaniciadi');
  });

  test('LinkedIn https:// olmadan girilmişse otomatik eklenir', async () => {
    const res = await request(app).get('/link-test-firma/link-test/t/linkedin');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://linkedin.com/in/ornek');
  });

  test('Website https:// olmadan girilmişse otomatik eklenir', async () => {
    const res = await request(app).get('/link-test-firma/link-test/t/website');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://ornek.com');
  });

  test('profil sayfasında QR kod doğru domaine işaret eder, nfckart.com içermez', async () => {
    const res = await request(app).get('/link-test-firma/link-test');
    expect(res.text).toContain('api.qrserver.com');
    expect(res.text).not.toContain('nfckart.com');
  });
});

describe('Raf kartı link tıklama — kullanıcı adı normalleştirme', () => {
  let firmaId, eczaneId;
  const kod = 'linktikla1';

  beforeAll(async () => {
    const hash = await bcrypt.hash('x', 4);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket, instagram, tiktok, website)
       VALUES ('Raf Link Test Firma', 'raf-link-test-firma', 'raflinktest@example.com', $1, 'kurumsal',
               '@rafinstagram', '@raftiktok', 'raf-ornek.com') RETURNING id`,
      [hash]
    );
    firmaId = f.rows[0].id;
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Link Test Eczanesi', $2) RETURNING id`,
      [firmaId, kod]
    );
    eczaneId = e.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('Instagram kullanıcı adı girilmişse doğru linke yönlendirir', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/instagram`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://instagram.com/rafinstagram');
  });

  test('TikTok kullanıcı adı girilmişse @ ile birlikte doğru linke yönlendirir', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/tiktok`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://tiktok.com/@raftiktok');
  });

  test('Website https:// olmadan girilmişse otomatik eklenir', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/website`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://raf-ornek.com');
  });
});
