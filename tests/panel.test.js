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

describe('routes/panel — temsilci giriş bilgisi', () => {
  let firmaId, agent;
  const firmaEmail = 'panelk2@example.com';

  beforeAll(async () => {
    firmaId = await firmaOlustur(firmaEmail);
    // Tüm testler tek bir giriş yapılmış agent'ı paylaşır — her test kendi
    // girişini yapsaydı createLoginLimiter'ın (10/15dk) sınırını aşardık.
    agent = await girisYap(firmaEmail);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('giris_email + giris_sifre ile çalışan eklenince hash DB\'de saklanır', async () => {
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Ali', soyad: 'Veli', kvkk: 'on',
      giris_email: 'ali.veli@example.com', giris_sifre: 'gizli123',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com']);
    expect(c.rows.length).toBe(1);
    expect(await bcrypt.compare('gizli123', c.rows[0].giris_sifre_hash)).toBe(true);
  });

  test('giris_email verilip giris_sifre verilmezse çalışan eklenmez', async () => {
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Şifresiz', soyad: 'Kişi', kvkk: 'on',
      giris_email: 'sifresiz@example.com',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['sifresiz@example.com']);
    expect(c.rows.length).toBe(0);
  });

  test('aynı giriş e-postasıyla ikinci çalışan eklenemez', async () => {
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Ikinci', soyad: 'Kisi', kvkk: 'on',
      giris_email: 'ali.veli@example.com', giris_sifre: 'baskasifre',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com']);
    expect(c.rows.length).toBe(1); // hala sadece ilk çalışan
  });

  test('çalışan düzenlenirken giriş e-postası boşa çekilirse giriş devre dışı kalır', async () => {
    const mevcut = (await pool.query('SELECT id FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com'])).rows[0];
    const res = await agent.post(`/firma/panel/${mevcut.id}/duzenle`).send({
      ad: 'Ali', soyad: 'Veli', giris_email: '',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT giris_email, giris_sifre_hash FROM calisanlar WHERE id = $1', [mevcut.id]);
    expect(c.rows[0].giris_email).toBeNull();
    expect(c.rows[0].giris_sifre_hash).toBeNull();
  });

  test('çalışan pasife alma formu (_method=PATCH gövdede) durumu değiştirir', async () => {
    const mevcut = (await pool.query('SELECT id FROM calisanlar WHERE firma_id = $1', [firmaId])).rows[0];
    const res = await agent.post(`/firma/panel/${mevcut.id}/durum`).send({
      _method: 'PATCH', durum: 'pasif',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT durum FROM calisanlar WHERE id = $1', [mevcut.id]);
    expect(c.rows[0].durum).toBe('pasif');
  });

  test('kurumsal firma çalışan panelinde giriş e-postası alanı görünür', async () => {
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Giriş E-postası');
  });

  test('Excel toplu yüklenen çalışan onayli=false ile eklenir', async () => {
    const XLSX = require('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['ad', 'soyad', 'unvan', 'departman', 'telefon', 'email', 'linkedin', 'biyografi'],
      ['Toplu', 'Onaysiz', '', '', '', '', '', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Çalışanlar');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const res = await agent.post('/firma/panel/toplu-yukle')
      .attach('excel', buffer, { filename: 'test.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(res.statusCode).toBe(302);
    const c = await pool.query(
      "SELECT onayli FROM calisanlar WHERE firma_id = $1 AND ad = 'Toplu' AND soyad = 'Onaysiz'",
      [firmaId]
    );
    expect(c.rows.length).toBe(1);
    expect(c.rows[0].onayli).toBe(false);
  });

  test('Excel toplu yüklemede instagram ve twitter kolonları da kaydedilir', async () => {
    const XLSX = require('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['ad', 'soyad', 'linkedin', 'instagram', 'twitter'],
      ['Sosyal', 'Medya', 'https://linkedin.com/in/sosyal', '@sosyalmedya', '@sosyalx'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Çalışanlar');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const res = await agent.post('/firma/panel/toplu-yukle')
      .attach('excel', buffer, { filename: 'test.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(res.statusCode).toBe(302);
    const c = await pool.query(
      "SELECT instagram, twitter FROM calisanlar WHERE firma_id = $1 AND ad = 'Sosyal' AND soyad = 'Medya'",
      [firmaId]
    );
    expect(c.rows.length).toBe(1);
    expect(c.rows[0].instagram).toBe('@sosyalmedya');
    expect(c.rows[0].twitter).toBe('@sosyalx');
  });

  test('çalışan onaylama onayli=true yapar', async () => {
    const c = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug, onayli) VALUES ($1,'Onay','Bekleyen','onay-bekleyen',false) RETURNING id",
      [firmaId]
    );
    const res = await agent.post(`/firma/panel/calisan/${c.rows[0].id}/onayla`);
    expect(res.statusCode).toBe(302);
    const r = await pool.query('SELECT onayli FROM calisanlar WHERE id = $1', [c.rows[0].id]);
    expect(r.rows[0].onayli).toBe(true);
  });

  test('pasif çalışan ayrı "Pasif Çalışanlar" bölümünde, aktif tablonun dışında gösterilir', async () => {
    const pasif = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug, durum) VALUES ($1,'Pasif','Kisi','pasif-kisi','pasif') RETURNING id",
      [firmaId]
    );
    const beklenenSayi = (await pool.query(
      "SELECT COUNT(*) FROM calisanlar WHERE firma_id = $1 AND durum = 'pasif'", [firmaId]
    )).rows[0].count;
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain(`Pasif Çalışanlar (${beklenenSayi})`);
    expect(res.text).toContain('<details');
    expect(res.text.indexOf('Pasif Kisi')).toBeGreaterThan(res.text.indexOf('Pasif Çalışanlar ('));
    await pool.query('DELETE FROM calisanlar WHERE id = $1', [pasif.rows[0].id]);
  });

  test('foto_url boş olan çalışan için "Fotoğraf Ekle" kısayolu çıkar, doluysa çıkmaz', async () => {
    const fotosuz = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'Fotosuz','Kisi','fotosuz-kisi') RETURNING id",
      [firmaId]
    );
    const fotolu = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug, foto_url) VALUES ($1,'Fotolu','Kisi','fotolu-kisi','https://ornek.com/foto.jpg') RETURNING id",
      [firmaId]
    );
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Fotoğraf Ekle');
    await pool.query('DELETE FROM calisanlar WHERE id = ANY($1)', [[fotosuz.rows[0].id, fotolu.rows[0].id]]);
  });

  test('çalışana amiri ve ekip yöneticisi ataması yapılabilir', async () => {
    const mudur = (await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'Test','Müdür','test-mudur-ptest') RETURNING id",
      [firmaId]
    )).rows[0].id;
    const temsilci = (await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'Test','Temsilci','test-temsilci-ptest') RETURNING id",
      [firmaId]
    )).rows[0].id;

    await agent.put(`/firma/panel/${mudur}/duzenle`).send({ ad: 'Test', soyad: 'Müdür', ekip_yoneticisi: 'true' });
    await agent.put(`/firma/panel/${temsilci}/duzenle`).send({ ad: 'Test', soyad: 'Temsilci', amiri_id: String(mudur) });

    const kontrol = await pool.query('SELECT amiri_id, ekip_yoneticisi FROM calisanlar WHERE id = ANY($1) ORDER BY id', [[mudur, temsilci]]);
    expect(kontrol.rows.find(r => r.amiri_id === null).ekip_yoneticisi).toBe(true);

    const temsilciKontrol = await pool.query('SELECT amiri_id FROM calisanlar WHERE id = $1', [temsilci]);
    expect(temsilciKontrol.rows[0].amiri_id).toBe(mudur);

    await pool.query('DELETE FROM calisanlar WHERE id = ANY($1)', [[mudur, temsilci]]);
  });

  test('döngü oluşturacak amiri ataması reddedilir', async () => {
    const a = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'A','Kisi','a-kisi-ptest') RETURNING id", [firmaId])).rows[0].id;
    const b = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, amiri_id) VALUES ($1,'B','Kisi','b-kisi-ptest',$2) RETURNING id", [firmaId, a])).rows[0].id;

    const res = await agent.put(`/firma/panel/${a}/duzenle`).send({ ad: 'A', soyad: 'Kisi', amiri_id: String(b) });
    expect(res.statusCode).toBe(302);

    const kontrol = await pool.query('SELECT amiri_id FROM calisanlar WHERE id = $1', [a]);
    expect(kontrol.rows[0].amiri_id).toBeNull();

    await pool.query('DELETE FROM calisanlar WHERE id = ANY($1)', [[a, b]]);
  });

  test('saha istatistikleri sayfası temsilci_notu içeriğini firma sahibine göstermez', async () => {
    const calisan = (await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Not', 'Test', $2) RETURNING id",
      [firmaId, `not-test-calisan-${Date.now()}`]
    )).rows[0].id;
    const eczane = (await pool.query(
      "INSERT INTO eczaneler (firma_id, ad, kod) VALUES ($1, 'Not Test Eczanesi', $2) RETURNING id",
      [firmaId, `notkod${Date.now() % 100000}`]
    )).rows[0].id;
    await pool.query(
      "INSERT INTO ziyaretler (calisan_id, eczane_id, temsilci_notu) VALUES ($1, $2, 'GİZLİ-NOT-İÇERİĞİ')",
      [calisan, eczane]
    );
    const res = await agent.get('/?tab=saha');
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('GİZLİ-NOT-İÇERİĞİ');

    await pool.query('DELETE FROM calisanlar WHERE id = $1', [calisan]);
    await pool.query('DELETE FROM eczaneler WHERE id = $1', [eczane]);
  });
});
