function vcfOlustur(calisan) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${calisan.soyad || ''};${calisan.ad || ''};;;`,
    `FN:${calisan.ad || ''} ${calisan.soyad || ''}`,
  ];
  if (calisan.unvan) lines.push(`TITLE:${calisan.unvan}`);
  if (calisan.firma_ad) lines.push(`ORG:${calisan.firma_ad}`);
  if (calisan.telefon) lines.push(`TEL;TYPE=WORK,VOICE:${calisan.telefon}`);
  if (calisan.email) lines.push(`EMAIL;TYPE=WORK:${calisan.email}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

module.exports = { vcfOlustur };
