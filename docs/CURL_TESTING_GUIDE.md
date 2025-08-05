# CrossBridge API - Comprehensive cURL Testing Guide

## Base Configuration
```bash
# Set your base URL
export BASE_URL="http://localhost:3001"
export API_URL="$BASE_URL/api"

# After login, set your JWT token
export JWT_TOKEN="your_jwt_token_here"
```

## 1. Authentication Endpoints

### Register User
```bash
curl -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234",
    "email": "test@example.com",
    "password": "password123",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

### Verify Phone Number
```bash
curl -X POST "$API_URL/auth/verify-phone" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234",
    "verification_code": "123456"
  }'
```

### Resend Verification Code
```bash
curl -X POST "$API_URL/auth/resend-verification" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234"
  }'
```

### Get Verification Status
```bash
curl -X GET "$API_URL/auth/verification-status/8123456789/+234"
```

### Login
```bash
curl -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234",
    "password": "password123"
  }'
```

### Refresh Token
```bash
curl -X POST "$API_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Logout
```bash
curl -X POST "$API_URL/auth/logout" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 2. User Management Endpoints

### Get Profile
```bash
curl -X GET "$API_URL/users/me" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Update Profile
```bash
curl -X PUT "$API_URL/users/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@example.com"
  }'
```

### Get Wallet
```bash
curl -X GET "$API_URL/users/wallet" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Lookup User by Phone
```bash
curl -X POST "$API_URL/users/lookup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "phone_number": "8987654321",
    "country_code": "+234"
  }'
```

### Validate Phone Number
```bash
curl -X POST "$API_URL/users/validate-phone" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234"
  }'
```

### Setup Transaction PIN
```bash
curl -X POST "$API_URL/users/pin/setup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "pin": "1234",
    "confirmPin": "1234"
  }'
```

### Verify Transaction PIN
```bash
curl -X POST "$API_URL/users/pin/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "pin": "1234"
  }'
```

### Change Transaction PIN
```bash
curl -X PUT "$API_URL/users/pin/change" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "currentPin": "1234",
    "newPin": "5678",
    "confirmNewPin": "5678"
  }'
```

### Get PIN Status
```bash
curl -X GET "$API_URL/users/pin/status" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Disable Transaction PIN
```bash
curl -X DELETE "$API_URL/users/pin" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Delete Account (Soft Delete)
```bash
curl -X DELETE "$API_URL/users/me" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 3. Transaction Endpoints

### Get Quote
```bash
curl -X POST "$API_URL/transactions/quote" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "amount": 100,
    "currency_from": "NGN",
    "currency_to": "GBP",
    "payment_method": "app_balance",
    "recipient_phone": "8987654321",
    "recipient_country_code": "+234"
  }'
```

### Lock Exchange Rate
```bash
curl -X POST "$API_URL/transactions/lock-rate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "quote_id": "quote-uuid-here",
    "duration": 300
  }'
```

### Verify Rate Lock
```bash
curl -X GET "$API_URL/transactions/verify-lock/lock-id-here" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Send Money
```bash
curl -X POST "$API_URL/transactions/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "recipient_phone": "8987654321",
    "recipient_country_code": "+234",
    "amount": 50,
    "currency_from": "CBUSD",
    "currency_to": "CBUSD",
    "pin": "1234",
    "narration": "Test transfer"
  }'
```

### Get Transaction History
```bash
curl -X GET "$API_URL/transactions/history?limit=20&offset=0" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Transaction Details
```bash
curl -X GET "$API_URL/transactions/transaction-id-here" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Cancel Transaction
```bash
curl -X POST "$API_URL/transactions/transaction-id-here/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "reason": "User requested cancellation"
  }'
```

### Retry Transaction
```bash
curl -X POST "$API_URL/transactions/transaction-id-here/retry" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Initiate Bank Deposit
```bash
curl -X POST "$API_URL/transactions/bank-to-app" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "amount": 100000,
    "currency": "NGN"
  }'
```

