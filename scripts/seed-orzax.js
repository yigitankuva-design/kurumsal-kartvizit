// scripts/seed-orzax.js
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const H = require('./seedYardimcilar');

const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ORTAK_SIFRE = 'orzax2026';

async function uyariBekle() {
  console.log('\n⚠️  UYARI: Bu script TÜM firmalari (ve bagli tum veriyi) SILIP Orzax demo verisini yeniden olusturur.');
  console.log('   Bayi/superadmin girisleri ve mali kayitlar KORUNUR.');
  console.log('   Iptal icin 3 saniye icinde Ctrl+C.\n');
  await new Promise(r => setTimeout(r, 3000));
}

// Chunk'lar halinde cok-satirli INSERT. satirlar: dizi-of-dizi (her satir sutun degerleri).
async function topluEkle(client, tabloVeSutunlar, satirlar, sutunSayisi, donenId = false) {
  const CHUNK = 500;
  const idler = [];
  for (let i = 0; i < satirlar.length; i += CHUNK) {
    const dilim = satirlar.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    dilim.forEach((satir, j) => {
      const yer = [];
      satir.forEach((deger, k) => { params.push(deger); yer.push(`$${j * sutunSayisi + k + 1}`); });
      values.push(`(${yer.join(',')})`);
    });
    const ek = donenId ? ' RETURNING id' : '';
    const r = await client.query(`INSERT INTO ${tabloVeSutunlar} VALUES ${values.join(',')}${ek}`, params);
    if (donenId) r.rows.forEach(row => idler.push(row.id));
  }
  return idler;
}

