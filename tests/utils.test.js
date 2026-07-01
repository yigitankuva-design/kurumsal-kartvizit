const { vcfOlustur } = require('../utils/vcf');

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