**Note**: For deposits:
- `currency_from` is automatically set to the `currency` field value  
- `currency_to` is automatically set to "CBUSD" (always to app balance)
- `sender_country_code` is automatically determined from the source currency (null for borderless tokens)

### Initiate Bank Withdrawal
```bash
curl -X POST "$API_URL/transactions/app-to-bank" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "amount": 50,
    "currency": "GBP",
    "bank_account_number": "12345678",
    "bank_name": "NatWest",
    "account_holder_name": "John Doe",
    "transaction_pin": "1234"
  }'
```

**Note**: For withdrawals:
- `currency_from` is automatically set to "CBUSD" (always from app balance)
- `currency_to` is automatically set to the `currency` field value
- `recipient_country_code` is automatically determined from the target currency (null for borderless tokens like CBUSD)

## 4. Banking Endpoints

### Link Bank Account
```bash
curl -X POST "$API_URL/banking/link-account" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "bank_name": "GTBank",
    "account_number": "1234567890",
    "account_name": "John Doe",
    "bank_code": "GTB",
    "account_type": "savings",
    "currency": "NGN"
  }'
```

### Get Linked Accounts
```bash
curl -X GET "$API_URL/banking/accounts" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Remove Bank Account
```bash
curl -X DELETE "$API_URL/banking/accounts/account-id-here" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Verify Bank Account
```bash
curl -X POST "$API_URL/banking/verify-account" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "account_id": "account-id-here",
    "verification_code": "123456"
  }'
```

### Verify Deposit
```bash
curl -X POST "$API_URL/banking/verify-deposit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "deposit_reference": "DEP123456789",
    "amount": 100000,
    "currency": "NGN"
  }'
```

## 5. CBUSD Token Endpoints

### Mint CBUSD
```bash
curl -X POST "$API_URL/cbusd/mint" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "amount": 100,
    "currency": "NGN"
  }'
```

### Burn CBUSD
```bash
curl -X POST "$API_URL/cbusd/burn" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "amount": 50,
    "target_currency": "GBP"
  }'
```

### Get CBUSD Balance
```bash
curl -X GET "$API_URL/cbusd/balance" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Transfer CBUSD (legacy, we now use api/transaction/send/)
```bash
curl -X POST "$API_URL/cbusd/transfer" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "recipient_phone": "8987654321",
    "recipient_country_code": "+234",
    "amount": 25
  }'
```

## 6. Analytics Endpoints

### Get Transaction Volume Data
```bash
# Basic volume data (daily by default)
curl -X GET "$API_URL/analytics/volume" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Volume data with specific period and currency
curl -X GET "$API_URL/analytics/volume?period=monthly&currency=NGN" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Corridor Analytics
```bash
# Get analytics for specific currency corridor
curl -X GET "$API_URL/analytics/corridor/NGN/GBP" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Corridor analytics with time period
curl -X GET "$API_URL/analytics/corridor/CBUSD/USD?period=weekly" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get User Activity Statistics (Admin Only)
```bash
# User activity for last 30 days (default)
curl -X GET "$API_URL/analytics/user-activity" \
  -H "Authorization: Bearer $JWT_TOKEN"

