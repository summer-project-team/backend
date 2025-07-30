const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { AppError } = require('../middleware/errorHandler');
const asyncHandler = require('express-async-handler');
const phoneService = require('../services/phoneService');
const { setCache, getCache } = require('../utils/redis'); // FIXED: Use helper functions
const pricingService = require('../services/pricingService');
const ExchangeRate = require('../models/ExchangeRate');
const transactionService = require('../services/transaction');

/**
 * USSD Controller for handling USSD session requests
 */

/**
 * @desc    Process USSD session request
 * @route   POST /api/ussd/session
 * @access  Public (Restricted by network operator)
 */
/**
 * Show main menu
 * @param {Object} user - User object
 * @returns {Object} Response with message and end_session flag
 */
const showMainMenu = async (user) => {
  const menu = await getPersonalizedMenu(user);
  return {
    message: 
      'Welcome to CrossBridge\n' +
      '1. Check balance\n' +
      '2. Send money\n' +
      '3. Deposit from bank\n' +
      '4. Withdraw to bank\n' +
      '5. Check rates\n' +
      '6. Recent transactions\n' +
      '7. Settings\n' +
      '0. Exit',
    end_session: false
  };
};

/**
 * Get menu for specific step
 * @param {string} step - Current step
 * @param {Object} session - Session data
 * @param {Object} user - User object
 * @returns {Object} Response with message and end_session flag
 */
