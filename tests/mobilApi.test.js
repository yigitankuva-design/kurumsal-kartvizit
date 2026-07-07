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
      `INSERT INTO eczaneler (firma_id, ad, kod, yonetici_notu) VALUES ($1, 'Ziyaret Eczanesi', 'ziyarkod', 'Bu eczaneye kampanya broşürü bırakılacak') RETURNING id`,
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

  test('geçerli eczane_kod ile 201 döner, eczane adı ve yönetici notuyla birlikte ve ziyaretler tablosuna kayıt düşer', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'ziyarkod', not: 'Eczacı yoğundu, tekrar uğranacak' });
    expect(res.statusCode).toBe(201);
    expect(res.body.eczaneAdi).toBe('Ziyaret Eczanesi');
    expect(res.body.yoneticiNotu).toBe('Bu eczaneye kampanya broşürü bırakılacak');
    const z = await pool.query('SELECT * FROM ziyaretler WHERE calisan_id = $1 AND eczane_id = $2', [calisanId, eczaneId]);
    expect(z.rows.length).toBe(1);
    expect(z.rows[0].temsilci_notu).toBe('Eczacı yoğundu, tekrar uğranacak');
  });

  test('not gönderilmezse temsilci_notu null kaydedilir', async () => {
    const res = await request(app)
      .post('/api/mobil/ziyaret-kaydet')
      .set('Authorization', `Bearer ${token}`)
      .send({ eczane_kod: 'ziyarkod' });
    expect(res.statusCode).toBe(201);
    const z = await pool.query(
      'SELECT * FROM ziyaretler WHERE calisan_id = $1 AND eczane_id = $2 ORDER BY created_at DESC LIMIT 1',
      [calisanId, eczaneId]
    );
    expect(z.rows[0].temsilci_notu).toBeNull();
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

    await pool.query(
      'INSERT INTO ziyaretler (calisan_id, eczane_id, temsilci_notu) VALUES ($1, $2, $3)',
      [calisanId, eczaneId, 'Stok yeterli']
    );

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
    expect(res.body.ziyaretler[0].temsilci_notu).toBe('Stok yeterli');
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/ziyaretlerim');
    expect(res.statusCode).toBe(401);
  });
});

describe('Mobil API — /api/mobil/firma-giris', () => {
  let firmaId;
  const email = 'firma-giris-test@example.com';
  const kullaniciAdi = 'firmagiristest';
  const sifre = 'test1234';

  beforeAll(async () => {
    const hash = await bcrypt.hash(sifre, 12);
    const r = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, kullanici_adi, yetkili_sifre_hash, paket)
       VALUES ('Firma Giris Test', 'firma-giris-test', $1, $2, $3, 'kurumsal') RETURNING id`,
      [email, kullaniciAdi, hash]
    );
    firmaId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('e-posta ile doğru bilgilerle token döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: email, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.firma.id).toBe(firmaId);
  });

  test('kullanıcı adı ile de token döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: kullaniciAdi, sifre });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('yanlış şifreyle 401 döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: email, sifre: 'yanlis' });
    expect(res.statusCode).toBe(401);
  });

  test('eksik alanla 400 döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: email });
    expect(res.statusCode).toBe(400);
  });

  test('kayıtlı olmayan bilgi ile 401 döner', async () => {
    const res = await request(app).post('/api/mobil/firma-giris').send({ giris_bilgisi: 'yok@example.com', sifre: 'x' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Mobil API — /api/mobil/firma/calisanlarimiz', () => {
  let firmaId, digerFirmaId, token;

  beforeAll(async () => {
    const { firmaTokenUret } = require('../utils/jwt');
    const r = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Firma Calisan Test', 'firma-calisan-test', 'fc1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = r.rows[0].id;
    token = firmaTokenUret(firmaId);
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Ali', 'Veli', 'ali-veli-fc')`,
      [firmaId]
    );
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, onayli) VALUES ($1, 'Onaysiz', 'Calisan', 'onaysiz-calisan-fc', false)`,
      [firmaId]
    );
    const d = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Diger Firma FC', 'diger-firma-fc', 'fc2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    digerFirmaId = d.rows[0].id;
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Baska', 'Kisi', 'baska-kisi-fc')`,
      [digerFirmaId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirmaId]);
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/firma/calisanlarimiz');
    expect(res.statusCode).toBe(401);
  });

  test('yalnızca kendi firmasının çalışanları döner', async () => {
    const res = await request(app)
      .get('/api/mobil/firma/calisanlarimiz')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.firma.id).toBe(firmaId);
    const adlar = res.body.calisanlar.map((c) => c.ad);
    expect(adlar).toContain('Ali');
    expect(adlar).not.toContain('Baska');
    expect(adlar).not.toContain('Onaysiz');
  });
});

