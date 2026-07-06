# Eczane Bazlı Detaylı Analitik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panelin Raf Kartları sekmesinde, her eczane için detaylı etkileşim metriklerini (okutma, tıklama dağılımı, PDF açılma, yaklaşık farklı kişi sayısı, mümessil ziyaret etkisi) gösteren bir "Detay" görünümü eklemek.

**Architecture:** `raf_okutmalar`'a tuzlanmış IP hash kolonu eklenir (ham IP saklanmaz); eczacı kartındaki PDF linki artık takip edilen bir yönlendirme ucundan geçer; yeni bir panel ucu tüm metrikleri tek JSON'da toplar; panelde bir "Detay" butonu bu JSON'ı fetch edip modal içinde, güvenli DOM metodlarıyla (innerHTML kullanmadan) gösterir.

**Tech Stack:** Node.js/Express, PostgreSQL (window function: `LEAD()`), EJS, vanilla JS (fetch + DOM API).

---

### Task 1: `utils/ipHash.js` — IP hash yardımcı fonksiyonu

**Files:**
- Create: `utils/ipHash.js`
- Test: `tests/ipHash.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
require('dotenv').config();
const { ipHashOlustur } = require('../utils/ipHash');

describe('ipHashOlustur', () => {
  test('aynı IP her zaman aynı hash\'i üretir', () => {
    const h1 = ipHashOlustur('1.2.3.4');
    const h2 = ipHashOlustur('1.2.3.4');
    expect(h1).toBe(h2);
  });

  test('farklı IP farklı hash üretir', () => {
    const h1 = ipHashOlustur('1.2.3.4');
    const h2 = ipHashOlustur('5.6.7.8');
    expect(h1).not.toBe(h2);
  });

  test('hash ham IP\'yi içermez, 64 karakterlik hex string döner', () => {
    const h = ipHashOlustur('192.168.1.1');
    expect(h).not.toContain('192.168.1.1');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/ipHash.test.js`
Expected: FAIL — `Cannot find module '../utils/ipHash'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
const crypto = require('crypto');

function ipHashOlustur(ip) {
  return crypto.createHash('sha256').update(ip + (process.env.IP_HASH_SALT || 'dev-salt')).digest('hex');
}

module.exports = { ipHashOlustur };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/ipHash.test.js`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add utils/ipHash.js tests/ipHash.test.js
git commit -m "Eczane analitik T1: ipHash yardimci fonksiyonu"
```

---

### Task 2: DB migration — `ip_hash` kolonu + `eczaci_tiklamalar` tablosu

**Files:**
- Modify: `scripts/migrate.js`

- [ ] **Step 1: `scripts/migrate.js`'in migration dizisine ekle**

Dosyanın sonundaki migration dizisine (en son satırdan hemen önce) şu satırları ekle:

```javascript
    `ALTER TABLE raf_okutmalar ADD COLUMN IF NOT EXISTS ip_hash TEXT`,
    `CREATE TABLE IF NOT EXISTS eczaci_tiklamalar (
      id          SERIAL PRIMARY KEY,
      eczane_id   INTEGER REFERENCES eczaneler(id) ON DELETE CASCADE,
      tip         TEXT NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    )`,
