const ExcelJS = require('exceljs');

function hucreDegeri(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.text !== undefined) return v.text;
    if (v.richText) return v.richText.map((rt) => rt.text).join('');
    if (v.result !== undefined) return v.result;
    return String(v);
  }
  return v;
}

async function ilkSayfaSatirlariniOku(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const headers = [];
  const rows = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = String(hucreDegeri(cell.value) || '').trim();
      });
      return;
    }
    const obj = {};
    headers.forEach((h, colNumber) => {
      if (!h) return;
      obj[h] = hucreDegeri(row.getCell(colNumber).value);
    });
    rows.push(obj);
  });

  return rows;
}

async function excelParse(buffer) {
  const rows = await ilkSayfaSatirlariniOku(buffer);

  const calisanlar = [];
  const hatalar = [];

  rows.forEach((row, i) => {
    const ad = String(row['ad'] || '').trim();
    const soyad = String(row['soyad'] || '').trim();

    if (!ad || !soyad) {
      hatalar.push(`Satır ${i + 2}: ad ve soyad zorunlu`);
      return;
    }

    const email = String(row['email'] || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      hatalar.push(`Satır ${i + 2}: geçersiz email (${email})`);
      return;
    }

    calisanlar.push({
      ad,
      soyad,
      unvan: String(row['unvan'] || '').trim() || null,
      departman: String(row['departman'] || '').trim() || null,
      telefon: String(row['telefon'] || '').trim() || null,
      email: email || null,
      linkedin: String(row['linkedin'] || '').trim() || null,
      instagram: String(row['instagram'] || '').trim() || null,
      twitter: String(row['twitter'] || '').trim() || null,
      biyografi: String(row['biyografi'] || '').trim() || null,
    });
  });

  return { calisanlar, hatalar };
}

async function eczaneExcelParse(buffer) {
  const rows = await ilkSayfaSatirlariniOku(buffer);

  const eczaneler = [];
  const hatalar = [];

  rows.forEach((row, i) => {
    const ad = String(row['ad'] || '').trim();
    if (!ad) {
      hatalar.push(`Satır ${i + 2}: ad zorunlu`);
      return;
    }
    eczaneler.push({
      ad,
      adres: String(row['adres'] || '').trim() || null,
    });
  });

  return { eczaneler, hatalar };
}

async function aoaToXlsxBuffer(satirlar, sayfaAdi) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sayfaAdi);
  sheet.addRows(satirlar);
  return workbook.xlsx.writeBuffer();
}

module.exports = { excelParse, eczaneExcelParse, aoaToXlsxBuffer };