# User activity for specific period
curl -X GET "$API_URL/analytics/user-activity?days=7" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Performance Metrics (Admin Only)
```bash
curl -X GET "$API_URL/analytics/performance" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get System Status (Admin Only)
```bash
curl -X GET "$API_URL/analytics/system-status" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Fraud Indicators (Admin Only)
```bash
curl -X GET "$API_URL/analytics/fraud-indicators" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Dashboard Data (Admin Only)
```bash
curl -X GET "$API_URL/analytics/dashboard" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Spending Patterns
```bash
# Basic spending patterns (current user, last 30 days)
curl -X GET "$API_URL/analytics/spending-patterns" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Spending patterns with filters
curl -X GET "$API_URL/analytics/spending-patterns?period=weekly&currency=NGN&days=14" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Admin can view specific user's patterns
curl -X GET "$API_URL/analytics/spending-patterns?userId=user-uuid-here&period=monthly" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Transaction Trends
```bash
# Basic transaction trends (daily, last 30 days)
curl -X GET "$API_URL/analytics/transaction-trends" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Transaction trends with specific filters
curl -X GET "$API_URL/analytics/transaction-trends?period=monthly&currency=GBP&days=90" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Trends for specific transaction type
curl -X GET "$API_URL/analytics/transaction-trends?transactionType=app_transfer&period=weekly" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Analytics Summary
```bash
# Basic analytics summary (last 30 days)
curl -X GET "$API_URL/analytics/summary" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Summary with specific parameters
curl -X GET "$API_URL/analytics/summary?currency=CBUSD&days=60" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Period-over-period comparison
curl -X GET "$API_URL/analytics/summary?period=weekly&days=14" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Monthly Comparison
```bash
# Monthly comparison (last 6 months by default)
curl -X GET "$API_URL/analytics/monthly-comparison" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Monthly comparison with specific parameters
curl -X GET "$API_URL/analytics/monthly-comparison?months=12&currency=USD" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Compare specific currency over time
curl -X GET "$API_URL/analytics/monthly-comparison?months=3&currency=NGN" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Currency Distribution
```bash
# Basic currency distribution (last 30 days)
curl -X GET "$API_URL/analytics/currency-distribution" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Currency distribution with filters
curl -X GET "$API_URL/analytics/currency-distribution?period=weekly&days=14" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Distribution for specific transaction type
curl -X GET "$API_URL/analytics/currency-distribution?transactionType=withdrawal&days=60" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get CBUSD Flows (Inflow/Outflow)
```bash
# Basic CBUSD flows (daily, last 30 days)
curl -X GET "$API_URL/analytics/cbusd-flows" \
  -H "Authorization: Bearer $JWT_TOKEN"

