# Firma Paneli — Saha & Hiyerarşi UX Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firma panelinde hiyerarşiyi görsel ağaç olarak göstermek, saha raporlarını KPI şeridi + akıllı soru chip'leri (tıkla→anlık rapor) ile toparlamak ve Excel dışa aktarımlarını profesyonelleştirmek.

**Architecture:** Saf dönüşümler `utils/sahaAnaliz.js` (ağaç + performans) ve `utils/excelStil.js` (exceljs stil) — jest ile TDD. Veri montajı `app.js` GET `/` handler'ında; görsel `views/public/dashboard.ejs` (Organizasyon sekmesi + Saha KPI/chip'ler). Excel yükseltmesi `routes/kurumsal.js`. Ek npm bağımlılığı yok.

**Tech Stack:** Node/Express, EJS, PostgreSQL (pg), exceljs, jest+supertest.

**Referans spec:** `docs/superpowers/specs/2026-07-12-panel-saha-hiyerarsi-ux-design.md`

**Doğrulanmış kod gerçekleri:**
- Dashboard `app.js` GET `/` içinde render ediliyor; `calisanlar` = `SELECT * FROM calisanlar WHERE firma_id=$1` (id, ad, soyad, unvan, amiri_id, ekip_yoneticisi, durum dahil) `app.js:222`. `sahaIstatistik` bloğu `app.js:399-466`, render `app.js:471-475`.
- Excel: `routes/kurumsal.js` — `ziyaretler-excel` (`:186`, `aoaToXlsxBuffer` kullanıyor), `rapor-excel` (`:212`, inline `basliklariUygula` + 4 sheet), `const ExcelJS = require('exceljs')` (`:3`).
- Saha grubunda `tab==='saha'` kurumsal pakete özel; `aktifGrup` `dashboard.ejs`'te tab'dan türetiliyor; sekme linkleri `dashboard.ejs:515-536`.
- Durum renk değişkenleri mevcut: `--success`, `--danger`, `--gold`. Stat kart sınıfı `stat-card`, tablo sarıcı `table-wrap`.

---

## Dosya yapısı
- **Create:** `utils/sahaAnaliz.js` — `hiyerarsiAgaciKur`, `mumessilPerformansi` (saf).
- **Create:** `tests/sahaAnaliz.test.js`.
- **Create:** `utils/excelStil.js` — `basrilkSatiriUygula`, `kolonGenislikleriAyarla` (saf, exceljs sheet üstünde).
- **Create:** `tests/excelStil.test.js`.
- **Modify:** `app.js` — organizasyon veri + saha performans/akıllı sorular/KPI.
- **Modify:** `views/public/dashboard.ejs` — Organizasyon sekmesi + Saha KPI/chip/rapor kartları + arama.
- **Modify:** `routes/kurumsal.js` — `rapor-excel` (Özet + Performans sheet + stil), `ziyaretler-excel` (stil).

---

### Task 1: `hiyerarsiAgaciKur` (saf, TDD)

**Files:**
- Create: `utils/sahaAnaliz.js`
- Test: `tests/sahaAnaliz.test.js`

- [ ] **Step 1: Testi yaz**

```js
// tests/sahaAnaliz.test.js
const { hiyerarsiAgaciKur } = require('../utils/sahaAnaliz');

describe('hiyerarsiAgaciKur', () => {
  const kisiler = [
    { id: 1, ad: 'Genel', soyad: 'Müdür', unvan: 'Genel Müdür', amiri_id: null, ekip_yoneticisi: true },
    { id: 2, ad: 'Bölge', soyad: 'A', unvan: 'Bölge Müdürü', amiri_id: 1, ekip_yoneticisi: true },
    { id: 3, ad: 'Mümessil', soyad: 'X', unvan: 'Tıbbi Mümessil', amiri_id: 2, ekip_yoneticisi: false },
    { id: 4, ad: 'Mümessil', soyad: 'Y', unvan: 'Tıbbi Mümessil', amiri_id: 2, ekip_yoneticisi: false },
  ];
  const ziyaret = { 1: 0, 2: 5, 3: 10, 4: 7 };

  test('tek kök (amiri_id null) döner', () => {
    const kokler = hiyerarsiAgaciKur(kisiler, ziyaret);
    expect(kokler).toHaveLength(1);
    expect(kokler[0].id).toBe(1);
  });

  test('iç içe çocuklar doğru bağlanır', () => {
    const [gm] = hiyerarsiAgaciKur(kisiler, ziyaret);
    expect(gm.cocuklar).toHaveLength(1);
    expect(gm.cocuklar[0].id).toBe(2);
    expect(gm.cocuklar[0].cocuklar.map(c => c.id).sort()).toEqual([3, 4]);
  });

  test('ekipZiyaret = kendi + tüm alt ağaç', () => {
    const [gm] = hiyerarsiAgaciKur(kisiler, ziyaret);
    expect(gm.ekipZiyaret).toBe(22); // 0+5+10+7
    expect(gm.cocuklar[0].ekipZiyaret).toBe(22); // bölge: 5+10+7
    expect(gm.cocuklar[0].cocuklar.find(c => c.id === 3).kendiZiyaret).toBe(10);
  });

  test('kopuk amiri_id (var olmayan) güvenli — o kişi köke düşmez, yok sayılır', () => {
    const bozuk = [...kisiler, { id: 9, ad: 'Kopuk', soyad: 'Z', unvan: 'Tıbbi Mümessil', amiri_id: 999, ekip_yoneticisi: false }];
    const kokler = hiyerarsiAgaciKur(bozuk, { ...ziyaret, 9: 3 });
    const tumIdler = [];
    const gez = n => { tumIdler.push(n.id); n.cocuklar.forEach(gez); };
    kokler.forEach(gez);
    expect(tumIdler).not.toContain(9);
  });
});
```

