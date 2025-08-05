#!/bin/bash

# CrossBridge API Comprehensive Testing Script
# Tests all major endpoints with proper validation

set -e

# Configuration
export BASE_URL="http://localhost:3000"
export API_URL="$BASE_URL/api"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
total_tests=0
passed_tests=0
failed_tests=0

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_status() {
    local status=$1
    local message=$2
    case $status in
        "PASS") 
            echo -e "${GREEN}✓ $message${NC}"
            ((passed_tests++))
            ;;
        "FAIL") 
            echo -e "${RED}✗ $message${NC}"
            ((failed_tests++))
            ;;
        "INFO") 
            echo -e "${YELLOW}ℹ $message${NC}"
            ;;
    esac
    ((total_tests++))
}

# Test endpoint function
test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local headers=$5
    local expected_status=${6:-200}
    
    echo -e "\nTesting: $name"
    echo "URL: $method $endpoint"
    
    if [ -n "$data" ]; then
        echo "Data: $data"
    fi
    
    # Build curl command
    curl_cmd="curl -s -w \"HTTP_STATUS:%{http_code}\" -X $method \"$endpoint\""
    
    if [ -n "$headers" ]; then
        curl_cmd="$curl_cmd -H \"$headers\""
    fi
    
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -H \"Content-Type: application/json\" -d '$data'"
    fi
    
    # Execute request
    response=$(eval $curl_cmd)
    
    # Parse response
    http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS/d')
    
    echo "Status: $http_status"
    echo "Response: ${response_body:0:200}$([ ${#response_body} -gt 200 ] && echo '...')"
    
    # Check if status matches expected
    if [ "$http_status" -eq "$expected_status" ] || ([ "$expected_status" -eq 200 ] && [ "$http_status" -ge 200 ] && [ "$http_status" -lt 300 ]); then
        print_status "PASS" "$name"
        echo "$response_body"
        return 0
    else
        print_status "FAIL" "$name (Expected: $expected_status, Got: $http_status)"
        return 1
    fi
}

# Start testing
print_header "CrossBridge API Testing Suite"
echo "Base URL: $BASE_URL"
echo "Starting comprehensive API tests..."

# Variables for storing data across tests
JWT_TOKEN=""
QUOTE_ID=""
TRANSACTION_ID=""

print_header "1. Health & System Checks"

test_api "Health Check" "GET" "$BASE_URL/health"
test_api "System Status" "GET" "$API_URL/system/status"

print_header "2. Authentication Flow"

# Register user
register_data='{
    "phone_number": "8123456789",
    "country_code": "+234",
    "email": "apitest@example.com",
    "password": "password123",
    "first_name": "API",
    "last_name": "Tester"
}'

