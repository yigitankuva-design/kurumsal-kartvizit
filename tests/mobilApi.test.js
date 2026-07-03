require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');
const { bayiTokenDogrula } = require('../utils/jwt');

describe('Mobil API — /api/mobil/giris', () => {
  let bayiId;
  const email = 'mobilapi-test-bayi@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, kullanici_adi, sifre_hash, aktif)
       VALUES ('Mobil Api Test Bayi', 'mobilapi-test-bayi', $1, 'mobilapitestbayi', $2, true)
       RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('doğru bilgilerle token döner', async () => {
    const res = await request(app)
      .post('/api/mobil/giris')
      .send({ giris_bilgisi: email, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    const payload = bayiTokenDogrula(res.body.token);
    expect(payload.bayiId).toBe(bayiId);
  });

  test('yanlış şifreyle 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/giris')
      .send({ giris_bilgisi: email, sifre: 'yanlis-sifre' });
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('eksik alanla 400 döner', async () => {
    const res = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email });
    expect(res.statusCode).toBe(400);
  });
});

describe('Mobil API — /api/mobil/musteriler', () => {
  let bayiId;
  let token;
  let firmaId;
  const email = 'mobilapi-musteri-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const bayiSonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, aktif)
       VALUES ('Mobil Musteri Test Bayi', 'mobil-musteri-test-bayi', $1, $2, true) RETURNING id`,
      [email, hash]
    );
    bayiId = bayiSonuc.rows[0].id;

    const girisRes = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email, sifre });
    token = girisRes.body.token;

    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, bayi_id)
       VALUES ('Test Musteri Firma', 'test-musteri-firma-mobil', 'x@x.com', 'x', $1) RETURNING id`,
      [bayiId]
    );
    firmaId = firmaSonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('token olmadan 401 döner', async () => {
    const res = await request(app).get('/api/mobil/musteriler');
    expect(res.statusCode).toBe(401);
  });

  test('geçerli token ile sadece kendi müşterilerini listeler', async () => {
    const res = await request(app)
      .get('/api/mobil/musteriler')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.musteriler.some(m => m.id === firmaId)).toBe(true);
  });

  test('başka bayinin müşterisine erişilemez (404)', async () => {
    const res = await request(app)
      .get('/api/mobil/musteriler/999999/calisanlar')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  test('kendi müşterisinin çalışanlarını listeler', async () => {
    const res = await request(app)
      .get(`/api/mobil/musteriler/${firmaId}/calisanlar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.calisanlar)).toBe(true);
    expect(res.body.firma.id).toBe(firmaId);
  });
});

describe('Mobil API — /api/mobil/abonelik', () => {
  let bayiId;
  let token;
  const email = 'mobilapi-abonelik-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, aktif, abonelik_bitis_tarihi)
       VALUES ('Mobil Abonelik Test Bayi', 'mobil-abonelik-test-bayi', $1, $2, true, '2099-01-01') RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
    const girisRes = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('abonelik bitiş tarihini ve aktif durumunu döner', async () => {
    const res = await request(app)
      .get('/api/mobil/abonelik')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.aktif).toBe(true);
    expect(res.body.abonelikBitisTarihi).toBeTruthy();
  });
});

describe('Mobil API — /api/mobil/profil-olustur', () => {
  let bayiId;
  let token;
  let olusturulanFirmaId;
  const email = 'mobilapi-profil-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash, aktif)
       VALUES ('Mobil Profil Test Bayi', 'mobil-profil-test-bayi', $1, $2, true) RETURNING id`,
      [email, hash]
    );
    bayiId = sonuc.rows[0].id;
    const girisRes = await request(app).post('/api/mobil/giris').send({ giris_bilgisi: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    if (olusturulanFirmaId) await pool.query('DELETE FROM firmalar WHERE id = $1', [olusturulanFirmaId]);
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
  });

  test('fotoğrafsız, geçerli veriyle profil oluşturur ve url döner', async () => {
    const res = await request(app)
      .post('/api/mobil/profil-olustur')
      .set('Authorization', `Bearer ${token}`)
      .field('ad_soyad', 'Mehmet Demir')
      .field('kvkk', 'on');
    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toContain('/mehmet-demir');
    olusturulanFirmaId = res.body.firmaId;
  });

  test('ad_soyad eksikse 400 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/profil-olustur')
      .set('Authorization', `Bearer ${token}`)
      .field('kvkk', 'on');
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('token olmadan 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/profil-olustur')
      .field('ad_soyad', 'Test Test')
      .field('kvkk', 'on');
    expect(res.statusCode).toBe(401);
  });
});

