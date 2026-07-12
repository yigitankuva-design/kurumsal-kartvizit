const ExcelJS = require('exceljs');
const { basrilkSatiriUygula, kolonGenislikleriAyarla } = require('../utils/excelStil');

describe('excelStil', () => {
  test('basrilkSatiriUygula: başlık satırı ekler, dondurur, filtre açar, altın dolgu', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('T');
    basrilkSatiriUygula(ws, ['Ad', 'Sayı']);
    expect(ws.getRow(1).getCell(1).value).toBe('Ad');
    expect(ws.getRow(1).getCell(1).font.bold).toBe(true);
    expect(ws.getRow(1).getCell(1).fill.fgColor.argb).toBe('FFC8A84B');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });

  test('kolonGenislikleriAyarla: içerik uzunluğuna göre genişlik (min 10, max 40)', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('T');
    ws.addRow(['kısa', 'x'.repeat(100)]);
    kolonGenislikleriAyarla(ws);
    expect(ws.getColumn(1).width).toBeGreaterThanOrEqual(10);
    expect(ws.getColumn(2).width).toBe(40);
  });
});
