# Kurumsal NFC Kartvizit Sistemi — Tasarım Spesifikasyonu

**Tarih:** 2026-06-28  
**Durum:** Onaylandı

---

## Genel Bakış

Büyük firmaların (ilaç, banka, sigorta vb.) çalışanlarına toplu NFC dijital kartvizit sistemi. Firma yetkilisi çalışanlarını yönetir; her çalışana benzersiz URL üretilir ve NFC kartına yazılır. Kart hiç değişmez — içerik güncellenir.

---

## Stack

- **Backend:** Node.js / Express
- **Şablon:** EJS
- **Veritabanı:** PostgreSQL (Railway)
- **Dosya Depolama:** Railway Object Storage (S3-uyumlu)
- **Auth:** express-session + bcrypt
- **Deploy:** Railway

---

## Kullanıcı Tipleri

| Tip | Erişim |
|-----|--------|
| Süper Admin | Tüm firmaları görür, firma ekler/siler |
| Firma Yetkilisi | Kendi çalışanlarını yönetir (ekle, güncelle, pasife al) |
| Çalışan | Giriş yok — NFC okutunca profili açılır |

---

## Mimari

Domain-bazlı modüler Express uygulaması.

```
kurumsal-kartvizit/
├── routes/
│   ├── auth.js          → /firma/giris, /firma/kayit, /firma/cikis
│   ├── panel.js         → /firma/panel/** (session korumalı)
│   ├── superadmin.js    → /superadmin/** (ayrı session)
│   └── public.js        → /:firma-slug/:calisan-slug
├── views/
│   ├── auth/            → giris.ejs, kayit.ejs
│   ├── panel/           → panel.ejs, ekle.ejs, duzenle.ejs
│   ├── superadmin/      → index.ejs
│   └── public/          → profil.ejs, 404.ejs
├── middleware/
│   ├── authMiddleware.js  → session kontrolü
│   └── upload.js          → Railway Object Storage (multer-s3)
├── db/
│   └── index.js           → pg pool
├── public/                → CSS, JS, görseller
└── app.js
```

**Auth detayı:**
- Firma yetkilisi: `req.session.firmaId` set edilir
- Süper admin: `req.session.superadmin = true` set edilir
- Her route grubu kendi middleware'ini kullanır

---

## Veritabanı

```sql
CREATE TABLE firmalar (
  id               SERIAL PRIMARY KEY,
  ad               TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,       -- URL'de kullanılır: /pfizer/...
  logo_url         TEXT,
  marka_rengi      TEXT DEFAULT '#1a73e8',     -- hex renk kodu
  sektor           TEXT DEFAULT 'diger',       -- 'ilac' | 'banka' | 'sigorta' | 'diger'
  yetkili_email    TEXT UNIQUE NOT NULL,
  yetkili_sifre_hash TEXT NOT NULL,
  paket            TEXT DEFAULT 'basic',       -- alan var, kısıtlama yok şimdilik
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE calisanlar (
  id               SERIAL PRIMARY KEY,
  firma_id         INTEGER REFERENCES firmalar(id) ON DELETE CASCADE,
  ad               TEXT NOT NULL,
  soyad            TEXT NOT NULL,
  unvan            TEXT,
  departman        TEXT,
  telefon          TEXT,
  email            TEXT,
  linkedin         TEXT,
  foto_url         TEXT,                       -- Railway Object Storage URL
  biyografi        TEXT,                       -- kısa tanıtım yazısı
  ilaclar          TEXT[],                     -- sadece sektor='ilac' firmalar kullanır
  slug             TEXT NOT NULL,              -- nanoid(8), firm içinde unique
  durum            TEXT DEFAULT 'aktif',       -- 'aktif' | 'pasif'
  goruntuleme_sayisi INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE(firma_id, slug)
);
```

---

## Sayfa Yapısı