describe('Mobil API — /api/mobil/temsilci-giris', () => {
  let firmaId, calisanId;
  const email = 'temsilci-giris-test@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Temsilci Test Firma', 'temsilci-test-firma', 'x2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;
    const hash = await bcrypt.hash(sifre, 12);
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, giris_email, giris_sifre_hash)
       VALUES ($1, 'Test', 'Temsilci', 'test-temsilci', $2, $3) RETURNING id`,
      [firmaId, email, hash]
    );
    calisanId = calisanSonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('doğru bilgilerle token döner', async () => {
    const res = await request(app)
      .post('/api/mobil/temsilci-giris')
      .send({ giris_email: email, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
  });

  test('yanlış şifreyle 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/temsilci-giris')
      .send({ giris_email: email, sifre: 'yanlis' });
    expect(res.statusCode).toBe(401);
  });

  test('eksik alanla 400 döner', async () => {
    const res = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: email });
    expect(res.statusCode).toBe(400);
  });

  test('kayıtlı olmayan e-posta ile 401 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/temsilci-giris')
      .send({ giris_email: 'yok@example.com', sifre: 'herhangi' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Mobil API — /api/mobil/ziyaret-kaydet', () => {
  let firmaId, digerFirmaId, calisanId, eczaneId, digerEczaneId, token;
  const email = 'ziyaret-test-temsilci@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Ziyaret Test Firma', 'ziyaret-test-firma', 'z1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;

    const digerFirmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Diğer Firma', 'ziyaret-diger-firma', 'z2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    digerFirmaId = digerFirmaSonuc.rows[0].id;

    const hash = await bcrypt.hash(sifre, 12);
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, giris_email, giris_sifre_hash)
       VALUES ($1, 'Ziyaret', 'Temsilci', 'ziyaret-temsilci', $2, $3) RETURNING id`,
      [firmaId, email, hash]
    );
    calisanId = calisanSonuc.rows[0].id;

    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Ziyaret Eczanesi', 'ziyarkod') RETURNING id`,
      [firmaId]
    );
    eczaneId = eczaneSonuc.rows[0].id;

    const digerEczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Diğer Eczane', 'digerkod') RETURNING id`,
      [digerFirmaId]
    );
    digerEczaneId = digerEczaneSonuc.rows[0].id;

    const girisRes = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = ANY($1)', [[firmaId, digerFirmaId]]);
  });

  test('geçerli eczane_kod ile 201 döner, eczane adıyla birlikte ve ziyaretler tablosuna kayıt düşer', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'ziyarkod' });
    expect(res.statusCode).toBe(201);
    expect(res.body.eczaneAdi).toBe('Ziyaret Eczanesi');
    const z = await pool.query('SELECT * FROM ziyaretler WHERE calisan_id = $1 AND eczane_id = $2', [calisanId, eczaneId]);
    expect(z.rows.length).toBe(1);
  });

  test('başka firmanın eczanesiyle 403 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'digerkod' });
    expect(res.statusCode).toBe(403);
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).post('/api/mobil/ziyaret-kaydet').send({ eczane_kod: 'ziyarkod' });
    expect(res.statusCode).toBe(401);
  });

  test('geçersiz eczane_kod ile 404 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'yokkod12' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Mobil API — /api/mobil/ziyaretlerim', () => {
  let firmaId, calisanId, eczaneId, token;
  const email = 'ziyaretlerim-test-temsilci@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Ziyaretlerim Test Firma', 'ziyaretlerim-test-firma', 'zl1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;

    const hash = await bcrypt.hash(sifre, 12);
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, giris_email, giris_sifre_hash)
       VALUES ($1, 'Ziyaretlerim', 'Temsilci', 'ziyaretlerim-temsilci', $2, $3) RETURNING id`,
      [firmaId, email, hash]
    );
    calisanId = calisanSonuc.rows[0].id;

    const eczaneSonuc = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Ziyaretlerim Eczanesi', 'zlkod1') RETURNING id`,
      [firmaId]
    );
    eczaneId = eczaneSonuc.rows[0].id;

    await pool.query('INSERT INTO ziyaretler (calisan_id, eczane_id) VALUES ($1, $2)', [calisanId, eczaneId]);

    const girisRes = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('kendi ziyaretlerini eczane adıyla döner', async () => {
    const res = await request(app)
      .get('/api/mobil/ziyaretlerim')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ziyaretler.length).toBe(1);
    expect(res.body.ziyaretler[0].eczane_adi).toBe('Ziyaretlerim Eczanesi');
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/ziyaretlerim');
    expect(res.statusCode).toBe(401);
  });
});

describe('Mobil API — /api/mobil/eczanelerim', () => {
  let firmaId, digerFirmaId, calisanId, token;
  const email = 'eczanelerim-test-temsilci@example.com';
  const sifre = 'test1234';

  beforeAll(async () => {
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Eczanelerim Test Firma', 'eczanelerim-test-firma', 'ecz1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;

    const digerFirmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Eczanelerim Diğer Firma', 'eczanelerim-diger-firma', 'ecz2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    digerFirmaId = digerFirmaSonuc.rows[0].id;

    const hash = await bcrypt.hash(sifre, 12);
    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, giris_email, giris_sifre_hash)
       VALUES ($1, 'Eczaneler', 'Temsilci', 'eczanelerim-temsilci', $2, $3) RETURNING id`,
      [firmaId, email, hash]
    );
    calisanId = calisanSonuc.rows[0].id;

    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, adres, kod) VALUES ($1, 'Kendi Eczanem', 'Merkez Mah.', 'eczkend1')`,
      [firmaId]
    );
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Baskasinin Eczanesi', 'eczdigr1')`,
      [digerFirmaId]
    );

    const girisRes = await request(app).post('/api/mobil/temsilci-giris').send({ giris_email: email, sifre });
    token = girisRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = ANY($1)', [[firmaId, digerFirmaId]]);
  });

  test('sadece kendi firmasının eczanelerini döner', async () => {
    const res = await request(app)
      .get('/api/mobil/eczanelerim')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.eczaneler.length).toBe(1);
    expect(res.body.eczaneler[0].ad).toBe('Kendi Eczanem');
    expect(res.body.eczaneler[0].kod).toBe('eczkend1');
    expect(res.body.eczaneler[0].adres).toBe('Merkez Mah.');
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/eczanelerim');
    expect(res.statusCode).toBe(401);
  });
});
