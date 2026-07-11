require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Genel Bakış sekmesi — dönem karşılaştırması', () => {
  let firmaId, calisanId, agent;
  const email = 'genelbakis@example.com';

  beforeAll(async () => {
    const hash = await bcrypt.hash('test1234', 8);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Genel Bakış Firma', 'genel-bakis-firma', $1, $2, 'kurumsal') RETURNING id`,
      [email, hash]
    );
    firmaId = f.rows[0].id;
    const c = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, durum)
       VALUES ($1, 'Genel', 'Bakis', 'genel-bakis-calisan', 'aktif') RETURNING id`,
      [firmaId]
    );
    calisanId = c.rows[0].id;

    // Bu dönem (son 7 gün): 3 tıklama, 2 profil görüntüleme
    await pool.query(
      `INSERT INTO link_tiklama (calisan_id, tip, created_at) VALUES
       ($1, 'telefon', NOW() - INTERVAL '1 day'),
       ($1, 'email', NOW() - INTERVAL '2 days'),
       ($1, 'profil_goruntuleme', NOW() - INTERVAL '3 days'),
       ($1, 'profil_goruntuleme', NOW() - INTERVAL '4 days')`,
      [calisanId]
    );
    // Önceki dönem (7-14 gün önce): 1 tıklama
    await pool.query(
      `INSERT INTO link_tiklama (calisan_id, tip, created_at) VALUES
       ($1, 'telefon', NOW() - INTERVAL '10 days')`,
      [calisanId]
    );

    agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: email, sifre: 'test1234' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('bu dönem tıklama sayısı doğru hesaplanır', async () => {
    const res = await agent.get('/?tab=genel');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('4');
  });

  test('önceki döneme göre yüzde değişim gösterilir', async () => {
    const res = await agent.get('/?tab=genel');
    // bu dönem 4, önceki 1 -> %300 artış
    expect(res.text).toMatch(/%\s*300|300%/);
  });

  test('14 günlük sparkline verisi görünür', async () => {
    const res = await agent.get('/?tab=genel');
    expect(res.text).toContain('genelSparkline');
  });
});
