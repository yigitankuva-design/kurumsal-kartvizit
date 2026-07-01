const { biyografiTemizle } = require('../utils/sanitize');

describe('biyografiTemizle', () => {
  test('izin verilen etiketleri korur', () => {
    expect(biyografiTemizle('<b>Merhaba</b> dünya')).toBe('<b>Merhaba</b> dünya');
  });

  test('script etiketini ve içeriğini temizler', () => {
    expect(biyografiTemizle('<script>alert(1)</script>Merhaba')).toBe('Merhaba');
  });

  test('on-event attribute temizler ama linki korur', () => {
    expect(biyografiTemizle('<a href="https://x.com" onclick="alert(1)">link</a>'))
      .toBe('<a href="https://x.com">link</a>');
  });

  test('izin verilmeyen etiketi (div) soyar ama içeriğini korur', () => {
    expect(biyografiTemizle('<div>metin</div>')).toBe('metin');
  });

  test('boş veya null girdi için null döner', () => {
    expect(biyografiTemizle(null)).toBe(null);
    expect(biyografiTemizle('')).toBe(null);
  });
});
