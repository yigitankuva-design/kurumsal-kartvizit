require('dotenv').config();
const request = require('supertest');

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn().mockImplementation((params) => ({ params })),
}));

const app = require('../app');

describe('GET /dosya/:klasor/:dosya — private bucket proxy', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test('dosya bucket\'ta bulunursa içeriği doğru content-type ile döner', async () => {
    mockSend.mockResolvedValue({
      ContentType: 'application/pdf',
      Body: { transformToByteArray: () => Promise.resolve(new TextEncoder().encode('PDF-ICERIK')) },
    });

    const res = await request(app).get('/dosya/eczaci-dokumanlar/123.pdf');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(res.body).toString()).toBe('PDF-ICERIK');
  });

  test('dosya bucket\'ta yoksa 404 döner', async () => {
    const hata = new Error('bulunamadı');
    hata.name = 'NoSuchKey';
    mockSend.mockRejectedValue(hata);

    const res = await request(app).get('/dosya/eczaci-dokumanlar/olmayan.pdf');

    expect(res.statusCode).toBe(404);
  });
});
