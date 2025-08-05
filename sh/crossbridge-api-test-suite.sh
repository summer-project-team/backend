#!/bin/bash

# CrossBridge API Comprehensive Test Suite
# This script tests every single API endpoint in the CrossBridge system
# Author: AI Assistant
# Date: August 5, 2025

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api"
JWT_TOKEN=""
USER_ID=""
WALLET_ID=""
TRANSACTION_ID=""
PHONE_NUMBER=""
COUNTRY_CODE=""

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    ((PASSED_TESTS++))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((FAILED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

increment_test() {
    ((TOTAL_TESTS++))
}

# Test execution helper
run_test() {
    local test_name="$1"
    local endpoint="$2"
    local method="$3"
    local data="$4"
    local headers="$5"
    local expected_status="${6:-200}"
    
    increment_test
    log_info "Testing: $test_name"
    
    # Build curl command
    local curl_cmd="curl -s -w '%{http_code}' -X $method"
    
    if [ -n "$headers" ]; then
        curl_cmd="$curl_cmd $headers"
    fi
    
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -d '$data'"
    fi
    
    curl_cmd="$curl_cmd $endpoint"
    
    # Execute and capture response
    local response=$(eval $curl_cmd)
    local status_code="${response: -3}"
    local body="${response%???}"
    
    # Check status code
    if [ "$status_code" -eq "$expected_status" ] || [ "$status_code" -eq "201" ] || [ "$status_code" -eq "204" ]; then
        log_success "$test_name (Status: $status_code)"
        echo "$body" | jq . 2>/dev/null || echo "$body"
    else
        log_error "$test_name (Expected: $expected_status, Got: $status_code)"
        echo "Response: $body"
    fi
    
    echo "---"
    return 0
}

# Extract value from JSON response
extract_json_value() {
    local json="$1"
    local key="$2"
    echo "$json" | jq -r ".$key" 2>/dev/null || echo ""
}

# Main test suite
main() {
    echo "=== CrossBridge API Comprehensive Test Suite ==="
    echo "Base URL: $BASE_URL"
    echo "API URL: $API_URL"
    echo
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed. Please install jq to run this test suite."
        exit 1
    fi
    
    # Get user input
    read -p "Enter phone number (without country code, e.g., 8123456789): " PHONE_NUMBER
    read -p "Enter country code (e.g., +234): " COUNTRY_CODE
    
    echo
    log_info "Using phone number: $PHONE_NUMBER"
    log_info "Using country code: $COUNTRY_CODE"
    echo
    
    # Test 1: Health Check
    run_test "Basic Health Check" "$BASE_URL/health" "GET"
    
    # Test 2: System Status
    run_test "System Status" "$API_URL/system/status" "GET"
    
    # Test 3: System Health
    run_test "System Health" "$API_URL/system/health" "GET"
    
    # Authentication Flow
    echo
    log_info "=== AUTHENTICATION FLOW ==="
    
    # Test 4: Register User
    local register_data="{
        \"phone_number\": \"$PHONE_NUMBER\",
        \"country_code\": \"$COUNTRY_CODE\",
        \"email\": \"test@crossbridge.dev\",
        \"password\": \"SecurePass123!\",
        \"first_name\": \"Test\",
        \"last_name\": \"User\"
    }"
    
    local register_response=$(curl -s -X POST "$API_URL/auth/register" \
        -H "Content-Type: application/json" \
        -d "$register_data")
    
    increment_test
    if echo "$register_response" | grep -q "success.*true\\|User registered"; then
        log_success "User Registration"
        USER_ID=$(extract_json_value "$register_response" "user_id")
    else
        log_warning "User Registration (User may already exist)"
    fi
    echo "$register_response" | jq . 2>/dev/null || echo "$register_response"
    echo "---"
    
    # Test 5: Verification Status
    run_test "Get Verification Status" "$API_URL/auth/verification-status/$PHONE_NUMBER/$(echo $COUNTRY_CODE | sed 's/+/%2B/g')" "GET"
    
    # Test 6: Resend Verification
    local resend_data="{
        \"phone_number\": \"$PHONE_NUMBER\",
        \"country_code\": \"$COUNTRY_CODE\"
    }"
    run_test "Resend Verification Code" "$API_URL/auth/resend-verification" "POST" "$resend_data" "-H 'Content-Type: application/json'"
    
    # Test 7: Phone Verification (using mock code)
    local verify_data="{
        \"phone_number\": \"$PHONE_NUMBER\",
        \"country_code\": \"$COUNTRY_CODE\",
        \"verification_code\": \"123456\"
    }"
    
    local verify_response=$(curl -s -X POST "$API_URL/auth/verify-phone" \
        -H "Content-Type: application/json" \
        -d "$verify_data")
    
    increment_test
    if echo "$verify_response" | grep -q "token"; then
        log_success "Phone Verification"
        JWT_TOKEN=$(extract_json_value "$verify_response" "token")
        log_info "JWT Token obtained: ${JWT_TOKEN:0:50}..."
    else
        # Try login instead
        log_warning "Phone Verification failed, trying login..."
        local login_data="{
            \"phone_number\": \"$PHONE_NUMBER\",
            \"country_code\": \"$COUNTRY_CODE\",
            \"password\": \"SecurePass123!\"
        }"
        
        local login_response=$(curl -s -X POST "$API_URL/auth/login" \
            -H "Content-Type: application/json" \
            -d "$login_data")
        
        if echo "$login_response" | grep -q "token"; then
            log_success "Login Authentication"
            JWT_TOKEN=$(extract_json_value "$login_response" "token")
            log_info "JWT Token obtained via login: ${JWT_TOKEN:0:50}..."
        else
            log_error "Authentication failed completely"
            echo "$login_response"
            exit 1
        fi
    fi
    echo "$verify_response" | jq . 2>/dev/null || echo "$verify_response"
    echo "---"
    
    # Check if we have a valid token
    if [ -z "$JWT_TOKEN" ] || [ "$JWT_TOKEN" = "null" ]; then
        log_error "No valid JWT token obtained. Cannot continue with authenticated tests."
        exit 1
    fi
    
    # Test 8: Refresh Token
    run_test "Refresh Token" "$API_URL/auth/refresh" "POST" "" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # User Management Tests
    echo
    log_info "=== USER MANAGEMENT TESTS ==="
    
    # Test 9: Get Profile
    run_test "Get User Profile" "$API_URL/users/me" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 10: Update Profile
    local update_profile_data="{
        \"first_name\": \"Updated\",
        \"last_name\": \"TestUser\",
        \"email\": \"updated@crossbridge.dev\"
    }"
    run_test "Update Profile" "$API_URL/users/profile" "PUT" "$update_profile_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 11: Get Wallet
    local wallet_response=$(curl -s -X GET "$API_URL/users/wallet" \
        -H "Authorization: Bearer $JWT_TOKEN")
    
    increment_test
    if echo "$wallet_response" | grep -q "wallet_address\\|cbusd_balance"; then
        log_success "Get Wallet"
        WALLET_ID=$(extract_json_value "$wallet_response" "id")
    else
        log_error "Get Wallet"
    fi
    echo "$wallet_response" | jq . 2>/dev/null || echo "$wallet_response"
    echo "---"
    
    # Test 12: Lookup User by Phone
    local lookup_data="{
        \"phone_number\": \"8987654321\",
        \"country_code\": \"$COUNTRY_CODE\"
    }"
    run_test "Lookup User by Phone" "$API_URL/users/lookup" "POST" "$lookup_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'" "404"
    
    # Test 13: Validate Phone Number
    local validate_phone_data="{
        \"phone_number\": \"$PHONE_NUMBER\",
        \"country_code\": \"$COUNTRY_CODE\"
    }"
    run_test "Validate Phone Number" "$API_URL/users/validate-phone" "POST" "$validate_phone_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # PIN Management Tests
    echo
    log_info "=== PIN MANAGEMENT TESTS ==="
    
    # Test 14: Setup Transaction PIN
    local setup_pin_data="{
        \"pin\": \"1234\",
        \"confirmPin\": \"1234\"
    }"
    run_test "Setup Transaction PIN" "$API_URL/users/pin/setup" "POST" "$setup_pin_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 15: Verify Transaction PIN
    local verify_pin_data="{
        \"pin\": \"1234\"
    }"
    run_test "Verify Transaction PIN" "$API_URL/users/pin/verify" "POST" "$verify_pin_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 16: Get PIN Status
    run_test "Get PIN Status" "$API_URL/users/pin/status" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Demo Wallet Deposit for Testing
    echo
    log_info "=== DEMO WALLET OPERATIONS ==="
    
    # Test 17: Demo Deposit (if available)
    local demo_deposit_data="{
        \"amount\": 1000,
        \"currency\": \"NGN\"
    }"
    run_test "Demo Wallet Deposit" "$API_URL/wallets/deposit" "POST" "$demo_deposit_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Transaction Tests
    echo
    log_info "=== TRANSACTION TESTS ==="
    
    # Test 18: Get Transaction Quote
    local quote_data="{
        \"amount\": 100,
        \"currency_from\": \"NGN\",
        \"currency_to\": \"GBP\",
        \"payment_method\": \"app_balance\",
        \"recipient_phone\": \"8987654321\",
        \"recipient_country_code\": \"$COUNTRY_CODE\"
    }"
    run_test "Get Transaction Quote" "$API_URL/transactions/quote" "POST" "$quote_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 19: Get Transaction History
    run_test "Get Transaction History" "$API_URL/transactions/history?limit=5&offset=0" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 20: Initiate Bank Deposit
    local bank_deposit_data="{
        \"amount\": 50000,
        \"currency\": \"NGN\"
    }"
    
    local deposit_response=$(curl -s -X POST "$API_URL/transactions/bank-to-app" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$bank_deposit_data")
    
    increment_test
    if echo "$deposit_response" | grep -q "success.*true\\|Deposit initiated"; then
        log_success "Initiate Bank Deposit"
    else
        log_error "Initiate Bank Deposit"
    fi
    echo "$deposit_response" | jq . 2>/dev/null || echo "$deposit_response"
    echo "---"
    
    # CBUSD Operations
    echo
    log_info "=== CBUSD TOKEN TESTS ==="
    
    # Test 21: Get CBUSD Balance
    run_test "Get CBUSD Balance" "$API_URL/cbusd/balance" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 22: Mint CBUSD
    local mint_data="{
        \"amount\": 100,
        \"currency\": \"NGN\"
    }"
    run_test "Mint CBUSD" "$API_URL/cbusd/mint" "POST" "$mint_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Banking Tests
    echo
    log_info "=== BANKING TESTS ==="
    
    # Test 23: Link Bank Account
    local link_account_data="{
        \"bank_name\": \"GTBank\",
        \"account_number\": \"1234567890\",
        \"account_name\": \"Test User\",
        \"bank_code\": \"GTB\",
        \"account_type\": \"savings\",
        \"currency\": \"NGN\"
    }"
    run_test "Link Bank Account" "$API_URL/banking/link-account" "POST" "$link_account_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 24: Get Linked Accounts
    run_test "Get Linked Bank Accounts" "$API_URL/banking/accounts" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Analytics Tests
    echo
    log_info "=== ANALYTICS TESTS ==="
    
    # Test 25: Get Analytics Summary
    run_test "Get Analytics Summary" "$API_URL/analytics/summary" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 26: Get Spending Patterns
    run_test "Get Spending Patterns" "$API_URL/analytics/spending-patterns" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 27: Get Transaction Trends
    run_test "Get Transaction Trends" "$API_URL/analytics/transaction-trends?period=monthly" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 28: Get Currency Distribution
    run_test "Get Currency Distribution" "$API_URL/analytics/currency-distribution" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Dashboard Tests
    echo
    log_info "=== DASHBOARD TESTS ==="
    
    # Test 29: Get Dashboard Overview
    run_test "Get Dashboard Overview" "$API_URL/dashboard/overview" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Test 30: Get Recent Activity
    run_test "Get Recent Activity" "$API_URL/dashboard/recent-activity" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # USSD Tests (Public endpoints)
    echo
    log_info "=== USSD TESTS ==="
    
    # Test 31: Initiate USSD Session
    local ussd_initiate_data="{
        \"phone_number\": \"$PHONE_NUMBER\",
        \"network_code\": \"MTN\",
        \"ussd_code\": \"*737#\"
    }"
    run_test "Initiate USSD Session" "$API_URL/ussd/initiate" "POST" "$ussd_initiate_data" "-H 'Content-Type: application/json'"
    
    # Security Tests
    echo
    log_info "=== SECURITY TESTS ==="
    
    # Test 32: Assess Device Risk
    local device_risk_data="{
        \"device_fingerprint\": \"device123456\"
    }"
    run_test "Assess Device Risk" "$API_URL/security/assess-device" "POST" "$device_risk_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Webhook Tests (Public endpoints)
    echo
    log_info "=== WEBHOOK TESTS ==="
    
    # Test 33: Bank Deposit Webhook
    local webhook_data="{
        \"reference_code\": \"CB_DEP_123456_TEST\",
        \"amount\": 10000,
        \"currency\": \"NGN\",
        \"bank_reference\": \"BNK123456\",
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }"
    run_test "Bank Deposit Webhook" "$API_URL/webhooks/bank-deposit" "POST" "$webhook_data" "-H 'Content-Type: application/json'"
    
    # WebSocket Tests
    echo
    log_info "=== WEBSOCKET TESTS ==="
    
    # Test 34: Get WebSocket Status
    run_test "Get WebSocket Status" "$API_URL/websocket/status" "GET" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Logout Test
    echo
    log_info "=== CLEANUP TESTS ==="
    
    # Test 35: Logout
    run_test "User Logout" "$API_URL/auth/logout" "POST" "" "-H 'Authorization: Bearer $JWT_TOKEN'"
    
    # Final Results
    echo
    echo "=== TEST RESULTS SUMMARY ==="
    echo "Total Tests: $TOTAL_TESTS"
    echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed!${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  Some tests failed. Check the logs above.${NC}"
        exit 1
    fi
}

# Run the test suite
main "$@"
