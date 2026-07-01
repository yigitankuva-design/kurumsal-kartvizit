const { normalizeSlug, firmaSlugOlustur, calisanSlugTabanOlustur } = require('../utils/slug');

describe('normalizeSlug', () => {
  test('Türkçe karakterleri normalize eder', () => {
    expect(normalizeSlug('Pfizer Türkiye')).toBe('pfizer-turkiye');
  });

  test('özel karakterleri kaldırır', () => {
    expect(normalizeSlug('ABC & Co.')).toBe('abc-co');
  });

  test('80 karakteri aşan girdiyi keser', () => {
    const uzunMetin = 'kelime '.repeat(20).trim();
    const sonuc = normalizeSlug(uzunMetin);
    expect(sonuc.length).toBeLessThanOrEqual(80);
    expect(sonuc.endsWith('-')).toBe(false);
  });
});

describe('firmaSlugOlustur', () => {
  test('normalizeSlug ile aynı sonucu üretir', () => {
    expect(firmaSlugOlustur('Pfizer Türkiye')).toBe('pfizer-turkiye');
  });
});

describe('calisanSlugTabanOlustur', () => {
  test('ad-soyad formatında slug üretir', () => {
    expect(calisanSlugTabanOlustur('Ali', 'Yılmaz')).toBe('ali-yilmaz');
  });

  test('Türkçe karakterli ad-soyad normalize edilir', () => {
    expect(calisanSlugTabanOlustur('Ömer', 'Çağlar')).toBe('omer-caglar');
  });
});
