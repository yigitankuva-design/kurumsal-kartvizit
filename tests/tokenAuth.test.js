require('dotenv').config();
const { requireBayiToken } = require('../middleware/tokenAuth');
const { bayiTokenUret } = require('../utils/jwt');

function sahteResCevap() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/tokenAuth', () => {
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
