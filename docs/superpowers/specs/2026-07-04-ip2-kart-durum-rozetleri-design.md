# İP-2 — Kart Durum Rozetleri & Envanter Özeti (Tasarım)

## Amaç ve Bağlam

Firma yetkilisi ve mümessil, hangi kartın fiilen yazıldığını, kilitlendiğini ve kaç
kartın yazılmayı beklediğini şu an göremiyor. Bu iş paketi, hem mobilde hem web
panelde bu durumu görünür kılar.

Onaylanmış kararlar (brainstorming, 2026-07-04):
- Eczanenin iki fiziksel kartı (müşteri/raf + eczacı) için durum **ayrı ayrı**
  takip edilir.
- Bu özellik eklenmeden önce oluşturulan kayıtlar başlangıçta "yazılmadı" (`false`)
  görünür — kabul edilebilir; yetkili isterse panelden elle "yazıldı" işaretleyebilir.

**Fiziksel not (KURAL #1):** NFC kartın kendisi renk değiştiremez (pasif çip).
Buradaki "durum" tamamen yazılımda tutulan bir bayrak/rozet — kartın fiziksel
rengiyle ilgisi yok.

Kapsam DIŞI: toplu Excel içe aktarım (İP-3), QR yedek (İP-4).

## Veri Modeli

`scripts/migrate.js`'e eklenecek migrationlar (mevcut `ALTER TABLE ... ADD COLUMN
IF NOT EXISTS` deseniyle):

```sql
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS karta_yazildi BOOLEAN DEFAULT false;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS kart_kilitli BOOLEAN DEFAULT false;
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS kart_yazma_tarihi TIMESTAMP;

ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS musteri_karta_yazildi BOOLEAN DEFAULT false;
ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS musteri_kart_kilitli BOOLEAN DEFAULT false;
ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS musteri_kart_yazma_tarihi TIMESTAMP;

ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS eczaci_karta_yazildi BOOLEAN DEFAULT false;
ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS eczaci_kart_kilitli BOOLEAN DEFAULT false;
ALTER TABLE eczaneler ADD COLUMN IF NOT EXISTS eczaci_kart_yazma_tarihi TIMESTAMP;
```

## Backend

### 1. `POST /api/mobil/kart-yazildi`

Mobil uygulamadan NFC yazımı başarılı olunca çağrılır. Bayi, temsilci veya firma
token'larından herhangi biriyle çalışır (üçünün de `requireBayiToken`/
`requireCalisanToken`/`requireFirmaToken` middleware'lerinden biri geçerli olabilir
— bu route üç ayrı middleware denemesi yerine, gövdede gelen `tip`'e göre ilgili
tabloda güncelleme yapar ve güncellenecek satırın mevcut oturumun erişimindeki bir
firmaya ait olduğunu doğrular).

Basitlik için: route `requireCalisanToken` VEYA `requireFirmaToken` VEYA
`requireBayiToken`'dan en az biriyle korunmaz — bunun yerine mevcut üç ayrı
"karta yaz" ekranının HER BİRİ zaten hangi token'la çağrıldığını biliyor
(bayi/temsilci/firma). Bu nedenle üç ayrı basit uç yerine TEK bir uç, gövdede
`token_tipi` alanı almadan, sadece Authorization header'ındaki token'ın tipini
sırayla dener: önce firma, olmazsa calisan, olmazsa bayi. İlk eşleşen kullanılır.

Girdi: `{ tip: 'calisan' | 'musteri' | 'eczaci', id: number, kilitli?: boolean }`

Tenant izolasyonu: güncellenecek satırın `firma_id`'si, token'dan çözülen
firma/bayi'nin erişimindeki firmayla eşleşmiyorsa 403.

Yardımcı fonksiyon, token'ı çözer ve **payload'daki alan adına göre** (imzanın
geçip geçmemesine göre DEĞİL) sahibinin tipini ayırt eder.

> **Kritik not:** Üç token tipi de aynı `JWT_SECRET` ile imzalandığı ve üç
> `*Dogrula` fonksiyonu da yalnızca `jwt.verify(token, secret)` yaptığı için, bir
> bayi token'ı `firmaTokenDogrula` ile de "geçerli" sayılır (imza doğru) ama
> `.firmaId` `undefined` döner. Bu yüzden ayırt etme, `try/catch` sırasına değil,
> çözülen payload'da hangi kimlik alanının bulunduğuna dayanmalıdır. `verify`
> herhangi bir `*Dogrula` ile bir kez yapılır (üçü de aynı olduğundan
> `firmaTokenDogrula` yeterli), sonra alan adına bakılır.

```javascript
async function tokenSahibiCoz(token) {
  let payload;
  try {
    payload = firmaTokenDogrula(token); // yalnizca imza dogrulama + decode
  } catch {
    return null;
  }
  if (payload.firmaId != null) {
    return { tur: 'firma', firmaId: payload.firmaId };
  }
  if (payload.calisanId != null) {
    const c = await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [payload.calisanId]);
    return c.rows.length ? { tur: 'calisan', firmaId: c.rows[0].firma_id } : null;
  }
  if (payload.bayiId != null) {
    return { tur: 'bayi', bayiId: payload.bayiId };
  }
  return null;
}

