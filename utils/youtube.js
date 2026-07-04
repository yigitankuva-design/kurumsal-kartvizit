function youtubeIdCikar(url) {
  if (!url) return null;
  const eslesme = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return eslesme ? eslesme[1] : null;
}

module.exports = { youtubeIdCikar };