- [ ] **Step 2: Testi çalıştır — kırmızı**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/sahaAnaliz.test.js -t hiyerarsiAgaciKur`
Expected: FAIL — "hiyerarsiAgaciKur is not a function".

- [ ] **Step 3: Uygula**

```js
// utils/sahaAnaliz.js
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
```

- [ ] **Step 4: Testi çalıştır — yeşil**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/sahaAnaliz.test.js -t hiyerarsiAgaciKur`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/kurumsal-kartvizit && git add utils/sahaAnaliz.js tests/sahaAnaliz.test.js && git commit -m "Panel saha: hiyerarsiAgaciKur + test"
```

---

### Task 2: `mumessilPerformansi` (saf, TDD)

**Files:**
- Modify: `utils/sahaAnaliz.js`
- Test: `tests/sahaAnaliz.test.js`

- [ ] **Step 1: Testi yaz** (dosyanın sonuna ekle)

```js
const { mumessilPerformansi } = require('../utils/sahaAnaliz');

describe('mumessilPerformansi', () => {
  const bugun = Date.now();
  const gunOnce = g => new Date(bugun - g * 86400000);
  const satirlar = [
    { id: 1, ad: 'A', soyad: 'A', unvan: 'Tıbbi Mümessil', ziyaret30: 20, ziyaret90: 50, sonZiyaret: gunOnce(1) },
    { id: 2, ad: 'B', soyad: 'B', unvan: 'Tıbbi Mümessil', ziyaret30: 2, ziyaret90: 6, sonZiyaret: gunOnce(80) },
    { id: 3, ad: 'C', soyad: 'C', unvan: 'Tıbbi Mümessil', ziyaret30: 0, ziyaret90: 0, sonZiyaret: null },
    { id: 4, ad: 'D', soyad: 'D', unvan: 'Tıbbi Mümessil', ziyaret30: 5, ziyaret90: 15, sonZiyaret: gunOnce(3) },
    { id: 5, ad: 'E', soyad: 'E', unvan: 'Tıbbi Mümessil', ziyaret30: 4, ziyaret90: 12, sonZiyaret: gunOnce(4) },
  ];

  test('60+ gün veya hiç ziyaret → geride', () => {
    const s = mumessilPerformansi(satirlar);
    expect(s.find(r => r.id === 2).durum).toBe('geride');
    expect(s.find(r => r.id === 3).durum).toBe('geride');
  });

  test('üst %20 (en yüksek ziyaret30) → yildiz', () => {
    const s = mumessilPerformansi(satirlar);
    expect(s.find(r => r.id === 1).durum).toBe('yildiz');
  });

  test('geride olanlar listenin başında', () => {
    const s = mumessilPerformansi(satirlar);
    const ilkIki = s.slice(0, 2).map(r => r.durum);
    expect(ilkIki.every(d => d === 'geride')).toBe(true);
  });
});
```

- [ ] **Step 2: Testi çalıştır — kırmızı**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/sahaAnaliz.test.js -t mumessilPerformansi`
Expected: FAIL — "mumessilPerformansi is not a function".

- [ ] **Step 3: Uygula** (`module.exports`'tan önce ekle, exports'a `mumessilPerformansi` ekle)

```js
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
```

- [ ] **Step 4: Testi çalıştır — yeşil**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/sahaAnaliz.test.js`
Expected: PASS (her iki describe yeşil).

- [ ] **Step 5: Commit**

```bash
cd ~/kurumsal-kartvizit && git add utils/sahaAnaliz.js tests/sahaAnaliz.test.js && git commit -m "Panel saha: mumessilPerformansi + test"
```

---

### Task 3: `utils/excelStil.js` (saf, TDD)

**Files:**
- Create: `utils/excelStil.js`
- Test: `tests/excelStil.test.js`

- [ ] **Step 1: Testi yaz**

```js
// tests/excelStil.test.js
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
```

- [ ] **Step 2: Testi çalıştır — kırmızı**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/excelStil.test.js`
Expected: FAIL — "basrilkSatiriUygula is not a function".

- [ ] **Step 3: Uygula**

```js
// utils/excelStil.js
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
```

- [ ] **Step 4: Testi çalıştır — yeşil**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/excelStil.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/kurumsal-kartvizit && git add utils/excelStil.js tests/excelStil.test.js && git commit -m "Panel saha: excelStil yardimcilari + test"
```

---

### Task 4: `app.js` — Organizasyon sekmesi verisi (hiyerarşi ağacı)

**Files:**
- Modify: `app.js`

- [ ] **Step 1: `hiyerarsiAgaciKur` import et** — `app.js` üst kısmındaki require blokuna ekle (diğer `require('./utils/...')` satırlarının yanına):

```js
const { hiyerarsiAgaciKur } = require('./utils/sahaAnaliz');
```

- [ ] **Step 2: Organizasyon verisini hesapla** — `app.js`'te `let genelBakis = null;` satırından ÖNCE (yani `kullanicilarListesi` bloğundan sonra, ~`app.js:254`) ekle:

```js
    let hiyerarsiAgaci = [];
    if (tab === 'organizasyon' && calisanlar.length) {
      const ziyaretSayiResult = await pool.query(
        `SELECT z.calisan_id, COUNT(*) AS sayi
         FROM ziyaretler z JOIN calisanlar c ON c.id = z.calisan_id
         WHERE c.firma_id = $1 AND z.created_at >= NOW() - INTERVAL '90 days'
         GROUP BY z.calisan_id`,
        [req.session.firmaId]
      );
      const ziyaretMap = {};
      ziyaretSayiResult.rows.forEach(r => { ziyaretMap[r.calisan_id] = Number(r.sayi); });
      const aktifCalisanlar = calisanlar.filter(c => c.durum === 'aktif');
      hiyerarsiAgaci = hiyerarsiAgaciKur(aktifCalisanlar, ziyaretMap);
    }
```

- [ ] **Step 3: `organizasyon`'u çalışan-rolü tab listesine ekle** — `app.js`'teki `CALISAN_ROLU_TABLARI` dizisine `'organizasyon'` ekle:

```js
    const CALISAN_ROLU_TABLARI = ['calisanlar', 'istatistik', 'excel', 'genel', 'analytics', 'gecmis', 'organizasyon'];
```

- [ ] **Step 4: Render payload'a ekle** — `res.render('public/dashboard', { ... })` çağrısındaki nesneye `hiyerarsiAgaci` ekle (mevcut `rol: req.session.rol` satırının yanına):

```js
      indirimIstatistik, ara, sayfa, islemGecmisi, genelBakis, kullanicilarListesi, hiyerarsiAgaci, rol: req.session.rol