# CBUSD flows with specific period
curl -X GET "$API_URL/analytics/cbusd-flows?period=weekly&days=14" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Extended CBUSD flow analysis
curl -X GET "$API_URL/analytics/cbusd-flows?period=monthly&days=90" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get CBUSD Circulation Analytics
```bash
# Basic CBUSD circulation metrics
curl -X GET "$API_URL/analytics/cbusd-circulation" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Circulation analysis over specific period
curl -X GET "$API_URL/analytics/cbusd-circulation?period=daily&days=60" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Long-term circulation trends
curl -X GET "$API_URL/analytics/cbusd-circulation?period=weekly&days=180" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### CBUSD Analytics Features

#### CBUSD Flows Endpoint (`/cbusd-flows`):
- **Inflow Tracking**: Mint operations and deposits that create new CBUSD
- **Outflow Tracking**: Burn operations and withdrawals that remove CBUSD
- **Net Flow Analysis**: Real-time supply changes over time
- **Velocity Metrics**: How fast CBUSD circulates in the economy
- **Reserve Ratios**: Backing asset ratios and reserve health
- **Health Indicators**: Circulation growth, flow stability, backing diversity

#### CBUSD Circulation Endpoint (`/cbusd-circulation`):
- **Supply Metrics**: Total supply, holder count, distribution statistics
- **Holder Analytics**: Balance tiers, geographical distribution
- **Concentration Analysis**: Gini coefficient, wealth distribution
- **Growth Tracking**: Historical circulation changes
- **Liquidity Metrics**: Active vs dormant holdings

#### Sample CBUSD Flows Response:
```json
{
  "success": true,
  "data": {
    "period": "daily",
    "days": 30,
    "summary": {
      "total_inflow": 2500000.00,
      "total_outflow": 2100000.00,
      "net_flow": 400000.00,
      "inflow_count": 1250,
      "outflow_count": 980
    },
    "circulation": {
      "total_supply": 15000000.00,
      "holders_count": 2850,
      "avg_balance": 5263.16,
      "max_balance": 150000.00
    },
    "velocity_metrics": {
      "velocity": 0.45,
      "period_days": 30
    },
    "reserve_metrics": {
      "total_backing_value": 15200000.00,
      "reserve_ratio": 101.33,
      "backing_currencies": [...]
    },
    "health_indicators": {
      "circulation_growth_rate": 2.5,
      "velocity": 0.45,
      "reserve_ratio": 101.33,
      "backing_diversity": 3,
      "flow_stability": 15000.0
    }
  }
}
```

### Analytics Query Parameters Guide

#### Common Parameters:
- `period`: Time grouping (`hourly`, `daily`, `weekly`, `monthly`, `yearly`)
- `currency`: Filter by specific currency (`NGN`, `GBP`, `USD`, `CBUSD`)
- `days`: Number of days to analyze (default: 30)
- `transactionType`: Filter by transaction type (`app_transfer`, `deposit`, `withdrawal`, `mint`, `burn`, `bank_to_bank`)

#### Admin-Only Parameters:
- `userId`: Analyze specific user's data (spending patterns only)
- `months`: Number of months for comparison (monthly-comparison endpoint)

#### Response Features:
- **Inflow/Outflow Analysis**: All endpoints include inflow vs outflow metrics by transaction type
- **Growth Rates**: Period-over-period percentage changes
- **Success Rates**: Transaction completion ratios
- **Currency Flows**: Volume and count by currency and transaction type
- **Market Share**: Currency distribution percentages
- **Time Series Data**: Trends over specified periods
- **CBUSD Health Metrics**: Circulation, velocity, reserve ratios, and stability indicators

#### Sample Response Structure:
```json
{
  "success": true,
  "data": {
    "period": "daily",
    "filters": { "currency": "NGN", "days": 30 },
    "summary": {
      "total_transactions": 1250,
      "total_volume": 15000000.00,
      "total_fees": 75000.00,
      "average_success_rate": 0.96
    },
    "inflow_outflow": {
      "inflow": {
        "total_volume": 8000000.00,
        "total_count": 800,
        "by_currency": [...]
      },
      "outflow": {
        "total_volume": 7000000.00,
        "total_count": 450,
        "by_currency": [...]
      },
      "net_flow": 1000000.00
    },
    "trends": [...],
    "currency_breakdown": [...]
  }
}
```

## 7. USSD Endpoints

### Initiate USSD Session
```bash
curl -X POST "$API_URL/ussd/initiate" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "network_code": "MTN",
    "ussd_code": "*737#"
  }'
```

### Process USSD Session
```bash
curl -X POST "$API_URL/ussd/session" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "session_id": "session-uuid-here",
    "text": "1",
    "network_code": "MTN"
  }'
```

### Get USSD Status
```bash
curl -X GET "$API_URL/ussd/status/session-uuid-here"
```

### Handle Provider Callback
```bash
curl -X POST "$API_URL/ussd/callback" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "session-uuid-here",
    "phone_number": "8123456789",
    "text": "user_input",
    "network_code": "MTN",
    "status": "active"
  }'
```

## 8. System Endpoints

### System Status
```bash
curl -X GET "$API_URL/system/status"
```

### Health Check
```bash
curl -X GET "$API_URL/system/health"
```

### Refresh Exchange Rates (Admin)
```bash
curl -X POST "$API_URL/system/refresh-rates" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get System Metrics (Admin)
```bash
curl -X GET "$API_URL/system/metrics" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 9. Admin Endpoints

### Get All Users (Admin)
```bash
curl -X GET "$API_URL/admin/users?page=1&limit=20" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get All Transactions (Admin)
```bash
curl -X GET "$API_URL/admin/transactions?page=1&limit=20&status=completed" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get System Health (Admin)
```bash
curl -X GET "$API_URL/admin/system-health" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Suspend User (Admin)
```bash
curl -X POST "$API_URL/admin/users/user-id-here/suspend" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "reason": "Suspicious activity",
    "duration": "30d"
  }'
```

