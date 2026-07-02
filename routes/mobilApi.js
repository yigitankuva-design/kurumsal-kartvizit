const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { bayiTokenUret } = require('../utils/jwt');
const { createJsonLimiter } = require('../middleware/rateLimiter');

const mobilGirisLimiter = createJsonLimiter('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.');

router.post('/giris', mobilGirisLimiter, async (req, res) => {
  const { giris_bilgisi, sifre } = req.body;
  if (!giris_bilgisi || !sifre) {
    return res.status(400).json({ ok: false, error: 'E-posta/kullanıcı adı ve şifre zorunlu.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM bayiler WHERE (email = $1 OR kullanici_adi = $1) AND aktif = true',
      [giris_bilgisi]
    );
    if (!result.rows.length) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const bayi = result.rows[0];
    const eslesme = await bcrypt.compare(sifre, bayi.sifre_hash);
    if (!eslesme) {
      return res.status(401).json({ ok: false, error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
    }
    const token = bayiTokenUret(bayi.id);
    res.json({ ok: true, token, bayi: { id: bayi.id, ad: bayi.ad } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});

module.exports = router;
