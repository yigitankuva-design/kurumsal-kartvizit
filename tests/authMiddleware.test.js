const { requireRolIzni } = require('../middleware/authMiddleware');

function sahteRes() {
  const res = {};
  res.flash = jest.fn();
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/authMiddleware — requireRolIzni', () => {
  test('req.session.rol atanmamışsa (firma sahibi) her zaman next() çağrılır', () => {
    const req = { session: {}, flash: jest.fn() };
    const res = sahteRes();
    const next = jest.fn();

    requireRolIzni('tam_yetkili')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('rol izinli listede varsa next() çağrılır', () => {
    const req = { session: { rol: 'sadece_calisan' }, flash: jest.fn() };
    const res = sahteRes();
    const next = jest.fn();

    requireRolIzni('tam_yetkili', 'sadece_calisan')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('rol izinli listede yoksa / yönlendirilir ve next() çağrılmaz', () => {
    const req = { session: { rol: 'sadece_saha' }, flash: jest.fn() };
    const res = sahteRes();
    const next = jest.fn();

    requireRolIzni('tam_yetkili', 'sadece_calisan')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(req.flash).toHaveBeenCalledWith('error', 'Bu bölüme erişim yetkiniz yok.');
  });
});