describe('Mobil API — /api/mobil/firma/eczanelerimiz', () => {
  let firmaId, digerFirmaId, token;

  beforeAll(async () => {
    const { firmaTokenUret } = require('../utils/jwt');
    const r = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Firma Eczane Test', 'firma-eczane-test', 'fe1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = r.rows[0].id;
    token = firmaTokenUret(firmaId);
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Benim Eczanem', 'femus1', 'feecz1')`,
      [firmaId]
    );
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, onayli) VALUES ($1, 'Onaysiz Eczane', 'feonaysiz1', false)`,
      [firmaId]
    );
    const d = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Diger Firma FE', 'diger-firma-fe', 'fe2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    digerFirmaId = d.rows[0].id;
    await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Baska Eczane', 'febaska1')`,
      [digerFirmaId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [digerFirmaId]);
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/firma/eczanelerimiz');
    expect(res.statusCode).toBe(401);
  });

  test('yalnızca kendi firmasının eczaneleri (eczaci_kod dahil) döner', async () => {
    const res = await request(app)
      .get('/api/mobil/firma/eczanelerimiz')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const adlar = res.body.eczaneler.map((e) => e.ad);
    expect(adlar).toContain('Benim Eczanem');
    expect(adlar).not.toContain('Baska Eczane');
    expect(adlar).not.toContain('Onaysiz Eczane');
    const benim = res.body.eczaneler.find((e) => e.ad === 'Benim Eczanem');
    expect(benim.eczaci_kod).toBe('feecz1');
    expect(benim.musteri_karta_yazildi).toBe(false);
    expect(benim.eczaci_karta_yazildi).toBe(false);
  });
});

