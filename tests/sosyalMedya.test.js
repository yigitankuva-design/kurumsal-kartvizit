const { instagramLinkOlustur, twitterLinkOlustur, tiktokLinkOlustur, urlNormallestir } = require('../utils/sosyalMedya');

describe('instagramLinkOlustur', () => {
  test('@ ile başlayan kullanıcı adını linke çevirir', () => {
    expect(instagramLinkOlustur('@hasan_____yigit')).toBe('https://instagram.com/hasan_____yigit');
  });

  test('@ olmadan girilen kullanıcı adını linke çevirir', () => {
    expect(instagramLinkOlustur('hasanyigit')).toBe('https://instagram.com/hasanyigit');
  });

  test('zaten tam link girilmişse dokunmaz', () => {
    expect(instagramLinkOlustur('https://instagram.com/hasanyigit')).toBe('https://instagram.com/hasanyigit');
  });

  test('boş/null için null döner', () => {
    expect(instagramLinkOlustur(null)).toBeNull();
    expect(instagramLinkOlustur('')).toBeNull();
  });
});

describe('twitterLinkOlustur', () => {
  test('@ ile başlayan kullanıcı adını linke çevirir', () => {
    expect(twitterLinkOlustur('@hasanyigit')).toBe('https://twitter.com/hasanyigit');
  });

  test('zaten tam link girilmişse dokunmaz', () => {
    expect(twitterLinkOlustur('https://twitter.com/hasanyigit')).toBe('https://twitter.com/hasanyigit');
  });
});

describe('tiktokLinkOlustur', () => {
  test('@ ile başlayan kullanıcı adını @ korunarak linke çevirir', () => {
    expect(tiktokLinkOlustur('@hasanyigit')).toBe('https://tiktok.com/@hasanyigit');
  });

  test('@ olmadan girilen kullanıcı adını da @ ekleyerek linke çevirir', () => {
    expect(tiktokLinkOlustur('hasanyigit')).toBe('https://tiktok.com/@hasanyigit');
  });

  test('zaten tam link girilmişse dokunmaz', () => {
    expect(tiktokLinkOlustur('https://tiktok.com/@hasanyigit')).toBe('https://tiktok.com/@hasanyigit');
  });
});

describe('urlNormallestir', () => {
  test('http/https ile başlamayan değere https:// ekler', () => {
    expect(urlNormallestir('www.ornek.com')).toBe('https://www.ornek.com');
  });

  test('zaten http:// ile başlıyorsa dokunmaz', () => {
    expect(urlNormallestir('http://ornek.com')).toBe('http://ornek.com');
  });

  test('zaten https:// ile başlıyorsa dokunmaz', () => {
    expect(urlNormallestir('https://ornek.com')).toBe('https://ornek.com');
  });

  test('boş/null için null döner', () => {
    expect(urlNormallestir(null)).toBeNull();
    expect(urlNormallestir('')).toBeNull();
    expect(urlNormallestir('   ')).toBeNull();
  });
});