```

- [ ] **Step 2: Migration'ı yerel veritabanında çalıştır**

Run: `cd /c/Users/muham/kurumsal-kartvizit && node scripts/migrate.js`
Expected: Çıktıda yeni iki satır için `OK` görünür, hata yok.

- [ ] **Step 3: Kolonun ve tablonun oluştuğunu doğrula**

Run:
```bash
node -e "
require('dotenv').config();
const { pool } = require('./db');
(async () => {
  const c = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='raf_okutmalar' AND column_name='ip_hash'\");
  const t = await pool.query(\"SELECT table_name FROM information_schema.tables WHERE table_name='eczaci_tiklamalar'\");
  console.log('ip_hash kolonu:', c.rows.length ? 'VAR' : 'YOK');
  console.log('eczaci_tiklamalar tablosu:', t.rows.length ? 'VAR' : 'YOK');
  await pool.end();
})();
"
```
Expected: İkisi de "VAR".

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.js
git commit -m "Eczane analitik T2: ip_hash kolonu + eczaci_tiklamalar tablosu"
```

---

### Task 3: `/raf/:kod` okutma kaydına `ip_hash` ekle

**Files:**
- Modify: `routes/public.js:24-40` (`GET /raf/:kod`)
- Test: `tests/raf.test.js`

**Bağlam:** `routes/public.js`'in en üstünde `const { vcfOlustur } = require('../utils/vcf');` gibi importlar var; oraya `ipHashOlustur` import'u eklenecek.

- [ ] **Step 1: Write the failing test**

`tests/raf.test.js`'teki `test('geçerli kod 200 döner, okutma kaydedilir', ...)` testinin (satır 34-42) hemen altına ekle:

```javascript
  test('okutma kaydına ip_hash yazılır', async () => {
    await request(app).get(`/raf/${kod}`);
    const son = await pool.query(
      'SELECT ip_hash FROM raf_okutmalar WHERE eczane_id = $1 ORDER BY id DESC LIMIT 1',
      [eczaneId]
    );
    expect(son.rows[0].ip_hash).not.toBeNull();
    expect(son.rows[0].ip_hash).toMatch(/^[a-f0-9]{64}$/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/raf.test.js -t "ip_hash yazılır"`
Expected: FAIL — `ip_hash` şu an her zaman `null`.

- [ ] **Step 3: `routes/public.js`'e import ekle**

Dosyanın import bloğunun sonuna (satır 7'den sonra) ekle:

```javascript
const { ipHashOlustur } = require('../utils/ipHash');
```

- [ ] **Step 4: Raf okutma INSERT'ini güncelle**

`routes/public.js:30-34` şu anki hali:

```javascript
    try {
      await pool.query('INSERT INTO raf_okutmalar (eczane_id) VALUES ($1)', [veri.eczane_id]);
    } catch (kayitHatasi) {
      console.error('raf okutma kaydı başarısız:', kayitHatasi);
    }
```

Şununla değiştir:

```javascript
    try {
      const ipHash = ipHashOlustur(req.ip);
      await pool.query('INSERT INTO raf_okutmalar (eczane_id, ip_hash) VALUES ($1, $2)', [veri.eczane_id, ipHash]);
    } catch (kayitHatasi) {
      console.error('raf okutma kaydı başarısız:', kayitHatasi);
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/raf.test.js`
Expected: Tüm testler PASS (yeni test dahil).

- [ ] **Step 6: Commit**

```bash
git add routes/public.js tests/raf.test.js
git commit -m "Eczane analitik T3: raf okutmalarina ip_hash kaydi"
```

---

### Task 4: `/eczaci/:kod/tikla/pdf` ucu + eczacı PDF linkini takip edilebilir yap

**Files:**
- Modify: `routes/public.js:85-101` (`GET /eczaci/:kod`)
- Modify: `views/public/eczaci.ejs`
- Test: `tests/eczaci.test.js`

**Bağlam:** `views/public/eczaci.ejs`'te PDF linki şu an doğrudan `<a href="<%= veri.eczaci_pdf_url %>">` şeklinde — bu satır değişecek. `veri.kod` alanı eczacı sorgusunda select edilmiyor ama route parametresi (`req.params.kod`) zaten mevcut, view'a ayrıca geçirilecek.

- [ ] **Step 1: Write the failing test**

`tests/eczaci.test.js`'teki `test('geçerli kod 200 döner, içerik gösterilir, okutma kaydedilir', ...)` testinin (satır 35-46) hemen altına ekle:

```javascript
  test('PDF tıklaması kaydedilir ve redirect eder', async () => {
    const res = await request(app).get(`/eczaci/${eczaciKod}/tikla/pdf`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://ornek.com/egitim.pdf');
    const sayi = (await pool.query(
      "SELECT COUNT(*) FROM eczaci_tiklamalar WHERE eczane_id = $1 AND tip = 'pdf'", [eczaneId]
    )).rows[0].count;
    expect(Number(sayi)).toBeGreaterThan(0);
  });

  test('PDF linki sayfada takip edilen url üzerinden geçer', async () => {
    const res = await request(app).get(`/eczaci/${eczaciKod}`);
    expect(res.text).toContain(`/eczaci/${eczaciKod}/tikla/pdf`);
    expect(res.text).not.toContain('https://ornek.com/egitim.pdf');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/eczaci.test.js -t "PDF"`
Expected: FAIL — `/eczaci/:kod/tikla/pdf` ucu henüz yok (404), ve sayfa hâlâ doğrudan PDF linkini içeriyor.

- [ ] **Step 3: `routes/public.js`'e yeni uç ekle**

`routes/public.js:85-101`'deki (`GET /eczaci/:kod` route'unun) hemen üstüne ekle:

```javascript
// Eczacı kartı PDF tıklama takibi
router.get('/eczaci/:kod/tikla/pdf', async (req, res) => {
  const { kod } = req.params;
  try {
    const veri = await eczaciGetir(kod);
    if (!veri || !veri.eczaci_pdf_url) return res.redirect(`/eczaci/${kod}`);
    await pool.query('INSERT INTO eczaci_tiklamalar (eczane_id, tip) VALUES ($1, $2)', [veri.eczane_id, 'pdf']);
    res.redirect(veri.eczaci_pdf_url);
  } catch (err) {
    console.error(err);
    res.redirect(`/eczaci/${kod}`);
  }
});

```

**Önemli:** Bu route, mevcut `GET /eczaci/:kod` route'undan **önce** tanımlanmalı — Express route eşleştirmesinde path segment sayısı farklı olduğu için asıl bir çakışma riski yoktur, ama okunabilirlik için tıklama route'u üstte tutulur.

- [ ] **Step 4: `views/public/eczaci.ejs`'teki PDF linkini güncelle**

`views/public/eczaci.ejs`'teki şu satırı:

```html
          <a class="btn" href="<%= veri.eczaci_pdf_url %>" target="_blank">📄 Eğitim Dokümanını Aç (PDF)</a>
```

Şununla değiştir:

```html
          <a class="btn" href="/eczaci/<%= eczaciKod %>/tikla/pdf" target="_blank">📄 Eğitim Dokümanını Aç (PDF)</a>
```

- [ ] **Step 5: `routes/public.js`'teki `GET /eczaci/:kod` render çağrısına `eczaciKod` ekle**

`routes/public.js`'teki mevcut `GET /eczaci/:kod` handler'ında (`res.render('public/eczaci', { title: veri.firma_ad, veri, qrHedef, layout: false })`) satırını şununla değiştir:

```javascript
    res.render('public/eczaci', { title: veri.firma_ad, veri, qrHedef, eczaciKod: req.params.kod, layout: false });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/eczaci.test.js`
Expected: Tüm testler PASS (yeni testler dahil).

- [ ] **Step 7: Commit**

```bash
git add routes/public.js views/public/eczaci.ejs tests/eczaci.test.js
git commit -m "Eczane analitik T4: eczaci PDF tiklama takibi"
```

---

### Task 5: `GET /kurumsal/eczane/:id/detay` ucu

**Files:**
- Modify: `routes/kurumsal.js`
- Test: `tests/kurumsal.test.js`

- [ ] **Step 1: Write the failing test**

`tests/kurumsal.test.js`'e, `describe('Kurumsal panel uçları', ...)` bloğunun içine (herhangi bir mevcut testten sonra) ekle:

```javascript
  test('eczane detay ucu okutma/tıklama/pdf/ziyaret metriklerini döner', async () => {
    const agent = kurumsalAgent;
    const eczaneRes = await pool.query(
      'INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, $2, $3, $4) RETURNING id',
      [kurumsalId, 'Detay Test Eczanesi', 'detaykod1', 'detayeczaci1']
    );
    const eczaneId = eczaneRes.rows[0].id;

    await pool.query("INSERT INTO raf_okutmalar (eczane_id, ip_hash) VALUES ($1, 'hashA'), ($1, 'hashA'), ($1, 'hashB')", [eczaneId]);
    await pool.query("INSERT INTO raf_tiklamalar (eczane_id, tip) VALUES ($1, 'katalog'), ($1, 'website')", [eczaneId]);
    await pool.query("INSERT INTO eczaci_tiklamalar (eczane_id, tip) VALUES ($1, 'pdf')", [eczaneId]);

    const res = await agent.get(`/kurumsal/eczane/${eczaneId}/detay`);
    expect(res.statusCode).toBe(200);
    expect(res.body.okutma_sayisi).toBe(3);
    expect(res.body.farkli_kisi_tahmini).toBe(2);
    expect(res.body.tiklama_dagilimi.katalog).toBe(1);
    expect(res.body.tiklama_dagilimi.website).toBe(1);
    expect(res.body.pdf_acilma_sayisi).toBe(1);
    expect(Array.isArray(res.body.ziyaret_etkisi)).toBe(true);

    await pool.query('DELETE FROM eczaneler WHERE id = $1', [eczaneId]);
  });

  test('başka firmanın eczane detayı 404 döner', async () => {
    const eczaneRes = await pool.query(
      'INSERT INTO eczaneler (firma_id, ad, kod, eczaci_kod) VALUES ($1, $2, $3, $4) RETURNING id',
      [basicId, 'Baska Firma Eczanesi', 'baskakod1', 'baskaeczaci1']
    );
    const eczaneId = eczaneRes.rows[0].id;
    const res = await kurumsalAgent.get(`/kurumsal/eczane/${eczaneId}/detay`);
    expect(res.statusCode).toBe(404);
    await pool.query('DELETE FROM eczaneler WHERE id = $1', [eczaneId]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/kurumsal.test.js -t "eczane detay"`
Expected: FAIL — `/kurumsal/eczane/:id/detay` ucu henüz yok.

- [ ] **Step 3: `routes/kurumsal.js`'e yeni uç ekle**

Dosyanın sonuna, `module.exports = router;` satırından hemen önce ekle:

```javascript
router.get('/eczane/:id/detay', async (req, res) => {
  try {
    const eczaneKontrol = await pool.query(
      'SELECT id FROM eczaneler WHERE id=$1 AND firma_id=$2',
      [req.params.id, req.session.firmaId]
    );
    if (!eczaneKontrol.rows.length) return res.status(404).json({ error: 'Eczane bulunamadı.' });

    const okutma = await pool.query(
      'SELECT COUNT(*) as toplam, COUNT(DISTINCT ip_hash) as farkli_kisi FROM raf_okutmalar WHERE eczane_id=$1',
      [req.params.id]
    );
    const tiklama = await pool.query(
      'SELECT tip, COUNT(*) as sayi FROM raf_tiklamalar WHERE eczane_id=$1 GROUP BY tip',
      [req.params.id]
    );
    const pdf = await pool.query(
      "SELECT COUNT(*) as sayi FROM eczaci_tiklamalar WHERE eczane_id=$1 AND tip='pdf'",
      [req.params.id]
    );
    const ziyaretEtkisi = await pool.query(
      `WITH ziyaret_sirali AS (
        SELECT id, created_at,
               LEAD(created_at) OVER (ORDER BY created_at) AS sonraki_ziyaret
        FROM ziyaretler
        WHERE eczane_id = $1
      )
      SELECT z.created_at AS ziyaret_tarihi,
             (SELECT COUNT(*) FROM raf_okutmalar r
              WHERE r.eczane_id = $1
                AND r.created_at > z.created_at
                AND r.created_at <= COALESCE(z.sonraki_ziyaret, NOW()))
             AS sonraki_okutma_sayisi
      FROM ziyaret_sirali z
      ORDER BY z.created_at DESC`,
      [req.params.id]
    );

    const tiklamaDagilimi = {};
    tiklama.rows.forEach(r => { tiklamaDagilimi[r.tip] = Number(r.sayi); });

    res.json({
      okutma_sayisi: Number(okutma.rows[0].toplam),
      farkli_kisi_tahmini: Number(okutma.rows[0].farkli_kisi),
      tiklama_dagilimi: tiklamaDagilimi,
      pdf_acilma_sayisi: Number(pdf.rows[0].sayi),
      ziyaret_etkisi: ziyaretEtkisi.rows.map(r => ({
        ziyaret_tarihi: r.ziyaret_tarihi,
        sonraki_okutma_sayisi: Number(r.sonraki_okutma_sayisi),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Detay alınamadı.' });
  }
});

```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest tests/kurumsal.test.js`
Expected: Tüm testler PASS (yeni testler dahil).

- [ ] **Step 5: Commit**

```bash
git add routes/kurumsal.js tests/kurumsal.test.js
git commit -m "Eczane analitik T5: eczane detay ucu"
```

---

### Task 6: Panel UI — "Detay" butonu + modal (innerHTML kullanmadan, güvenli DOM inşası)

**Files:**
- Modify: `views/public/dashboard.ejs`

- [ ] **Step 1: Raf Kartları tablosuna "Detay" butonu ekle**

`views/public/dashboard.ejs:515-520`'deki (Sil butonunun olduğu `<td>`) şu anki hali:

```html
            <td>
              <form method="POST" action="/kurumsal/eczane/<%= e.id %>/sil" style="display:inline"
                    onsubmit="return confirm('<%= e.ad %> silinsin mi? Okutma geçmişi de silinir.')">
                <button type="submit">Sil</button>
              </form>
            </td>
```

Şununla değiştir:

```html
            <td>
              <button type="button" onclick="eczaneDetayGoster(<%= e.id %>, '<%= e.ad.replace(/'/g, "\\'") %>')" style="margin-right:6px">Detay</button>
              <form method="POST" action="/kurumsal/eczane/<%= e.id %>/sil" style="display:inline"
                    onsubmit="return confirm('<%= e.ad %> silinsin mi? Okutma geçmişi de silinir.')">
                <button type="submit">Sil</button>
              </form>
            </td>
