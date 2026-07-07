// Kare kırpma/yakınlaştırma bileşeni. Kütüphanesiz: seçilen görsel bir modalda
// açılır, kullanıcı sürükleyip yakınlaştırarak kareye neyin gireceğini seçer,
// "Kullan" ile canvas üzerinden kırpılmış hali orijinal <input type="file">'a
// geri yazılır (form değişmeden aynı şekilde submit edilir). Kullanıcı iptal
// ederse veya görsel yüklenemezse orijinal (kırpılmamış) dosya olduğu gibi kalır.

const FOTO_KIRPICI_CIKTI_BOYUTU = 600;
const FOTO_KIRPICI_VIEWPORT = 280;

function fotoKirpiciBaglama(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', () => {
    const dosya = input.files && input.files[0];
    if (!dosya) return;
    fotoKirpiciModalAc(dosya, (kirpilmisDosya) => {
      const veriTransferi = new DataTransfer();
      veriTransferi.items.add(kirpilmisDosya);
      input.files = veriTransferi.files;
    });
  });
}

function fotoKirpiciModalAc(dosya, tamamlaninca) {
  const okuyucu = new FileReader();
  okuyucu.onload = () => {
    const img = new Image();
    img.onload = () => fotoKirpiciArayuzOlustur(img, tamamlaninca);
    img.onerror = () => {};
    img.src = okuyucu.result;
  };
  okuyucu.readAsDataURL(dosya);
}

function fotoKirpiciArayuzOlustur(img, tamamlaninca) {
  const minOlcek = Math.max(FOTO_KIRPICI_VIEWPORT / img.naturalWidth, FOTO_KIRPICI_VIEWPORT / img.naturalHeight);
  const maksOlcek = minOlcek * 3;
  let olcek = minOlcek;
  let konumX = (FOTO_KIRPICI_VIEWPORT - img.naturalWidth * olcek) / 2;
  let konumY = (FOTO_KIRPICI_VIEWPORT - img.naturalHeight * olcek) / 2;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100';

  const kutu = document.createElement('div');
  kutu.style.cssText = 'background:#1a1a1a;border-radius:12px;padding:20px;max-width:360px;width:100%;display:flex;flex-direction:column;gap:14px;align-items:center';

  const baslik = document.createElement('div');
  baslik.textContent = 'Fotoğrafı Ayarla';
  baslik.style.cssText = 'color:#fff;font-weight:600;font-size:15px;align-self:flex-start';

  const viewport = document.createElement('div');
  viewport.style.cssText = `width:${FOTO_KIRPICI_VIEWPORT}px;height:${FOTO_KIRPICI_VIEWPORT}px;overflow:hidden;position:relative;border-radius:8px;background:#000;touch-action:none;cursor:grab`;

  const resim = document.createElement('img');
  resim.src = img.src;
  resim.style.cssText = 'position:absolute;left:0;top:0;transform-origin:top left;user-select:none;pointer-events:none';
  viewport.appendChild(resim);

  const sinirla = () => {
    const genislik = img.naturalWidth * olcek;
    const yukseklik = img.naturalHeight * olcek;
    const minX = FOTO_KIRPICI_VIEWPORT - genislik;
    const minY = FOTO_KIRPICI_VIEWPORT - yukseklik;
    konumX = Math.min(0, Math.max(minX, konumX));
    konumY = Math.min(0, Math.max(minY, konumY));
  };

  const uygula = () => {
    sinirla();
    resim.style.transform = `translate(${konumX}px, ${konumY}px) scale(${olcek})`;
  };
  uygula();

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '0';
  slider.style.cssText = 'width:100%';
  slider.addEventListener('input', () => {
    const oran = Number(slider.value) / 100;
    olcek = minOlcek + (maksOlcek - minOlcek) * oran;
    uygula();
  });

  const butonSatiri = document.createElement('div');
  butonSatiri.style.cssText = 'display:flex;gap:10px;width:100%';

  const mousemoveHandler = (e) => suruklemeDevam(e.clientX, e.clientY);
  const mouseupHandler = () => suruklemeBitir();

  const kapat = () => {
    window.removeEventListener('mousemove', mousemoveHandler);
    window.removeEventListener('mouseup', mouseupHandler);
    overlay.remove();
  };

  const iptalBtn = document.createElement('button');
  iptalBtn.type = 'button';
  iptalBtn.textContent = 'İptal';
  iptalBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;border:1px solid #444;background:transparent;color:#fff;cursor:pointer';
  iptalBtn.addEventListener('click', kapat);

  const kullanBtn = document.createElement('button');
  kullanBtn.type = 'button';
  kullanBtn.textContent = 'Kullan';
  kullanBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;border:none;background:#d4a017;color:#1a1a1a;font-weight:600;cursor:pointer';
  kullanBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = FOTO_KIRPICI_CIKTI_BOYUTU;
    canvas.height = FOTO_KIRPICI_CIKTI_BOYUTU;
    const ctx = canvas.getContext('2d');
    const cikisOlcek = FOTO_KIRPICI_CIKTI_BOYUTU / FOTO_KIRPICI_VIEWPORT;
    ctx.drawImage(
      img,
      0, 0, img.naturalWidth, img.naturalHeight,
      konumX * cikisOlcek, konumY * cikisOlcek,
      img.naturalWidth * olcek * cikisOlcek, img.naturalHeight * olcek * cikisOlcek
    );
    canvas.toBlob((blob) => {
      if (blob) {
        const yeniDosya = new File([blob], 'kirpilmis.jpg', { type: 'image/jpeg' });
        tamamlaninca(yeniDosya);
      }
      kapat();
    }, 'image/jpeg', 0.9);
  });

  butonSatiri.appendChild(iptalBtn);
  butonSatiri.appendChild(kullanBtn);
  kutu.appendChild(baslik);
  kutu.appendChild(viewport);
  kutu.appendChild(slider);
  kutu.appendChild(butonSatiri);
  overlay.appendChild(kutu);
  document.body.appendChild(overlay);

  let surukleniyor = false;
  let baslangicX = 0;
  let baslangicY = 0;
  let baslangicKonumX = 0;
  let baslangicKonumY = 0;

  function suruklemeBaslat(x, y) {
    surukleniyor = true;
    baslangicX = x;
    baslangicY = y;
    baslangicKonumX = konumX;
    baslangicKonumY = konumY;
    viewport.style.cursor = 'grabbing';
  }
  function suruklemeDevam(x, y) {
    if (!surukleniyor) return;
    konumX = baslangicKonumX + (x - baslangicX);
    konumY = baslangicKonumY + (y - baslangicY);
    uygula();
  }
  function suruklemeBitir() {
    surukleniyor = false;
    viewport.style.cursor = 'grab';
  }

  viewport.addEventListener('mousedown', (e) => suruklemeBaslat(e.clientX, e.clientY));
  window.addEventListener('mousemove', mousemoveHandler);
  window.addEventListener('mouseup', mouseupHandler);

  viewport.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    suruklemeBaslat(t.clientX, t.clientY);
  });
  viewport.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    suruklemeDevam(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchend', suruklemeBitir);
}
