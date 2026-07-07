const XLSX = require('xlsx');

function excelParse(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

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

function eczaneExcelParse(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

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

module.exports = { excelParse, eczaneExcelParse };
