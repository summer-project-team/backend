const asyncHandler = require('express-async-handler');
const knex = require('knex')(require('../../knexfile')[process.env.NODE_ENV || 'development']);
const transactionService = require('../services/transaction');
const Wallet = require('../models/Wallet');
const { AppError } = require('../middleware/errorHandler');

/**
 * @desc    Handle bank deposit webhook
 * @route   POST /api/webhooks/bank-deposit
 * @access  Public (but verified)
 */
const handleBankDeposit = asyncHandler(async (req, res) => {
  const { 
    reference_code, 
    amount, 
    currency, 
    bank_reference,
    timestamp 
  } = req.body;

  try {
    // Log webhook event
    await knex('webhook_events').insert({
      event_type: 'bank_deposit',
      reference_code,
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      bank_reference,
      raw_data: JSON.stringify(req.body)
    });

    // Find matching deposit reference
    const depositRef = await knex('bank_deposit_references')
      .where({ 
        reference_code, 
        status: 'pending',
        currency: currency.toUpperCase()
      })
      .first();

    if (!depositRef) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reference code'
      });
    }

    // Verify amount matches
    if (parseFloat(amount) !== parseFloat(depositRef.amount)) {
      return res.status(400).json({
        success: false,
        error: 'Amount mismatch'
      });
    }

    // Process the deposit
    await processDepositToApp(depositRef, parseFloat(amount), currency.toUpperCase());

    res.status(200).json({
      success: true,
      message: 'Deposit processed successfully'
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

/**
 * Process bank deposit to app wallet with CBUSD conversion
 */
const processDepositToApp = async (depositRef, amount, currency) => {
  const transaction = await knex.transaction(async (trx) => {
    // Update deposit reference status
    await trx('bank_deposit_references')
      .where({ id: depositRef.id })
      .update({ 
        status: 'processing',
        processed_at: new Date()
      });

    // Create transaction record
    const txn = await transactionService.createTransaction({
      sender_id: null, // Bank deposit has no sender
      recipient_id: depositRef.user_id,
      sender_phone: null,
      recipient_phone: null,
      sender_country_code: null,
      recipient_country_code: 'NG', // Default for now
      amount: amount,
      source_currency: currency,
      target_currency: 'CBUSD',
      exchange_rate: await getCBUSDRate(currency),
      fee: amount * 0.004, // 0.4% fee
      transaction_type: 'deposit',
      metadata: {
        deposit_reference_id: depositRef.id,
        reference_code: depositRef.reference_code,
        conversion_type: 'bank_to_cbusd'
      }
    });

    // Convert currency to CBUSD
    const cbusdRate = await getCBUSDRate(currency);
    const feeAmount = amount * 0.004;
    const netAmount = amount - feeAmount;
    const cbusdAmount = netAmount * cbusdRate;

    // Update user's CBUSD balance
    const wallet = await Wallet.findByUserId(depositRef.user_id);
    await trx('wallets')
      .where({ id: wallet.id })
      .increment('cbusd_balance', cbusdAmount);

    // Complete transaction
    await transactionService.completeTransaction(txn.id);

    // Update deposit reference to completed
    await trx('bank_deposit_references')
      .where({ id: depositRef.id })
      .update({ status: 'completed' });

    return txn;
  });

  return transaction;
};

/**
 * Get CBUSD exchange rate for currency (same as in transaction controller)
 */
const getCBUSDRate = async (currency) => {
  const rates = {
    'USD': 1.0,
    'NGN': 1/1500, // 1500 NGN = 1 CBUSD
    'GBP': 1.25    // 1 GBP = 1.25 CBUSD
  };
  return rates[currency] || 1.0;
};

module.exports = {
  handleBankDeposit,
  processDepositToApp,
  getCBUSDRate
};