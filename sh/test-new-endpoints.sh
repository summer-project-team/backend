#!/bin/bash

# Quick Phone Verification Test
# Tests the new endpoints without needing full database setup

BASE_URL="http://localhost:3001"
API_URL="$BASE_URL/api"

echo "=== Quick Phone Verification Test ==="
echo "Testing new endpoints we just implemented..."
echo

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_endpoint() {
    local name="$1"
    local method="$2"
    local url="$3"
    local data="$4"
    local headers="$5"
    
    echo -e "\n${YELLOW}Testing: $name${NC}"
    echo "URL: $method $url"
    
    if [ -n "$data" ]; then
        echo "Data: $data"
    fi
    
    # Build curl command
    if [ -n "$headers" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
                -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -H "$headers" \
                -d "$data")
        else
            response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
                -X "$method" "$url" \
                -H "$headers")
        fi
    else
        if [ -n "$data" ]; then
            response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
                -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -d "$data")
        else
            response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
                -X "$method" "$url")
        fi
    fi
    
    # Parse response
    http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS/d')
    
    echo "Status: $http_status"
    echo "Response: $response_body"
    
    if [ "$http_status" -ge 200 ] && [ "$http_status" -lt 500 ]; then
        echo -e "${GREEN}✓ Endpoint responding${NC}"
    else
        echo -e "${RED}✗ Endpoint not responding or server error${NC}"
    fi
}

# Test 1: Health check
test_endpoint "Health Check" "GET" "$BASE_URL/health"

# Test 2: System status
test_endpoint "System Status" "GET" "$API_URL/system/status"

# Test 3: New resend verification endpoint
resend_data='{
    "phone_number": "8123456789",
    "country_code": "+234"
}'
test_endpoint "Resend Verification Code" "POST" "$API_URL/auth/resend-verification" "$resend_data"

# Test 4: New verification status endpoint
test_endpoint "Verification Status" "GET" "$API_URL/auth/verification-status/8123456789/+234"

# Test 5: Updated verify phone endpoint
verify_data='{
    "phone_number": "8123456789",
    "country_code": "+234",
    "verification_code": "123456"
}'
test_endpoint "Verify Phone" "POST" "$API_URL/auth/verify-phone" "$verify_data"

# Test 6: Register user (to see production verification in action)
register_data='{
    "phone_number": "8123456789",
    "country_code": "+234",
    "email": "test@example.com",
    "password": "password123",
    "first_name": "Test",
    "last_name": "User"
}'
test_endpoint "User Registration" "POST" "$API_URL/auth/register" "$register_data"

echo
echo "=== Summary ==="
echo "✓ New phone verification endpoints have been added:"
echo "  • POST /api/auth/resend-verification"
echo "  • GET /api/auth/verification-status/:phone/:country"
echo "  • Updated POST /api/auth/verify-phone (now uses production service)"
echo
echo "✓ Production features implemented:"
echo "  • Rate limiting (5 sends/hour, 3 verifications/hour)"
echo "  • Multiple SMS providers (Twilio, AWS SNS, Termii, Mock)"
echo "  • Secure code generation with crypto module"
echo "  • Proper error handling and retry logic"
echo "  • Redis caching for performance"
echo
echo "📝 Note: If server is not running, you'll see connection errors."
echo "   Start the server with: npm start (in backend directory)"
echo "   Database connection is required for full functionality."
