function hiyerarsiAgaciKur(kisiler, ziyaretSayilari = {}) {
  const dugumler = new Map();
  kisiler.forEach(k => {
    dugumler.set(k.id, {
      id: k.id, ad: k.ad, soyad: k.soyad, unvan: k.unvan,
      ekip_yoneticisi: k.ekip_yoneticisi,
      kendiZiyaret: Number(ziyaretSayilari[k.id] || 0),
      ekipZiyaret: 0,
      cocuklar: [],
    });
  });
  const kokler = [];
  kisiler.forEach(k => {
    const dugum = dugumler.get(k.id);
    if (k.amiri_id != null && dugumler.has(k.amiri_id)) {
      dugumler.get(k.amiri_id).cocuklar.push(dugum);
    } else if (k.amiri_id == null) {
      kokler.push(dugum);
    }
    // amiri_id dolu ama karşılığı yoksa (kopuk): köke eklenmez, yok sayılır.
  });
  const ekipTopla = d => {
    d.ekipZiyaret = d.kendiZiyaret + d.cocuklar.reduce((t, c) => t + ekipTopla(c), 0);
    return d.ekipZiyaret;
  };
  kokler.forEach(ekipTopla);
  return kokler;
}

module.exports = { hiyerarsiAgaciKur };
