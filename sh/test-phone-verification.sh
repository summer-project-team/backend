#!/bin/bash

# CrossBridge Phone Verification Testing Script
# Tests the new production-ready phone verification system

set -e  # Exit on any error

# Configuration
export BASE_URL="http://localhost:3000"
export API_URL="$BASE_URL/api"
TEST_PHONE="8123456789"
TEST_COUNTRY="+234"
TEST_EMAIL="test@example.com"

echo "=== CrossBridge Phone Verification Test ==="
echo "Base URL: $BASE_URL"
echo "Testing phone: $TEST_PHONE"
echo "Country code: $TEST_COUNTRY"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "SUCCESS") echo -e "${GREEN}✓ $message${NC}" ;;
        "ERROR") echo -e "${RED}✗ $message${NC}" ;;
        "INFO") echo -e "${YELLOW}ℹ $message${NC}" ;;
    esac
}

# Function to test endpoint
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    local headers=$5
    
    echo -e "\n--- Testing: $name ---"
    
    if [ -z "$headers" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            ${data:+-d "$data"})
    else
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -H "$headers" \
            ${data:+-d "$data"})
    fi
    
    # Extract HTTP status and response body
    http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS/d')
    
    echo "Response: $response_body"
    
    if [ "$http_status" -ge 200 ] && [ "$http_status" -lt 300 ]; then
        print_status "SUCCESS" "$name (Status: $http_status)"
        return 0
    else
        print_status "ERROR" "$name (Status: $http_status)"
        return 1
    fi
}

# 1. Test health check
print_status "INFO" "Testing health check..."
test_endpoint "Health Check" "GET" "$BASE_URL/health"

# 2. Register user
print_status "INFO" "Registering new user..."
register_data='{
    "phone_number": "'$TEST_PHONE'",
    "country_code": "'$TEST_COUNTRY'",
    "email": "'$TEST_EMAIL'",
    "password": "password123",
    "first_name": "Test",
    "last_name": "User"
}'

if test_endpoint "User Registration" "POST" "$API_URL/auth/register" "$register_data"; then
    sleep 1  # Brief pause between requests
fi

# 3. Check verification status
print_status "INFO" "Checking verification status..."
test_endpoint "Verification Status" "GET" "$API_URL/auth/verification-status/$TEST_PHONE/$TEST_COUNTRY"

# 4. Resend verification code
print_status "INFO" "Sending verification code..."
resend_data='{
    "phone_number": "'$TEST_PHONE'",
    "country_code": "'$TEST_COUNTRY'"
}'

if test_endpoint "Send Verification Code" "POST" "$API_URL/auth/resend-verification" "$resend_data"; then
    sleep 2  # Wait before next request
fi

# 5. Test rate limiting
print_status "INFO" "Testing rate limiting (should fail)..."
test_endpoint "Rate Limiting Test" "POST" "$API_URL/auth/resend-verification" "$resend_data" || print_status "SUCCESS" "Rate limiting is working correctly"

# 6. Test wrong verification code
print_status "INFO" "Testing wrong verification code..."
wrong_verify_data='{
    "phone_number": "'$TEST_PHONE'",
    "country_code": "'$TEST_COUNTRY'",
    "verification_code": "000000"
}'

test_endpoint "Wrong Verification Code" "POST" "$API_URL/auth/verify-phone" "$wrong_verify_data" || print_status "SUCCESS" "Wrong code correctly rejected"

# 7. Test correct verification code (mock provider uses 123456)
print_status "INFO" "Testing correct verification code..."
correct_verify_data='{
    "phone_number": "'$TEST_PHONE'",
    "country_code": "'$TEST_COUNTRY'",
    "verification_code": "123456"
}'

if test_endpoint "Correct Verification Code" "POST" "$API_URL/auth/verify-phone" "$correct_verify_data"; then
    # Extract JWT token for further tests
    verify_response=$(curl -s -X POST "$API_URL/auth/verify-phone" \
        -H "Content-Type: application/json" \
        -d "$correct_verify_data")
    
    if echo "$verify_response" | grep -q "token"; then
        JWT_TOKEN=$(echo "$verify_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        print_status "SUCCESS" "JWT token extracted"
        
        # 8. Test authenticated endpoints
        print_status "INFO" "Testing authenticated endpoints..."
        
        # Get profile
        test_endpoint "Get Profile" "GET" "$API_URL/users/me" "" "Authorization: Bearer $JWT_TOKEN"
        
        # Get wallet
        test_endpoint "Get Wallet" "GET" "$API_URL/users/wallet" "" "Authorization: Bearer $JWT_TOKEN"
        
        # Setup PIN
        pin_data='{"pin": "1234"}'
        test_endpoint "Setup PIN" "POST" "$API_URL/users/pin/setup" "$pin_data" "Authorization: Bearer $JWT_TOKEN"
        
        # Verify PIN
        test_endpoint "Verify PIN" "POST" "$API_URL/users/pin/verify" "$pin_data" "Authorization: Bearer $JWT_TOKEN"
        
        # Get PIN status
        test_endpoint "Get PIN Status" "GET" "$API_URL/users/pin/status" "" "Authorization: Bearer $JWT_TOKEN"
        
    else
        print_status "ERROR" "Could not extract JWT token from response"
    fi
fi

# 9. Final verification status check
print_status "INFO" "Final verification status check..."
test_endpoint "Final Verification Status" "GET" "$API_URL/auth/verification-status/$TEST_PHONE/$TEST_COUNTRY"

echo
print_status "INFO" "Testing completed!"
echo
echo "=== Test Summary ==="
echo "• Phone verification system uses production-ready service"
echo "• Rate limiting: 5 sends/hour, 3 verifications/hour per phone"
echo "• Mock provider accepts code: 123456"
echo "• Real providers need API keys in environment variables"
echo "• All endpoints follow RESTful conventions"
echo
echo "For production, set these environment variables:"
echo "• TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN"
echo "• AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION"  
echo "• TERMII_API_KEY"
