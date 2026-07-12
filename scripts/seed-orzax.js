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

    // (Sonraki task'larda burasi doldurulacak)

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
