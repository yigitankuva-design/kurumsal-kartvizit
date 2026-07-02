const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { firmaSlugOlustur, benzersizCalisanSlugOlustur } = require('../utils/slug');
const { biyografiTemizle } = require('../utils/sanitize');

class GecersizProfilHatasi extends Error {}
class AbonelikSuresiDolmusHatasi extends Error {}

function adSoyadAyir(adSoyad) {
  const parcalar = adSoyad.trim().split(/\s+/);
  if (parcalar.length === 1) return { ad: parcalar[0], soyad: '' };
  return { ad: parcalar.slice(0, -1).join(' '), soyad: parcalar[parcalar.length - 1] };
}

async function profilOlustur(bayiId, alanlar, fotoUrl) {
  const {
    isletme_adi, sektor, marka_rengi,
    ad_soyad, unvan, departman, telefon, email, adres, biyografi,
    linkedin, instagram, twitter, youtube, website, whatsapp, tiktok,
    sahibinden, hurriyet_emlak, google_yorum_link, kvkk,
  } = alanlar;

  if (!ad_soyad || !ad_soyad.trim()) {
    throw new GecersizProfilHatasi('Ad soyad zorunlu.');
  }
  if (!kvkk) {
    throw new GecersizProfilHatasi('Devam etmek için KVKK onayı gerekiyor.');
  }
  const { ad, soyad } = adSoyadAyir(ad_soyad);
  if (!soyad) {
    throw new GecersizProfilHatasi('Lütfen ad ve soyadı birlikte yazın.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bayiSonuc = await client.query(
      'SELECT abonelik_bitis_tarihi FROM bayiler WHERE id = $1 FOR UPDATE',
      [bayiId]
    );
    if (!bayiSonuc.rows.length) {
      throw new GecersizProfilHatasi('Bayi bulunamadı.');
    }
    const bitisTarihi = bayiSonuc.rows[0].abonelik_bitis_tarihi;
    if (bitisTarihi && new Date(bitisTarihi) < new Date()) {
      throw new AbonelikSuresiDolmusHatasi('Aboneliğinizin süresi dolmuş. Lütfen bizimle iletişime geçin.');
    }

    const firmaAd = (isletme_adi && isletme_adi.trim()) || `${ad} ${soyad}`;
    let slug = firmaSlugOlustur(firmaAd);
    const check = await client.query('SELECT id FROM firmalar WHERE slug = $1', [slug]);
    if (check.rows.length) slug = `${slug}-${Date.now()}`;

    const dummyEmail = `${slug}-${Date.now()}@bayi.local`;
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 8);

    const firmaSonuc = await client.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, sektor, marka_rengi, bayi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [firmaAd, slug, dummyEmail, dummyHash, sektor || 'diger', marka_rengi || '#1a73e8', bayiId]
    );
    const firmaId = firmaSonuc.rows[0].id;

    const calisanSlug = await benzersizCalisanSlugOlustur(firmaId, ad, soyad);
    const biyografiTemiz = biyografiTemizle(biyografi);

    await client.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, unvan, departman, telefon, email, adres,
        linkedin, instagram, twitter, youtube, website, whatsapp, tiktok, sahibinden,
        hurriyet_emlak, google_yorum_link, biyografi, foto_url, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [firmaId, ad, soyad, unvan || null, departman || null, telefon || null, email || null, adres || null,
       linkedin || null, instagram || null, twitter || null, youtube || null, website || null,
       whatsapp || null, tiktok || null, sahibinden || null, hurriyet_emlak || null, google_yorum_link || null,
       biyografiTemiz, fotoUrl || null, calisanSlug]
    );

    await client.query('COMMIT');
    return { firmaId, firmaSlug: slug, calisanSlug, ad, soyad };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { profilOlustur, adSoyadAyir, GecersizProfilHatasi, AbonelikSuresiDolmusHatasi };