```

- [ ] **Step 2: Modal HTML'i ekle**

`views/public/dashboard.ejs`'teki Raf Kartları tablosunun kapanışından hemen sonra (satır 526, tabloyu saran `table-wrap` div'inin kapanışından sonra, "TAB: SAHA İSTATİSTİKLERİ" yorumundan önce) ekle:

```html

    <!-- Eczane Detay Modal -->
    <div id="eczaneDetayModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:60;padding:16px">
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;position:relative">
        <button type="button" onclick="document.getElementById('eczaneDetayModal').style.display='none'" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:18px;cursor:pointer">✕</button>
        <h3 id="eczaneDetayBaslik" style="margin-bottom:16px;font-size:16px;font-weight:700"></h3>
        <div id="eczaneDetayIcerik" style="font-size:13px;line-height:1.7"></div>
      </div>
    </div>
```

- [ ] **Step 3: JS fonksiyonunu ekle (güvenli DOM inşası — innerHTML kullanılmaz)**

`views/public/dashboard.ejs`'in en sonundaki `<script>` bloğuna (satır 686'daki `<script>` etiketinin içine, `function openSlide()` tanımından önce) ekle:

```javascript
    function elOlustur(etiket, metin, stiller) {
      const el = document.createElement(etiket);
      if (metin !== undefined) el.textContent = metin;
      if (stiller) Object.assign(el.style, stiller);
      return el;
    }

    async function eczaneDetayGoster(eczaneId, eczaneAdi) {
      document.getElementById('eczaneDetayBaslik').textContent = eczaneAdi + ' — Detay';
      const icerik = document.getElementById('eczaneDetayIcerik');
      icerik.textContent = 'Yükleniyor...';
      document.getElementById('eczaneDetayModal').style.display = 'flex';
      try {
        const res = await fetch('/kurumsal/eczane/' + eczaneId + '/detay');
        const veri = await res.json();
        icerik.textContent = '';
        if (!res.ok) {
          icerik.textContent = veri.error || 'Detay alınamadı.';
          return;
        }
        icerik.appendChild(elOlustur('p', 'Toplam okutma: ' + veri.okutma_sayisi));
        icerik.appendChild(elOlustur('p', 'Yaklaşık farklı kişi: ' + veri.farkli_kisi_tahmini));
        icerik.appendChild(elOlustur('p', 'PDF açılma: ' + veri.pdf_acilma_sayisi));

        icerik.appendChild(elOlustur('p', 'Tıklama dağılımı:', { marginTop: '10px', fontWeight: '700' }));
        const tiklamaListesi = document.createElement('ul');
        Object.keys(veri.tiklama_dagilimi).forEach(function(tip) {
          tiklamaListesi.appendChild(elOlustur('li', tip + ': ' + veri.tiklama_dagilimi[tip]));
        });
        icerik.appendChild(tiklamaListesi);

        if (veri.ziyaret_etkisi.length) {
          icerik.appendChild(elOlustur('p', 'Ziyaret etkisi:', { marginTop: '10px', fontWeight: '700' }));
          const ziyaretListesi = document.createElement('ul');
          veri.ziyaret_etkisi.forEach(function(z) {
            const tarih = new Date(z.ziyaret_tarihi).toLocaleDateString('tr-TR');
            ziyaretListesi.appendChild(elOlustur('li', tarih + ' ziyaretinden sonra ' + z.sonraki_okutma_sayisi + ' okutma'));
          });
          icerik.appendChild(ziyaretListesi);
        }
      } catch (err) {
        icerik.textContent = 'Detay alınamadı.';
      }
    }