async function main() {
  await uyariBekle();
  const client = await pool.connect();
  try {
    // Orzax'i baglamak icin mevcut bir bayi bul
    const bayiSonuc = await client.query('SELECT id FROM bayiler WHERE aktif = true ORDER BY id LIMIT 1');
    if (!bayiSonuc.rows.length) throw new Error('Aktif bayi bulunamadi — yanlislikla bos DB. Iptal.');
    const bayiId = bayiSonuc.rows[0].id;

    await client.query('BEGIN');
    await client.query('DELETE FROM firmalar'); // CASCADE: calisanlar/eczaneler/ziyaretler/tiklamalar/urunler/indirim/...
    console.log('Eski firma verisi temizlendi.');

    const yetkiliHash = await bcrypt.hash(ORTAK_SIFRE, 8);
    const katalogGuncelleme = new Date(Date.now() - 3 * 86400000); // 3 gün önce
    const firmaSonuc = await client.query(
      `INSERT INTO firmalar
        (ad, slug, sektor, marka_rengi, yetkili_email, kullanici_adi, yetkili_sifre_hash, paket, bayi_id,
         website, instagram, linkedin, twitter, whatsapp,
         katalog_guncelleme_tarihi, eczaci_baslik, eczaci_metin,
         indirim_aktif, indirim_yuzdesi, tema_renk, tema_isik_seviyesi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'kurumsal',$8,
         'www.orzax.com','orzaxturkiye','https://www.linkedin.com/company/orzaksilac/','orzaxturkiye','05075847646',
         $9,'Eczacılara Özel Orzax İçeriği','Orzax ürün ailesi ve eczacı desteği hakkında bilgi.',
         true,5,'#c8a84b',50)
       RETURNING id`,
      ['Orzax', 'orzax', 'saglik', '#c8a84b', 'panel@orzax.com', 'orzax', yetkiliHash, bayiId, katalogGuncelleme]
    );
    const firmaId = firmaSonuc.rows[0].id;

    // Rol kullanicilari (rol ayrimi demosu)
    const roller = [
      { ad: 'Tam Yetkili', email: 'tam@orzax.com', rol: 'tam_yetkili' },
      { ad: 'Saha Yöneticisi', email: 'saha@orzax.com', rol: 'sadece_saha' },
      { ad: 'Çalışan Sorumlusu', email: 'calisan@orzax.com', rol: 'sadece_calisan' },
    ];
    for (const r of roller) {
      await client.query(
        `INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1,$2,$3,$4,$5)`,
        [firmaId, r.ad, r.email, yetkiliHash, r.rol]
      );
    }
    console.log('Orzax firma + 3 rol kullanicisi olusturuldu.');

    const kisiler = H.hiyerarsiKur();
    const girisHash = await bcrypt.hash(ORTAK_SIFRE, 8);
    const kisiIdler = []; // gecici index -> gercek calisan id

    for (let i = 0; i < kisiler.length; i++) {
      const p = kisiler[i];
      const slug = `orzax-${i + 1}-${p.ad}-${p.soyad}`.toLowerCase()
        .replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u')
        .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
      const girisEmail = `${slug}@orzax.com`;
      const kartaYazildi = p.unvan === 'Tıbbi Mümessil' ? Math.random() < 0.7 : false;
      const r = await client.query(
        `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, slug, giris_email, giris_sifre_hash, ekip_yoneticisi, karta_yazildi, onayli)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id`,
        [firmaId, p.ad, p.soyad, p.unvan, slug, girisEmail, girisHash, p.ekip_yoneticisi, kartaYazildi]
      );
      kisiIdler.push(r.rows[0].id);
    }
    // amiri_id bagla
    for (let i = 0; i < kisiler.length; i++) {
      if (kisiler[i].amiri !== null) {
        await client.query('UPDATE calisanlar SET amiri_id=$1 WHERE id=$2', [kisiIdler[kisiler[i].amiri], kisiIdler[i]]);
      }
    }
    console.log(`${kisiler.length} calisan (hiyerarsi) olusturuldu.`);

    const eczaneler = H.eczaneleriUret(kisiler, 1000);
    const eczaneSatirlari = eczaneler.map(e => {
      const musteriYazildi = Math.random() < 0.8;
      const musteriKilitli = musteriYazildi && Math.random() < 0.3;
      const eczaciYazildi = Math.random() < 0.7;
      const eczaciKilitli = eczaciYazildi && Math.random() < 0.25;
      const durum = Math.random() < 0.05 ? 'pasif' : 'aktif';
      return [
        firmaId, e.ad, e.adres, e.kod, e.eczaci_kod,
        musteriYazildi, musteriKilitli, musteriYazildi ? H.trendliTarih() : null,
        eczaciYazildi, eczaciKilitli, eczaciYazildi ? H.trendliTarih() : null,
        durum,
      ];
    });
    const eczaneIdler = await topluEkle(
      client,
      `eczaneler (firma_id, ad, adres, kod, eczaci_kod, musteri_karta_yazildi, musteri_kart_kilitli, musteri_kart_yazma_tarihi, eczaci_karta_yazildi, eczaci_kart_kilitli, eczaci_kart_yazma_tarihi, durum)`,
      eczaneSatirlari, 12, true
    );
    // gecici index -> gercek eczane id
    eczaneler.forEach((e, i) => { e.id = eczaneIdler[i]; });
    console.log(`${eczaneler.length} eczane olusturuldu.`);

    const urunSatirlari = H.URUNLER.map((ad, i) => [firmaId, ad, `${ad} — Orzax ürün ailesi.`, i, true]);
    const urunIdler = await topluEkle(
      client, `urunler (firma_id, ad, aciklama, sira, aktif)`, urunSatirlari, 5, true
    );
    console.log(`${urunIdler.length} urun olusturuldu.`);

    const crypto = require('crypto');
    const ipHash = () => crypto.createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 32);

    // Eczane popülerlik ağırlığı (1..5)
    const eczanePop = eczaneler.map(() => 1 + Math.floor(Math.random() * 5));

    // raf_okutmalar (~8000) — ip_hash'li
    const rafOkutma = [];
    eczaneler.forEach((e, i) => {
      const adet = eczanePop[i] * (1 + Math.floor(Math.random() * 3)); // ~ort 8
      for (let n = 0; n < adet; n++) rafOkutma.push([e.id, H.trendliTarih(), ipHash()]);
    });
    await topluEkle(client, `raf_okutmalar (eczane_id, created_at, ip_hash)`, rafOkutma, 3);

    // raf_tiklamalar (~5000)
    const rafTikla = [];
    eczaneler.forEach((e, i) => {
      const adet = Math.floor(eczanePop[i] * (0.5 + Math.random() * 1.5));
      for (let n = 0; n < adet; n++) rafTikla.push([e.id, H.rastgele(H.RAF_TIP), H.trendliTarih()]);
    });
    await topluEkle(client, `raf_tiklamalar (eczane_id, tip, created_at)`, rafTikla, 3);

    // eczaci_okutmalar (~4000) — sadece eczaci karti yazili eczanelere
    const eczaciOkutma = [];
    eczaneler.forEach((e, i) => {
      const adet = 2 + Math.floor(Math.random() * eczanePop[i]);
      for (let n = 0; n < adet; n++) eczaciOkutma.push([e.id, H.trendliTarih()]);
    });
    await topluEkle(client, `eczaci_okutmalar (eczane_id, created_at)`, eczaciOkutma, 2);

    // eczaci_tiklamalar (~2500) — tip 'pdf'
    const eczaciTikla = [];
    eczaneler.forEach((e, i) => {
      const adet = 1 + Math.floor(Math.random() * eczanePop[i]);
      for (let n = 0; n < adet; n++) eczaciTikla.push([e.id, 'pdf', H.trendliTarih()]);
    });
    await topluEkle(client, `eczaci_tiklamalar (eczane_id, tip, created_at)`, eczaciTikla, 3);

    // urun_tiklamalar (~6000) — ilk 3 urun agirlikli
    const urunAgirlik = urunIdler.map((_, i) => (i < 3 ? 10 : 1));
    const urunTikla = [];
    eczaneler.forEach((e, i) => {
      const adet = Math.floor(eczanePop[i] * (0.8 + Math.random() * 1.5));
      for (let n = 0; n < adet; n++) {
        const ui = H.agirlikliIndeks(urunAgirlik);
        urunTikla.push([urunIdler[ui], e.id, H.trendliTarih()]);
      }
    });
    await topluEkle(client, `urun_tiklamalar (urun_id, eczane_id, created_at)`, urunTikla, 3);

    // ziyaretler — mümessil bazlı; performans farkı
    const NOTLAR = ['Stok kontrolü yapıldı.', 'Yeni ürün tanıtıldı.', 'Eczacı ilgili, tekrar ziyaret planlandı.', 'Kampanya bilgisi verildi.', 'Raf düzenlemesi önerildi.', 'Sipariş alındı.', null, null];
    // mümessil index -> eczane id listesi
    const mumessilEczane = {};
    eczaneler.forEach(e => { (mumessilEczane[e.mumessilIndex] ??= []).push(e); });
    const mumessilIndexleri = kisiler.map((p, i) => (p.unvan === 'Tıbbi Mümessil' ? i : -1)).filter(i => i >= 0);
    const ziyaretler = [];
    mumessilIndexleri.forEach((mi, sira) => {
      const kendiEczaneleri = mumessilEczane[mi] || [];
      const geride = sira % 7 === 0;   // ~%15 geride
      const yildiz = sira % 10 === 0;  // ~%10 yildiz
      kendiEczaneleri.forEach(e => {
        const ziyaretSayisi = yildiz ? 4 + Math.floor(Math.random() * 4) : geride ? Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3);
        for (let n = 0; n < ziyaretSayisi; n++) {
          let tarih;
          if (geride) { const g = 60 + Math.floor(Math.random() * 60); tarih = new Date(Date.now() - g * 86400000); }
          else tarih = H.trendliTarih();
          ziyaretler.push([kisiIdler[mi], e.id, H.rastgele(NOTLAR), e.lat, e.lng, tarih]);
        }
      });
    });
    await topluEkle(client, `ziyaretler (calisan_id, eczane_id, temsilci_notu, lat, lng, created_at)`, ziyaretler, 6);

    console.log(`Aktivite: ${rafOkutma.length} raf okutma, ${rafTikla.length} raf tik, ${eczaciOkutma.length} eczaci okutma, ${eczaciTikla.length} eczaci tik, ${urunTikla.length} urun tik, ${ziyaretler.length} ziyaret.`);

    // 600 eczanede %5 indirim kodu
    const karisik = [...eczaneler].sort(() => Math.random() - 0.5).slice(0, 600);
    const indirimKodlar = H.benzersizKodlar(600);
    const indirimSatirlari = karisik.map((e, i) => {
      const kullanildi = Math.random() < 0.4;
      return [
        firmaId, e.id, indirimKodlar[i], 5,
        crypto.createHash('sha256').update('cerez' + Math.random()).digest('hex').slice(0, 24),
        kullanildi, kullanildi ? H.trendliTarih() : null,
      ];
    });
    await topluEkle(client, `indirim_kodlari (firma_id, eczane_id, kod, yuzde, cerez_id, kullanildi, kullanilma_tarihi)`, indirimSatirlari, 7);
    console.log(`600 eczanede %5 indirim kodu olusturuldu.`);

    // Katalog bildirimi: mümessillerin ~yarısı yeni katalogu görmüş
    for (let i = 0; i < kisiler.length; i++) {
      if (kisiler[i].unvan === 'Tıbbi Mümessil' && Math.random() < 0.5) {
        await client.query('UPDATE calisanlar SET son_gorulen_katalog_tarihi=$1 WHERE id=$2',
          [new Date(Date.now() - 1 * 86400000), kisiIdler[i]]); // katalog güncellemesinden (3 gün önce) sonra
      }
    }
    console.log('Katalog gorulme durumlari ayarlandi.');

    await client.query('COMMIT');
    console.log('\n✅ Seed tamamlandi.');
    console.log(`Bagli bayi id: ${bayiId}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('HATA — rollback yapildi:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
