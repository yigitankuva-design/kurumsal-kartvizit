// scripts/seedYardimcilar.js
const { eczaneKodUret } = require('../utils/eczaneKod');

const ADLAR = ['Ahmet','Mehmet','Mustafa','Ali','Hüseyin','Hasan','İbrahim','Ömer','Yusuf','Murat','Emre','Burak','Serkan','Fatih','Kemal','Volkan','Onur','Tolga','Cem','Barış','Ayşe','Fatma','Emine','Hatice','Zeynep','Elif','Meryem','Şerife','Sultan','Merve','Büşra','Esra','Gamze','Derya','Seda','Pınar','Ebru','Gül','Aslı','Deniz'];
const SOYADLAR = ['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir','Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özkan','Şimşek','Polat','Korkmaz','Çakır','Erdoğan','Yavuz','Güneş','Aksoy','Bulut','Keskin','Türk','Acar','Bozkurt','Taş','Ateş','Duman','Tekin','Uzun','Güler','Yalçın','Aktaş'];
const MAHALLELER = ['Merkez','Cumhuriyet','Atatürk','Yeni','Fatih','Bahçelievler','Yıldız','Gazi','İstiklal','Hürriyet','Barbaros','Kültür','Çamlık','Güzelyalı','Karşıyaka'];

const BOLGELER = [
  { ad:'Marmara', sehirler:[{ad:'İstanbul',lat:41.0082,lng:28.9784},{ad:'Bursa',lat:40.1826,lng:29.0665},{ad:'Kocaeli',lat:40.7654,lng:29.9408},{ad:'Tekirdağ',lat:40.9780,lng:27.5110},{ad:'Balıkesir',lat:39.6484,lng:27.8826}] },
  { ad:'Ege', sehirler:[{ad:'İzmir',lat:38.4237,lng:27.1428},{ad:'Aydın',lat:37.8560,lng:27.8416},{ad:'Manisa',lat:38.6191,lng:27.4289},{ad:'Muğla',lat:37.2153,lng:28.3636},{ad:'Denizli',lat:37.7765,lng:29.0864}] },
  { ad:'İç Anadolu', sehirler:[{ad:'Ankara',lat:39.9334,lng:32.8597},{ad:'Konya',lat:37.8746,lng:32.4932},{ad:'Kayseri',lat:38.7312,lng:35.4787},{ad:'Eskişehir',lat:39.7767,lng:30.5206},{ad:'Sivas',lat:39.7477,lng:37.0179}] },
  { ad:'Akdeniz', sehirler:[{ad:'Antalya',lat:36.8969,lng:30.7133},{ad:'Adana',lat:37.0000,lng:35.3213},{ad:'Mersin',lat:36.8121,lng:34.6415},{ad:'Hatay',lat:36.4018,lng:36.3498},{ad:'Isparta',lat:37.7648,lng:30.5566}] },
  { ad:'Karadeniz', sehirler:[{ad:'Samsun',lat:41.2867,lng:36.3300},{ad:'Trabzon',lat:41.0015,lng:39.7178},{ad:'Ordu',lat:40.9839,lng:37.8764},{ad:'Rize',lat:41.0201,lng:40.5234},{ad:'Zonguldak',lat:41.4564,lng:31.7987}] },
];

const URUNLER = ['Ocean A Vitamini','Ocean E Vitamini Kapsül','Ocean Daily One Energy Tablet','Ocean Gummies D3K2','Ocean Gummies Multivitamin Adult','Ocean Vitamin C 1000mg Tablet','Ocean Gummies Vitamin D3','Ocean Vitamin C-SR Tablet','Ocean B Complex Kapsül','Ocean Methyl B12 500 µg 5 ml Sprey','Ocean Methyl B12 1000 µg 5 ml Sprey','Ocean Methyl B12 1000 µg 10 ml Sprey','Ocean Microfer Kapsül','Ocean VM Arginin PS Likit','Ocean Microfer Likit','Ocean Methyl Folat Tablet','Ocean Biotin Kapsül','Efervit Sambucus Nigra Kara Mürver 20 Efervesan Tablet','Efervit Defence 20 Efervesan Tablet','Ocean VM Vitamin-Mineral Likit','Ocean Microfer Tablet','Efervit Vitamin C 1000 mg 20 Efervesan Tablet','Efervit Multivitamin Mineral 20 Efervesan Tablet','Ocean Multi Likit'];

const RAF_TIP = ['katalog','website','instagram','linkedin','twitter','youtube','tiktok','whatsapp'];

function rastgele(dizi) { return dizi[Math.floor(Math.random() * dizi.length)]; }

module.exports = { ADLAR, SOYADLAR, MAHALLELER, BOLGELER, URUNLER, RAF_TIP, rastgele };