```

- [ ] **Step 4: Tarayıcıda manuel doğrulama**

Yerel sunucuyu başlat (`preview_start` veya `npm run dev`), kurumsal bir firma hesabıyla giriş yap, Raf Kartları sekmesine git, bir eczanenin "Detay" butonuna tıkla. Modal açılmalı ve okutma/tıklama/PDF/ziyaret bilgilerini göstermeli (veri yoksa 0/boş liste göstermeli, hata vermemeli).

- [ ] **Step 5: Commit**

```bash
git add views/public/dashboard.ejs
git commit -m "Eczane analitik T6: panel Detay butonu + modal (guvenli DOM insasi)"
```

---

### Task 7: Tam test + deploy + production doğrulama + `.env`/Railway güncelleme

**Files:** Yok (komutlar)

- [ ] **Step 1: Tüm backend testleri**

Run: `cd /c/Users/muham/kurumsal-kartvizit && npx jest`
Expected: Tüm paket PASS.

- [ ] **Step 2: `IP_HASH_SALT` env değişkenini Railway'e ekle**

Rastgele güçlü bir salt üret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Çıkan değeri Railway servis değişkenlerine `IP_HASH_SALT` olarak ekle. **Not:** Bu adım üretim yapılandırmasını değiştirdiği için, CLI ile (`railway variables set`) yapılacaksa önce kullanıcıya onaylat; onaylanmazsa Railway panelinden manuel eklenmesini iste.

- [ ] **Step 3: Push + deploy**

```bash
git push origin master
railway up --service app --detach
```

- [ ] **Step 4: Prod migration**

Run: `node scripts/migrate.js`
Expected: `ip_hash` kolonu ve `eczaci_tiklamalar` tablosu için `OK`.

- [ ] **Step 5: Deploy'un canlıya çıkışını doğrula**

Marker bir firma+eczane oluşturup (İP-3/İP-4'teki desenle), cookie ile giriş yapıp `curl` ile `/kurumsal/eczane/:id/detay` ucunun 200 döndüğünü ve beklenen alanları (`okutma_sayisi`, `farkli_kisi_tahmini`, `tiklama_dagilimi`, `pdf_acilma_sayisi`, `ziyaret_etkisi`) içerdiğini doğrula.

- [ ] **Step 6: Marker verisini temizle**

`node -e` script'i ile oluşturulan test firma/eczanesini sil.

- [ ] **Step 7: git durumu**

Run: `git status --short`
Expected: Boş.