const getMenuForStep = async (step, session, user) => {
  switch (step) {
    case 'main':
      return await showMainMenu(user);
    
    case 'send_money_phone':
      return {
        message: 'Enter recipient phone number:\n#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'send_money_amount':
      return {
        message: 'Enter amount to send:\n#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'send_money_confirm':
      return {
        message: `Send ${session.data.amount} to ${session.data.recipient_phone}?\n` +
                '1. Confirm\n2. Cancel\n#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'deposit_currency':
      return {
        message: 'Select currency to deposit:\n' +
                '1. NGN\n2. USD\n3. GBP\n4. CBUSD\n' +
                '#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'deposit_amount':
      return {
        message: 'Enter amount to deposit:\n#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'withdraw_currency':
      return {
        message: 'Select currency to withdraw:\n' +
                '1. NGN\n2. USD\n3. GBP\n4. CBUSD\n' +
                '#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'withdraw_amount':
      return {
        message: 'Enter amount to withdraw:\n#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'withdraw_bank':
      return {
        message: 'Select bank:\n' +
                '1. GTBank\n2. Access\n3. First Bank\n4. UBA\n' +
                '#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'rate_check':
      return {
        message: 'Select currency pair:\n' +
                '1. NGN/USD\n2. NGN/GBP\n3. USD/GBP\n4. NGN/CBUSD\n' +
                '#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    case 'settings':
      return {
        message: 'Settings:\n' +
                '1. Change PIN\n2. Language\n3. Notifications\n4. Security\n' +
                '#. Back\n00. Main Menu\n0. Exit',
        end_session: false
      };
    
    default:
      return await showMainMenu(user);
  }
};

const processUssdSession = asyncHandler(async (req, res, next) => {
  // Extract USSD session data
  const { 
    phone_number, 
    session_id, 
    text, 
    network_code 
  } = req.body;
  
  // Validate phone number
  let normalizedNumber = phone_number;
  
  // Handle different formats
  if (phone_number.startsWith('0')) {
    // Convert local format (0812...) to international format
    normalizedNumber = '234' + phone_number.substring(1);
  } else if (phone_number.startsWith('+')) {
    // Remove the + prefix
    normalizedNumber = phone_number.substring(1);
  }
  
  // Validate the normalized number
  const phoneValidation = phoneService.validatePhoneNumber(
    normalizedNumber,
    'NG'  // Default to Nigeria since this is a Nigerian USSD service
  );
  
  if (!phoneValidation.isValid) {
    return sendUssdResponse(res, 'Invalid phone number format.');
  }
  
  // Find user by phone number
  const user = await phoneService.lookupUserByPhone(phoneValidation.e164Format);
  
  if (!user) {
    return sendUssdResponse(res, 
      'Welcome to CrossBridge. You need to register first.\n' +
      'Please download our app or visit our website to register.'
    );
  }
  
  // Process USSD code and text input
  const ussdResponse = await handleUssdRequest(user, text, session_id);
  
  // Send response back to telecom provider
  return sendUssdResponse(res, ussdResponse.message, ussdResponse.end_session);
});

/**
 * Handle USSD request based on user input
 * @param {Object} user - User object
 * @param {string} text - USSD text input
 * @param {string} sessionId - USSD session ID
 * @returns {Object} Response with message and end_session flag
 */


const handleUssdRequest = async (user, text, sessionId) => {
  // Check if we have a stored session state
  const sessionKey = `ussd:${sessionId}`;
  const storedSession = await getCache(sessionKey);
  const session = storedSession || {
    user_id: user.id,
    step: 'main',
    previousStep: null,
    data: {}
  };
  
  // Check for universal navigation commands first
  if (text === '0') {
    await setCache(sessionKey, null, 0); // Clear session
    return {
      message: 'Thank you for using CrossBridge.',
      end_session: true
    };
  }

  if (text === '00' && session.step !== 'main') {
    session.step = 'main';
    session.previousStep = null;
    await setCache(sessionKey, session, 180);
    return await showMainMenu(user);
  }

  if (text === '#' && session.previousStep) {
    session.step = session.previousStep;
    const prevStep = session.previousStep;
    session.previousStep = null;
    await setCache(sessionKey, session, 180);
    return await getMenuForStep(prevStep, session, user);
  }

  // Handle different codes
  if (text === '*737#' || text === '') {
    // Main menu
    session.step = 'main';
    session.previousStep = null;
    await setCache(sessionKey, session, 180);
    return await showMainMenu(user);
  } else if (text === '*737*1#') {
    // Direct balance check
    return await handleBalanceCheck(user);
  } else if (text === '*737*2#') {
    // Direct send money
    session.step = 'send_money_phone';
    await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
    
    return {
      message: 'Enter recipient phone number:',
      end_session: false
    };
  } else if (text === '*737*3#') {
    // Direct deposit
    session.step = 'deposit_amount';
    await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
    
    return {
      message: 'Enter amount to deposit:',
      end_session: false
    };
  } else if (text === '*737*4#') {
    // Direct withdraw
    session.step = 'withdraw_amount';
    await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
    
    return {
      message: 'Enter amount to withdraw:',
      end_session: false
    };
  } else if (text === '*737*5#') {
    // Direct rate check
    session.step = 'rate_check';
    await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
    
    return {
      message: 'Select currency pair:\n1. NGN/USD\n2. NGN/GBP\n3. USD/GBP\n4. NGN/CBUSD',
      end_session: false
    };
  } else if (text === '*737*6#') {
    // Direct transaction history
    return await handleTransactionHistory(user);
  } else if (storedSession) {
    // Handle menu navigation based on stored session
    return await handleMenuNavigation(user, text, session, sessionKey);
  }
  
  // Default response
  return {
    message: 'Invalid USSD code. Please try *737# for the menu.',
    end_session: true
  };
};

/**
 * Handle menu navigation based on session state
 * @param {Object} user - User object
 * @param {string} text - User input text
 * @param {Object} session - Session object
 * @param {string} sessionKey - Redis session key
 * @returns {Object} Response with message and end_session flag
 */
/**
 * Handle navigation commands
 * @param {string} command - Navigation command (0, 00, #)
 * @param {Object} session - Session object
 * @param {string} sessionKey - Redis session key
 * @param {Object} user - User object
 * @returns {Object} Response with message and end_session flag
 */
const handleNavigation = async (command, session, sessionKey, user) => {
  switch (command) {
    case '0':
      await setCache(sessionKey, null, 0); // Clear session
      return {
        message: 'Thank you for using CrossBridge.',
        end_session: true
      };
    
    case '00':
      session.step = 'main';
      session.previousStep = null;
      await setCache(sessionKey, session, 180);
      return await showMainMenu(user);
    
    case '#':
      if (session.previousStep) {
        const prevStep = session.previousStep;
        session.step = prevStep;
        session.previousStep = null;
        await setCache(sessionKey, session, 180);
        return await getMenuForStep(prevStep, session, user);
      }
      return await showMainMenu(user);
    
    default:
      return await showMainMenu(user);
  }
};

const handleMenuNavigation = async (user, text, session, sessionKey) => {
  // Store current step as previous step before changing
  const currentStep = session.step;
  
  // Handle universal navigation first
  if (text === '0') {
    await setCache(sessionKey, null, 0); // Clear session
    return {
      message: 'Thank you for using CrossBridge.',
      end_session: true
    };
  }

  if (text === '00') {
    session.step = 'main';
    session.previousStep = null;
    await setCache(sessionKey, session, 180);
    return await showMainMenu(user);
  }

  if (text === '#' && session.previousStep) {
    const prevStep = session.previousStep;
    session.step = prevStep;
    session.previousStep = null;
    await setCache(sessionKey, session, 180);
    return await getMenuForStep(prevStep, session, user);
  }

  // Handle main menu selection
  if (session.step === 'main') {
    switch (text) {
      case '1':
        return await handleBalanceCheck(user);
      case '2':
        session.previousStep = session.step;
        session.step = 'send_money_phone';
        await setCache(sessionKey, session, 180);
        return await getMenuForStep('send_money_phone', session, user);
      case '3':
        session.step = 'deposit_amount';
        await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
        return {
          message: 'Enter amount to deposit:',
          end_session: false
        };
      case '4':
        session.step = 'withdraw_amount';
        await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
        return {
          message: 'Enter amount to withdraw:',
          end_session: false
        };
      case '5':
        session.step = 'rate_check';
        await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
        return {
          message: 'Select currency pair:\n1. NGN/USD\n2. NGN/GBP\n3. USD/GBP\n4. NGN/CBUSD',
          end_session: false
        };
      case '6':
        return await handleTransactionHistory(user);
      case '7':
        session.step = 'settings';
        await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
        return {
          message: 'Settings:\n1. Profile\n2. Security\n3. Back',
          end_session: false
        };
      default:
        return {
          message: 'Invalid option. Please try again.',
          end_session: true
        };
    }
  }
  
  // Handle send money flow
  else if (session.step === 'send_money_phone') {
    if (text === '#' || text === '00' || text === '0') {
      return handleNavigation(text, session, sessionKey, user);
    }
    session.data.recipient_phone = text;
    session.previousStep = session.step;
    session.step = 'send_money_amount';
    await setCache(sessionKey, session, 180);
    return await getMenuForStep('send_money_amount', session, user);
  }
  else if (session.step === 'send_money_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return {
        message: 'Invalid amount. Please try again.',
        end_session: true
      };
    }
    
    session.data.amount = amount;
    session.step = 'send_money_confirm';
    await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
    
    return {
      message: `Send ${amount} CBUSD to ${session.data.recipient_phone}?\n1. Confirm\n2. Cancel`,
      end_session: false
    };
  }
  else if (session.step === 'send_money_confirm') {
    if (text === '1') {
      // Process transfer (simplified for example)
      return {
        message: 'Transfer initiated. You will receive an SMS confirmation.',
        end_session: true
      };
    } else {
      return {
        message: 'Transfer cancelled.',
        end_session: true
      };
    }
  }
  
  // Handle deposit flow
  else if (session.step === 'deposit_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return {
        message: 'Invalid amount. Please try again.',
        end_session: true
      };
    }
    
    // Return deposit instructions
    return {
      message: `To deposit ${amount}, send to your unique account:\nBank: CrossBridge\nAcc: ${user.id.substring(0, 10)}\nRef: ${user.phone_number}`,
      end_session: true
    };
  }
  
  // Handle withdraw flow
  else if (session.step === 'withdraw_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return {
        message: 'Invalid amount. Please try again.',
        end_session: true
      };
    }
    
    session.data.amount = amount;
    session.step = 'withdraw_bank';
    await setCache(sessionKey, session, 180); // FIXED: Use setCache helper
    
    return {
      message: 'Select bank:\n1. GTBank\n2. Access\n3. First Bank\n4. UBA',
      end_session: false
    };
  }
  
  // Handle rate checking flow
  else if (session.step === 'rate_check') {
    let fromCurrency, toCurrency;
    switch (text) {
      case '1':
        fromCurrency = 'NGN';
        toCurrency = 'USD';
        break;
      case '2':
        fromCurrency = 'NGN';
        toCurrency = 'GBP';
        break;
      case '3':
        fromCurrency = 'USD';
        toCurrency = 'GBP';
        break;
      case '4':
        fromCurrency = 'NGN';
        toCurrency = 'CBUSD';
        break;
      default:
        return {
          message: 'Invalid option. Please try again.',
          end_session: true
        };
    }
    
    return await handleRateCheck(fromCurrency, toCurrency);
  }
  
  // Default response for unhandled steps
  return {
    message: 'Session expired. Please dial *737# to start again.',
    end_session: true
  };
};

/**
 * Handle balance check request
 * @param {Object} user - User object
 * @returns {Object} Response with message and end_session flag
 */
const handleBalanceCheck = async (user) => {
  try {
    if (!user || !user.id) {
      return {
        message: 'Invalid user session. Please try again.',
        end_session: true
      };
    }

    // Get user wallet
    const wallet = await Wallet.findByUserId(user.id);
    
    if (!wallet) {
      return {
        message: 'Wallet not found. Please contact support.',
        end_session: true
      };
    }
    
    // Format balance response with null checks
    let balanceMessage = 'CrossBridge Balance:\n';
    
    // CBUSD is always shown even if 0
    balanceMessage += `${(wallet.cbusd_balance || 0).toFixed(2)} CBUSD\n`;
    
    // Only show other currencies if they exist and have positive balance
    if (wallet.balance_ngn && wallet.balance_ngn > 0) {
      balanceMessage += `${wallet.balance_ngn.toFixed(2)} NGN\n`;
    }
    if (wallet.balance_gbp && wallet.balance_gbp > 0) {
      balanceMessage += `${wallet.balance_gbp.toFixed(2)} GBP\n`;
    }
    if (wallet.balance_usd && wallet.balance_usd > 0) {
      balanceMessage += `${wallet.balance_usd.toFixed(2)} USD\n`;
    }
    
    return {
      message: balanceMessage,
      end_session: true
    };
  } catch (error) {
    // Log error with context for debugging
    console.error('Error checking balance via USSD:', {
      userId: user?.id,
      error: error.message,
      stack: error.stack
    });

    // Return appropriate error message based on error type
    if (error.message.includes('database') || error.message.includes('connection')) {
      return {
        message: 'Service temporarily unavailable. Please try again in a few minutes.',
        end_session: true
      };
    }

    return {
      message: 'Unable to retrieve balance. Please try again or contact support if the issue persists.',
      end_session: true
    };
  }
};

/**
 * Handle rate check request
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @returns {Object} Response with message and end_session flag
 */
const handleRateCheck = async (fromCurrency, toCurrency) => {
  try {
    // Get current rate
    const quote = await pricingService.generateQuote(fromCurrency, toCurrency, 100);
    
    // Get 24h change
    const rateHistory = await ExchangeRate.getRecentRates(fromCurrency, toCurrency, 24);
    let change24h = 0;
    let changeIndicator = '';
    
    if (rateHistory && rateHistory.length > 0) {
      const oldestRate = rateHistory[rateHistory.length - 1].rate;
      change24h = ((quote.exchange_rate - oldestRate) / oldestRate) * 100;
      changeIndicator = change24h >= 0 ? '▲' : '▼';
    }
    
    // Format message
    const rateMessage = 
      `Current Rate: 1 ${fromCurrency} = ${quote.exchange_rate.toFixed(4)} ${toCurrency}\n` +
      `24h Change: ${changeIndicator} ${Math.abs(change24h).toFixed(2)}%\n` +
      `Updated: ${new Date().toLocaleTimeString()}`;
    
    return {
      message: rateMessage,
      end_session: true
    };
  } catch (error) {
    console.error('Error checking rates via USSD:', error);
    return {
      message: 'Error retrieving rates. Please try again later.',
      end_session: true
    };
  }
};

/**
 * Handle transaction history request
 * @param {Object} user - User object
 * @returns {Object} Response with message and end_session flag
 */
const handleTransactionHistory = async (user) => {
  try {
    // Get recent transactions
    const recentTransactions = await Transaction.getRecentTransactions(user.id, 3);
    
    if (!recentTransactions || recentTransactions.length === 0) {
      return {
        message: 'No recent transactions found.',
        end_session: true
      };
    }
    
    // Format transaction history
    let historyMessage = 'Recent Transactions:\n';
    
    for (const tx of recentTransactions) {
      const txDate = new Date(tx.created_at).toLocaleDateString();
      const txType = tx.transaction_type || 'Transfer';
      const txAmount = `${tx.amount} ${tx.currency_from}`;
      const txStatus = tx.status.charAt(0).toUpperCase() + tx.status.slice(1);
      
      historyMessage += `${txDate} | ${txType} | ${txAmount} | ${txStatus}\n`;
    }
    
    return {
      message: historyMessage,
      end_session: true
    };
  } catch (error) {
    console.error('Error getting transaction history via USSD:', error);
    return {
      message: 'Error retrieving transactions. Please try again later.',
      end_session: true
    };
  }
};

/**
 * Send formatted response for USSD
 * @param {Object} res - Express response object
 * @param {string} message - Response message
 * @param {boolean} endSession - Whether to end the USSD session
 */
const sendUssdResponse = (res, message, endSession = true) => {
  // Format may vary depending on telecom provider
  res.status(200).json({
    response_type: endSession ? 'end' : 'continue',
    message: message
  });
};

/**
 * Get personalized menu based on user history
 * @param {Object} user - User object
 * @returns {Array} Array of menu items ordered by relevance
 */
const getPersonalizedMenu = async (user) => {
  try {
    // Get user transaction patterns
    const transactionPatterns = await getUserTransactionPatterns(user.id);
    
    // Default menu items with weights
    const menuItems = [
      { id: 1, name: 'Check balance', weight: 10 },
      { id: 2, name: 'Send money', weight: 10 },
      { id: 3, name: 'Deposit from bank', weight: 10 },
      { id: 4, name: 'Withdraw to bank', weight: 10 },
      { id: 5, name: 'Check rates', weight: 10 },
      { id: 6, name: 'Recent transactions', weight: 10 },
      { id: 7, name: 'Settings', weight: 5 }
    ];
    
    // Apply patterns to weights
    if (transactionPatterns.frequentSends) {
      menuItems.find(i => i.id === 2).weight += 10;
    }
    
    if (transactionPatterns.frequentDeposits) {
      menuItems.find(i => i.id === 3).weight += 10;
    }
    
    if (transactionPatterns.frequentWithdrawals) {
      menuItems.find(i => i.id === 4).weight += 10;
    }
    
    if (transactionPatterns.frequentRateChecks) {
      menuItems.find(i => i.id === 5).weight += 10;
    }
    
    // Sort by weight (descending)
    return menuItems.sort((a, b) => b.weight - a.weight);
  } catch (error) {
    console.error('Error generating personalized menu:', error);
    // Return default order
    return [1, 2, 3, 4, 5, 6, 7];
  }
};

/**
 * Get user transaction patterns for personalization
 * @param {string} userId - User ID
 * @returns {Object} Transaction patterns
 */
const getUserTransactionPatterns = async (userId) => {
  try {
    // Get transaction counts by type in last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
    
    const transactions = await db('transactions')
      .where('sender_id', userId)
      .where('created_at', '>=', thirtyDaysAgo)
      .select('transaction_type')
      .count('* as count')
      .groupBy('transaction_type');
    
    // Get rate check events from Redis
    const rateCheckKey = `user:${userId}:rate_checks`;
    const rateCheckCount = await getCache(rateCheckKey) || 0; // FIXED: Use getCache helper
    
    // Determine patterns
    let sendCount = 0;
    let depositCount = 0;
    let withdrawalCount = 0;
    
    transactions.forEach(tx => {
      if (tx.transaction_type === 'p2p') sendCount = parseInt(tx.count);
      if (tx.transaction_type === 'deposit') depositCount = parseInt(tx.count);
      if (tx.transaction_type === 'withdrawal') withdrawalCount = parseInt(tx.count);
    });
    
    return {
      frequentSends: sendCount > 3,
      frequentDeposits: depositCount > 2,
      frequentWithdrawals: withdrawalCount > 2,
      frequentRateChecks: rateCheckCount > 5
    };
  } catch (error) {
    console.error('Error analyzing user patterns:', error);
    return {
      frequentSends: false,
      frequentDeposits: false,
      frequentWithdrawals: false,
      frequentRateChecks: false
    };
  }
};

module.exports = {
  processUssdSession
};