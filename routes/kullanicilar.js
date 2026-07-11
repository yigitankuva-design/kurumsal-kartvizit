const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db');

const GECERLI_ROLLER = ['tam_yetkili', 'sadece_calisan', 'sadece_saha'];

router.post('/ekle', async (req, res) => {
  const { ad, email, sifre, rol } = req.body;
  if (!ad || !email || !sifre || !GECERLI_ROLLER.includes(rol)) {
    req.flash('error', 'Tüm alanları doğru şekilde doldurun.');
    return res.redirect('/?tab=kullanicilar');
  }
  try {
    const hash = await bcrypt.hash(sifre, 12);
    await pool.query(
      'INSERT INTO firma_kullanicilari (firma_id, ad, email, sifre_hash, rol) VALUES ($1, $2, $3, $4, $5)',
      [req.session.firmaId, ad.trim(), email.trim(), hash, rol]
    );
    req.flash('success', 'Kullanıcı eklendi.');
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      req.flash('error', 'Bu e-posta zaten kayıtlı.');
    } else {
      req.flash('error', 'Kullanıcı eklenemedi.');
    }
  }
  res.redirect('/?tab=kullanicilar');
});

router.post('/:id/sil', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM firma_kullanicilari WHERE id = $1 AND firma_id = $2',
      [req.params.id, req.session.firmaId]
    );
    req.flash('success', 'Kullanıcı kaldırıldı.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Kullanıcı kaldırılamadı.');
  }
  res.redirect('/?tab=kullanicilar');
});

module.exports = router;
