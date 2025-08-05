# CrossBridge API Test Suite Documentation

## Overview
The CrossBridge API Test Suite is a comprehensive bash script that tests every single API endpoint in the CrossBridge system. It provides automated testing with interactive prompts for user credentials and detailed reporting.

## Features
- **Complete Coverage**: Tests all 35+ API endpoints
- **Interactive Setup**: Prompts for phone number and country code
- **Automatic Authentication**: Handles registration, verification, and token management
- **Colored Output**: Clear visual feedback with success/error indicators
- **Detailed Reporting**: Shows test results with response bodies
- **Error Handling**: Graceful failure handling and informative error messages
- **Modular Design**: Easy to customize and extend

## Requirements
- `curl` - for HTTP requests
- `jq` - for JSON parsing
- `bash` - shell environment
- CrossBridge API server running (default: localhost:3001)

### Installing Requirements
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install curl jq

# macOS
brew install curl jq

# CentOS/RHEL
sudo yum install curl jq
```

## Usage

### Basic Usage
```bash
# Navigate to backend directory
cd /path/to/crossbridge/backend

# Run the test suite
./crossbridge-api-test-suite.sh
```

### Interactive Prompts
The script will prompt for:
1. **Phone Number**: Enter without country code (e.g., `8123456789`)
2. **Country Code**: Enter with + prefix (e.g., `+234`)

### Example Run
```
=== CrossBridge API Comprehensive Test Suite ===
Base URL: http://localhost:3001
API URL: http://localhost:3001/api

Enter phone number (without country code, e.g., 8123456789): 8123456789
Enter country code (e.g., +234): +234

Using phone number: 8123456789
Using country code: +234

[INFO] Testing: Basic Health Check
[SUCCESS] Basic Health Check (Status: 200)
---
```

## Test Categories

### 1. System Health Tests
- Basic health check
- System status
- System health endpoint

### 2. Authentication Flow
- User registration
- Phone verification
- Login authentication
- Token refresh
- Verification status check
- Resend verification code

### 3. User Management
- Get user profile
- Update profile
- Get wallet information
- User lookup by phone
- Phone number validation

### 4. PIN Management
- Setup transaction PIN
- Verify transaction PIN
- Get PIN status

### 5. Wallet Operations
- Demo wallet deposit
- Get CBUSD balance
- Mint CBUSD tokens

### 6. Transaction Tests
- Get transaction quotes
- Transaction history
- Bank-to-app deposits

### 7. Banking Tests
- Link bank accounts
- Get linked accounts

### 8. Analytics Tests
- Analytics summary
- Spending patterns
- Transaction trends
- Currency distribution

### 9. Dashboard Tests
- Dashboard overview
- Recent activity

### 10. USSD Tests
- Initiate USSD sessions

### 11. Security Tests
- Device risk assessment

### 12. Webhook Tests
- Bank deposit webhooks

### 13. WebSocket Tests
- WebSocket status

## Configuration

### Environment Variables
Edit `test-config.env` to customize test parameters:

```bash
# Server Configuration
BASE_URL="http://localhost:3001"
API_URL="$BASE_URL/api"

# Test amounts and currencies
TEST_AMOUNT=100
TEST_CURRENCY="NGN"
DEMO_DEPOSIT_AMOUNT=1000