```

- [ ] **Step 5: Sözdizimi + sunucu ayağa kalkıyor mu**

Run: `cd ~/kurumsal-kartvizit && node -e "require('./app'); console.log('app yuklendi')" ; echo done`
Expected: "app yuklendi" (veya port dinleme logu) — sözdizimi hatası YOK. (Ctrl+C ile kapat; süreç dinlemede kalırsa `timeout 5 node ...` da olur.)

- [ ] **Step 6: Commit**

```bash
cd ~/kurumsal-kartvizit && git add app.js && git commit -m "Panel saha: organizasyon sekmesi hiyerarsi agaci verisi"
```

---

### Task 5: `app.js` — Saha performans + akıllı sorular + KPI

**Files:**
- Modify: `app.js`

- [ ] **Step 1: `mumessilPerformansi` importunu genişlet** — Task 4'teki import satırını güncelle:

```js
const { hiyerarsiAgaciKur, mumessilPerformansi } = require('./utils/sahaAnaliz');
```

- [ ] **Step 2: Saha bloğuna performans + akıllı sorular + KPI ekle** — `app.js`'te `sahaIstatistik = { ... }` ataması (`app.js:455-465`) tamamlandıktan HEMEN SONRA, `if (tab === 'saha' ...)` bloğunun içinde, kapanış `}`'sinden önce ekle:

```js
      // Performans (soru 1-2-3)
      const perfResult = await pool.query(
        `SELECT c.id, c.ad, c.soyad, c.unvan,
                COUNT(*) FILTER (WHERE z.created_at >= NOW() - INTERVAL '30 days') AS ziyaret30,
                COUNT(*) FILTER (WHERE z.created_at >= NOW() - INTERVAL '90 days') AS ziyaret90,
                MAX(z.created_at) AS son_ziyaret
         FROM calisanlar c LEFT JOIN ziyaretler z ON z.calisan_id = c.id
         WHERE c.firma_id = $1 AND c.durum = 'aktif' AND c.ekip_yoneticisi = false
         GROUP BY c.id, c.ad, c.soyad, c.unvan`,
        [req.session.firmaId]
      );
      const perfSatir = perfResult.rows.map(r => ({
        id: r.id, ad: r.ad, soyad: r.soyad, unvan: r.unvan,
        ziyaret30: Number(r.ziyaret30), ziyaret90: Number(r.ziyaret90), sonZiyaret: r.son_ziyaret,
      }));
      sahaIstatistik.performans = mumessilPerformansi(perfSatir);

      // Akıllı sorular — küçük agregasyonlar
      const enCokUrunResult = await pool.query(
        `SELECT u.ad, COUNT(*) AS sayi
         FROM urun_tiklamalar ut JOIN urunler u ON u.id = ut.urun_id
         WHERE u.firma_id = $1 GROUP BY u.id, u.ad ORDER BY sayi DESC LIMIT 10`,
        [req.session.firmaId]
      );
      const kartiEksikResult = await pool.query(
        `SELECT ad, musteri_karta_yazildi, eczaci_karta_yazildi
         FROM eczaneler
         WHERE firma_id = $1 AND (musteri_karta_yazildi = false OR eczaci_karta_yazildi = false)
         ORDER BY ad LIMIT 100`,
        [req.session.firmaId]
      );
      const kartiEksikSayiResult = await pool.query(
        `SELECT COUNT(*) AS sayi FROM eczaneler
         WHERE firma_id = $1 AND (musteri_karta_yazildi = false OR eczaci_karta_yazildi = false)`,
        [req.session.firmaId]
      );
      const indirimOzetResult = await pool.query(
        `SELECT COUNT(*) AS uretilen, COUNT(*) FILTER (WHERE kullanildi) AS kullanilan
         FROM indirim_kodlari WHERE firma_id = $1`,
        [req.session.firmaId]
      );
      const io = indirimOzetResult.rows[0];
      // Bölge/ekip performansı: ekip_yoneticisi olan "Bölge Müdürü" düğümlerinin ekip ziyareti
      const ekipZiyaretResult = await pool.query(
        `SELECT c.id, c.ad, c.soyad, c.unvan, c.amiri_id, c.ekip_yoneticisi,
                COALESCE((SELECT COUNT(*) FROM ziyaretler z WHERE z.calisan_id = c.id AND z.created_at >= NOW() - INTERVAL '90 days'),0) AS sayi
         FROM calisanlar c WHERE c.firma_id = $1 AND c.durum = 'aktif'`,
        [req.session.firmaId]
      );
      const ezMap = {};
      ekipZiyaretResult.rows.forEach(r => { ezMap[r.id] = Number(r.sayi); });
      const ezAgac = hiyerarsiAgaciKur(ekipZiyaretResult.rows, ezMap);
      const bolgePerf = [];
      const gezBolge = d => {
        if (d.unvan === 'Bölge Müdürü') bolgePerf.push({ ad: d.ad, soyad: d.soyad, ekipZiyaret: d.ekipZiyaret });
        d.cocuklar.forEach(gezBolge);
      };
      ezAgac.forEach(gezBolge);
      bolgePerf.sort((a, b) => b.ekipZiyaret - a.ekipZiyaret);

      sahaIstatistik.akilliSorular = {
        enCokTiklananUrunler: enCokUrunResult.rows.map(r => ({ ad: r.ad, sayi: Number(r.sayi) })),
        kartiEksikEczaneler: {
          sayi: Number(kartiEksikSayiResult.rows[0].sayi),
          liste: kartiEksikResult.rows.map(r => ({
            ad: r.ad,
            eksik: [!r.musteri_karta_yazildi ? 'Müşteri kartı' : null, !r.eczaci_karta_yazildi ? 'Eczacı kartı' : null].filter(Boolean).join(', '),
          })),
        },
        bolgePerformans: bolgePerf,
        indirimOzeti: {
          uretilen: Number(io.uretilen), kullanilan: Number(io.kullanilan),
          oran: Number(io.uretilen) ? Math.round((Number(io.kullanilan) / Number(io.uretilen)) * 100) : 0,
        },
      };

      // KPI şeridi
      const kpiResult = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM ziyaretler z JOIN calisanlar c ON c.id=z.calisan_id
              WHERE c.firma_id=$1 AND z.created_at >= date_trunc('month', NOW())) AS bu_ay,
           (SELECT COUNT(*) FROM ziyaretler z JOIN calisanlar c ON c.id=z.calisan_id
              WHERE c.firma_id=$1 AND z.created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
              AND z.created_at < date_trunc('month', NOW())) AS gecen_ay,
           (SELECT COUNT(DISTINCT z.calisan_id) FROM ziyaretler z JOIN calisanlar c ON c.id=z.calisan_id
              WHERE c.firma_id=$1 AND z.created_at >= date_trunc('month', NOW())) AS aktif_mumessil,
           (SELECT COUNT(*) FROM calisanlar WHERE firma_id=$1 AND durum='aktif' AND ekip_yoneticisi=false) AS toplam_mumessil,
           (SELECT COUNT(*) FROM eczaneler WHERE firma_id=$1) AS toplam_eczane,
           (SELECT COUNT(*) FROM eczaneler WHERE firma_id=$1 AND musteri_karta_yazildi=true) AS kartli_eczane`,
        [req.session.firmaId]
      );
      const kp = kpiResult.rows[0];
      const yuzde = (a, b) => (Number(b) ? Math.round((Number(a) / Number(b)) * 100) : 0);
      const buAy = Number(kp.bu_ay), gecenAy = Number(kp.gecen_ay);
      sahaIstatistik.kpi = {
        buAyZiyaret: buAy,
        ziyaretDegisim: gecenAy ? Math.round(((buAy - gecenAy) / gecenAy) * 100) : null,
        aktifMumessilOrani: yuzde(kp.aktif_mumessil, kp.toplam_mumessil),
        kartKapsamasi: yuzde(kp.kartli_eczane, kp.toplam_eczane),
        indirimDonusumu: sahaIstatistik.akilliSorular.indirimOzeti.oran,
      };
```

