require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Raf kartı public sayfası', () => {
  let firmaId;
  let eczaneId;
  const kod = 'raftest1';

  beforeAll(async () => {
    const hash = await bcrypt.hash('x', 4);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket, katalog_url, website)
       VALUES ('Raf Test Firma', 'raf-test-firma', 'raftest@example.com', $1, 'kurumsal',
               'https://ornek.com/katalog.pdf', 'https://ornek.com') RETURNING id`,
      [hash]
    );
    firmaId = f.rows[0].id;
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, adres, kod)
       VALUES ($1, 'Test Eczanesi', 'Test Mah.', $2) RETURNING id`,
      [firmaId, kod]
    );
    eczaneId = e.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('geçerli kod 200 döner, okutma kaydedilir', async () => {
    const onceki = (await pool.query('SELECT COUNT(*) FROM raf_okutmalar WHERE eczane_id = $1', [eczaneId])).rows[0].count;
    const res = await request(app).get(`/raf/${kod}`);
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Raf Test Firma');
    expect(res.text).toContain('Ürün Kataloğu');
    const sonraki = (await pool.query('SELECT COUNT(*) FROM raf_okutmalar WHERE eczane_id = $1', [eczaneId])).rows[0].count;
    expect(Number(sonraki)).toBe(Number(onceki) + 1);
  });

  test('okutma kaydına ip_hash yazılır', async () => {
    await request(app).get(`/raf/${kod}`);
    const son = await pool.query(
      'SELECT ip_hash FROM raf_okutmalar WHERE eczane_id = $1 ORDER BY id DESC LIMIT 1',
      [eczaneId]
    );
    expect(son.rows[0].ip_hash).not.toBeNull();
    expect(son.rows[0].ip_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('QR kodu gösterilir, doğru domaine işaret eder', async () => {
    const res = await request(app).get(`/raf/${kod}`);
    expect(res.text).toContain('api.qrserver.com');
    expect(res.text).toContain('QR Kodu Göster');
    expect(res.text).not.toContain('nfckart.com');
  });

  test('geçersiz kod 404 döner', async () => {
    const res = await request(app).get('/raf/yokboylekod');
    expect(res.statusCode).toBe(404);
  });

  test('katalog tıklaması kaydedilir ve redirect eder', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/katalog`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://ornek.com/katalog.pdf');
    const sayi = (await pool.query(
      "SELECT COUNT(*) FROM raf_tiklamalar WHERE eczane_id = $1 AND tip = 'katalog'", [eczaneId]
    )).rows[0].count;
    expect(Number(sayi)).toBeGreaterThan(0);
  });

  test('beyaz liste dışı tip kaydedilmez, sayfaya redirect eder', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/zararli`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/raf/${kod}`);
    const sayi = (await pool.query(
      "SELECT COUNT(*) FROM raf_tiklamalar WHERE eczane_id = $1 AND tip = 'zararli'", [eczaneId]
    )).rows[0].count;
    expect(Number(sayi)).toBe(0);
  });

  test('boş alanın tıklaması sayfaya geri döner', async () => {
    const res = await request(app).get(`/raf/${kod}/tikla/instagram`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/raf/${kod}`);
  });
});
