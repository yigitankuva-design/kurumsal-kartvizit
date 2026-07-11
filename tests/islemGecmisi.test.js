require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { islemKaydet } = require('../utils/islemGecmisi');

describe('islemKaydet', () => {
  let firmaId;

  beforeAll(async () => {
    const hash = await bcrypt.hash('x', 4);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Islem Gecmisi Test', 'islem-gecmisi-test', 'islemgecmisi@example.com', $1, 'kurumsal') RETURNING id`,
      [hash]
    );
    firmaId = f.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('işlem kaydı doğru alanlarla oluşturulur', async () => {
    await islemKaydet(firmaId, 'calisan_silindi', 'calisan', 42, 'Ahmet Yılmaz');
    const r = await pool.query('SELECT * FROM islem_gecmisi WHERE firma_id = $1', [firmaId]);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].islem).toBe('calisan_silindi');
    expect(r.rows[0].hedef_tip).toBe('calisan');
    expect(r.rows[0].hedef_id).toBe(42);
    expect(r.rows[0].aciklama).toBe('Ahmet Yılmaz');
    expect(r.rows[0].created_at).toBeTruthy();
  });

  test('hedef_id ve aciklama opsiyonel', async () => {
    await islemKaydet(firmaId, 'indirim_ayar_degisti', null, null, null);
    const r = await pool.query(
      "SELECT * FROM islem_gecmisi WHERE firma_id = $1 AND islem = 'indirim_ayar_degisti'",
      [firmaId]
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].hedef_id).toBeNull();
  });
});