- [ ] **Step 2b: `sahaIstatistik` başlangıç nesnesine yeni alanları ekle** — `app.js:399`'daki başlangıç ataması varsayılanlarını genişlet (saha dışı tab'larda `undefined` erişimini önlemek için):

```js
    let sahaIstatistik = { gunlukZiyaret: [], temsilciZiyaret: [], eczaneOkutma: [], tiklamaDagilimi: [], tiklamaDagilimiEczaneBazli: [], ziyaretEdilmeyenEczaneler: [], ziyaretNotlari: [], performans: [], akilliSorular: null, kpi: null };
```

- [ ] **Step 3: Sözdizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -e "require('./app'); console.log('app yuklendi')"`
Expected: "app yuklendi", hata yok.

- [ ] **Step 4: Commit**

```bash
cd ~/kurumsal-kartvizit && git add app.js && git commit -m "Panel saha: performans + akilli sorular + KPI verisi"
```

---

### Task 6: `dashboard.ejs` — Organizasyon sekmesi (link + ağaç)

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] **Step 1: Sekme linki ekle** — `dashboard.ejs`'te `aktifGrup === 'calisanlar'` bloğundaki sekme linklerine (`İstatistik` linkinden sonra) ekle:

```html
    <a href="/?tab=organizasyon" class="dash-tab <%= tab === 'organizasyon' ? 'active' : '' %>">Organizasyon</a>
