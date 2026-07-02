const { createJsonLimiter } = require('../middleware/rateLimiter');

describe('createJsonLimiter', () => {
  test('bir express-rate-limit middleware fonksiyonu döner', () => {
    const limiter = createJsonLimiter('test mesajı');
    expect(typeof limiter).toBe('function');
  });
});
