// Ortak profesyonel Excel stili: koyu-altın başlık, dondurulmuş üst satır, otomatik filtre, kolon genişlikleri.
function basrilkSatiriUygula(ws, basliklar) {
  ws.addRow(basliklar);
  const satir = ws.getRow(1);
  satir.font = { bold: true, color: { argb: 'FF1A1A1A' } };
  satir.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8A84B' } };
  satir.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: basliklar.length },
  };
}

function kolonGenislikleriAyarla(ws) {
  ws.columns.forEach(col => {
    let enUzun = 10;
    col.eachCell({ includeEmpty: false }, cell => {
      const uzunluk = cell.value == null ? 0 : String(cell.value).length;
      if (uzunluk > enUzun) enUzun = uzunluk;
    });
    col.width = Math.min(enUzun + 2, 40);
  });
}

module.exports = { basrilkSatiriUygula, kolonGenislikleriAyarla };
