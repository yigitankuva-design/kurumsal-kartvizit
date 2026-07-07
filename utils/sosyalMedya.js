function tamLinkMi(deger) {
  return /^https?:\/\//i.test(deger);
}

function kullaniciAdiTemizle(deger) {
  return deger.trim().replace(/^[@#]+/, '');
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
  const temiz = deger.trim();
  if (!temiz) return null;
  if (tamLinkMi(temiz)) return temiz;
  if (temiz.toLowerCase().includes('tiktok.com')) return `https://${temiz}`;
  const kullaniciAdi = kullaniciAdiTemizle(temiz);
  return kullaniciAdi ? `https://tiktok.com/@${kullaniciAdi}` : null;
}

function youtubeLinkOlustur(deger) {
  if (!deger) return null;
  const temiz = deger.trim();
  if (!temiz) return null;
  if (tamLinkMi(temiz)) return temiz;
  if (temiz.toLowerCase().includes('youtube.com') || temiz.toLowerCase().includes('youtu.be')) {
    return `https://${temiz}`;
  }
  const kullaniciAdi = kullaniciAdiTemizle(temiz);
  return kullaniciAdi ? `https://youtube.com/@${kullaniciAdi}` : null;
}

function urlNormallestir(deger) {
  if (!deger) return null;
  const temiz = deger.trim();
  if (!temiz) return null;
  return tamLinkMi(temiz) ? temiz : `https://${temiz}`;
}

module.exports = { instagramLinkOlustur, twitterLinkOlustur, tiktokLinkOlustur, youtubeLinkOlustur, urlNormallestir };