## 10. Bank Integration Endpoints (B2B)

### Register Bank (Admin)
```bash
curl -X POST "$API_URL/bank-integration/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "bank_name": "Test Bank",
    "bank_code": "TEST",
    "swift_code": "TESTNGLA",
    "country_code": "NG",
    "api_key": "test_api_key",
    "api_secret": "test_api_secret",
    "supports_b2b": true
  }'
```

### List Banks (Admin)
```bash
curl -X GET "$API_URL/bank-integration/list" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Bank Details (Admin)
```bash
curl -X GET "$API_URL/bank-integration/bank-id-here" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### B2B Transfer (API Key Auth)
```bash
curl -X POST "$API_URL/bank-integration/b2b-transfer" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_bank_api_key" \
  -d '{
    "sender_bank_id": "TEST",
    "recipient_bank_id": "DEST",
    "amount": 1000,
    "source_currency": "NGN",
    "target_currency": "GBP",
    "sender_account": {
      "account_number": "1234567890",
      "account_name": "Test Account"
    },
    "recipient_account": {
      "account_number": "0987654321",
      "account_name": "Dest Account"
    }
  }'
```

### Get B2B Quote (API Key Auth)
```bash
curl -X POST "$API_URL/bank-integration/b2b-quote" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_bank_api_key" \
  -d '{
    "amount": 1000,
    "source_currency": "NGN",
    "target_currency": "GBP"
  }'
```

### Get Transfer Status (API Key Auth)
```bash
curl -X GET "$API_URL/bank-integration/transfer-status/transaction-id-here" \
  -H "X-API-Key: your_bank_api_key"
```

## 11. Security Endpoints

### Assess Transaction Risk
```bash
curl -X POST "$API_URL/security/assess-transaction" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "transaction_id": "transaction-uuid-here",
    "context": {
      "device_fingerprint": "device123",
      "location": "Lagos, Nigeria",
      "country_code": "NG"
    }
  }'
```

### Assess Device Risk
```bash
curl -X POST "$API_URL/security/assess-device" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "device_fingerprint": "device123"
  }'
```

### Get Fraud Alerts (Admin)
```bash
curl -X GET "$API_URL/security/fraud-alerts" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 12. Webhook Endpoints

### Bank Deposit Webhook
```bash
curl -X POST "$API_URL/webhooks/bank-deposit" \
  -H "Content-Type: application/json" \
  -d '{
    "deposit_reference": "DEP123456789",
    "amount": 100000,
    "currency": "NGN",
    "user_id": "user-uuid-here",
    "bank_name": "GTBank",
    "account_number": "1234567890"
  }'
```

### Flutterwave Webhook
```bash
curl -X POST "$API_URL/webhooks/flutterwave" \
  -H "Content-Type: application/json" \
  -H "verif-hash: your_flutterwave_hash" \
  -d '{
    "event": "charge.completed",
    "data": {
      "id": 123456,
      "amount": 100000,
      "currency": "NGN",
      "customer": {
        "email": "test@example.com",
        "phone_number": "8123456789"
      },
      "status": "successful"
    }
  }'
```

## 13. WebSocket Endpoints

### Connect to WebSocket
```bash
# WebSocket connection (use a WebSocket client)
# URL: ws://localhost:3001/socket.io/?token=your_jwt_token
```

### Get WebSocket Status
```bash
curl -X GET "$API_URL/websocket/status" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 14. Wallet Endpoints

### Demo Deposit (Testing)
```bash
curl -X POST "$API_URL/wallets/deposit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "amount": 1000,
    "currency": "NGN"
  }'
```

## 15. Dashboard Endpoints

