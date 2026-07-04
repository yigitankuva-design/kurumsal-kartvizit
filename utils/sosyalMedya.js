function tamLinkMi(deger) {
  return /^https?:\/\//i.test(deger);
}

function kullaniciAdiTemizle(deger) {
  return deger.trim().replace(/^@/, '');
}

function instagramLinkOlustur(deger) {
  if (!deger) return null;
  if (tamLinkMi(deger)) return deger;
  const kullaniciAdi = kullaniciAdiTemizle(deger);
  return kullaniciAdi ? `https://instagram.com/${kullaniciAdi}` : null;
}

function twitterLinkOlustur(deger) {
  if (!deger) return null;
  if (tamLinkMi(deger)) return deger;
  const kullaniciAdi = kullaniciAdiTemizle(deger);
  return kullaniciAdi ? `https://twitter.com/${kullaniciAdi}` : null;
}

function tiktokLinkOlustur(deger) {
  if (!deger) return null;
  if (tamLinkMi(deger)) return deger;
  const kullaniciAdi = kullaniciAdiTemizle(deger);
  return kullaniciAdi ? `https://tiktok.com/@${kullaniciAdi}` : null;
}

function urlNormallestir(deger) {
  if (!deger) return null;
  const temiz = deger.trim();
  if (!temiz) return null;
  return tamLinkMi(temiz) ? temiz : `https://${temiz}`;
}

module.exports = { instagramLinkOlustur, twitterLinkOlustur, tiktokLinkOlustur, urlNormallestir };
