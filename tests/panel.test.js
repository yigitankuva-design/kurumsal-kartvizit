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
  let firmaId;
  const firmaEmail = 'panelk2@example.com';

  beforeAll(async () => {
    firmaId = await firmaOlustur(firmaEmail);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('giris_email + giris_sifre ile çalışan eklenince hash DB\'de saklanır', async () => {
    const agent = await girisYap(firmaEmail);
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
    const agent = await girisYap(firmaEmail);
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Şifresiz', soyad: 'Kişi', kvkk: 'on',
      giris_email: 'sifresiz@example.com',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['sifresiz@example.com']);
    expect(c.rows.length).toBe(0);
  });

  test('aynı giriş e-postasıyla ikinci çalışan eklenemez', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.post('/firma/panel/ekle').send({
      ad: 'Ikinci', soyad: 'Kisi', kvkk: 'on',
      giris_email: 'ali.veli@example.com', giris_sifre: 'baskasifre',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT * FROM calisanlar WHERE giris_email = $1', ['ali.veli@example.com']);
    expect(c.rows.length).toBe(1); // hala sadece ilk çalışan
  });

  test('çalışan düzenlenirken giriş e-postası boşa çekilirse giriş devre dışı kalır', async () => {
    const agent = await girisYap(firmaEmail);
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
    const agent = await girisYap(firmaEmail);
    const mevcut = (await pool.query('SELECT id FROM calisanlar WHERE firma_id = $1', [firmaId])).rows[0];
    const res = await agent.post(`/firma/panel/${mevcut.id}/durum`).send({
      _method: 'PATCH', durum: 'pasif',
    });
    expect(res.statusCode).toBe(302);
    const c = await pool.query('SELECT durum FROM calisanlar WHERE id = $1', [mevcut.id]);
    expect(c.rows[0].durum).toBe('pasif');
  });

  test('kurumsal firma çalışan panelinde giriş e-postası alanı görünür', async () => {
    const agent = await girisYap(firmaEmail);
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Giriş E-postası');
  });

  test('Excel toplu yüklenen çalışan onayli=false ile eklenir', async () => {
    const XLSX = require('xlsx');
    const agent = await girisYap(firmaEmail);
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
    const agent = await girisYap(firmaEmail);
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
    const agent = await girisYap(firmaEmail);
    const c = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug, onayli) VALUES ($1,'Onay','Bekleyen','onay-bekleyen',false) RETURNING id",
      [firmaId]
    );
    const res = await agent.post(`/firma/panel/calisan/${c.rows[0].id}/onayla`);
    expect(res.statusCode).toBe(302);
    const r = await pool.query('SELECT onayli FROM calisanlar WHERE id = $1', [c.rows[0].id]);
    expect(r.rows[0].onayli).toBe(true);
  });
});