### Get Dashboard Data
```bash
curl -X GET "$API_URL/dashboard/overview" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Recent Activity
```bash
curl -X GET "$API_URL/dashboard/recent-activity" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 16. Health Check Endpoint

### Basic Health Check
```bash
curl -X GET "$BASE_URL/health"
```

## Testing Flow Example

Here's a complete testing flow:

```bash
#!/bin/bash

# Set base configuration
export BASE_URL="http://localhost:3001"
export API_URL="$BASE_URL/api"

echo "=== CrossBridge API Testing Script ==="
echo "Base URL: $BASE_URL"

# 1. Test health check first
echo -e "\n1. Testing health check..."
curl -s -X GET "$BASE_URL/health" | jq '.'

# 2. Register user
echo -e "\n2. Registering new user..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234",
    "email": "test@example.com",
    "password": "password123",
    "first_name": "John",
    "last_name": "Doe"
  }')

echo "Register response: $REGISTER_RESPONSE"

# 3. Test resend verification code
echo -e "\n3. Testing resend verification code..."
RESEND_RESPONSE=$(curl -s -X POST "$API_URL/auth/resend-verification" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234"
  }')

echo "Resend response: $RESEND_RESPONSE"

# 4. Check verification status
echo -e "\n4. Checking verification status..."
STATUS_RESPONSE=$(curl -s -X GET "$API_URL/auth/verification-status/8123456789/+234")
echo "Status response: $STATUS_RESPONSE"

# 5. Verify phone (use the code from mock provider)
echo -e "\n5. Verifying phone with mock code..."
VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/auth/verify-phone" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234",
    "verification_code": "123456"
  }')

echo "Verify response: $VERIFY_RESPONSE"

# Extract token if verification was successful
if [[ $VERIFY_RESPONSE == *"token"* ]]; then
  JWT_TOKEN=$(echo $VERIFY_RESPONSE | jq -r '.token')
  echo "JWT Token extracted: ${JWT_TOKEN:0:50}..."
  
  # 6. Get profile
  echo -e "\n6. Getting user profile..."
  curl -s -X GET "$API_URL/users/me" \
    -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
  
  # 7. Get wallet balance
  echo -e "\n7. Getting wallet balance..."
  curl -s -X GET "$API_URL/users/wallet" \
    -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
  
  # 8. Setup transaction PIN
  echo -e "\n8. Setting up transaction PIN..."
  curl -s -X POST "$API_URL/users/pin/setup" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d '{"pin": "1234"}' | jq '.'
  
  # 9. Verify transaction PIN
  echo -e "\n9. Verifying transaction PIN..."
  curl -s -X POST "$API_URL/users/pin/verify" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d '{"pin": "1234"}' | jq '.'
  
  # 10. Get PIN status
  echo -e "\n10. Getting PIN status..."
  curl -s -X GET "$API_URL/users/pin/status" \
    -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
  
  # 11. Demo deposit (if wallet endpoint is available)
  echo -e "\n11. Demo deposit..."
  curl -s -X POST "$API_URL/wallets/deposit" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d '{
      "amount": 1000,
      "currency": "NGN"
    }' | jq '.'
  
  # 12. Get transaction quote
  echo -e "\n12. Getting transaction quote..."
  curl -s -X POST "$API_URL/transactions/quote" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d '{
      "amount": 100,
      "currency_from": "NGN",
      "currency_to": "GBP",
      "payment_method": "app_balance",
      "recipient_phone": "8987654321",
      "recipient_country_code": "+234"
    }' | jq '.'
  
else
  echo "Authentication failed, skipping authenticated tests"
fi

echo -e "\n=== Testing completed ==="
```

## New Phone Verification Testing

