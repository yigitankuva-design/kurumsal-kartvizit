// Google'ın eski google.maps.places.Autocomplete sınıfı 1 Mart 2025'ten sonra
// oluşturulan projelerde çalışmıyor (Google tarafından kaldırıldı). Bunun yerine
// yeni PlaceAutocompleteElement kullanılıyor — bu, var olan bir <input>'a
// eklenmiyor, kendi arayüzünü sayfaya ekliyor. Orijinal input'u gizli tutup
// seçilen adresi oraya yazıyoruz; aynı zamanda "elle yaz" yedek alanı sunuyoruz
// çünkü kullanıcı bir öneri seçmeden yazdığı metni Google'ın bileşeninden
// okumanın güvenilir bir yolu yok.
async function adresAutocompleteYukselt(inputId) {
  const orijinal = document.getElementById(inputId);
  if (!orijinal || !window.google || !window.google.maps || !window.google.maps.places) return;
  if (orijinal.dataset.gmpYukseltildi) return; // aynı input'u iki kez yükseltme
  orijinal.dataset.gmpYukseltildi = '1';

  const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');

  const mevcutDeger = orijinal.value;
  orijinal.type = 'hidden';

  const sarmalayici = document.createElement('div');
  sarmalayici.style.display = 'flex';
  sarmalayici.style.flexDirection = 'column';
  sarmalayici.style.gap = '6px';

  const gmpEl = new PlaceAutocompleteElement({ includedRegionCodes: ['tr'] });
  gmpEl.id = inputId + '_gmp';
  gmpEl.style.width = '100%';

  const manuelInput = document.createElement('input');
  manuelInput.id = inputId + '_manuel';
  manuelInput.type = 'text';
  manuelInput.placeholder = 'Aramada bulamazsan adresi buraya elle yazabilirsin';
  manuelInput.value = mevcutDeger || '';
  manuelInput.style.cssText = 'background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px 12px;font-size:0.8rem;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  manuelInput.addEventListener('input', () => { orijinal.value = manuelInput.value; });

  orijinal.insertAdjacentElement('afterend', sarmalayici);
  sarmalayici.appendChild(gmpEl);
  sarmalayici.appendChild(manuelInput);

  gmpEl.addEventListener('gmp-select', async (event) => {
    const place = event.placePrediction.toPlace();
    await place.fetchFields({ fields: ['formattedAddress'] });
    orijinal.value = place.formattedAddress || '';
    manuelInput.value = place.formattedAddress || '';
  });
}
