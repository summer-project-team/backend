# CrossBridge API

A fintech prototype for cross-border transfers focusing on Nigeria-UK/US transfers with phone number abstraction.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Navigate to the backend directory:
   ```
   cd backend
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Create a `.env` file with the following content:
   ```
   # Database
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crossbridge
   REDIS_URL=redis://localhost:6379
   
   # JWT
   JWT_SECRET=your-secret-key-change-in-production
   JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
   JWT_EXPIRY=1d
   JWT_REFRESH_EXPIRY=7d
   
   # API
   PORT=3000
   NODE_ENV=development
   
   # Mock Banking
   MOCK_BANK_DELAY_MS=2000
   MOCK_SUCCESS_RATE=0.95
   
   # Exchange Rates
   BASE_FEE_PERCENTAGE=0.3
   RATE_REFRESH_INTERVAL=30000
   ```

### Running the API

Start the API server:

```
npm start
```

Or for development with auto-reload:

```
npm run dev
```

The API will be available at http://localhost:3000

## Testing the API

You can test the API using the included Postman collection:

1. Import the `CrossBridge-API.postman_collection.json` file into Postman
2. Create a Postman environment and add the following variables:
   - `access_token` (leave empty, will be auto-filled)
   - `refresh_token` (leave empty, will be auto-filled)
   - `quote_id` (leave empty, will be auto-filled)
   - `transaction_id` (leave empty, will be auto-filled)

### Demo Flow

1. **Login with a Demo User**:
   - Use the "Login" request with one of the demo users:
     - Nigerian user: `nigerian.user@example.com` / `Password123`
     - UK user: `uk.user@example.com` / `Password123`
     - US user: `us.user@example.com` / `Password123`
   - This will automatically save the access and refresh tokens

2. **View User Profile and Wallet**:
   - Use the "Get User Profile" and "Get User Wallet" requests

3. **Make a Demo Deposit**:
   - Use the "Demo Deposit" request to add funds to your wallet
   - You can modify the amount and currency as needed

4. **Look Up a Recipient**:
   - Use the "Lookup User by Phone" request with one of these phone numbers:
     - Nigerian: `+2348012345678`
     - UK: `+447123456789`
     - US: `+12025550179`

5. **Create a Transaction**:
   - Use the "Create Transaction Quote" request to get a quote
   - Then use the "Send Transaction" request to complete the transaction
   - The quote_id will be automatically saved from the quote response

6. **View Transaction History**:
   - Use the "Get User Transactions" request to see your transaction history
   - Use the "Get Transaction Details" request to view details of a specific transaction

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/refresh` - Refresh access token

### User
- `GET /api/users/me` - Get current user profile
- `GET /api/users/wallet` - Get user wallet
- `GET /api/users/lookup/:phoneNumber` - Look up user by phone number

### Transactions
- `POST /api/transactions/quote` - Create a transaction quote
- `POST /api/transactions/send` - Execute a transaction
- `GET /api/transactions` - Get user transactions
- `GET /api/transactions/:id` - Get transaction details

### Exchange Rates
- `GET /api/exchange-rates` - Get all exchange rates
- `GET /api/exchange-rates/:from/:to` - Get specific exchange rate

### Wallet
- `POST /api/wallet/demo-deposit` - Make a demo deposit (testing only)

### System
- `GET /health` - API health check
- `GET /api/system/status` - Get system status
- `GET /api/notifications/status` - Get WebSocket connection info 