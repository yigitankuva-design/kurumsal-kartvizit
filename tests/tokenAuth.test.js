require('dotenv').config();
const { pool } = require('../db');
const { requireBayiToken, requireCalisanToken, requireFirmaToken } = require('../middleware/tokenAuth');
const { bayiTokenUret, calisanTokenUret, firmaTokenUret } = require('../utils/jwt');

function sahteResCevap() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/tokenAuth — bayi', () => {
  test('geçerli Bearer token ile req.bayiId set edilir, next çağrılır', () => {
    const token = bayiTokenUret(7);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = sahteResCevap();
    const next = jest.fn();

    requireBayiToken(req, res, next);

    expect(req.bayiId).toBe(7);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('header yoksa 401 döner', () => {
    const req = { headers: {} };
    const res = sahteResCevap();
    const next = jest.fn();

    requireBayiToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('bozuk token ile 401 döner', () => {
    const req = { headers: { authorization: 'Bearer gecersiz.token.deger' } };
    const res = sahteResCevap();
    const next = jest.fn();

    requireBayiToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('middleware/tokenAuth — temsilci', () => {
  let firmaId, calisanId;

  beforeAll(async () => {
    const firma = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('Token Test Firma', 'token-test-firma', 'tokentest@example.com', 'x', 'kurumsal') RETURNING id`
    );
    firmaId = firma.rows[0].id;
    const calisan = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Test', 'Calisan', 'token-test-calisan') RETURNING id",
      [firmaId]
    );
    calisanId = calisan.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM calisanlar WHERE firma_id = $1', [firmaId]);
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
  });

  test('geçerli Bearer token ile req.calisanId set edilir, next çağrılır', async () => {
    const token = calisanTokenUret(calisanId);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = sahteResCevap();
    const next = jest.fn();

    await requireCalisanToken(req, res, next);

    expect(req.calisanId).toBe(calisanId);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('silinmiş çalışanın tokenı 401 döner', async () => {
    const silinen = await pool.query(
      "INSERT INTO calisanlar (firma_id, ad, soyad, slug, durum) VALUES ($1, 'Silinmis', 'Calisan', 'token-test-silinmis', 'silindi') RETURNING id",
      [firmaId]
    );
    const token = calisanTokenUret(silinen.rows[0].id);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = sahteResCevap();
    const next = jest.fn();

    await requireCalisanToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('header yoksa 401 döner', async () => {
    const req = { headers: {} };
    const res = sahteResCevap();
    const next = jest.fn();

    await requireCalisanToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('bozuk token ile 401 döner', async () => {
    const req = { headers: { authorization: 'Bearer gecersiz.token.deger' } };
    const res = sahteResCevap();
    const next = jest.fn();

    await requireCalisanToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('middleware/tokenAuth — firma', () => {
  test('geçerli Bearer token ile req.firmaId set edilir, next çağrılır', () => {
    const token = firmaTokenUret(55);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = sahteResCevap();
    const next = jest.fn();

    requireFirmaToken(req, res, next);

    expect(req.firmaId).toBe(55);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('header yoksa 401 döner', () => {
    const req = { headers: {} };
    const res = sahteResCevap();
    const next = jest.fn();

    requireFirmaToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('bozuk token ile 401 döner', () => {
    const req = { headers: { authorization: 'Bearer gecersiz.token.deger' } };
    const res = sahteResCevap();
    const next = jest.fn();

    requireFirmaToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