```

- [ ] **Step 2: Organizasyon tab içeriği** — `dashboard.ejs`'te GENEL BAKIŞ tab bloğundan (`<% if (tab === 'genel') { %>`) hemen ÖNCE, yeni bir tab bloğu ekle:

```html
  <!-- TAB: ORGANİZASYON -->
  <% if (tab === 'organizasyon') { %>
    <% if (!hiyerarsiAgaci || !hiyerarsiAgaci.length) { %>
    <div class="table-wrap"><div class="empty-state">
      <div class="empty-state-title">Hiyerarşi tanımlı değil</div>
      <div class="empty-state-sub">Çalışanlara "amiri" atadıkça organizasyon şeması burada oluşur.</div>
    </div></div>
    <% } else { %>
    <div class="table-wrap" style="padding:20px">
      <h3 style="margin-bottom:16px">Organizasyon Şeması <span style="font-size:var(--fs-xs);color:var(--text-faint)">(son 90 gün ekip ziyaretleri)</span></h3>
      <%
        const kacis = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
        function dugumHtml(d, seviye) {
          const yonetici = d.cocuklar && d.cocuklar.length;
          const rozet = yonetici
            ? `<span style="background:var(--gold);color:#1a1a1a;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600">👥 ${d.ekipZiyaret}</span>`
            : `<span style="color:var(--text-muted);font-size:12px">🧍 ${d.kendiZiyaret}</span>`;
          const bas = `<div style="display:flex;align-items:center;gap:8px;padding:6px 0 6px ${seviye*22}px;border-bottom:1px solid var(--border)">
              <strong style="font-size:var(--fs-sm)">${kacis(d.ad)} ${kacis(d.soyad)}</strong>
              <span style="color:var(--text-muted);font-size:12px">${kacis(d.unvan)}</span>
              <span style="margin-left:auto">${rozet}</span>
            </div>`;
          if (!yonetici) return bas;
          const cocukHtml = d.cocuklar.map(c => dugumHtml(c, seviye + 1)).join('');
          return `<details open style="margin:0"><summary style="list-style:none;cursor:pointer">${bas}</summary>${cocukHtml}</details>`;
        }
      %>
      <%- hiyerarsiAgaci.map(k => dugumHtml(k, 0)).join('') %>
    </div>
    <% } %>
  <% } %>
```

Not: `dugumHtml` içindeki `kacis()` isim/ünvanı HTML-escape eder (stored-XSS koruması; codebase'deki G1 düzeltmesiyle tutarlı). Bu blok kendi `<% if (tab === 'organizasyon') { %> ... <% } %>` zincirini kapatır; mevcut `<% if (tab === 'genel') { %>` bloğu değişmeden altında kalır.

- [ ] **Step 3: Sözdizimi/EJS derleme kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -e "const ejs=require('ejs'),fs=require('fs'); ejs.compile(fs.readFileSync('views/public/dashboard.ejs','utf8'), {filename:'views/public/dashboard.ejs'}); console.log('ejs derlendi')"`
Expected: "ejs derlendi" — EJS sözdizim hatası YOK.

- [ ] **Step 4: Commit**

```bash
cd ~/kurumsal-kartvizit && git add views/public/dashboard.ejs && git commit -m "Panel saha: Organizasyon sekmesi + hiyerarsi agaci gorunumu"
```

---

### Task 7: `dashboard.ejs` — Saha KPI şeridi + akıllı soru chip'leri + rapor kartları

**Files:**
- Modify: `views/public/dashboard.ejs`

Mevcut saha bloğu (`<% } else if (tab === 'saha' && firma.paket === 'kurumsal') { %>` ... bir sonraki `<% } else if ...` veya `<% } %>`'e kadar) **tamamen** aşağıdakiyle değiştirilir. Grafikler ve mevcut listeler korunur ama chip/rapor-kartı yapısına taşınır.

- [ ] **Step 1: Saha bloğunu değiştir** — `dashboard.ejs`'teki `tab === 'saha'` bloğunun TAMAMINI (açılış `<% } else if (tab === 'saha' && firma.paket === 'kurumsal') { %>`'ten, bu bloğu kapatan ve `chartGunluk/chartTemsilci/...` script'lerini içeren kısmın sonuna kadar) şu içerikle değiştir:

```html
  <% } else if (tab === 'saha' && firma.paket === 'kurumsal') { %>
    <% const k = sahaIstatistik.kpi || {}; const AS = sahaIstatistik.akilliSorular || {}; %>
    <!-- KPI ŞERİDİ -->
    <div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-card-n"><%= k.buAyZiyaret != null ? k.buAyZiyaret : 0 %></div>
        <div class="stat-card-l">Bu ay ziyaret</div>
        <% if (k.ziyaretDegisim != null) { %>
          <div style="margin-top:6px;font-size:var(--fs-xs);font-weight:600;color:<%= k.ziyaretDegisim >= 0 ? 'var(--success)' : 'var(--danger)' %>">
            <%= k.ziyaretDegisim >= 0 ? '↑' : '↓' %> %<%= Math.abs(k.ziyaretDegisim) %> geçen aya göre
          </div>
        <% } %>
      </div>
      <div class="stat-card">
        <div class="stat-card-n">%<%= k.aktifMumessilOrani || 0 %></div>
        <div class="stat-card-l">Aktif mümessil (bu ay)</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-n">%<%= k.kartKapsamasi || 0 %></div>
        <div class="stat-card-l">Kart kapsaması</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-n">%<%= k.indirimDonusumu || 0 %></div>
        <div class="stat-card-l">İndirim dönüşümü</div>
      </div>
    </div>

    <!-- AKILLI SORU CHIP BAR -->
    <div class="table-wrap" style="padding:12px 16px;margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
      <% const chipler = [
        ['1','⭐ En çok ziyaret'], ['2','⚠️ 60+ gün geride'], ['3','📉 Bu ay ziyaretsiz'],
        ['4','🏆 En aktif eczaneler'], ['5','💊 En çok ürün'], ['6','🪪 Kartı eksik'],
        ['7','🗺️ Bölge performansı'], ['8','🎁 İndirim özeti'], ['9','📊 Grafikler']
      ]; %>
      <% chipler.forEach(([no, etiket], i) => { %>
        <button class="soru-chip <%= i === 0 ? 'active' : '' %>" data-soru="<%= no %>" onclick="soruGoster('<%= no %>')"><%= etiket %></button>
      <% }) %>
    </div>

    <% const perf = sahaIstatistik.performans || []; %>
    <!-- 1: En çok ziyaret -->
    <div class="soru-rapor" data-soru="1">
      <div class="table-wrap"><table>
        <thead><tr><th>Mümessil</th><th>Son 30g</th><th>Son 90g</th><th>Durum</th></tr></thead>
        <tbody>
          <% perf.slice().sort((a,b)=>b.ziyaret90-a.ziyaret90).slice(0,10).forEach(r => { %>
          <tr><td><%= r.ad %> <%= r.soyad %></td><td><%= r.ziyaret30 %></td><td><%= r.ziyaret90 %></td>
            <td><%= r.durum === 'yildiz' ? '⭐ Yıldız' : r.durum === 'geride' ? '⚠️ Geride' : '—' %></td></tr>
          <% }) %>
        </tbody>
      </table></div>
    </div>
    <!-- 2: 60+ gün geride -->
    <div class="soru-rapor" data-soru="2" style="display:none">
      <div class="table-wrap"><table>
        <thead><tr><th>Mümessil</th><th>Son ziyaret</th></tr></thead>
        <tbody>
          <% perf.filter(r => r.durum === 'geride').forEach(r => { %>
          <tr><td style="color:var(--danger)"><%= r.ad %> <%= r.soyad %></td>
            <td><%= r.sonZiyaret ? new Date(r.sonZiyaret).toLocaleDateString('tr-TR') : 'Hiç ziyaret yok' %></td></tr>
          <% }) %>
          <% if (!perf.filter(r => r.durum === 'geride').length) { %><tr><td colspan="2">Geride mümessil yok 👍</td></tr><% } %>
        </tbody>
      </table></div>
    </div>
    <!-- 3: Bu ay ziyaretsiz (30 günde 0) -->
    <div class="soru-rapor" data-soru="3" style="display:none">
      <div class="table-wrap"><table>
        <thead><tr><th>Mümessil</th><th>Son 90g ziyaret</th></tr></thead>
        <tbody>
          <% perf.filter(r => r.ziyaret30 === 0).forEach(r => { %>
          <tr><td><%= r.ad %> <%= r.soyad %></td><td><%= r.ziyaret90 %></td></tr>
          <% }) %>
          <% if (!perf.filter(r => r.ziyaret30 === 0).length) { %><tr><td colspan="2">Herkes bu ay ziyaret yapmış 👍</td></tr><% } %>
        </tbody>
      </table></div>
    </div>
    <!-- 4: En aktif eczaneler -->
    <div class="soru-rapor" data-soru="4" style="display:none">
      <div class="table-wrap"><table>
        <thead><tr><th>Eczane</th><th>Raf okutma</th></tr></thead>
        <tbody>
          <% (sahaIstatistik.eczaneOkutma || []).forEach(r => { %><tr><td><%= r.ad %></td><td><%= r.sayi %></td></tr><% }) %>
        </tbody>
      </table></div>
    </div>
    <!-- 5: En çok tıklanan ürünler -->
    <div class="soru-rapor" data-soru="5" style="display:none">
      <div class="table-wrap"><table>
        <thead><tr><th>Ürün</th><th>Tıklama</th></tr></thead>
        <tbody>
          <% (AS.enCokTiklananUrunler || []).forEach(r => { %><tr><td><%= r.ad %></td><td><%= r.sayi %></td></tr><% }) %>
        </tbody>
      </table></div>
    </div>
    <!-- 6: Kartı eksik eczaneler (arama) -->
    <div class="soru-rapor" data-soru="6" style="display:none">
      <div class="table-wrap" style="padding:12px 16px;margin-bottom:8px">
        Toplam <strong><%= AS.kartiEksikEczaneler ? AS.kartiEksikEczaneler.sayi : 0 %></strong> eczanede kart eksik (ilk 100 gösteriliyor).
        <input id="kartiEksikAra" placeholder="Eczane ara…" oninput="tabloAra('kartiEksikAra','kartiEksikTablo')" style="margin-left:8px;padding:4px 8px">
      </div>
      <div class="table-wrap"><table id="kartiEksikTablo">
        <thead><tr><th>Eczane</th><th>Eksik</th></tr></thead>
        <tbody>
          <% ((AS.kartiEksikEczaneler && AS.kartiEksikEczaneler.liste) || []).forEach(r => { %>
          <tr><td><%= r.ad %></td><td style="color:var(--danger)"><%= r.eksik %></td></tr>
          <% }) %>
        </tbody>
      </table></div>
    </div>
    <!-- 7: Bölge performansı -->
    <div class="soru-rapor" data-soru="7" style="display:none">
      <div class="table-wrap"><table>
        <thead><tr><th>Bölge Müdürü</th><th>Ekip ziyareti (90g)</th></tr></thead>
        <tbody>
          <% (AS.bolgePerformans || []).forEach(r => { %><tr><td><%= r.ad %> <%= r.soyad %></td><td><%= r.ekipZiyaret %></td></tr><% }) %>
        </tbody>
      </table></div>
    </div>
    <!-- 8: İndirim özeti -->
    <div class="soru-rapor" data-soru="8" style="display:none">
      <div class="stat-row" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat-card"><div class="stat-card-n"><%= AS.indirimOzeti ? AS.indirimOzeti.uretilen : 0 %></div><div class="stat-card-l">Üretilen kod</div></div>
        <div class="stat-card"><div class="stat-card-n"><%= AS.indirimOzeti ? AS.indirimOzeti.kullanilan : 0 %></div><div class="stat-card-l">Kullanılan</div></div>
        <div class="stat-card"><div class="stat-card-n">%<%= AS.indirimOzeti ? AS.indirimOzeti.oran : 0 %></div><div class="stat-card-l">Dönüşüm</div></div>
      </div>
    </div>
    <!-- 9: Grafikler -->
    <div class="soru-rapor" data-soru="9" style="display:none">
      <div class="table-wrap" style="padding:20px;margin-bottom:16px"><h3 style="margin-bottom:12px">Son 30 Gün — Günlük Ziyaret</h3><canvas id="chartGunluk" height="80"></canvas></div>
      <div class="table-wrap" style="padding:20px;margin-bottom:16px"><h3 style="margin-bottom:12px">Temsilci Başına Ziyaret</h3><canvas id="chartTemsilci" height="80"></canvas></div>
      <div class="table-wrap" style="padding:20px;margin-bottom:16px"><h3 style="margin-bottom:12px">Eczane Başına Okutma</h3><canvas id="chartEczane" height="80"></canvas></div>
      <div class="table-wrap" style="padding:20px"><h3 style="margin-bottom:12px">İçerik Tıklama Dağılımı</h3><canvas id="chartTiklama" height="80"></canvas></div>
    </div>

    <div class="table-wrap" style="padding:12px 16px;margin-top:16px">
      <a href="/kurumsal/ziyaretler-excel" class="btn btn-border" style="height:34px">⬇ Ziyaretleri Excel'e Aktar</a>
      <a href="/kurumsal/rapor-excel" class="btn btn-border" style="height:34px;margin-left:8px">⬇ Gelişmiş Rapor (.xlsx)</a>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      const sahaVeri = <%- JSON.stringify({ gunlukZiyaret: sahaIstatistik.gunlukZiyaret, temsilciZiyaret: sahaIstatistik.temsilciZiyaret, eczaneOkutma: sahaIstatistik.eczaneOkutma, tiklamaDagilimi: sahaIstatistik.tiklamaDagilimi }) %>;
      let grafiklerHazir = false;
      function grafikleriKur() {
        if (grafiklerHazir) return; grafiklerHazir = true;
        new Chart(document.getElementById('chartGunluk'), { type:'line', data:{ labels: sahaVeri.gunlukZiyaret.map(r=>r.gun), datasets:[{ label:'Ziyaret', data: sahaVeri.gunlukZiyaret.map(r=>r.sayi), borderColor:'#c9a15a', tension:0.2 }] } });
        new Chart(document.getElementById('chartTemsilci'), { type:'bar', data:{ labels: sahaVeri.temsilciZiyaret.map(r=>r.ad+' '+r.soyad), datasets:[{ label:'Ziyaret', data: sahaVeri.temsilciZiyaret.map(r=>r.sayi), backgroundColor:'#c9a15a' }] } });
        new Chart(document.getElementById('chartEczane'), { type:'bar', data:{ labels: sahaVeri.eczaneOkutma.map(r=>r.ad), datasets:[{ label:'Okutma', data: sahaVeri.eczaneOkutma.map(r=>r.sayi), backgroundColor:'#3a7ca5' }] } });
        new Chart(document.getElementById('chartTiklama'), { type:'bar', data:{ labels: sahaVeri.tiklamaDagilimi.map(r=>r.tip), datasets:[{ label:'Tıklama', data: sahaVeri.tiklamaDagilimi.map(r=>r.sayi), backgroundColor:'#7a9e7e' }] } });
      }
      function soruGoster(no) {
        document.querySelectorAll('.soru-rapor').forEach(el => { el.style.display = el.dataset.soru === no ? 'block' : 'none'; });
        document.querySelectorAll('.soru-chip').forEach(el => { el.classList.toggle('active', el.dataset.soru === no); });
        if (no === '9') grafikleriKur();
      }
      function tabloAra(inputId, tabloId) {
        const q = document.getElementById(inputId).value.toLowerCase();
        document.querySelectorAll('#' + tabloId + ' tbody tr').forEach(tr => {
          tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      }
    </script>
```

- [ ] **Step 2: Chip stilini ekle** — `dashboard.ejs`'in `<style>` bloğunun sonuna (kapanış `</style>`'dan önce) ekle:

```css
    .soru-chip { padding:7px 12px; border:1px solid var(--border); background:var(--surface,#fff); border-radius:20px; font-size:var(--fs-sm); cursor:pointer; color:var(--text-muted); transition:all .15s; }
    .soru-chip:hover { border-color:var(--gold); color:var(--text); }
    .soru-chip.active { background:var(--gold); border-color:var(--gold); color:#1a1a1a; font-weight:600; }
```

- [ ] **Step 3: EJS derleme kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -e "const ejs=require('ejs'),fs=require('fs'); ejs.compile(fs.readFileSync('views/public/dashboard.ejs','utf8'), {filename:'views/public/dashboard.ejs'}); console.log('ejs derlendi')"`
Expected: "ejs derlendi".

- [ ] **Step 4: Commit**

```bash
cd ~/kurumsal-kartvizit && git add views/public/dashboard.ejs && git commit -m "Panel saha: KPI seridi + akilli soru chipleri + rapor kartlari"
```

---

### Task 8: `routes/kurumsal.js` — `rapor-excel` profesyonelleştirme (Özet + Performans + stil)

**Files:**
- Modify: `routes/kurumsal.js`

- [ ] **Step 1: excelStil'i import et** — `routes/kurumsal.js` üstündeki require blokuna ekle:

```js
const { basrilkSatiriUygula, kolonGenislikleriAyarla } = require('../utils/excelStil');
const { mumessilPerformansi } = require('../utils/sahaAnaliz');
```

- [ ] **Step 2: `rapor-excel` içindeki inline `basliklariUygula`'yı stil yardımcısıyla değiştir + Özet ve Performans sayfası ekle** — `rapor-excel` handler'ında, `const wb = new ExcelJS.Workbook();`'ten sonra gelen `const basliklariUygula = ...` fonksiyon tanımını SİL ve her `basliklariUygula(ws, [...])` çağrısını `basrilkSatiriUygula(ws, [...])` yap. Her `addRow` döngüsünden SONRA `kolonGenislikleriAyarla(ws)` çağır. Ayrıca `wb.addWorksheet('Ziyaretler')` satırından ÖNCE Özet + Performans sayfalarını ekle:

```js
    // Özet sayfası (ilk sayfa) — KPI'lar
    const kpiSonuc = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM ziyaretler z JOIN calisanlar c ON c.id=z.calisan_id WHERE c.firma_id=$1) AS toplam_ziyaret,
         (SELECT COUNT(*) FROM eczaneler WHERE firma_id=$1) AS toplam_eczane,
         (SELECT COUNT(*) FROM eczaneler WHERE firma_id=$1 AND musteri_karta_yazildi=true) AS kartli_eczane,
         (SELECT COUNT(*) FROM indirim_kodlari WHERE firma_id=$1) AS indirim_uretilen,
         (SELECT COUNT(*) FROM indirim_kodlari WHERE firma_id=$1 AND kullanildi) AS indirim_kullanilan`,
      [firmaId]
    );
    const kpi = kpiSonuc.rows[0];
    const oran = (a, b) => (Number(b) ? Math.round((Number(a) / Number(b)) * 100) : 0);
    const wsOzet = wb.addWorksheet('Özet');
    basrilkSatiriUygula(wsOzet, ['Metrik', 'Değer']);
    wsOzet.addRow(['Rapor tarihi', new Date()]).getCell(2).numFmt = 'dd.mm.yyyy';
    wsOzet.addRow(['Toplam ziyaret', Number(kpi.toplam_ziyaret)]);
    wsOzet.addRow(['Toplam eczane', Number(kpi.toplam_eczane)]);
    wsOzet.addRow(['Kart kapsaması', oran(kpi.kartli_eczane, kpi.toplam_eczane) / 100]).getCell(2).numFmt = '0%';
    wsOzet.addRow(['İndirim dönüşümü', oran(kpi.indirim_kullanilan, kpi.indirim_uretilen) / 100]).getCell(2).numFmt = '0%';
    kolonGenislikleriAyarla(wsOzet);

    // Mümessil Performansı sayfası — geride satırlar kırmızı
    const perfSonuc = await pool.query(
      `SELECT c.id, c.ad, c.soyad, c.unvan,
              COUNT(*) FILTER (WHERE z.created_at >= NOW() - INTERVAL '30 days') AS ziyaret30,
              COUNT(*) FILTER (WHERE z.created_at >= NOW() - INTERVAL '90 days') AS ziyaret90,
              MAX(z.created_at) AS son_ziyaret
       FROM calisanlar c LEFT JOIN ziyaretler z ON z.calisan_id = c.id
       WHERE c.firma_id = $1 AND c.durum='aktif' AND c.ekip_yoneticisi=false
       GROUP BY c.id, c.ad, c.soyad, c.unvan`,
      [firmaId]
    );
    const perf = mumessilPerformansi(perfSonuc.rows.map(r => ({
      id: r.id, ad: r.ad, soyad: r.soyad, unvan: r.unvan,
      ziyaret30: Number(r.ziyaret30), ziyaret90: Number(r.ziyaret90), sonZiyaret: r.son_ziyaret,
    })));
    const wsPerf = wb.addWorksheet('Mümessil Performansı');
    basrilkSatiriUygula(wsPerf, ['Mümessil', 'Son 30g', 'Son 90g', 'Son Ziyaret', 'Durum']);
    perf.forEach(r => {
      const satir = wsPerf.addRow([`${r.ad} ${r.soyad}`, r.ziyaret30, r.ziyaret90, r.sonZiyaret || '', r.durum === 'yildiz' ? 'Yıldız' : r.durum === 'geride' ? 'Geride' : 'Normal']);
      if (r.sonZiyaret) satir.getCell(4).numFmt = 'dd.mm.yyyy';
      if (r.durum === 'geride') satir.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } }; });
    });
    kolonGenislikleriAyarla(wsPerf);
```

- [ ] **Step 3: Kalan sayfalarda `basrilkSatiriUygula` + `kolonGenislikleriAyarla` kullanıldığını doğrula** — mevcut `wsZiyaret`, `wsEczane`, `wsTemsilci`, `wsIndirim` bloklarında `basliklariUygula(...)` → `basrilkSatiriUygula(...)` yapıldı ve her birinin `addRow` döngüsünden sonra `kolonGenislikleriAyarla(wsX)` eklendi mi kontrol et. (Tarih/sayı hücreleri: `wsIndirim`'de `Yüzde` sütununa `numFmt='0"%"'` verilebilir; opsiyonel.)

- [ ] **Step 4: Sözdizimi + üretim testi**

Run: `cd ~/kurumsal-kartvizit && node -e "require('./routes/kurumsal'); console.log('route yuklendi')"`
Expected: "route yuklendi".

- [ ] **Step 5: Commit**

```bash
cd ~/kurumsal-kartvizit && git add routes/kurumsal.js && git commit -m "Panel saha: rapor-excel Ozet+Performans sayfasi + profesyonel stil"
```

---

### Task 9: `routes/kurumsal.js` — `ziyaretler-excel` profesyonelleştirme

**Files:**
- Modify: `routes/kurumsal.js`

- [ ] **Step 1: `ziyaretler-excel`'i stilli exceljs workbook'a çevir** — mevcut `aoaToXlsxBuffer` kullanan gövdeyi şununla değiştir:

```js
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ziyaretler');
    basrilkSatiriUygula(ws, ['Temsilci', 'Eczane', 'Tarih', 'Not']);
    result.rows.forEach(r => {
      const satir = ws.addRow([`${r.temsilci_ad} ${r.temsilci_soyad}`, r.eczane_ad, r.created_at, r.temsilci_notu || '']);
      satir.getCell(3).numFmt = 'dd.mm.yyyy hh:mm';
    });
    kolonGenislikleriAyarla(ws);
    const buffer = await wb.xlsx.writeBuffer();
```

(`res.setHeader(...)` ve `res.send(buffer)` satırları aynı kalır.)

- [ ] **Step 2: Sözdizimi kontrolü**

Run: `cd ~/kurumsal-kartvizit && node -e "require('./routes/kurumsal'); console.log('route yuklendi')"`
Expected: "route yuklendi".

- [ ] **Step 3: Commit**

```bash
cd ~/kurumsal-kartvizit && git add routes/kurumsal.js && git commit -m "Panel saha: ziyaretler-excel profesyonel stil + tarih formati"
```

---

### Task 10: Tam doğrulama (test + tarayıcı + Excel)

**Files:** (yok — doğrulama)

- [ ] **Step 1: Tüm birim testler**

Run: `cd ~/kurumsal-kartvizit && npx jest tests/sahaAnaliz.test.js tests/excelStil.test.js`
Expected: PASS (her iki dosya yeşil).

- [ ] **Step 2: Tam test paketi (regresyon)**

Run: `cd ~/kurumsal-kartvizit && npm test 2>&1 | tail -15`
Expected: Tüm mevcut testler + yeniler geçer (kırmızı yok).

- [ ] **Step 3: Deploy** — değişiklikler master'a push edilince Railway otomatik deploy eder.

```bash
cd ~/kurumsal-kartvizit && git push
```

- [ ] **Step 4: Tarayıcı smoke (production, Orzax paneli)** — `docs/orzax-demo-giris-bilgileri.md`'deki `orzax`/`orzax2026` ile panele giriş:
  - **Çalışanlar → Organizasyon**: ağaç görünüyor (Genel Müdür → Müdürler → Bölge Müdürleri → mümessiller), aç/kapa çalışıyor, ekip ziyaret rozetleri dolu.
  - **Saha Raporları**: KPI şeridi 4 kart (bu ay ziyaret + değişim, aktif mümessil %, kart kapsaması %, indirim dönüşümü %); chip'lere tıklayınca ilgili rapor **anında** açılıyor; ⚠️ 60+ gün chip'inde geride mümessiller listeleniyor; 🪪 kartı eksik chip'inde arama filtreliyor; 📊 grafikler chip'inde Chart.js çiziliyor.
  - **⬇ Gelişmiş Rapor (.xlsx)** indir → Özet ilk sayfa (KPI'lar), Mümessil Performansı sayfası (geride satırlar kırmızı), tüm sayfalarda dondurulmuş başlık + filtre oku + doğru sayı/tarih formatı.

- [ ] **Step 5: Sonucu bildir** — gözlemleri özetle; sorun varsa ilgili task'a dön.

---

## Notlar
- **Bağımlılık yok**: `pg`, `exceljs`, `ejs` mevcut.
- **Güvenlik**: hiyerarşi ağacında isim/ünvan `kacis()` ile HTML-escape edilir (stored-XSS koruması).
- **Gizlilik**: ziyaret notu içeriği web'de gösterilmez (mevcut karar korunur; performans/rapor sadece sayı/tarih).
- **Performans**: akıllı soru agregasyonları küçük GROUP BY/COUNT; KPI tek sorgu. Kartı-eksik listesi ilk 100 ile sınırlı.
