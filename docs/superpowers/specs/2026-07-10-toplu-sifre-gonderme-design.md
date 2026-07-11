# Toplu Şifre Oluşturma ve Gönderme — Tasarım

**Tarih:** 2026-07-10
**Durum:** Onaylandı, implementasyona alınmadı — yapılacaklar listesinde bekliyor.

## Amaç

Firma sahibi, çalışanlarına (temsilci/müdür) tek tek mobil giriş şifresi belirleyip elden iletmek yerine, panelden toplu veya seçerek şifre oluşturup doğrudan e-posta ile gönderebilsin.

## Ön Koşul

Sistemde e-posta gönderme altyapısı yok — `nodemailer` eklenmeli, kullanıcının kendi SMTP hesabı (Gmail veya kurumsal) `.env`'e `SMTP_HOST/PORT/USER/PASS` olarak girilmeli. Bu implementasyon başlamadan önce kullanıcıdan alınacak.

## Kapsam

- Çalışan toplu Excel yükleme **kapsam dışı** — çalışanlar mevcut yöntemle (panelden tek tek) eklenmeye devam eder.
- Bu özellik sadece: giriş e-postası girilmiş (veya normal e-postadan türetilebilecek) çalışanlara toplu/seçerek şifre üretip mail atma adımını kapsar.

## Akış

1. **Panel — Çalışanlar sekmesi:** Her satıra checkbox eklenir (eczane toplu işlem desenindeki gibi). Üstte iki buton:
   - **"Seçilenlere Gönder"**
   - **"Giriş Bilgisi Olmayan Herkese Gönder"**
2. **Backend (`POST /kurumsal/calisan/sifre-gonder`):** Seçilen her çalışan için:
   - `giris_email` boşsa, `calisanlar.email` alanı `giris_email` olarak kullanılır ve kaydedilir.
   - Hiç e-postası olmayan çalışan atlanır.
   - Rastgele okunaklı şifre üretilir (eczaneKod'daki karakter kümesi deseniyle, karışan karakterler hariç, ~10 hane).
   - Mail **önce gönderilir**, gönderim başarılıysa şifre hash'i bcrypt ile DB'ye yazılır (yarım başarısız durumda mevcut şifre bozulmaz).
   - Zaten şifresi olan çalışan için de yeni şifre üretilip üzerine yazılır — bu aynı zamanda şifre sıfırlama işlevi görür.
3. **Sonuç:** Ekranda şifre **gösterilmez**. Sadece özet flash mesajı: "✓ 42 kişiye gönderildi, 3 kişi atlandı (e-posta yok), 1 kişide mail gönderim hatası."

## Mail İçeriği

Türkçe, sade: "NFCKartify Mobil Giriş Bilgileriniz" başlığı, giriş e-postası + şifre, uygulamaya nasıl giriş yapılacağına dair kısa not.

## Güvenlik

- Şifre düz metin hiçbir yerde loglanmaz/saklanmaz, sadece mail gövdesinde bir kereliğine gönderilir.
- Firma sahibi dahil kimse ekrandan şifreyi göremez.

## Test Planı (implementasyon başladığında)

- giris_email boş + email dolu → email, giris_email olarak kullanılır.
- Hiç e-postası olmayan çalışan → atlanır, özet mesajında sayılır.
- Mail gönderimi başarısız olursa → şifre değişmez (eski hash korunur).
- Zaten şifresi olan çalışan → yeni şifre üretilip üzerine yazılır.
- "Giriş Bilgisi Olmayan Herkese Gönder" → sadece giris_sifre_hash NULL olanları hedefler.
