require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

async function firmaOlustur(paket, email) {
  const hash = await bcrypt.hash('test1234', 8);
  const r = await pool.query(
    `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [`Firma ${email}`, `firma-${email.split('@')[0]}`, email, hash, paket]
  );
  return r.rows[0].id;
}

async function girisYap(email) {
  const agent = request.agent(app);
  await agent.post('/giris').send({ giris_bilgisi: email, sifre: 'test1234' });
  return agent;
}

describe('Kurumsal panel uçları', () => {
  let kurumsalId, basicId;

  beforeAll(async () => {
    kurumsalId = await firmaOlustur('kurumsal', 'k1kurumsal@example.com');
    basicId = await firmaOlustur('basic', 'k1basic@example.com');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = ANY($1)', [[kurumsalId, basicId]]);
    await pool.end();
  });

  test('kurumsal firma eczane ekleyebilir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Deneme Eczanesi', adres: 'Merkez' });
    expect(res.statusCode).toBe(302);
    const e = await pool.query('SELECT * FROM eczaneler WHERE firma_id = $1', [kurumsalId]);
    expect(e.rows.length).toBe(1);
    expect(e.rows[0].kod).toHaveLength(8);
  });

  test('basic firma /kurumsal uçlarından redirect ile döner, kayıt oluşmaz', async () => {
    const agent = await girisYap('k1basic@example.com');
    const res = await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Yetkisiz Eczane' });
    expect(res.statusCode).toBe(302);
    const e = await pool.query('SELECT * FROM eczaneler WHERE firma_id = $1', [basicId]);
    expect(e.rows.length).toBe(0);
  });

  test('başka firmanın eczanesi düzenlenemez', async () => {
    const eczane = (await pool.query('SELECT id FROM eczaneler WHERE firma_id = $1', [kurumsalId])).rows[0];
    const digerKurumsalId = await firmaOlustur('kurumsal', 'k1diger@example.com');
    const agent = await girisYap('k1diger@example.com');
    await agent.post(`/kurumsal/eczane/${eczane.id}/duzenle`).send({ ad: 'HACKLENDI' });
    const kontrol = await pool.query('SELECT ad FROM eczaneler WHERE id = $1', [eczane.id]);
    expect(kontrol.rows[0].ad).toBe('Deneme Eczanesi');
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerKurumsalId]);
  });

  test('içerik linkleri güncellenir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent.post('/kurumsal/icerik').send({
      website: 'https://ornek.com', instagram: 'https://instagram.com/ornek',
    });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT website, instagram FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].website).toBe('https://ornek.com');
    expect(f.rows[0].instagram).toBe('https://instagram.com/ornek');
  });

  test('katalog PDF yüklenir (dev ortamında location null olsa da 302 döner)', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent
      .post('/kurumsal/katalog')
      .attach('katalog', Buffer.from('%PDF-1.4 test'), { filename: 'katalog.pdf', contentType: 'application/pdf' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?tab=icerik');
  });

  test('PDF olmayan dosya reddedilir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const res = await agent
      .post('/kurumsal/katalog')
      .attach('katalog', Buffer.from('degil'), { filename: 'resim.jpg', contentType: 'image/jpeg' });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT katalog_url FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].katalog_url).toBeNull();
  });

  test('eczane silinir', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    const eczane = (await pool.query('SELECT id FROM eczaneler WHERE firma_id = $1', [kurumsalId])).rows[0];
    await agent.post(`/kurumsal/eczane/${eczane.id}/sil`);
    const e = await pool.query('SELECT * FROM eczaneler WHERE id = $1', [eczane.id]);
    expect(e.rows.length).toBe(0);
  });

  test('kurumsal firma dashboardında Raf Kartları sekmesi ve eczane listesi görünür', async () => {
    const agent = await girisYap('k1kurumsal@example.com');
    await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Sekme Test Eczanesi' });
    const res = await agent.get('/?tab=raf');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Raf Kartları');
    expect(res.text).toContain('Sekme Test Eczanesi');
    expect(res.text).toContain('/raf/');
  });

  test('basic firma dashboardında Raf Kartları sekmesi görünmez', async () => {
    const agent = await girisYap('k1basic@example.com');
    const res = await agent.get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Raf Kartları');
  });
});