| URL | Açıklama | Erişim |
|-----|----------|--------|
| `/firma/kayit` | Firma kayıt formu | Public |
| `/firma/giris` | Yetkili giriş | Public |
| `/firma/cikis` | Oturum kapat | Yetkili |
| `/firma/panel` | Ana panel (tab'lı) | Yetkili |
| `/firma/panel/ekle` | Tek çalışan ekleme | Yetkili |
| `/firma/panel/:id/duzenle` | Çalışan düzenleme | Yetkili |
| `/firma/panel/toplu-yukle` | Excel import | Yetkili |
| `/:firma-slug/:calisan-slug` | Public profil (NFC hedefi) | Herkese Açık |
| `/superadmin` | Tüm firmalar listesi | Süper Admin |

---

## Profil Sayfası (Public)

**Düzen:** Kart + Bio + Etiketler

Yapı (yukarıdan aşağıya):
1. **Üst band** — firma marka rengi, firma logosu
2. **Profil kartı** — çalışan fotoğrafı (yoksa isim harfleri/initials), ad-soyad, unvan, departman
3. **Bio** — kısa tanıtım yazısı (varsa)
4. **İlaç etiketleri** — firma sektörü `ilac` ise `ilaclar` dizisini etiket olarak göster
5. **İletişim butonları** — telefon (tel: link), email (mailto: link), LinkedIn
6. **"Rehbere Kaydet"** butonu — `.vcf` (vCard 3.0) dosyası indirir; ad, soyad, telefon, email, şirket, unvan bilgilerini içerir
7. **Footer** — firma adı

**Pasif çalışan:** 404 sayfası döner, "Bu profil artık aktif değil." mesajı.  
**Var olmayan slug:** 404 sayfası döner.

**Görüntülenme sayacı:** Her GET isteğinde `goruntuleme_sayisi` +1 güncellenir (bot filtreleme yok, basit).

---

## Firma Paneli

**Düzen:** Tab'lı tek sayfa (`/firma/panel?tab=calisanlar`)

### Çalışanlar Tab'ı (varsayılan)
- Üstte sayaç chip'leri: Aktif: N | Pasif: N
- Sağ üstte: "Yeni Çalışan" butonu + "Excel Yükle" butonu
- Tablo sütunları: Ad Soyad | Unvan | Durum | Profil URL | İşlemler (Düzenle / Pasif Yap)
- Pasif çalışanlar tabloda görünür, satır soluk renkte

### İstatistik Tab'ı
- Özet kartlar: Toplam çalışan, Aktif, Pasif, Toplam görüntülenme
- Çalışan bazlı görüntülenme tablosu: Ad Soyad | Görüntülenme | Durum

### Excel Yükle Tab'ı
- Şablon `.xlsx` indirme linki
- Dosya yükleme formu
- Yükleme sonucu: "X çalışan eklendi, Y hata"

---

## Excel Import

**Şablon sütunları (sırayla):**
`ad | soyad | unvan | departman | telefon | email | linkedin | biyografi`

**Kurallar:**
- Slug her satır için otomatik üretilir (nanoid 8 karakter)
- `ad` ve `soyad` zorunlu; diğerleri opsiyonel
- Boş satırlar atlanır
- Email format kontrolü yapılır; hatalı satırlar raporlanır, diğerleri eklenir
- Foto upload sonradan yapılır (Excel'de foto yok)

---

## Slug Üretimi

- **Çalışan slug:** `nanoid(8)` — örn. `xK9mP2qR` — firma içinde unique kontrolü yapılır
- **Firma slug:** Firma adından türetilir (Türkçe karakter normalize + boşluk → tire) — örn. `pfizer-turkiye`. Çakışma olursa sayı eklenir: `pfizer-turkiye-2`.

---

## Dosya Yükleme (Railway Object Storage)

- Çalışan foto: `multer` + `@aws-sdk/client-s3` ile Railway Object Storage'a yükle
- Firma logo: aynı yöntem
- Bucket: tek bucket, path yapısı: `firmalar/{firma_id}/logo.jpg`, `calisanlar/{calisan_id}/foto.jpg`
- Boyut limiti: 5 MB, kabul edilen: `image/jpeg`, `image/png`, `image/webp`

---

## Süper Admin

`/superadmin` — ayrı oturum (`SUPERADMIN_PASSWORD` env değişkeni ile giriş)

- Tüm firmaları listeler: Ad, Slug, Sektör, Çalışan Sayısı, Kayıt Tarihi
- Firma detayı görme
- Firma silme (çalışanlarıyla birlikte — CASCADE)
- Yeni firma ekleme (yetkili email + şifre belirleme)

---

## Ortam Değişkenleri (Environment Variables)

```
DATABASE_URL
SESSION_SECRET
SUPERADMIN_PASSWORD
RAILWAY_STORAGE_BUCKET
RAILWAY_STORAGE_ENDPOINT
RAILWAY_STORAGE_ACCESS_KEY
RAILWAY_STORAGE_SECRET_KEY
PORT (Railway otomatik sağlar)
```

---

## Güvenlik Notları

- Şifreler bcrypt (salt rounds: 12) ile hash'lenir
- Session cookie: `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`
- Panel route'ları `authMiddleware` ile korunur
- Dosya yükleme: MIME type + boyut kontrolü
- SQL injection: pg parametrik sorgular (`$1`, `$2`)
- XSS: EJS varsayılan escape (`<%=` kullanılır, `<%-` sadece güvenli içerikte)
