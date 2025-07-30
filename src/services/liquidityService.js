/**
 * Liquidity Management Service
 * Handles liquidity pools, monitoring, and rebalancing
 */
const { db } = require('../utils/database');
const { setCache, getCache, deleteCache } = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');

class LiquidityService {
  constructor() {
    this.poolCache = 'liquidity:pools';
    this.alertCache = 'liquidity:alerts';
    
    // Constants
    this.MIN_POOL_PERCENTAGE = 0.2; // 20% of target is minimum acceptable
    this.CRITICAL_POOL_PERCENTAGE = 0.1; // 10% of target triggers critical alert
    this.REBALANCE_THRESHOLD_HIGH = 0.9; // 90% of target triggers high rebalance
    this.REBALANCE_THRESHOLD_LOW = 0.3; // 30% of target triggers low rebalance
    
    // Default pool values by currency
    this.defaultPoolTargets = {
      'NGN': 5000000, // 5M NGN
      'USD': 100000,  // $100K
      'USDC': 100000, // 100K USDC
      'GBP': 75000,   // £75K
      'EUR': 85000,   // €85K
      'CBUSD': 150000 // 150K CBUSD
    };
  }

  /**
   * Get liquidity pool status for a specific currency
   * @param {string} currency - Currency code
   * @returns {Promise<Object>} Pool status
   */
  async getPoolStatus(currency) {
    try {
      // Uppercase currency code for consistency
      const currencyCode = currency.toUpperCase();
      
      // Try to get from cache first
      const cacheKey = `${this.poolCache}:${currencyCode}`;
      let poolInfo = await getCache(cacheKey);
      
      if (!poolInfo) {
        // Not in cache, get from database
        poolInfo = await this._getPoolFromDb(currencyCode);
        
        // Cache the result for 5 minutes
        await setCache(cacheKey, poolInfo, 300);
      }
      
      // Calculate health metrics
      const healthMetrics = this._calculateHealthMetrics(poolInfo);
      
      return {
        ...poolInfo,
        ...healthMetrics,
        currency: currencyCode,
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error getting pool status for ${currency}:`, error);
      throw error;
    }
  }
  
  /**
   * Get status for all liquidity pools
   * @returns {Promise<Object>} All pools status
   */
  async getAllPools() {
    try {
      // Get all currencies that have pools
      const pools = await db('liquidity_pools')
        .select('*')
        .orderBy('currency');
      
      // Process each pool
      const results = {};
      let totalValueUsd = 0;
      
      for (const pool of pools) {
        // Calculate health metrics
        const healthMetrics = this._calculateHealthMetrics(pool);
        
        // Convert to USD for total value calculation
        const usdValue = pool.current_balance * (pool.usd_rate || 1);
        totalValueUsd += usdValue;
        
        results[pool.currency] = {
          ...pool,
          ...healthMetrics,
          usd_value: usdValue,
          updated_at: new Date().toISOString()
        };
        
        // Cache individual pool for 5 minutes
        const cacheKey = `${this.poolCache}:${pool.currency}`;
        await setCache(cacheKey, pool, 300);
      }
      
      // Add system-wide metrics
      const systemHealth = this._calculateSystemHealth(pools);
      
      return {
        pools: results,
        total_value_usd: totalValueUsd,
        system_health: systemHealth,
        count: pools.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting all liquidity pools:', error);
      throw error;
    }
  }
  
  /**
   * Get pool details from database
   * @private
   */
  async _getPoolFromDb(currency) {
    // Get pool from database
    const pool = await db('liquidity_pools')
      .where({ currency })
      .first();
    
    if (!pool) {
      // Create default pool if it doesn't exist
      const defaultTarget = this.defaultPoolTargets[currency] || 100000;
      const newPool = {
        id: uuidv4(),
        currency,
        target_balance: defaultTarget,
        current_balance: 0,
        min_threshold: defaultTarget * this.MIN_POOL_PERCENTAGE,
        max_threshold: defaultTarget * 1.5,
        rebalance_frequency_hours: 24,
        last_rebalance_at: null,
        usd_rate: 1, // Default 1:1 for USD
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // Insert new pool
      const [createdPool] = await db('liquidity_pools')
        .insert(newPool)
        .returning('*');
        
      return createdPool;
    }
    
    return pool;
  }
  
  /**
   * Calculate health metrics for a pool
   * @private
   */
  _calculateHealthMetrics(pool) {
    // Calculate percentage of target
    const percentOfTarget = pool.target_balance > 0 
      ? pool.current_balance / pool.target_balance
      : 0;
    
    // Determine health status
    let status = 'healthy';
    if (percentOfTarget < this.MIN_POOL_PERCENTAGE) {
      status = 'warning';
    }
    if (percentOfTarget < this.CRITICAL_POOL_PERCENTAGE) {
      status = 'critical';
    }
    if (percentOfTarget > 1.5) {
      status = 'excess';
    }
    
    // Determine if rebalance is needed
    const needsRebalance = 
      percentOfTarget < this.REBALANCE_THRESHOLD_LOW || 
      percentOfTarget > this.REBALANCE_THRESHOLD_HIGH;
    
    // Calculate deficit or excess
    const targetDiff = pool.current_balance - pool.target_balance;
    
    return {
      status,
      percent_of_target: percentOfTarget,
      needs_rebalance: needsRebalance,
      target_diff: targetDiff
    };
  }
  
  /**
   * Calculate system-wide health metrics
   * @private
   */
  _calculateSystemHealth(pools) {
    // Count pools by status
    const statusCounts = {
      healthy: 0,
      warning: 0,
      critical: 0,
      excess: 0
    };
    
    let needsRebalanceCount = 0;
    
    for (const pool of pools) {
      const healthMetrics = this._calculateHealthMetrics(pool);
      statusCounts[healthMetrics.status]++;
      
      if (healthMetrics.needs_rebalance) {
        needsRebalanceCount++;
      }
    }
    
    // Determine overall system status (worst of all pools)
    let systemStatus = 'healthy';
    if (statusCounts.warning > 0) systemStatus = 'warning';
    if (statusCounts.critical > 0) systemStatus = 'critical';
    
    return {
      status: systemStatus,
      pool_statuses: statusCounts,
      pools_needing_rebalance: needsRebalanceCount,
      total_pools: pools.length
    };
  }
  
  /**
   * Update liquidity pool balance
   * @param {string} currency - Currency code
   * @param {number} amount - Amount to add (positive) or remove (negative)
   * @param {string} reason - Reason for update
   * @param {string} transactionId - Related transaction ID
   * @returns {Promise<Object>} Updated pool
   */
  async updatePoolBalance(currency, amount, reason, transactionId = null) {
    // Uppercase currency code for consistency
    const currencyCode = currency.toUpperCase();
    
    try {
      // Start transaction
      return await db.transaction(async (trx) => {
        // Get current pool with row lock
        const pool = await trx('liquidity_pools')
          .where({ currency: currencyCode })
          .forUpdate()
          .first();
        
        if (!pool) {
          // Create new pool if it doesn't exist
          const newPool = await this._createNewPool(currencyCode, trx);
          return this._updatePoolBalanceTx(newPool, amount, reason, transactionId, trx);
        }
        
        // Update existing pool
        return this._updatePoolBalanceTx(pool, amount, reason, transactionId, trx);
      });
    } catch (error) {
      console.error(`Error updating liquidity pool ${currencyCode}:`, error);
      throw error;
    }
  }
  
  /**
   * Create new pool in database
   * @private
   */
  async _createNewPool(currency, trx) {
    const defaultTarget = this.defaultPoolTargets[currency] || 100000;
    const newPool = {
      id: uuidv4(),
      currency,
      target_balance: defaultTarget,
      current_balance: 0,
      min_threshold: defaultTarget * this.MIN_POOL_PERCENTAGE,
      max_threshold: defaultTarget * 1.5,
      rebalance_frequency_hours: 24,
      last_rebalance_at: null,
      usd_rate: 1, // Default 1:1 for USD
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    // Insert new pool
    const [createdPool] = await trx('liquidity_pools')
      .insert(newPool)
      .returning('*');
      
    return createdPool;
  }
  
  /**
   * Update pool balance in a transaction
   * @private
   */
  async _updatePoolBalanceTx(pool, amount, reason, transactionId, trx) {
    // Calculate new balance
    const newBalance = pool.current_balance + amount;
    
    // Prevent negative balance
    if (newBalance < 0) {
      throw new Error(`Insufficient liquidity in ${pool.currency} pool`);
    }
    
    // Update pool
    const [updatedPool] = await trx('liquidity_pools')
      .where({ id: pool.id })
      .update({
        current_balance: newBalance,
        updated_at: new Date()
      })
      .returning('*');
    
    // Record the update
    await trx('liquidity_movements').insert({
      id: uuidv4(),
      pool_id: pool.id,
      amount,
      previous_balance: pool.current_balance,
      new_balance: newBalance,
      reason,
      transaction_id: transactionId,
      created_at: new Date()
    });
    
    // Check if we need to trigger alerts
    await this._checkPoolAlerts(updatedPool);
    
    // Invalidate cache
    await deleteCache(`${this.poolCache}:${pool.currency}`);
    
    return updatedPool;
  }
  
  /**
   * Check if pool needs alerts
   * @private
   */
  async _checkPoolAlerts(pool) {
    const healthMetrics = this._calculateHealthMetrics(pool);
    
    // Check for critical level
    if (healthMetrics.status === 'critical') {
      await this._createAlert(pool, 'critical', 
        `${pool.currency} pool critically low at ${pool.current_balance} (${(healthMetrics.percent_of_target * 100).toFixed(1)}% of target)`);
    }
    // Check for warning level
    else if (healthMetrics.status === 'warning') {
      await this._createAlert(pool, 'warning',
        `${pool.currency} pool below minimum at ${pool.current_balance} (${(healthMetrics.percent_of_target * 100).toFixed(1)}% of target)`);
    }
    // Check for excess
    else if (healthMetrics.status === 'excess') {
      await this._createAlert(pool, 'info',
        `${pool.currency} pool has excess funds at ${pool.current_balance} (${(healthMetrics.percent_of_target * 100).toFixed(1)}% of target)`);
    }
  }
  
  /**
   * Create a liquidity alert
   * @private
   */
  async _createAlert(pool, level, message) {
    try {
      // Create alert in database
      const alert = {
        id: uuidv4(),
        pool_id: pool.id,
        currency: pool.currency,
        level,
        message,
        current_balance: pool.current_balance,
        target_balance: pool.target_balance,
        percent_of_target: pool.current_balance / pool.target_balance,
        is_resolved: false,
        created_at: new Date()
      };
      
      await db('liquidity_alerts').insert(alert);
      
      // Cache recent alerts using helper function
      const cacheKey = `${this.alertCache}:${pool.currency}:${level}`;
      await setCache(cacheKey, alert, 3600);
      
      // In a real implementation, you would also send notifications
      console.log(`[LIQUIDITY ALERT] ${level.toUpperCase()}: ${message}`);
      
    } catch (error) {
      console.error('Error creating liquidity alert:', error);
    }
  }
  
  /**
   * Get active alerts for all pools or a specific currency
   * @param {string} currency - Optional currency filter
   * @param {boolean} includeResolved - Whether to include resolved alerts
   * @returns {Promise<Array>} Alerts
   */
  async getAlerts(currency = null, includeResolved = false) {
    try {
      // Build query
      let query = db('liquidity_alerts')
        .select('*')
        .orderBy('created_at', 'desc');
      
      // Add filters
      if (currency) {
        query = query.where({ currency: currency.toUpperCase() });
      }
      
      if (!includeResolved) {
        query = query.where({ is_resolved: false });
      }
      
      // Execute query
      const alerts = await query;
      
      return {
        alerts,
        count: alerts.length,
        active_count: alerts.filter(a => !a.is_resolved).length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting liquidity alerts:', error);
      throw error;
    }
  }
  
  /**
   * Resolve a liquidity alert
   * @param {string} alertId - Alert ID
   * @param {string} resolution - Resolution message
   * @param {string} resolvedBy - User ID who resolved the alert
   * @returns {Promise<Object>} Resolved alert
   */
  async resolveAlert(alertId, resolution, resolvedBy) {
    try {
      // Update alert
      const [alert] = await db('liquidity_alerts')
        .where({ id: alertId })
        .update({
          is_resolved: true,
          resolution,
          resolved_by: resolvedBy,
          resolved_at: new Date()
        })
        .returning('*');
      
      if (!alert) {
        throw new Error('Alert not found');
      }
      
      // Remove from cache
      const cacheKey = `${this.alertCache}:${alert.currency}:${alert.level}`;
      await deleteCache(cacheKey);
      
      return alert;
    } catch (error) {
      console.error('Error resolving liquidity alert:', error);
      throw error;
    }
  }
  
  /**
   * Recommend rebalancing actions for all pools
   * @returns {Promise<Object>} Rebalancing recommendations
   */
  async getRebalanceRecommendations() {
    try {
      // Get all pools
      const pools = await this.getAllPools();
      
      // Find pools that need rebalancing
      const needsRebalance = [];
      
      Object.values(pools.pools).forEach(pool => {
        if (pool.needs_rebalance) {
          needsRebalance.push({
            currency: pool.currency,
            current_balance: pool.current_balance,
            target_balance: pool.target_balance,
            difference: pool.target_diff,
            action: pool.target_diff < 0 ? 'add' : 'remove',
            amount: Math.abs(pool.target_diff),
            priority: pool.status === 'critical' ? 'high' : 
                    pool.status === 'warning' ? 'medium' : 'low'
          });
        }
      });
      
      // Sort by priority (high to low)
      needsRebalance.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      
      // Calculate recommended actions
      const rebalanceActions = this._calculateRebalanceActions(needsRebalance);
      
      return {
        timestamp: new Date().toISOString(),
        system_health: pools.system_health,
        needs_rebalance: needsRebalance,
        recommended_actions: rebalanceActions
      };
    } catch (error) {
      console.error('Error getting rebalance recommendations:', error);
      throw error;
    }
  }
  
  /**
   * Calculate specific rebalance actions
   * @private
   */
  _calculateRebalanceActions(needsRebalance) {
    // Group by action type
    const addActions = needsRebalance.filter(p => p.action === 'add');
    const removeActions = needsRebalance.filter(p => p.action === 'remove');
    
    // Calculate direct transfers between pools
    const directTransfers = [];
    
    // Match pools needing funds with pools having excess
    for (const addPool of addActions) {
      for (const removePool of removeActions) {
        // If the remove pool still has excess and the add pool still needs funds
        if (removePool.amount > 0 && addPool.amount > 0) {
          // Calculate transfer amount
          const transferAmount = Math.min(addPool.amount, removePool.amount);
          
          // Create transfer action
          directTransfers.push({
            action: 'transfer',
            from_currency: removePool.currency,
            to_currency: addPool.currency,
            amount: transferAmount,
            priority: addPool.priority
          });
          
          // Update remaining amounts
          addPool.amount -= transferAmount;
          removePool.amount -= transferAmount;
        }
      }
    }
    
    // Create individual actions for remaining imbalances
    const individualActions = [];
    
    // Remaining adds
    for (const pool of addActions) {
      if (pool.amount > 0) {
        individualActions.push({
          action: 'add',
          currency: pool.currency,
          amount: pool.amount,
          priority: pool.priority,
          source: 'external'
        });
      }
    }
    
    // Remaining removes
    for (const pool of removeActions) {
      if (pool.amount > 0) {
        individualActions.push({
          action: 'remove',
          currency: pool.currency,
          amount: pool.amount,
          priority: pool.priority,
          destination: 'external'
        });
      }
    }
    
    return {
      direct_transfers: directTransfers,
      individual_actions: individualActions
    };
  }
  
  /**
   * Execute a rebalance action
   * @param {Object} action - Rebalance action
   * @param {string} executedBy - User ID who executed the action
   * @returns {Promise<Object>} Result of rebalance
   */
  async executeRebalance(action, executedBy) {
    try {
      let result;
      
      switch (action.action) {
        case 'transfer':
          result = await this._executeTransfer(action, executedBy);
          break;
          
        case 'add':
          result = await this._executeAdd(action, executedBy);
          break;
          
        case 'remove':
          result = await this._executeRemove(action, executedBy);
          break;
          
        default:
          throw new Error(`Unknown rebalance action: ${action.action}`);
      }
      
      // Record the rebalance action
      await db('liquidity_rebalances').insert({
        id: uuidv4(),
        action_type: action.action,
        from_currency: action.from_currency || null,
        to_currency: action.to_currency || action.currency || null,
        amount: action.amount,
        executed_by: executedBy,
        execution_result: JSON.stringify(result),
        created_at: new Date()
      });
      
      // Update last_rebalance_at timestamp for affected pools
      const currencies = [];
      if (action.currency) currencies.push(action.currency);
      if (action.from_currency) currencies.push(action.from_currency);
      if (action.to_currency) currencies.push(action.to_currency);
      
      if (currencies.length > 0) {
        await db('liquidity_pools')
          .whereIn('currency', currencies)
          .update({ 
            last_rebalance_at: new Date(),
            updated_at: new Date()
          });
      }
      
      return result;
    } catch (error) {
      console.error('Error executing rebalance action:', error);
      throw error;
    }
  }
  
  /**
   * Execute a transfer between pools
   * @private
   */
  async _executeTransfer(action, executedBy) {
    return await db.transaction(async (trx) => {
      // Deduct from source pool
      await this._updatePoolBalanceTx(
        await trx('liquidity_pools').where({ currency: action.from_currency }).first(),
        -action.amount,
        `Rebalance transfer to ${action.to_currency}`,
        null,
        trx
      );
      
      // Add to target pool
      await this._updatePoolBalanceTx(
        await trx('liquidity_pools').where({ currency: action.to_currency }).first(),
        action.amount,
        `Rebalance transfer from ${action.from_currency}`,
        null,
        trx
      );
      
      return {
        action: 'transfer',
        from: action.from_currency,
        to: action.to_currency,
        amount: action.amount,
        status: 'completed',
        executed_at: new Date().toISOString(),
        executed_by: executedBy
      };
    });
  }
  
  /**
   * Execute an add to pool
   * @private
   */
  async _executeAdd(action, executedBy) {
    await this.updatePoolBalance(
      action.currency,
      action.amount,
      `Rebalance add from ${action.source || 'external'}`
    );
    
    return {
      action: 'add',
      currency: action.currency,
      amount: action.amount,
      status: 'completed',
      executed_at: new Date().toISOString(),
      executed_by: executedBy,
      source: action.source || 'external'
    };
  }
  
  /**
   * Execute a remove from pool
   * @private
   */
  async _executeRemove(action, executedBy) {
    await this.updatePoolBalance(
      action.currency,
      -action.amount,
      `Rebalance remove to ${action.destination || 'external'}`
    );
    
    return {
      action: 'remove',
      currency: action.currency,
      amount: action.amount,
      status: 'completed',
      executed_at: new Date().toISOString(),
      executed_by: executedBy,
      destination: action.destination || 'external'
    };
  }
}

// Create singleton instance
const liquidityService = new LiquidityService();

module.exports = liquidityService;