### Test the Production-Ready Verification Flow
```bash
#!/bin/bash

# Test complete phone verification flow
export BASE_URL="http://localhost:3001"
export API_URL="$BASE_URL/api"

echo "=== Testing Production Phone Verification ==="

# 1. Register user
echo "1. Registering user..."
curl -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234", 
    "email": "test@example.com",
    "password": "password123",
    "first_name": "Test",
    "last_name": "User"
  }'

# 2. Check verification status
echo -e "\n2. Checking verification status..."
curl -X GET "$API_URL/auth/verification-status/8123456789/+234"

# 3. Resend verification code
echo -e "\n3. Resending verification code..."
curl -X POST "$API_URL/auth/resend-verification" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234"
  }'

# 4. Test rate limiting (try resending again immediately)
echo -e "\n4. Testing rate limiting..."
curl -X POST "$API_URL/auth/resend-verification" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789", 
    "country_code": "+234"
  }'

# 5. Verify with wrong code
echo -e "\n5. Testing wrong verification code..."
curl -X POST "$API_URL/auth/verify-phone" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234",
    "verification_code": "000000"
  }'

# 6. Verify with correct code (mock provider uses 123456)
echo -e "\n6. Verifying with correct code..."
curl -X POST "$API_URL/auth/verify-phone" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "8123456789",
    "country_code": "+234", 
    "verification_code": "123456"
  }'
```

## Common Issues and Fixes

### 1. Authentication Issues
- Make sure to include `Authorization: Bearer $JWT_TOKEN` header
- JWT tokens expire, get a fresh token by logging in again
- Verify your token is properly extracted from login response

### 2. Validation Errors
- PIN must be exactly 4 digits (not 6)
- Phone numbers should not include country code when using separate country_code field
- Currency codes must be exactly: NGN, GBP, USD, CBUSD

### 3. Route Corrections
- Use `/users/pin/setup` not `/users/setup-pin`
- Use `/users/pin/verify` not `/users/verify-pin`
- Profile update uses `/users/profile` (both PUT routes work)

### 4. Phone Verification
- Mock provider always accepts code "123456"
- Real providers (Twilio, AWS SNS, Termii) need proper API keys
- Rate limiting: 5 sends per hour, 3 verifications per hour per phone

## Environment Variables Needed

Make sure these environment variables are set in your `.env` file:

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/crossbridge
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_here
FLUTTERWAVE_SECRET_HASH=your_flutterwave_hash
```

## Currency and Country Code Mapping

The API automatically handles currency-to-country mappings for transactions:

### Currency to Country Code Mapping:
- **NGN** → **+234** (Nigeria)
- **GBP** → **+44** (United Kingdom)  
- **USD** → **+1** (United States)
- **CBUSD** → **null** (Universal/borderless token - uses user's actual country)

### Transaction Types and Currency Logic:
1. **Send Money** (`/transactions/send`):
   - Explicitly specify both `currency_from` and `currency_to`
   - Country codes use actual user locations (not derived from currency)
   - Supports all currency combinations including CBUSD

2. **Bank Withdrawals** (`/transactions/app-to-bank`):
   - `currency_from` = "CBUSD" (automatic)
   - `currency_to` = value from `currency` field
   - `sender_country_code` = user's actual country
   - `recipient_country_code` = determined from target currency (null for CBUSD)

3. **Bank Deposits** (`/transactions/bank-to-app`):
   - `currency_from` = value from `currency` field
   - `currency_to` = "CBUSD" (automatic)
   - `sender_country_code` = determined from source currency (null for CBUSD)
   - `recipient_country_code` = user's actual country

### High Value Transaction Thresholds:
- **NGN**: 50,000 NGN
- **GBP**: £50
- **USD**: $60
- **CBUSD**: 60 CBUSD

## Notes

1. Replace `your_jwt_token_here` with actual JWT tokens from login responses
2. Replace `user-id-here`, `transaction-id-here`, etc. with actual UUIDs
3. Some endpoints require admin privileges
4. API key endpoints require valid bank API keys
5. Webhook endpoints are typically called by external services
6. WebSocket endpoints require WebSocket clients for testing

This comprehensive guide covers all your implemented endpoints!
