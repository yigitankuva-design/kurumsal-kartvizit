const CEVIRILER = {
  tr: {
    telefon: 'Telefon',
    eposta: 'E-posta',
    linkedin_buton: 'Profili Görüntüle',
    instagram_buton: 'Profili Görüntüle',
    twitter_buton: 'Profili Görüntüle',
    youtube_buton: 'Kanalı Görüntüle',
    website_buton: 'Ziyaret Et',
    whatsapp_buton: 'Mesaj Gönder',
    tiktok_buton: 'Profili Görüntüle',
    sahibinden_buton: 'İlanı Görüntüle',
    hurriyet_emlak_buton: 'İlanı Görüntüle',
    rehbere_ekle: 'Rehbere Ekle',
    google_degerlendir: 'Google\'da Değerlendir',
    qr_goster: 'QR Kodu Göster',
    imza_al: 'E-posta İmzası Al',
    calisilan_urunler: 'Çalışılan Ürünler',
    qr_modal_baslik: 'QR Kodu',
    qr_aciklama: 'Telefon kameranızla okutun',
    qr_indir: 'QR İndir',
    imza_modal_baslik: 'E-posta İmzası',
    imza_aciklama: 'Aşağıdaki kodu e-posta istemcinize yapıştırın',
    kopyala: 'Kopyala',
    kopyalandi: 'Kopyalandı!',
    dijital_kartvizit: 'Dijital Kartvizitim',
  },
  en: {
    telefon: 'Phone',
    eposta: 'Email',
    linkedin_buton: 'View Profile',
    instagram_buton: 'View Profile',
    twitter_buton: 'View Profile',
    youtube_buton: 'View Channel',
    website_buton: 'Visit',
    whatsapp_buton: 'Send Message',
    tiktok_buton: 'View Profile',
    sahibinden_buton: 'View Listing',
    hurriyet_emlak_buton: 'View Listing',
    rehbere_ekle: 'Add to Contacts',
    google_degerlendir: 'Leave a Google Review',
    qr_goster: 'Show QR Code',
    imza_al: 'Get Email Signature',
    calisilan_urunler: 'Products',
    qr_modal_baslik: 'QR Code',
    qr_aciklama: 'Scan with your phone camera',
    qr_indir: 'Download QR',
    imza_modal_baslik: 'Email Signature',
    imza_aciklama: 'Paste this code into your email client',
    kopyala: 'Copy',
    kopyalandi: 'Copied!',
    dijital_kartvizit: 'My Digital Business Card',
  },
};

function cevirmenOlustur(lang) {
  const sozluk = CEVIRILER[lang] || CEVIRILER.tr;
  return function t(anahtar) {
    return sozluk[anahtar] || CEVIRILER.tr[anahtar] || anahtar;
  };
}

module.exports = { cevirmenOlustur };
