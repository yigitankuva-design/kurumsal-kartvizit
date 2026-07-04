require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
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
  let kurumsalId, basicId, kurumsalAgent, basicAgent;

  beforeAll(async () => {
    kurumsalId = await firmaOlustur('kurumsal', 'k1kurumsal@example.com');
    basicId = await firmaOlustur('basic', 'k1basic@example.com');
    // createLoginLimiter IP başına 15 dakikada max 10 giriş izin verir — testler
    // arasında paylaşılan aynı agent kullanılarak login sayısı azaltılır.
    kurumsalAgent = await girisYap('k1kurumsal@example.com');
    basicAgent = await girisYap('k1basic@example.com');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = ANY($1)', [[kurumsalId, basicId]]);
    await pool.end();
  });

  test('kurumsal firma eczane ekleyebilir', async () => {
    const agent = kurumsalAgent;
    const res = await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Deneme Eczanesi', adres: 'Merkez' });
    expect(res.statusCode).toBe(302);
    const e = await pool.query('SELECT * FROM eczaneler WHERE firma_id = $1', [kurumsalId]);
    expect(e.rows.length).toBe(1);
    expect(e.rows[0].kod).toHaveLength(8);
    expect(e.rows[0].eczaci_kod).toHaveLength(8);
    expect(e.rows[0].eczaci_kod).not.toBe(e.rows[0].kod);
  });

  test('basic firma /kurumsal uçlarından redirect ile döner, kayıt oluşmaz', async () => {
    const agent = basicAgent;
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
    const agent = kurumsalAgent;
    const res = await agent.post('/kurumsal/icerik').send({
      website: 'https://ornek.com', instagram: 'https://instagram.com/ornek',
    });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT website, instagram FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].website).toBe('https://ornek.com');
    expect(f.rows[0].instagram).toBe('https://instagram.com/ornek');
  });

  test('katalog PDF yüklenir (dev ortamında location null olsa da 302 döner)', async () => {
    const agent = kurumsalAgent;
    const res = await agent
      .post('/kurumsal/katalog')
      .attach('katalog', Buffer.from('%PDF-1.4 test'), { filename: 'katalog.pdf', contentType: 'application/pdf' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?tab=icerik');
  });

  test('PDF olmayan dosya reddedilir', async () => {
    const agent = kurumsalAgent;
    const res = await agent
      .post('/kurumsal/katalog')
      .attach('katalog', Buffer.from('degil'), { filename: 'resim.jpg', contentType: 'image/jpeg' });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT katalog_url FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].katalog_url).toBeNull();
  });

  test('eczane silinir', async () => {
    const agent = kurumsalAgent;
    const eczane = (await pool.query('SELECT id FROM eczaneler WHERE firma_id = $1', [kurumsalId])).rows[0];
    await agent.post(`/kurumsal/eczane/${eczane.id}/sil`);
    const e = await pool.query('SELECT * FROM eczaneler WHERE id = $1', [eczane.id]);
    expect(e.rows.length).toBe(0);
  });

  test('kurumsal firma dashboardında Raf Kartları sekmesi ve eczane listesi görünür', async () => {
    const agent = kurumsalAgent;
    await agent.post('/kurumsal/eczane-ekle').send({ ad: 'Sekme Test Eczanesi' });
    const res = await agent.get('/?tab=raf');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Raf Kartları');
    expect(res.text).toContain('Sekme Test Eczanesi');
    expect(res.text).toContain('/raf/');
  });

  test('basic firma dashboardında Raf Kartları sekmesi görünmez', async () => {
    const agent = basicAgent;
    const res = await agent.get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Raf Kartları');
  });

  test('veri yokken saha istatistikleri sekmesi boş durum mesajı gösterir', async () => {
    const agent = kurumsalAgent;
    const res = await agent.get('/?tab=saha');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Henüz veri yok');
  });

  test('ziyaret/okutma verisi varken saha istatistikleri grafikleri gösterir', async () => {
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Saha', 'Temsilci', 'saha-temsilci-test') RETURNING id`,
      [kurumsalId]
    );
    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Saha Eczanesi', 'sahakod1') RETURNING id`,
      [kurumsalId]
    );
    await pool.query('INSERT INTO ziyaretler (calisan_id, eczane_id) VALUES ($1, $2)', [calisanSonuc.rows[0].id, eczaneSonuc.rows[0].id]);

    const agent = kurumsalAgent;
    const res = await agent.get('/?tab=saha');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('chartGunluk');
    expect(res.text).not.toContain('Henüz veri yok');
  });

  test('basic firma dashboardında Saha İstatistikleri sekmesi görünmez', async () => {
    const agent = basicAgent;
    const res = await agent.get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('Saha İstatistikleri');
  });

  test('ziyaretler excel export doğru içerik-tipiyle ve satırlarla döner', async () => {
    const agent = kurumsalAgent;
    const res = await agent.get('/kurumsal/ziyaretler-excel').buffer(true).parse((res, cb) => {
      res.setEncoding('binary');
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => cb(null, Buffer.from(data, 'binary')));
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    expect(rows[0]).toEqual(['Temsilci', 'Eczane', 'Tarih']);
    expect(rows.length).toBeGreaterThan(1); // önceki testte eklenen ziyaret satırı dahil
  });

  test('eczacı içeriği güncellenir', async () => {
    const agent = kurumsalAgent;
    const res = await agent.post('/kurumsal/eczaci-icerik').send({
      eczaci_baslik: 'Ağustos Kampanyası',
      eczaci_metin: 'Detaylar eczacımızda.',
      eczaci_video_url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(res.statusCode).toBe(302);
    const f = await pool.query('SELECT eczaci_baslik, eczaci_metin, eczaci_video_url FROM firmalar WHERE id = $1', [kurumsalId]);
    expect(f.rows[0].eczaci_baslik).toBe('Ağustos Kampanyası');
    expect(f.rows[0].eczaci_metin).toBe('Detaylar eczacımızda.');
    expect(f.rows[0].eczaci_video_url).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  test('eczacı eğitim PDF\'i yüklenir (dev ortamında location null olsa da 302 döner)', async () => {
    const agent = kurumsalAgent;
    const res = await agent
      .post('/kurumsal/eczaci-pdf')
      .attach('eczaci_pdf', Buffer.from('%PDF-1.4 test'), { filename: 'egitim.pdf', contentType: 'application/pdf' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?tab=icerik');
  });

  test('eczacı kartı kodu olmayan eczane için kod üretilir, ikinci çağrıda değişmez', async () => {
    const agent = kurumsalAgent;
    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Kod Uret Test Eczanesi', 'koduret01') RETURNING id`,
      [kurumsalId]
    );
    const eczaneId = eczaneSonuc.rows[0].id;
    const res = await agent.post(`/kurumsal/eczane/${eczaneId}/eczaci-kod-uret`);
    expect(res.statusCode).toBe(302);
    const e = await pool.query('SELECT eczaci_kod FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(e.rows[0].eczaci_kod).toHaveLength(8);

    // idempotent: ikinci çağrı mevcut kodu değiştirmez (kart fiziksel olarak yazılmış olabilir)
    await agent.post(`/kurumsal/eczane/${eczaneId}/eczaci-kod-uret`);
    const e2 = await pool.query('SELECT eczaci_kod FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(e2.rows[0].eczaci_kod).toBe(e.rows[0].eczaci_kod);
  });

  test('eczaci-kod-uret başka firmanın eczanesi için çalışmaz', async () => {
    const digerHash = await bcrypt.hash('test1234', 8);
    const digerFirma = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('K5 Diğer Firma', 'k5-diger-firma', 'k5diger@example.com', $1, 'kurumsal') RETURNING id`,
      [digerHash]
    );
    const digerEczane = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Diğer Firma Eczanesi', 'digerecz1') RETURNING id`,
      [digerFirma.rows[0].id]
    );
    const agent = kurumsalAgent;
    await agent.post(`/kurumsal/eczane/${digerEczane.rows[0].id}/eczaci-kod-uret`);
    const e = await pool.query('SELECT eczaci_kod FROM eczaneler WHERE id = $1', [digerEczane.rows[0].id]);
    expect(e.rows[0].eczaci_kod).toBeNull();
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirma.rows[0].id]);
  });

  test('İçerik sekmesinde eczacı sayfası formu görünür', async () => {
    const agent = kurumsalAgent;
    const res = await agent.get('/?tab=icerik');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Eczacı Sayfası');
    expect(res.text).toContain('eczaci_baslik');
  });

  test('Raf Kartları sekmesinde eczacı kartı sütunu ve linki görünür', async () => {
    const agent = kurumsalAgent;
    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Sütun Test Eczanesi', 'sutuntest1', 'sutuneczaci1') RETURNING id`,
      [kurumsalId]
    );
    await pool.query('INSERT INTO eczaci_okutmalar (eczane_id) VALUES ($1)', [eczaneSonuc.rows[0].id]);
    const res = await agent.get('/?tab=raf');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Eczacı Kartı');
    expect(res.text).toContain('/eczaci/sutuneczaci1');
  });

  test('çalışan kartını elle yazıldı işaretler ve geri alır', async () => {
    const c = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Elle', 'Isaret', 'elle-isaret-k') RETURNING id`,
      [kurumsalId]
    );
    const calisanId = c.rows[0].id;
    await kurumsalAgent.post(`/kurumsal/calisan/${calisanId}/kart-isaretle`).send({ yazildi: 'true' });
    let r = await pool.query('SELECT karta_yazildi FROM calisanlar WHERE id = $1', [calisanId]);
    expect(r.rows[0].karta_yazildi).toBe(true);
    await kurumsalAgent.post(`/kurumsal/calisan/${calisanId}/kart-isaretle`).send({ yazildi: 'false' });
    r = await pool.query('SELECT karta_yazildi FROM calisanlar WHERE id = $1', [calisanId]);
    expect(r.rows[0].karta_yazildi).toBe(false);
  });

  test('eczane müşteri kartını elle işaretler', async () => {
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Elle Eczane', 'elleecz1') RETURNING id`,
      [kurumsalId]
    );
    const eczaneId = e.rows[0].id;
    await kurumsalAgent.post(`/kurumsal/eczane/${eczaneId}/kart-isaretle`).send({ tip: 'musteri', yazildi: 'true' });
    const r = await pool.query('SELECT musteri_karta_yazildi, eczaci_karta_yazildi FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(r.rows[0].musteri_karta_yazildi).toBe(true);
    expect(r.rows[0].eczaci_karta_yazildi).toBe(false);
  });
});
