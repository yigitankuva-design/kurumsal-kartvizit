require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool } = require('../db');

describe('Çalışan/ürün adlarında XSS koruması (onclick JSON attribute)', () => {
  let firmaId, agent;
  const firmaEmail = 'xss-korumasi@example.com';
  const zararliAd = "Ali' onmouseover='alert(1)";

  beforeAll(async () => {
    const hash = await bcrypt.hash('test1234', 8);
    const f = await pool.query(
      `INSERT INTO firmalar (ad, slug, yetkili_email, yetkili_sifre_hash, paket)
       VALUES ('XSS Koruma Firma', 'xss-koruma-firma', $1, $2, 'kurumsal') RETURNING id`,
      [firmaEmail, hash]
    );
    firmaId = f.rows[0].id;
    agent = request.agent(app);
    await agent.post('/giris').send({ giris_bilgisi: firmaEmail, sifre: 'test1234' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM firmalar WHERE id = $1', [firmaId]);
    await pool.end();
  });

  test('tek tırnak içeren çalışan adı onclick attribute\'unu kıramaz', async () => {
    const ekleRes = await agent.post('/firma/panel/ekle').send({
      ad: zararliAd, soyad: 'Veli', kvkk: 'on',
    });
    expect(ekleRes.statusCode).toBe(302);

    const res = await agent.get('/?tab=calisanlar');
    expect(res.statusCode).toBe(200);
    // Ham tek tırnak, onclick='...' attribute'unu kırıp yeni bir HTML attribute'u başlatmamalı
    expect(res.text).not.toContain("Ali' onmouseover=");
    // JSON içindeki tek tırnak HTML entity olarak escape edilmiş olmalı
    expect(res.text).toContain('Ali&#39; onmouseover=&#39;alert(1)');
  });
});
