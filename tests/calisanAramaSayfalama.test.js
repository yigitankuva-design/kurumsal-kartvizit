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

describe('Çalışanlar sekmesi arama ve sayfalama', () => {
  let firmaId, agent;
  const firmaEmail = 'calisanaramasayfalama@example.com';

  beforeAll(async () => {
    firmaId = await firmaOlustur(firmaEmail);
    agent = await girisYap(firmaEmail);
    // Arama testi için birbirinden farklı isimli 3 çalışan
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, durum) VALUES
       ($1, 'Ahmet', 'Yılmaz', 'ahmet-yilmaz-aras', 'aktif'),
       ($1, 'Zeynep', 'Kaya', 'zeynep-kaya-aras', 'aktif'),
       ($1, 'Mehmet', 'Demir', 'mehmet-demir-aras', 'aktif')`,
      [firmaId]
    );
    // Sayfalama testi için 22 ek çalışan (sayfa boyutu 20)
    const degerler = [];
    const params = [firmaId];
    for (let i = 1; i <= 22; i++) {
      params.push(`Sayfa${i}`, `Test${i}`, `sayfa-test-${i}-aras`);
      degerler.push(`($1, $${params.length - 2}, $${params.length - 1}, $${params.length}, 'aktif')`);
    }
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug, durum) VALUES ${degerler.join(',')}`,
      params
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('arama sadece eşleşen çalışanı gösterir', async () => {
    const res = await agent.get('/?tab=calisanlar&ara=Zeynep');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Zeynep');
    // Diğer çalışanların profil URL'si (slug) sadece tablo satırında görünür —
    // "amiri seç" dropdown'ı arama filtresinden bağımsız tüm çalışanları
    // listeler (bilinçli tasarım), o yüzden düz isim yerine slug kontrol edilir.
    expect(res.text).not.toContain('ahmet-yilmaz-aras');
    expect(res.text).not.toContain('mehmet-demir-aras');
  });

  test('arama kutusu boşken tüm çalışanlar (ilk sayfa) gösterilir', async () => {
    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Ahmet');
  });

  test('sayfa başına en fazla 20 aktif çalışan satırı render edilir', async () => {
    const res = await agent.get('/?tab=calisanlar');
    const satirSayisi = (res.text.match(/class="td-name"/g) || []).length;
    expect(satirSayisi).toBeLessThanOrEqual(20);
  });

  test('ikinci sayfa farklı çalışanları gösterir', async () => {
    const sayfa1 = await agent.get('/?tab=calisanlar&sayfa=1');
    const sayfa2 = await agent.get('/?tab=calisanlar&sayfa=2');
    expect(sayfa1.text).not.toBe(sayfa2.text);
    expect(sayfa2.text).toContain('Sonraki'.length >= 0 ? 'Sayfa 2' : '');
  });

  test('sayfalama kontrolleri (Sayfa X / Y) gösterilir', async () => {
    const res = await agent.get('/?tab=calisanlar');
    expect(res.text).toMatch(/Sayfa \d+ \/ \d+/);
  });
});
