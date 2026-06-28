const { firmaSlugOlustur, calisanSlugOlustur } = require('../utils/slug');
const { vcfOlustur } = require('../utils/vcf');

describe('slug utils', () => {
  test('firmaSlugOlustur Türkçe karakterleri normalize eder', () => {
    expect(firmaSlugOlustur('Pfizer Türkiye')).toBe('pfizer-turkiye');
  });

  test('firmaSlugOlustur özel karakterleri kaldırır', () => {
    expect(firmaSlugOlustur('ABC & Co.')).toBe('abc-co');
  });

  test('calisanSlugOlustur 8 karakter üretir', () => {
    const slug = calisanSlugOlustur();
    expect(slug).toHaveLength(8);
    expect(typeof slug).toBe('string');
  });
});

describe('vcf utils', () => {
  test('vcfOlustur geçerli vCard string döner', () => {
    const calisan = {
      ad: 'Ali', soyad: 'Yılmaz', telefon: '+905321112233',
      email: 'ali@firma.com', unvan: 'Müdür', firma_ad: 'Pfizer'
    };
    const vcf = vcfOlustur(calisan);
    expect(vcf).toContain('BEGIN:VCARD');
    expect(vcf).toContain('Ali');
    expect(vcf).toContain('END:VCARD');
  });
});
