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

// Hücre-içi yatay bar grafik (Excel data bar) — bir kolonu görsel çubuklara çevirir.
function veriCubugu(ws, aralik, argb) {
  ws.addConditionalFormatting({
    ref: aralik,
    rules: [{
      type: 'dataBar',
      cfvo: [{ type: 'min' }, { type: 'max' }],
      color: { argb: argb || 'FF4E9AE0' },
      gradient: true,
      border: false,
    }],
  });
}

// Isı haritası — düşük kırmızı, orta sarı, yüksek yeşil.
function renkSkalasi(ws, aralik) {
  ws.addConditionalFormatting({
    ref: aralik,
    rules: [{
      type: 'colorScale',
      cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
      color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
    }],
  });
}

// 3 renkli trafik-ışığı ikon seti (yön/durum göstergesi).
function ikonSeti(ws, aralik) {
  ws.addConditionalFormatting({
    ref: aralik,
    rules: [{
      type: 'iconSet',
      iconSet: '3TrafficLights1',
      cfvo: [{ type: 'percent', value: 0 }, { type: 'percent', value: 33 }, { type: 'percent', value: 67 }],
    }],
  });
}

module.exports = { basrilkSatiriUygula, kolonGenislikleriAyarla, veriCubugu, renkSkalasi, ikonSeti };