describe('Mobil API — /api/mobil/kart-yazildi', () => {
  let firmaId, calisanId, eczaneId, firmaToken;

  beforeAll(async () => {
    const { firmaTokenUret } = require('../utils/jwt');
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Kart Yazildi Test', 'kart-yazildi-test', 'ky1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = f.rows[0].id;
    firmaToken = firmaTokenUret(firmaId);
    const c = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Kart', 'Test', 'kart-test-ky') RETURNING id`,
      [firmaId]
    );
    calisanId = c.rows[0].id;
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'KY Eczane', 'kymus001', 'kyecz001') RETURNING id`,
      [firmaId]
    );
    eczaneId = e.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).post('/api/mobil/kart-yazildi').send({ tip: 'calisan', id: calisanId });
    expect(res.statusCode).toBe(401);
  });

  test('geçersiz tip 400 döner', async () => {
    const res = await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .send({ tip: 'gecersiz', id: calisanId });
    expect(res.statusCode).toBe(400);
  });

  test('çalışan kartını yazıldı işaretler', async () => {
    const res = await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .send({ tip: 'calisan', id: calisanId, kilitli: false });
    expect(res.statusCode).toBe(200);
    const c = await pool.query('SELECT karta_yazildi, kart_kilitli FROM calisanlar WHERE id = $1', [calisanId]);
    expect(c.rows[0].karta_yazildi).toBe(true);
    expect(c.rows[0].kart_kilitli).toBe(false);
  });

  test('form-urlencoded ile gönderilen kilitli=false string olarak dogru yorumlanir (mobil istemci gercek gonderim sekli)', async () => {
    const res = await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .type('form')
      .send({ tip: 'calisan', id: calisanId, kilitli: 'false' });
    expect(res.statusCode).toBe(200);
    const c = await pool.query('SELECT kart_kilitli FROM calisanlar WHERE id = $1', [calisanId]);
    expect(c.rows[0].kart_kilitli).toBe(false);
  });

  test('eczane müşteri ve eczacı kartını bağımsız işaretler', async () => {
    await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .send({ tip: 'musteri', id: eczaneId, kilitli: true });
    let e = await pool.query('SELECT musteri_karta_yazildi, musteri_kart_kilitli, eczaci_karta_yazildi FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(e.rows[0].musteri_karta_yazildi).toBe(true);
    expect(e.rows[0].musteri_kart_kilitli).toBe(true);
    expect(e.rows[0].eczaci_karta_yazildi).toBe(false);

    await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${firmaToken}`)
      .send({ tip: 'eczaci', id: eczaneId });
    e = await pool.query('SELECT eczaci_karta_yazildi FROM eczaneler WHERE id = $1', [eczaneId]);
    expect(e.rows[0].eczaci_karta_yazildi).toBe(true);
  });

  test('başka firmanın kartında 403 döner', async () => {
    const { firmaTokenUret } = require('../utils/jwt');
    const d = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('KY Diger', 'ky-diger', 'ky2@x.com', 'x', 'kurumsal') RETURNING id`
    );
    const digerToken = firmaTokenUret(d.rows[0].id);
    const res = await request(app)
      .post('/api/mobil/kart-yazildi')
      .set('Authorization', `Bearer ${digerToken}`)
      .send({ tip: 'calisan', id: calisanId });
    expect(res.statusCode).toBe(403);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [d.rows[0].id]);
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
      `INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod) VALUES ($1, 'Kendi Eczanem', 'Merkez Mah.', 'eczkend1', 'eczcaci01')`,
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
    expect(res.body.eczaneler[0].eczaci_kod).toBe('eczcaci01');
  });

  test('token yoksa 401 döner', async () => {
    const res = await request(app).get('/api/mobil/eczanelerim');
    expect(res.statusCode).toBe(401);
  });
});

describe('Mobil API — /api/mobil/katalog-durumu ve /katalog-gorundu', () => {
  let firmaId, calisanId, token;

  beforeAll(async () => {
    const { calisanTokenUret } = require('../utils/jwt');
    const firmaSonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Katalog Test Firma', 'katalog-test-firma', 'kt1@x.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firmaSonuc.rows[0].id;

    const calisanSonuc = await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug)
       VALUES ($1, 'Katalog', 'Temsilci', 'katalog-temsilci') RETURNING id`,
      [firmaId]
    );
    calisanId = calisanSonuc.rows[0].id;
    token = calisanTokenUret(calisanId);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('firma hiç katalog yüklememişse yeni_katalog_var false döner', async () => {
    const res = await request(app)
      .get('/api/mobil/katalog-durumu')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.yeni_katalog_var).toBe(false);
  });

  test('firma katalog yükledikten sonra yeni_katalog_var true döner', async () => {
    await pool.query('UPDATE firmalar SET katalog_url=$1, katalog_guncelleme_tarihi=NOW() WHERE id=$2', ['https://ornek.com/k.pdf', firmaId]);
    const res = await request(app)
      .get('/api/mobil/katalog-durumu')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.yeni_katalog_var).toBe(true);
  });

  test('katalog-gorundu sonrası yeni_katalog_var tekrar false döner', async () => {
    await request(app)
      .post('/api/mobil/katalog-gorundu')
      .set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .get('/api/mobil/katalog-durumu')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.yeni_katalog_var).toBe(false);
  });

  test('token olmadan 401 döner', async () => {
    const res = await request(app).get('/api/mobil/katalog-durumu');
    expect(res.statusCode).toBe(401);
  });
});
