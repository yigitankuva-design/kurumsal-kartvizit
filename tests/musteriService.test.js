require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const {
  profilOlustur,
  GecersizProfilHatasi,
  AbonelikSuresiDolmusHatasi,
} = require('../services/musteriService');

describe('services/musteriService.profilOlustur', () => {
  let bayiId;

  beforeAll(async () => {
    const hash = await bcrypt.hash('test1234', 8);
    const sonuc = await pool.query(
      `INSERT INTO bayiler (ad, slug, email, sifre_hash)
       VALUES ('Musteri Servis Test Bayi', 'musteri-servis-test-bayi', 'musteriservistest@example.com', $1)
       RETURNING id`,
      [hash]
    );
    bayiId = sonuc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bayiler WHERE id = $1', [bayiId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM firmalar WHERE bayi_id = $1', [bayiId]);
  });

  test('geçerli veriyle firma+çalışan oluşturur, slug döner', async () => {
    const sonuc = await profilOlustur(bayiId, { ad_soyad: 'Ahmet Yılmaz', kvkk: 'on' }, null);
    expect(sonuc.firmaId).toBeDefined();
    expect(sonuc.ad).toBe('Ahmet');
    expect(sonuc.soyad).toBe('Yılmaz');
    expect(sonuc.firmaSlug).toBeTruthy();
    expect(sonuc.calisanSlug).toBeTruthy();
  });

  test('ad_soyad boşsa GecersizProfilHatasi fırlatır', async () => {
    await expect(profilOlustur(bayiId, { kvkk: 'on' }, null)).rejects.toThrow(GecersizProfilHatasi);
  });

  test('kvkk onayı yoksa GecersizProfilHatasi fırlatır', async () => {
    await expect(profilOlustur(bayiId, { ad_soyad: 'Ahmet Yılmaz' }, null)).rejects.toThrow(GecersizProfilHatasi);
  });

  test('sadece tek kelimelik ad_soyad ile GecersizProfilHatasi fırlatır', async () => {
    await expect(profilOlustur(bayiId, { ad_soyad: 'Ahmet', kvkk: 'on' }, null)).rejects.toThrow(GecersizProfilHatasi);
  });

  test('abonelik süresi dolmuşsa AbonelikSuresiDolmusHatasi fırlatır', async () => {
    await pool.query("UPDATE bayiler SET abonelik_bitis_tarihi = '2020-01-01' WHERE id = $1", [bayiId]);
    await expect(profilOlustur(bayiId, { ad_soyad: 'Ahmet Yılmaz', kvkk: 'on' }, null))
      .rejects.toThrow(AbonelikSuresiDolmusHatasi);
    await pool.query('UPDATE bayiler SET abonelik_bitis_tarihi = NULL WHERE id = $1', [bayiId]);
  });
});
