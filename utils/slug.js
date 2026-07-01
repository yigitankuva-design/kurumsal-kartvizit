const TURKCE_HARITA = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c' };

function normalizeSlug(metin) {
  const temiz = metin
    .toLowerCase()
    .replace(/[ğüşıöç]/g, (ch) => TURKCE_HARITA[ch])
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return temiz.slice(0, 80).replace(/-+$/, '');
}

function firmaSlugOlustur(ad) {
  return normalizeSlug(ad);
}

function calisanSlugTabanOlustur(ad, soyad) {
  return normalizeSlug(`${ad} ${soyad}`);
}

async function benzersizCalisanSlugOlustur(firmaId, ad, soyad) {
  const { pool } = require('../db');
  const taban = calisanSlugTabanOlustur(ad, soyad);
  let slug = taban;
  let sayac = 2;
  while (true) {
    const sonuc = await pool.query(
      'SELECT id FROM calisanlar WHERE firma_id = $1 AND slug = $2',
      [firmaId, slug]
    );
    if (!sonuc.rows.length) return slug;
    slug = `${taban}-${sayac}`.slice(0, 80).replace(/-+$/, '');
    sayac++;
  }
}

module.exports = { normalizeSlug, firmaSlugOlustur, calisanSlugTabanOlustur, benzersizCalisanSlugOlustur };
