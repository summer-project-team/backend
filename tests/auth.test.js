/*
const { expect } = require('chai');
const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/utils/database');

describe('Authentication API', () => {
  before(async () => {
    // Setup test database
    await db.migrate.latest();
  });

  after(async () => {
    // Cleanup
    await db.destroy();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          phone_number: '2348123456789',
          full_name: 'Test User'
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('user');
      expect(res.body.user).to.have.property('id');
      expect(res.body.user.email).to.equal('test@example.com');
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('errors');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!'
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('token');
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.status).to.equal(401);
    });
  });
});

describe('Transaction API', () => {
  let authToken;
  
  before(async () => {
    // Get auth token for protected routes
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Password123!'
      });
    
    authToken = res.body.token;
  });

  describe('POST /api/transactions/transfer', () => {
    it('should create a new transfer', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient_phone: '2348123456790',
          amount: 100,
          currency: 'CBUSD'
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('transaction');
      expect(res.body.transaction).to.have.property('id');
    });

    it('should validate sufficient balance', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient_phone: '2348123456790',
          amount: 1000000, // Very large amount
          currency: 'CBUSD'
        });

      expect(res.status).to.equal(400);
      expect(res.body.message).to.include('insufficient balance');
    });
  });
});
*/
