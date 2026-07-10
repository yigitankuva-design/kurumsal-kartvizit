require('dotenv').config();
const { pool } = require('../db');
const { calisanAltZinciriIdleri, amiriGecerliMi } = require('../utils/hiyerarsi');

describe('utils/hiyerarsi', () => {
  let firmaId, ust, orta, alt1, alt2, ilgisiz;

  beforeAll(async () => {
    const f = await pool.query(
      "INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket) VALUES ('Hiyerarşi Test', 'hiyerarsi-test-firma', 'hiyerarsitest@example.com', 'x', 'kurumsal') RETURNING id"
    );
    firmaId = f.rows[0].id;

    ust = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, ekip_yoneticisi) VALUES ($1,'Üst','Müdür','ust-mudur-htest',true) RETURNING id", [firmaId])).rows[0].id;
    orta = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, ekip_yoneticisi, amiri_id) VALUES ($1,'Orta','Müdür','orta-mudur-htest',true,$2) RETURNING id", [firmaId, ust])).rows[0].id;
    alt1 = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, amiri_id) VALUES ($1,'Alt','Bir-htest','alt-bir-htest',$2) RETURNING id", [firmaId, orta])).rows[0].id;
    alt2 = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug, amiri_id) VALUES ($1,'Alt','Iki-htest','alt-iki-htest',$2) RETURNING id", [firmaId, orta])).rows[0].id;
    ilgisiz = (await pool.query("INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1,'Ilgisiz','Kisi-htest','ilgisiz-kisi-htest') RETURNING id", [firmaId])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('çok seviyeli zincirdeki tüm alt id\'leri döner, ilgisiz kişiyi içermez', async () => {
    const idler = await calisanAltZinciriIdleri(ust);
    expect(idler.sort()).toEqual([orta, alt1, alt2].sort());
    expect(idler).not.toContain(ilgisiz);
  });

  test('en alttaki kişinin altı boştur', async () => {
    const idler = await calisanAltZinciriIdleri(alt1);
    expect(idler).toEqual([]);
  });

  test('amiriGecerliMi: doğrudan amiri true döner', async () => {
    expect(await amiriGecerliMi(orta, alt1)).toBe(true);
  });

  test('amiriGecerliMi: üst müdür (dolaylı) false döner — sadece direkt amiri geçerli', async () => {
    expect(await amiriGecerliMi(ust, alt1)).toBe(false);
  });

  test('amiriGecerliMi: ilgisiz kişi false döner', async () => {
    expect(await amiriGecerliMi(ilgisiz, alt1)).toBe(false);
  });
});
