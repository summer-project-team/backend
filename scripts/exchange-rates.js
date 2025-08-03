#!/usr/bin/env node

/**
 * Exchange Rate Management CLI
 * Tool for managing and monitoring the exchange rate system
 */

const pricingService = require('../src/services/pricingService');
const exchangeRateConfig = require('../src/config/exchangeRateConfig');

const { Command } = require('commander');
const program = new Command();

program
  .name('exchange-rates')
  .description('Exchange Rate Management CLI')
  .version('1.0.0');

// Update rates command
program
  .command('update')
  .description('Update exchange rates (tries API first, falls back to local)')
  .action(async () => {
    try {
      console.log('🔄 Updating exchange rates...');
      const result = await pricingService.updateExchangeRates();
      
      if (result.success) {
        console.log(`✅ Success! Updated ${result.updated_count} rates using ${result.source} source`);
        console.log(`📅 Timestamp: ${result.timestamp}`);
      } else {
        console.log(`❌ Failed to update rates: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Force local update
program
  .command('update-local')
  .description('Force update using local rates only')
  .action(async () => {
    try {
      console.log('🔄 Updating exchange rates (local mode)...');
      const result = await pricingService.updateLocalExchangeRates();
      
      if (result.success) {
        console.log(`✅ Success! Updated ${result.updated_count} local rates`);
        console.log(`📅 Timestamp: ${result.timestamp}`);
      } else {
        console.log(`❌ Failed to update local rates: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Show configuration
program
  .command('config')
  .description('Show current exchange rate configuration')
  .action(() => {
    console.log('📋 Exchange Rate Configuration:');
    console.log('');
    console.log('🔌 API Settings:');
    console.log(`  Enabled: ${exchangeRateConfig.api.enabled ? '✅' : '❌'}`);
    console.log(`  Force Local: ${exchangeRateConfig.development.forceLocalMode ? '✅' : '❌'}`);
    console.log('');
    console.log('💰 Supported Currencies:');
    console.log(`  Primary: ${exchangeRateConfig.currencies.primary.join(', ')}`);
    console.log(`  Secondary: ${exchangeRateConfig.currencies.secondary.join(', ')}`);
    console.log('');
    console.log('💸 Fee Structure:');
    console.log(`  Base Fee: ${(exchangeRateConfig.local.fees.baseFee * 100).toFixed(2)}%`);
    console.log(`  Major Pairs: ${(exchangeRateConfig.local.fees.baseFee * exchangeRateConfig.local.fees.currencyAdjustments.major.multiplier * 100).toFixed(2)}%`);
    console.log(`  Exotic Pairs: ${(exchangeRateConfig.local.fees.baseFee * exchangeRateConfig.local.fees.currencyAdjustments.exotic.multiplier * 100).toFixed(2)}%`);
    console.log(`  Stablecoin Pairs: ${(exchangeRateConfig.local.fees.baseFee * exchangeRateConfig.local.fees.currencyAdjustments.stable.multiplier * 100).toFixed(2)}%`);
    console.log('');
    console.log('⏱️ Update Intervals:');
    console.log(`  Rate Updates: ${exchangeRateConfig.timing.updateInterval / 1000}s`);
    console.log(`  Quote Cache: ${exchangeRateConfig.timing.quoteCacheDuration / 60}min`);
  });

// Test quote generation
program
  .command('quote')
  .description('Generate a test quote')
  .option('-f, --from <currency>', 'From currency', 'USD')
  .option('-t, --to <currency>', 'To currency', 'NGN')
  .option('-a, --amount <number>', 'Amount to exchange', '100')
  .action(async (options) => {
    try {
      const amount = parseFloat(options.amount);
      console.log(`💱 Generating quote: ${amount} ${options.from} → ${options.to}`);
      
      const quote = await pricingService.generateQuote(options.from, options.to, amount);
      
      console.log('');
      console.log('📊 Quote Details:');
      console.log(`  Quote ID: ${quote.quote_id}`);
      console.log(`  Exchange Rate: ${quote.exchange_rate.toFixed(6)}`);
      console.log(`  Fee: ${quote.fee_amount.toFixed(2)} ${options.from} (${(quote.fee_percentage * 100).toFixed(2)}%)`);
      console.log(`  You'll receive: ${quote.exchange_amount.toFixed(2)} ${options.to}`);
      console.log(`  Expires: ${new Date(quote.expires_at).toLocaleString()}`);
    } catch (error) {
      console.error('❌ Error generating quote:', error.message);
    }
  });

// Show current rates
program
  .command('rates')
  .description('Show current exchange rates')
  .option('-f, --from <currency>', 'Filter by from currency')
  .option('-t, --to <currency>', 'Filter by to currency')
  .action(async (options) => {
    try {
      const { db } = require('../src/utils/database');
      let query = db('exchange_rates').select('*');
      
      if (options.from) {
        query = query.where('from_currency', options.from.toUpperCase());
      }
      
      if (options.to) {
        query = query.where('to_currency', options.to.toUpperCase());
      }
      
      const rates = await query.orderBy('from_currency').orderBy('to_currency');
      
      console.log('📈 Current Exchange Rates:');
      console.log('');
      console.table(rates.map(rate => ({
        'From': rate.from_currency,
        'To': rate.to_currency,
        'Rate': rate.rate.toFixed(6),
        'Fee %': (rate.fee_percentage * 100).toFixed(2) + '%',
        'Updated': new Date(rate.updated_at).toLocaleString()
      })));
    } catch (error) {
      console.error('❌ Error fetching rates:', error.message);
    }
  });

// Health check
program
  .command('health')
  .description('Check exchange rate system health')
  .action(async () => {
    try {
      console.log('🏥 Exchange Rate System Health Check');
      console.log('');
      
      // Check database connection
      const { db } = require('../src/utils/database');
      const rateCount = await db('exchange_rates').count('* as count').first();
      console.log(`✅ Database: ${rateCount.count} rates stored`);
      
      // Check if rates are recent
      const latestRate = await db('exchange_rates')
        .orderBy('updated_at', 'desc')
        .first();
      
      if (latestRate) {
        const age = Date.now() - new Date(latestRate.updated_at).getTime();
        const ageMinutes = Math.floor(age / (1000 * 60));
        
        if (ageMinutes < 60) {
          console.log(`✅ Rate Freshness: Latest rate is ${ageMinutes} minutes old`);
        } else {
          console.log(`⚠️  Rate Freshness: Latest rate is ${ageMinutes} minutes old (consider updating)`);
        }
      }
      
      // Test rate calculation
      const testRate = await pricingService.getExchangeRate('USD', 'NGN');
      console.log(`✅ Rate Calculation: USD/NGN = ${testRate.rate.toFixed(2)}`);
      
      // Test quote generation
      const testQuote = await pricingService.generateQuote('USD', 'NGN', 100);
      console.log(`✅ Quote Generation: $100 → ₦${testQuote.exchange_amount.toFixed(2)}`);
      
      console.log('');
      console.log('🎉 All systems operational!');
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }
  });

program.parse();
