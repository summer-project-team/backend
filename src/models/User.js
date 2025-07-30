const { db } = require('../utils/database');
const bcrypt = require('bcryptjs');

/**
 * User model
 */
class User {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Object} Created user
   */
  static async create(userData) {
    const { password, ...otherData } = userData;
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Insert user
    const [user] = await db('users')
      .insert({
        ...otherData,
        password_hash,
      })
      .returning('*');
    
    return user;
  }
  
  /**
   * Find user by ID
   * @param {string} id - User ID
   * @returns {Object|null} User or null
   */
  static async findById(id) {
    const user = await db('users')
      .where({ id })
      .first();
    
    return user || null;
  }
  
  /**
   * Find user by phone number
   * @param {string} phone_number - Phone number
   * @param {string} country_code - Country code
   * @returns {Object|null} User or null
   */
  static async findByPhone(phone_number, country_code) {
    const user = await db('users')
      .where({ phone_number, country_code })
      .first();
    
    return user || null;
  }
  
  /**
   * Find user by email
   * @param {string} email - Email address
   * @returns {Object|null} User or null
   */
  static async findByEmail(email) {
    const user = await db('users')
      .where({ email })
      .first();
    
    return user || null;
  }
  
  /**
   * Update user
   * @param {string} id - User ID
   * @param {Object} userData - User data to update
   * @returns {Object} Updated user
   */
  static async update(id, userData) {
    const [user] = await db('users')
      .where({ id })
      .update({
        ...userData,
        updated_at: db.fn.now(),
      })
      .returning('*');
    
    return user;
  }
  
  /**
   * Verify password
   * @param {string} providedPassword - Password to verify
   * @param {string} storedHash - Stored password hash
   * @returns {boolean} Is password valid
   */
  static async verifyPassword(providedPassword, storedHash) {
    return await bcrypt.compare(providedPassword, storedHash);
  }
  
  /**
   * Get user profile (without sensitive data)
   * @param {string} id - User ID
   * @returns {Object|null} User profile or null
   */
  static async getProfile(id) {
    const user = await db('users')
      .select([
        'id',
        'phone_number',
        'country_code',
        'email',
        'first_name',
        'last_name',
        'kyc_status',
        'created_at',
        'updated_at',
      ])
      .where({ id })
      .first();
    
    return user || null;
  }
}

module.exports = User; 