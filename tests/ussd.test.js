const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/utils/database');
const { setCache, getCache } = require('../src/utils/redis');

describe('USSD Endpoints', () => {
  let testUser;
  let testSession;

  beforeAll(async () => {
    // Create test user
    testUser = await db('users').insert({
      phone_number: '+2348123456789',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      password_hash: 'hashed_password',
      verification_level: 'verified'
    }).returning('*');

    // Create test wallet
    await db('wallets').insert({
      user_id: testUser[0].id,
      currency: 'NGN',
      balance: 10000.00,
      cbusd_balance: 100.00
    });
  });

  afterAll(async () => {
    // Cleanup
    await db('ussd_sessions').where('user_id', testUser[0].id).del();
    await db('wallets').where('user_id', testUser[0].id).del();
    await db('users').where('id', testUser[0].id).del();
  });

  describe('POST /api/ussd/initiate', () => {
    it('should initiate a new USSD session', async () => {
      const response = await request(app)
        .post('/api/ussd/initiate')
        .send({
          phone_number: '+2348123456789',
          network_code: 'MTN',
          ussd_code: '*737#'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.session_id).toBeDefined();
      expect(response.body.message).toContain('Welcome to CrossBridge');

      testSession = response.body.session_id;
    });

    it('should reject unregistered phone number', async () => {
      const response = await request(app)
        .post('/api/ussd/initiate')
        .send({
          phone_number: '+2348999999999',
          network_code: 'MTN',
          ussd_code: '*737#'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('register first');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/api/ussd/initiate')
        .send({
          phone_number: 'invalid',
          network_code: 'MTN'
          // missing ussd_code
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/ussd/session', () => {
    it('should process balance check', async () => {
      const response = await request(app)
        .post('/api/ussd/session')
        .send({
          phone_number: '+2348123456789',
          session_id: testSession,
          text: '1',
          network_code: 'MTN'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('CrossBridge Balance');
      expect(response.body.message).toContain('CBUSD');
    });

    it('should handle send money flow', async () => {
      // Start send money flow
      let response = await request(app)
        .post('/api/ussd/session')
        .send({
          phone_number: '+2348123456789',
          session_id: testSession,
          text: '2',
          network_code: 'MTN'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Enter recipient phone number');
      expect(response.body.end_session).toBe(false);

      // Enter recipient phone
      response = await request(app)
        .post('/api/ussd/session')
        .send({
          phone_number: '+2348123456789',
          session_id: testSession,
          text: '+2348123456789', // Send to self for testing
          network_code: 'MTN'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Enter amount');
      expect(response.body.end_session).toBe(false);

      // Enter amount
      response = await request(app)
        .post('/api/ussd/session')
        .send({
          phone_number: '+2348123456789',
          session_id: testSession,
          text: '10',
          network_code: 'MTN'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Send 10 CBUSD');
      expect(response.body.message).toContain('1. Confirm');
      expect(response.body.end_session).toBe(false);
    });

    it('should handle navigation commands', async () => {
      // Test back navigation
      const response = await request(app)
        .post('/api/ussd/session')
        .send({
          phone_number: '+2348123456789',
          session_id: testSession,
          text: '#',
          network_code: 'MTN'
        });

      expect(response.status).toBe(200);
      expect(response.body.end_session).toBe(false);
    });

    it('should handle exit command', async () => {
      const response = await request(app)
        .post('/api/ussd/session')
        .send({
          phone_number: '+2348123456789',
          session_id: testSession,
          text: '0',
          network_code: 'MTN'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Thank you');
      expect(response.body.end_session).toBe(true);
    });
  });

  describe('GET /api/ussd/status/:sessionId', () => {
    it('should return session status', async () => {
      const response = await request(app)
        .get(`/api/ussd/status/${testSession}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeDefined();
      expect(response.body.data).toBeDefined();
    });

    it('should handle invalid session ID', async () => {
      const response = await request(app)
        .get('/api/ussd/status/invalid-session-id');

      expect(response.status).toBe(400); // Validation error
    });
  });

  describe('POST /api/ussd/callback', () => {
    it('should handle provider callback', async () => {
      const response = await request(app)
        .post('/api/ussd/callback')
        .send({
          session_id: testSession,
          phone_number: '+2348123456789',
          text: 'test',
          network_code: 'MTN',
          status: 'active'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeDefined();
    });

    it('should validate callback data', async () => {
      const response = await request(app)
        .post('/api/ussd/callback')
        .send({
          // missing required fields
          text: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting per phone number', async () => {
      const promises = [];
      
      // Make 35 requests (above the 30 limit)
      for (let i = 0; i < 35; i++) {
        promises.push(
          request(app)
            .post('/api/ussd/initiate')
            .send({
              phone_number: '+2348123456788', // Different number for this test
              network_code: 'MTN',
              ussd_code: '*737#'
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Some responses should be rate limited
      const rateLimited = responses.some(response => 
        response.body.message && response.body.message.includes('Too many requests')
      );
      
      expect(rateLimited).toBe(true);
    });
  });

  describe('Security', () => {
    it('should log USSD requests', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await request(app)
        .post('/api/ussd/session')
        .send({
          phone_number: '+2348123456789',
          session_id: testSession,
          text: '1',
          network_code: 'MTN'
        });

      expect(consoleSpy).toHaveBeenCalledWith(
        'USSD Request:',
        expect.objectContaining({
          phone: expect.stringContaining('****'),
          network: 'MTN'
        })
      );

      consoleSpy.mockRestore();
    });
  });
});
