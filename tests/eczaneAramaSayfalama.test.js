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

describe('Raf Kartları sekmesi arama ve sayfalama', () => {
  let firmaId, agent;
  const firmaEmail = 'eczanearamasayfalama@example.com';

  beforeAll(async () => {
    firmaId = await firmaOlustur(firmaEmail);
    agent = await girisYap(firmaEmail);
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod) VALUES
       ($1, 'Merkez Eczanesi', 'Merkez Mah.', 'eczarama1', 'eczaramaeczaci1'),
       ($1, 'Sahil Eczanesi', 'Sahil Cad.', 'eczarama2', 'eczaramaeczaci2')`,
      [firmaId]
    );
    const degerler = [];
    const params = [firmaId];
    for (let i = 1; i <= 22; i++) {
      params.push(`Sayfa Eczanesi ${i}`, `eczarama-sayfa-${i}`, `eczarama-sayfa-eczaci-${i}`);
      degerler.push(`($1, $${params.length - 2}, $${params.length - 1}, $${params.length})`);
    }
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ${degerler.join(',')}`,
      params
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('arama sadece eşleşen eczaneyi gösterir', async () => {
    const res = await agent.get('/?tab=raf&ara=Sahil');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Sahil Eczanesi');
    expect(res.text).not.toContain('eczarama-sayfa-1"');
  });

  test('sayfa başına en fazla 20 aktif eczane satırı render edilir', async () => {
    const res = await agent.get('/?tab=raf');
    const satirSayisi = (res.text.match(/class="eczane-sec"/g) || []).length;
    expect(satirSayisi).toBeLessThanOrEqual(20);
  });

  test('sayfalama kontrolleri (Sayfa X / Y) gösterilir', async () => {
    const res = await agent.get('/?tab=raf');
    expect(res.text).toMatch(/Sayfa \d+ \/ \d+/);
  });

  test('ikinci sayfa farklı eczaneleri gösterir', async () => {
    const sayfa1 = await agent.get('/?tab=raf&sayfa=1');
    const sayfa2 = await agent.get('/?tab=raf&sayfa=2');
    expect(sayfa1.text).not.toBe(sayfa2.text);
  });
});
