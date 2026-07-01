const { cevirmenOlustur } = require('../utils/i18n');

describe('cevirmenOlustur', () => {
  test('tr için Türkçe metin döner', () => {
    const t = cevirmenOlustur('tr');
    expect(t('telefon')).toBe('Telefon');
  });

  test('en için İngilizce metin döner', () => {
    const t = cevirmenOlustur('en');
    expect(t('telefon')).toBe('Phone');
  });

  test('desteklenmeyen dil kodu için tr\'ye düşer', () => {
    const t = cevirmenOlustur('fr');
    expect(t('telefon')).toBe('Telefon');
  });

  test('olmayan anahtar için anahtarın kendisini döner', () => {
    const t = cevirmenOlustur('tr');
    expect(t('olmayan_anahtar')).toBe('olmayan_anahtar');
  });

  test('en sözlüğünde eksik bir anahtar için tr karşılığına düşer', () => {
    const t = cevirmenOlustur('en');
    expect(t('telefon')).not.toBe('telefon');
  });
});
