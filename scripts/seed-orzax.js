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
