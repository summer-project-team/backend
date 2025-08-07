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
   * Update user password
   * @param {string} id - User ID
   * @param {string} newPassword - New password
   * @returns {Object} Updated user
   */
  static async updatePassword(id, newPassword) {
    const password_hash = await bcrypt.hash(newPassword, 10);
    
    const [user] = await db('users')
      .where({ id })
      .update({
        password_hash,
        updated_at: db.fn.now(),
      })
      .returning(['id', 'email', 'first_name', 'last_name', 'updated_at']);
    
    return user;
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

  /**
   * Soft delete user (recommended approach)
   * @param {string} id - User ID
   * @returns {Object} Updated user with deleted status
   */
  static async softDelete(id) {
    const [user] = await db('users')
      .where({ id })
      .update({
        deleted_at: db.fn.now(),
        email: db.raw("email || '_deleted_' || id"), // Append deleted marker to email
        phone_number: db.raw("phone_number || '_deleted_' || id"), // Append deleted marker to phone
        updated_at: db.fn.now(),
      })
      .returning('*');
    
    return user;
  }

  /**
   * Hard delete user (use with caution - for admin/compliance only)
   * This permanently removes all user data and related records
   * @param {string} id - User ID
   * @returns {boolean} Success status
   */
  static async hardDelete(id) {
    return await db.transaction(async (trx) => {
      // Delete in order to respect foreign key constraints
      
      // 1. Delete transaction events
      await trx('transaction_events')
        .whereIn('transaction_id', 
          trx('transactions').select('id').where('sender_id', id).orWhere('recipient_id', id)
        )
        .del();
      
      // 2. Delete transactions
      await trx('transactions')
        .where('sender_id', id)
        .orWhere('recipient_id', id)
        .del();
      
      // 3. Delete wallet
      await trx('wallets').where('user_id', id).del();
      
      // 4. Delete user
      const deletedCount = await trx('users').where('id', id).del();
      
      return deletedCount > 0;
    });
  }

  /**
   * Restore soft deleted user
   * @param {string} id - User ID
   * @returns {Object} Restored user
   */
  static async restore(id) {
    const [user] = await db('users')
      .where({ id })
      .update({
        deleted_at: null,
        email: db.raw("REPLACE(REPLACE(email, '_deleted_' || id, ''), '_deleted_', '')"),
        phone_number: db.raw("REPLACE(REPLACE(phone_number, '_deleted_' || id, ''), '_deleted_', '')"),
        updated_at: db.fn.now(),
      })
      .returning('*');
    
    return user;
  }

  /**
   * Set transaction PIN for user
   * @param {string} id - User ID
   * @param {string} pin - PIN to hash and store
   * @returns {Object} Updated user
   */
  static async setTransactionPin(id, pin) {
    const pinHash = await bcrypt.hash(pin, 10);
    
    const [user] = await db('users')
      .where({ id })
      .update({
        transaction_pin_hash: pinHash,
        pin_enabled: true,
        pin_created_at: db.fn.now(),
        pin_failed_attempts: 0,
        pin_locked_until: null,
        updated_at: db.fn.now(),
      })
      .returning('*');
    
    return user;
  }

  /**
   * Verify transaction PIN
   * @param {string} id - User ID
   * @param {string} pin - PIN to verify
   * @returns {Object} Verification result
   */
  static async verifyTransactionPin(id, pin) {
    const user = await db('users')
      .where({ id })
      .first();

    if (!user || !user.pin_enabled || !user.transaction_pin_hash) {
      return { valid: false, error: 'PIN not set up' };
    }

    // Check if PIN is locked
    if (user.pin_locked_until && new Date(user.pin_locked_until) > new Date()) {
      const lockTimeRemaining = Math.ceil((new Date(user.pin_locked_until) - new Date()) / 1000 / 60);
      return { valid: false, error: `PIN locked for ${lockTimeRemaining} minutes` };
    }

    const isValid = await bcrypt.compare(pin, user.transaction_pin_hash);

    if (isValid) {
      // Reset failed attempts and update last used
      await db('users')
        .where({ id })
        .update({
          pin_failed_attempts: 0,
          pin_locked_until: null,
          pin_last_used: db.fn.now(),
          updated_at: db.fn.now(),
        });

      return { valid: true };
    } else {
      // Increment failed attempts
      const newFailedAttempts = (user.pin_failed_attempts || 0) + 1;
      const updates = {
        pin_failed_attempts: newFailedAttempts,
        updated_at: db.fn.now(),
      };

      // Lock PIN after 3 failed attempts for 15 minutes
      if (newFailedAttempts >= 3) {
        updates.pin_locked_until = db.raw("NOW() + INTERVAL '15 minutes'");
      }

      await db('users')
        .where({ id })
        .update(updates);

      return { 
        valid: false, 
        error: newFailedAttempts >= 3 
          ? 'PIN locked for 15 minutes due to too many failed attempts'
          : `Invalid PIN. ${3 - newFailedAttempts} attempts remaining`
      };
    }
  }

  /**
   * Disable transaction PIN
   * @param {string} id - User ID
   * @returns {Object} Updated user
   */
  static async disableTransactionPin(id) {
    const [user] = await db('users')
      .where({ id })
      .update({
        transaction_pin_hash: null,
        pin_enabled: false,
        pin_failed_attempts: 0,
        pin_locked_until: null,
        updated_at: db.fn.now(),
      })
      .returning('*');
    
    return user;
  }

  /**
   * Check if user has PIN enabled
   * @param {string} id - User ID
   * @returns {boolean} PIN status
   */
  static async hasPinEnabled(id) {
    const user = await db('users')
      .select('pin_enabled')
      .where({ id })
      .first();
    
    return user?.pin_enabled || false;
  }
}

module.exports = User; 