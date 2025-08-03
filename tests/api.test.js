/*
const request = require('supertest');
const app = require('../src/app');

describe('API Endpoints', () => {
  describe('Health Check', () => {
    it('should return 200 OK for health check endpoint', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication', () => {
    it('should return 400 for invalid registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          phone_number: 'invalid',
          country_code: 'XX',
          email: 'notanemail',
          password: '123',
        });
      expect(res.statusCode).toEqual(400);
    });
  });

  describe('Routes', () => {
    it('should return 404 for non-existent routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.statusCode).toEqual(404);
    });
  });
}); 
*/