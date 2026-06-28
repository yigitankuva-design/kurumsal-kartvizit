const { nanoid } = require('nanoid');

function firmaSlugOlustur(ad) {
  return ad
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function calisanSlugOlustur() {
  return nanoid(8);
}

module.exports = { firmaSlugOlustur, calisanSlugOlustur };