router.post('/kart-yazildi', mobilProfilLimiter, async (req, res) => {
  const { tip, id, kilitli } = req.body;
  if (!tip || !id || !['calisan', 'musteri', 'eczaci'].includes(tip)) {
    return res.status(400).json({ ok: false, error: 'tip ve id zorunlu.' });
  }
  const header = req.headers.authorization || '';
  const [bearerTip, token] = header.split(' ');
  if (bearerTip !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Giriş gerekli.' });
  }
  const sahip = await tokenSahibiCoz(token);
  if (!sahip) {
    return res.status(401).json({ ok: false, error: 'Oturum geçersiz veya süresi dolmuş.' });
  }
  try {
    const hedefFirmaId = tip === 'calisan'
      ? (await pool.query('SELECT firma_id FROM calisanlar WHERE id = $1', [id])).rows[0]?.firma_id
      : (await pool.query('SELECT firma_id FROM eczaneler WHERE id = $1', [id])).rows[0]?.firma_id;
    if (!hedefFirmaId) {
      return res.status(404).json({ ok: false, error: 'Kayıt bulunamadı.' });
    }
    if (sahip.tur === 'bayi') {
      const f = await pool.query('SELECT id FROM firmalar WHERE id = $1 AND bayi_id = $2', [hedefFirmaId, sahip.bayiId]);
      if (!f.rows.length) return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    } else if (hedefFirmaId !== sahip.firmaId) {
      return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    }

    if (tip === 'calisan') {
      await pool.query(
        'UPDATE calisanlar SET karta_yazildi = true, kart_kilitli = $1, kart_yazma_tarihi = NOW() WHERE id = $2',
        [!!kilitli, id]
      );
    } else {
      const kolonOn = tip === 'musteri' ? 'musteri' : 'eczaci';
      await pool.query(
        `UPDATE eczaneler SET ${kolonOn}_karta_yazildi = true, ${kolonOn}_kart_kilitli = $1, ${kolonOn}_kart_yazma_tarihi = NOW() WHERE id = $2`,
        [!!kilitli, id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası.' });
  }
});
```

> Not: yukarıdaki `kolonOn` şablon-string sütun adı SQL injection riski taşımaz
> çünkü `tip` zaten `['calisan','musteri','eczaci']` whitelist'inden geçirilmiş,
> kullanıcı girdisi doğrudan sütun adına gitmiyor.

### 2. Liste uçlarının genişletilmesi

`calisanlarimiz`, `eczanelerimiz`, `musteriler/:firmaId/calisanlar`, `eczanelerim`
zaten `SELECT *` veya benzer geniş seçim kullanıyor — yeni kolonlar otomatik
dönecek, ek değişiklik gerekmez (doğrulama testte yapılacak).

### 3. Web panel manuel işaretleme

`POST /kurumsal/calisan/:id/kart-isaretle` ve
`POST /kurumsal/eczane/:id/kart-isaretle` (body: `{ tip: 'musteri'|'eczaci', yazildi: boolean }`
eczane için; çalışan ucu sadece `yazildi` alır) — tenant-scoped, panelden
"Yazıldı olarak işaretle" / "İşareti kaldır" butonu için.

## Mobil

- **Aktif token:** `TokenDeposu`'ya `aktifTokenAl()` eklenir — bayi/temsilci/firma
  token'larından dolu olan ilkini döndürür (aynı anda yalnızca biri dolu; `cikisYap`
  hepsini temizliyor). `KartaYazViewModel` bu token'ı `kart-yazildi` çağrısında
  `Bearer` olarak gönderir. `KartaYazViewModel()` bu nedenle `tokenDeposu`
  parametresi alacak şekilde güncellenir.
- **Navigasyon `kartId` + `kartTipi` taşır:** Mevcut `kartaYaz/{adSoyad}/{url}?tip={tip}`
  rotasına iki opsiyonel query param eklenir: `kartTipi` (`calisan`/`musteri`/`eczaci`)
  ve `kartId` (Int). Mevcut `tip` (`calisan`/`raf`) yalnızca EKRAN METNİNİ belirliyor;
  yeni `kartTipi` ise `kart-yazildi` çağrısının hangi tablo/kolonu güncelleyeceğini
  belirler — ikisi ayrı kavramdır. Çağrı yerleri:
  - `CalisanlarEkrani` (bayi + firma) → `kartTipi=calisan`, `kartId=calisan.id`
  - `EczanelerimEkrani` müşteri kartı → `kartTipi=musteri`, `kartId=eczane.id`
  - `EczanelerimEkrani` eczacı kartı → `kartTipi=eczaci`, `kartId=eczane.id`
- `KartaYazEkrani`/`KartaYazViewModel`: NFC yazımı başarılı olduğunda (mevcut
  "Kart başarıyla yazıldı." mesajından hemen sonra) `ApiService.kartYazildi(...)`
  çağrılır — `tip=kartTipi`, `id=kartId`, `kilitli` (kullanıcının kilitleme
  seçimine göre). `kartTipi`/`kartId` yoksa (null) çağrı atlanır (geriye dönük
  güvenli).
- Liste ekranları (`CalisanlarEkrani`, `EczanelerimEkrani`): her satırda küçük bir
  rozet — `karta_yazildi == true` ise yeşil "Yazıldı" (+ kilitliyse "🔒"), değilse
  gri "Yazılmadı". Eczane satırında müşteri ve eczacı kartı için ayrı rozet. Üstte
  özet: "X/Y yazıldı" (eczane listesinde özet **müşteri kartı** temel alınır; eczacı
  durumu satırda ayrıca görünür).

## Web Panel

- Raf Kartları sekmesi: mevcut "Okutma"/"Eczacı Kartı" sütunlarının yanına
  Müşteri Kartı ve Eczacı Kartı için ayrı "Yazıldı"/"Yazılmadı" rozeti +
  "İşaretle" butonu.
- İstatistik sekmesi: çalışan listesinde aynı rozet.
- Her iki sekmede üstte "X/Y yazıldı" özeti.

## Hata Yönetimi

- `kart-yazildi` çağrısı başarısız olsa bile (ağ hatası vb.) NFC yazımının
  kendisi zaten tamamlanmıştır — mobilde sessizce loglanır, kullanıcıya ekstra
  hata gösterilmez (mevcut "Kart başarıyla yazıldı." mesajı geçerliliğini korur).
- Tenant dışı erişim denemesi 403 döner.

## Test Planı

- **Backend:** `kart-yazildi` — calisan/musteri/eczaci için başarılı güncelleme;
  yanlış firma erişiminde 403; token yoksa 401; geçersiz `tip` 400. Liste
  uçlarının yeni kolonları döndürdüğü. Panel manuel işaretleme uçları.
- **Android:** `ApiService`'e eklenen `kartYazildi` çağrısının doğru gövdeyle
  gittiği (MockWebServer). Rozet render mantığı derleme + cihaz testiyle
  doğrulanır (Compose UI testi yok, önceki desenle tutarlı).
- **Cihazda uçtan uca:** Bir çalışan kartı yaz → listede "Yazıldı" rozeti
  görünsün. Bir eczane için önce müşteri kartı yaz (sadece o rozet yeşil olsun),
  sonra eczacı kartı yaz (o da yeşil olsun) → ikisinin bağımsız çalıştığı
  doğrulanır.