if test_api "User Registration" "POST" "$API_URL/auth/register" "$register_data"; then
    sleep 1
    
    # Resend verification
    resend_data='{"phone_number": "8123456789", "country_code": "+234"}'
    test_api "Resend Verification" "POST" "$API_URL/auth/resend-verification" "$resend_data"
    
    # Check verification status
    test_api "Verification Status" "GET" "$API_URL/auth/verification-status/8123456789/+234"
    
    # Verify phone
    verify_data='{"phone_number": "8123456789", "country_code": "+234", "verification_code": "123456"}'
    if test_api "Phone Verification" "POST" "$API_URL/auth/verify-phone" "$verify_data"; then
        # Extract JWT token
        verify_response=$(curl -s -X POST "$API_URL/auth/verify-phone" \
            -H "Content-Type: application/json" \
            -d "$verify_data")
        
        if echo "$verify_response" | grep -q "token"; then
            JWT_TOKEN=$(echo "$verify_response" | jq -r '.token' 2>/dev/null || echo "$verify_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
            print_status "INFO" "JWT token extracted for authenticated tests"
        fi
    fi
fi

# Test login
login_data='{"phone_number": "8123456789", "country_code": "+234", "password": "password123"}'
test_api "User Login" "POST" "$API_URL/auth/login" "$login_data"

if [ -n "$JWT_TOKEN" ]; then
    print_header "3. User Management (Authenticated)"
    
    AUTH_HEADER="Authorization: Bearer $JWT_TOKEN"
    
    test_api "Get Profile" "GET" "$API_URL/users/me" "" "$AUTH_HEADER"
    test_api "Get Wallet" "GET" "$API_URL/users/wallet" "" "$AUTH_HEADER"
    
    # PIN management
    pin_data='{"pin": "1234"}'
    test_api "Setup PIN" "POST" "$API_URL/users/pin/setup" "$pin_data" "$AUTH_HEADER"
    test_api "Verify PIN" "POST" "$API_URL/users/pin/verify" "$pin_data" "$AUTH_HEADER"
    test_api "Get PIN Status" "GET" "$API_URL/users/pin/status" "" "$AUTH_HEADER"
    
    # Profile update
    update_data='{"first_name": "Updated", "last_name": "Name", "email": "updated@example.com"}'
    test_api "Update Profile" "PUT" "$API_URL/users/profile" "$update_data" "$AUTH_HEADER"
    
    # Phone validation
    validate_data='{"phone_number": "8987654321", "country_code": "+234"}'
    test_api "Validate Phone" "POST" "$API_URL/users/validate-phone" "$validate_data" "$AUTH_HEADER"
    
    print_header "4. Transaction System"
    
    # Get quote
    quote_data='{
        "amount": 100,
        "currency_from": "NGN",
        "currency_to": "GBP",
        "payment_method": "app_balance",
        "recipient_phone": "8987654321",
        "recipient_country_code": "+234"
    }'
    
    if test_api "Get Quote" "POST" "$API_URL/transactions/quote" "$quote_data" "$AUTH_HEADER"; then
        # Try to extract quote ID for rate locking test
        quote_response=$(curl -s -X POST "$API_URL/transactions/quote" \
            -H "Content-Type: application/json" \
            -H "$AUTH_HEADER" \
            -d "$quote_data")
        
        # Mock quote ID for testing
        QUOTE_ID="550e8400-e29b-41d4-a716-446655440000"
    fi
    
    # Test rate locking (will fail without valid quote, but tests validation)
    if [ -n "$QUOTE_ID" ]; then
        lock_data='{"quote_id": "'$QUOTE_ID'", "duration": 300}'
        test_api "Lock Rate" "POST" "$API_URL/transactions/lock-rate" "$lock_data" "$AUTH_HEADER" 400
    fi
    
    # Transaction history
    test_api "Transaction History" "GET" "$API_URL/transactions/history?limit=10&offset=0" "" "$AUTH_HEADER"
    
    print_header "5. Banking Operations"
    
    # Link bank account
    bank_data='{
        "bank_name": "Test Bank",
        "account_number": "1234567890",
        "account_name": "API Tester",
        "bank_code": "TEST",
        "currency": "NGN"
    }'
    test_api "Link Bank Account" "POST" "$API_URL/banking/link-account" "$bank_data" "$AUTH_HEADER"
    
    # Get linked accounts
    test_api "Get Bank Accounts" "GET" "$API_URL/banking/accounts" "" "$AUTH_HEADER"
    
    print_header "6. USSD Operations"
    
    # USSD initiate
    ussd_initiate='{
        "phone_number": "+2348123456789",
        "network_code": "MTN",
        "ussd_code": "*737#"
    }'
    test_api "USSD Initiate" "POST" "$API_URL/ussd/initiate" "$ussd_initiate"
    
    print_header "7. Analytics"
    
    test_api "Spending Patterns" "GET" "$API_URL/analytics/spending-patterns" "" "$AUTH_HEADER"
    test_api "Transaction Trends" "GET" "$API_URL/analytics/transaction-trends?period=monthly" "" "$AUTH_HEADER"
    test_api "Analytics Summary" "GET" "$API_URL/analytics/summary" "" "$AUTH_HEADER"
    
    print_header "8. Dashboard"
    
    test_api "Dashboard Overview" "GET" "$API_URL/dashboard/overview" "" "$AUTH_HEADER"
    test_api "Recent Activity" "GET" "$API_URL/dashboard/recent-activity" "" "$AUTH_HEADER"
    
    print_header "9. Wallet Operations"
    
    # Demo deposit
    deposit_data='{"amount": 1000, "currency": "NGN"}'
    test_api "Demo Deposit" "POST" "$API_URL/wallets/deposit" "$deposit_data" "$AUTH_HEADER"
    
    print_header "10. Logout"
    
    test_api "User Logout" "POST" "$API_URL/auth/logout" "" "$AUTH_HEADER"
    
else
    print_status "FAIL" "No JWT token available - skipping authenticated tests"
fi

print_header "Test Summary"
echo -e "Total tests: $total_tests"
echo -e "${GREEN}Passed: $passed_tests${NC}"
echo -e "${RED}Failed: $failed_tests${NC}"

if [ $failed_tests -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed.${NC}"
    echo "Check the output above for details."
    exit 1
fi
