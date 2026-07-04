const { youtubeIdCikar } = require('../utils/youtube');

describe('youtubeIdCikar', () => {
  test('watch?v= formatından id çıkarır', () => {
    expect(youtubeIdCikar('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('youtu.be kısa linkinden id çıkarır', () => {
    expect(youtubeIdCikar('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('embed linkinden id çıkarır', () => {
    expect(youtubeIdCikar('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('YouTube olmayan url için null döner', () => {
    expect(youtubeIdCikar('https://ornek.com/video.mp4')).toBeNull();
  });

  test('boş/null girdi için null döner', () => {
    expect(youtubeIdCikar(null)).toBeNull();
    expect(youtubeIdCikar('')).toBeNull();
  });
});
