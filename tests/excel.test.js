const ExcelJS = require('exceljs');
const { excelParse, eczaneExcelParse } = require('../utils/excel');

async function bufferOlustur(satirlar) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Eczaneler');
  sheet.addRows(satirlar);
  return workbook.xlsx.writeBuffer();
}

describe('utils/excel — excelParse', () => {
  test('linkedin, instagram ve twitter kolonlarını okur', async () => {
    const buf = await bufferOlustur([
      ['ad', 'soyad', 'linkedin', 'instagram', 'twitter'],
      ['Murat', 'Özdemir', 'https://linkedin.com/in/murat', '@murat', '@muratx'],
    ]);
    const { calisanlar, hatalar } = await excelParse(buf);
    expect(hatalar).toHaveLength(0);
    expect(calisanlar[0].linkedin).toBe('https://linkedin.com/in/murat');
    expect(calisanlar[0].instagram).toBe('@murat');
    expect(calisanlar[0].twitter).toBe('@muratx');
  });
});

describe('utils/excel — eczaneExcelParse', () => {
  test('geçerli satırları ad ve adres ile döner', async () => {
    const buf = await bufferOlustur([
      ['ad', 'adres'],
      ['Merkez Eczanesi', 'Ana Cad. 5'],
      ['Şube Eczanesi', ''],
    ]);
    const { eczaneler, hatalar } = await eczaneExcelParse(buf);
    expect(hatalar).toHaveLength(0);
    expect(eczaneler).toHaveLength(2);
    expect(eczaneler[0]).toEqual({ ad: 'Merkez Eczanesi', adres: 'Ana Cad. 5' });
    expect(eczaneler[1]).toEqual({ ad: 'Şube Eczanesi', adres: null });
  });

  test('ad boş olan satırı hata listesine ekler, diğerlerini işler', async () => {
    const buf = await bufferOlustur([
      ['ad', 'adres'],
      ['', 'Adres var ama ad yok'],
      ['Geçerli Eczane', 'Adres'],
    ]);
    const { eczaneler, hatalar } = await eczaneExcelParse(buf);
    expect(eczaneler).toHaveLength(1);
    expect(eczaneler[0].ad).toBe('Geçerli Eczane');
    expect(hatalar).toHaveLength(1);
    expect(hatalar[0]).toContain('Satır 2');
  });
});
