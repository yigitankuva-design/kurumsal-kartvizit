require('dotenv').config();
const { pool } = require('../db');
const { normalizeSlug, firmaSlugOlustur, calisanSlugTabanOlustur, benzersizCalisanSlugOlustur } = require('../utils/slug');

describe('normalizeSlug', () => {
  test('Türkçe karakterleri normalize eder', () => {
    expect(normalizeSlug('Pfizer Türkiye')).toBe('pfizer-turkiye');
  });

  test('özel karakterleri kaldırır', () => {
    expect(normalizeSlug('ABC & Co.')).toBe('abc-co');
  });

  test('80 karakteri aşan girdiyi keser', () => {
    const uzunMetin = 'kelime '.repeat(20).trim();
    const sonuc = normalizeSlug(uzunMetin);
    expect(sonuc.length).toBeLessThanOrEqual(80);
    expect(sonuc.endsWith('-')).toBe(false);
  });
});

describe('firmaSlugOlustur', () => {
  test('normalizeSlug ile aynı sonucu üretir', () => {
    expect(firmaSlugOlustur('Pfizer Türkiye')).toBe('pfizer-turkiye');
  });
});

describe('calisanSlugTabanOlustur', () => {
  test('ad-soyad formatında slug üretir', () => {
    expect(calisanSlugTabanOlustur('Ali', 'Yılmaz')).toBe('ali-yilmaz');
  });

  test('Türkçe karakterli ad-soyad normalize edilir', () => {
    expect(calisanSlugTabanOlustur('Ömer', 'Çağlar')).toBe('omer-caglar');
  });
});

describe('benzersizCalisanSlugOlustur', () => {
  let firmaId;

  beforeAll(async () => {
    const sonuc = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash)
       VALUES ('Test Firma Slug Kontrol', 'test-firma-slug-kontrol', 'test-slug-kontrol@test.com', 'x')
       RETURNING id`
    );
    firmaId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('çakışma yoksa taban slug döner', async () => {
    const slug = await benzersizCalisanSlugOlustur(firmaId, 'Ali', 'Yilmaz');
    expect(slug).toBe('ali-yilmaz');
  });

  test('çakışma varsa -2 eklenir', async () => {
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Ali', 'Yilmaz', 'ali-yilmaz')`,
      [firmaId]
    );
    const slug = await benzersizCalisanSlugOlustur(firmaId, 'Ali', 'Yilmaz');
    expect(slug).toBe('ali-yilmaz-2');
  });

  test('art arda iki çakışma varsa -3 eklenir', async () => {
    await pool.query(
      `INSERT INTO calisanlar (firma_id, ad, soyad, slug) VALUES ($1, 'Ali', 'Yilmaz', 'ali-yilmaz-2')`,
      [firmaId]
    );
    const slug = await benzersizCalisanSlugOlustur(firmaId, 'Ali', 'Yilmaz');
    expect(slug).toBe('ali-yilmaz-3');
  });
});
