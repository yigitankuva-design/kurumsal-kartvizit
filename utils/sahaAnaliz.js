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

function mumessilPerformansi(satirlar) {
  const altmisGunOnce = Date.now() - 60 * 86400000;
  const gerideMi = r => !r.sonZiyaret || new Date(r.sonZiyaret).getTime() < altmisGunOnce;

  // Yıldız eşiği: geride olmayanların ziyaret30'una göre 80. persentil.
  const aktifZiyaretler = satirlar.filter(r => !gerideMi(r)).map(r => r.ziyaret30).sort((a, b) => a - b);
  let esik = Infinity;
  if (aktifZiyaretler.length) {
    const idx = Math.floor(aktifZiyaretler.length * 0.8);
    esik = aktifZiyaretler[Math.min(idx, aktifZiyaretler.length - 1)];
  }

  const zenginlestir = satirlar.map(r => {
    let durum = 'normal';
    if (gerideMi(r)) durum = 'geride';
    else if (r.ziyaret30 >= esik && r.ziyaret30 > 0) durum = 'yildiz';
    return { ...r, durum };
  });

  // Sıralama: geride önce, sonra ziyaret30 azalan.
  return zenginlestir.sort((a, b) => {
    if (a.durum === 'geride' && b.durum !== 'geride') return -1;
    if (b.durum === 'geride' && a.durum !== 'geride') return 1;
    return b.ziyaret30 - a.ziyaret30;
  });
}

module.exports = { hiyerarsiAgaciKur, mumessilPerformansi };
