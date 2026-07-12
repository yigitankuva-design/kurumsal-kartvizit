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
