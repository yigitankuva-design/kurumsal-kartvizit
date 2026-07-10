require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Eczacı kartı public sayfası', () => {
  let firmaId;
  let eczaneId;
  const eczaciKod = 'eczacitest1';

  beforeAll(async () => {
    const hash = await bcrypt.hash('x', 4);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket, eczaci_baslik, eczaci_metin, eczaci_video_url, eczaci_pdf_url)
       VALUES ('Eczacı Test Firma', 'eczaci-test-firma', 'eczacitest@example.com', $1, 'kurumsal',
               'Temmuz Kampanyası', '3 al 2 öde fırsatı.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
               'https://ornek.com/egitim.pdf') RETURNING id`,
      [hash]
    );
    firmaId = f.rows[0].id;
    const e = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, adres, kod, eczaci_kod)
       VALUES ($1, 'Test Eczanesi', 'Test Mah.', 'musteritest1', $2) RETURNING id`,
      [firmaId, eczaciKod]
    );
    eczaneId = e.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('geçerli kod 200 döner, içerik gösterilir, okutma kaydedilir', async () => {
    const onceki = (await pool.query('SELECT COUNT(*) FROM eczaci_okutmalar WHERE eczane_id = $1', [eczaneId])).rows[0].count;
    const res = await request(app).get(`/eczaci/${eczaciKod}`);
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Eczacı Test Firma');
    expect(res.text).toContain('Temmuz Kampanyası');
    expect(res.text).toContain('3 al 2 öde fırsatı.');
    expect(res.text).toContain('dQw4w9WgXcQ');
    const sonraki = (await pool.query('SELECT COUNT(*) FROM eczaci_okutmalar WHERE eczane_id = $1', [eczaneId])).rows[0].count;
    expect(Number(sonraki)).toBe(Number(onceki) + 1);
  });

  test('PDF tıklaması kaydedilir ve redirect eder', async () => {
    const res = await request(app).get(`/eczaci/${eczaciKod}/tikla/pdf`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://ornek.com/egitim.pdf');
    const sayi = (await pool.query(
      "SELECT COUNT(*) FROM eczaci_tiklamalar WHERE eczane_id = $1 AND tip = 'pdf'", [eczaneId]
    )).rows[0].count;
    expect(Number(sayi)).toBeGreaterThan(0);
  });

  test('PDF linki sayfada takip edilen url üzerinden geçer', async () => {
    const res = await request(app).get(`/eczaci/${eczaciKod}`);
    expect(res.text).toContain(`/eczaci/${eczaciKod}/tikla/pdf`);
    expect(res.text).not.toContain('https://ornek.com/egitim.pdf');
  });

  test('QR kodu gösterilir, doğru domaine işaret eder', async () => {
    const res = await request(app).get(`/eczaci/${eczaciKod}`);
    expect(res.text).toContain('api.qrserver.com');
    expect(res.text).toContain('QR Kodu Göster');
    expect(res.text).not.toContain('nfckart.com');
  });

  test('geçersiz kod 404 döner', async () => {
    const res = await request(app).get('/eczaci/yokboylekod');
    expect(res.statusCode).toBe(404);
  });

  test('içerik alanları boşken "İçerik henüz eklenmedi." gösterilir', async () => {
    const bosHash = await bcrypt.hash('x', 4);
    const bosFirma = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Boş İçerik Firma', 'bos-icerik-firma', 'bosicerik@example.com', $1, 'kurumsal') RETURNING id`,
      [bosHash]
    );
    const bosEczane = await pool.query(
      `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Boş Eczane', 'musteribos1', 'eczacibos1') RETURNING id`,
      [bosFirma.rows[0].id]
    );
    const res = await request(app).get('/eczaci/eczacibos1');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('İçerik henüz eklenmedi.');
    await pool.query('DELETE FROM firmalar WHERE id = $1', [bosFirma.rows[0].id]);
  });

  describe('İndirim kodu doğrulama', () => {
    async function kodOlustur(eId, fId, yuzde = 5) {
      const r = await pool.query(
        `INSERT INTO indirim_kodlari (firma_id, eczane_id, kod, yuzde, cerez_id)
         VALUES ($1, $2, $3, $4, 'test-cerez') RETURNING kod`,
        [fId, eId, String(Math.floor(100000 + Math.random() * 900000)), yuzde]
      );
      return r.rows[0].kod;
    }

    test('geçerli kod onaylanır ve kullanıldı işaretlenir', async () => {
      const kod = await kodOlustur(eczaneId, firmaId, 5);
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.yuzde).toBe(5);
      const satir = await pool.query('SELECT kullanildi FROM indirim_kodlari WHERE kod = $1', [kod]);
      expect(satir.rows[0].kullanildi).toBe(true);
    });

    test('zaten kullanılmış kod reddedilir', async () => {
      const kod = await kodOlustur(eczaneId, firmaId, 5);
      await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      expect(res.statusCode).toBe(409);
      expect(res.body.ok).toBe(false);
    });

    test('başka eczanenin kodu reddedilir', async () => {
      const basHash = await bcrypt.hash('x', 4);
      const basFirma = await pool.query(
        `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
         VALUES ('Baska Firma Indirim', 'baska-firma-indirim', 'baskaindirim@example.com', $1, 'kurumsal') RETURNING id`,
        [basHash]
      );
      const basEczane = await pool.query(
        `INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, 'Baska Eczane', 'baskaraf1', 'baskaeczaci1') RETURNING id`,
        [basFirma.rows[0].id]
      );
      const kod = await kodOlustur(basEczane.rows[0].id, basFirma.rows[0].id, 5);
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      expect(res.statusCode).toBe(403);
      await pool.query('DELETE FROM firmalar WHERE id = $1', [basFirma.rows[0].id]);
    });

    test('süresi dolmuş (dünkü) kod reddedilir', async () => {
      const kod = await kodOlustur(eczaneId, firmaId, 5);
      await pool.query(
        "UPDATE indirim_kodlari SET olusturulma_tarihi = NOW() - INTERVAL '1 day' WHERE kod = $1",
        [kod]
      );
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod });
      expect(res.statusCode).toBe(410);
    });

    test('olmayan kod reddedilir', async () => {
      const res = await request(app).post(`/eczaci/${eczaciKod}/indirim-dogrula`).send({ kod: '000000' });
      expect(res.statusCode).toBe(404);
    });
  });
});