# Enable/disable test categories
RUN_AUTH_TESTS=true
RUN_USER_TESTS=true
RUN_WALLET_TESTS=true
# ... etc
```

### Custom Server URL
```bash
# Test against different environment
BASE_URL="https://api.crossbridge.dev" ./crossbridge-api-test-suite.sh
```

## Output Format

### Success Output
```
[INFO] Testing: Get User Profile
[SUCCESS] Get User Profile (Status: 200)
{
  "success": true,
  "data": {
    "id": "user123",
    "phone_number": "8123456789",
    "email": "test@crossbridge.dev"
  }
}
---
```

### Error Output
```
[INFO] Testing: Invalid Endpoint
[ERROR] Invalid Endpoint (Expected: 200, Got: 404)
Response: {"error": "Endpoint not found"}
---
```

### Final Summary
```
=== TEST RESULTS SUMMARY ===
Total Tests: 35
Passed: 32
Failed: 3
⚠️  Some tests failed. Check the logs above.
```

## Test Flow Logic

### Authentication Strategy
1. **Registration Attempt**: Tries to register new user
2. **Verification Fallback**: If registration fails, attempts verification
3. **Login Fallback**: If verification fails, attempts login
4. **Token Management**: Automatically extracts and uses JWT tokens

### Error Handling
- **Expected Failures**: Some tests expect 404/400 status codes
- **Graceful Degradation**: Failed authentication doesn't stop all tests
- **Detailed Reporting**: Shows exact status codes and response bodies

### Data Flow
- **User Registration** → **Phone Verification** → **JWT Token**
- **JWT Token** → **Profile Management** → **Wallet Operations**
- **Wallet Setup** → **Transaction Testing** → **Advanced Features**

## Customization

### Adding New Tests
```bash
# Add to main() function
run_test "My New Test" "$API_URL/my-endpoint" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
```

### Modifying Test Data
```bash
# Update data payloads
local my_test_data="{
    \"custom_field\": \"custom_value\",
    \"amount\": $TEST_AMOUNT
}"
```

### Custom Headers
```bash
# Add custom headers
run_test "Custom Test" "$API_URL/endpoint" "POST" "$data" "-H 'X-Custom: value' -H 'Authorization: Bearer $JWT_TOKEN'"
```

## Troubleshooting

### Common Issues

#### 1. Authentication Failures
```
[ERROR] Phone Verification failed, trying login...
[ERROR] Authentication failed completely
```
**Solution**: Ensure the phone number is valid and exists in the system, or check if verification codes are properly configured.

#### 2. JSON Parsing Errors
```
jq: error (at <stdin>:0): Invalid numeric literal at line 1, column 1
```
**Solution**: Ensure `jq` is installed and the API returns valid JSON responses.

#### 3. Connection Refused
```
curl: (7) Failed to connect to localhost port 3001: Connection refused
```
**Solution**: Ensure the CrossBridge API server is running on the specified port.

#### 4. Permission Denied
```
bash: ./crossbridge-api-test-suite.sh: Permission denied
```
**Solution**: Make the script executable with `chmod +x crossbridge-api-test-suite.sh`

### Debug Mode
Add debug output by modifying the script:
```bash
# Add at the top of the script
set -x  # Enable debug mode
```

### Verbose cURL
For detailed HTTP debugging:
```bash
# Modify curl commands to include verbose output
curl -v -s -w '%{http_code}' ...
```

## Integration

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Run API Tests
  run: |
    cd backend
    ./crossbridge-api-test-suite.sh
  env:
    PHONE_NUMBER: "8123456789"
    COUNTRY_CODE: "+234"
```

### Docker Integration
```dockerfile
# Add to Dockerfile
COPY crossbridge-api-test-suite.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/crossbridge-api-test-suite.sh
```

### Monitoring Integration
```bash
# Log results to file
./crossbridge-api-test-suite.sh > test-results-$(date +%Y%m%d-%H%M%S).log 2>&1
```

## Best Practices

1. **Run Against Test Environment**: Don't run against production
2. **Clean Test Data**: Use test phone numbers and emails
3. **Monitor Resources**: Some tests may create database entries
4. **Regular Testing**: Run as part of development workflow
5. **Update Test Data**: Keep test data current with API changes

## Contributing

To extend the test suite:

1. **Add New Test Categories**: Follow the existing pattern
2. **Update Documentation**: Keep this file current
3. **Test Your Changes**: Ensure new tests work correctly
4. **Follow Conventions**: Use consistent naming and formatting

## License
This test suite follows the same license as the CrossBridge project.
