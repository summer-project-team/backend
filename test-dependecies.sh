# Run these commands in your backend directory to check if all required files exist

echo "=== Checking file structure ==="
ls -la src/
echo ""

echo "=== Checking models ==="
ls -la src/models/ 2>/dev/null || echo "models directory doesn't exist"
echo ""

echo "=== Checking middleware ==="
ls -la src/middleware/ 2>/dev/null || echo "middleware directory doesn't exist"
echo ""

echo "=== Checking utils ==="
ls -la src/utils/ 2>/dev/null || echo "utils directory doesn't exist"
echo ""

echo "=== Checking services ==="
ls -la src/services/ 2>/dev/null || echo "services directory doesn't exist"
echo ""

echo "=== Checking specific files ==="
echo "User model:" $(test -f src/models/User.js && echo "✓ exists" || echo "✗ missing")
echo "Wallet model:" $(test -f src/models/Wallet.js && echo "✓ exists" || echo "✗ missing")
echo "Error handler:" $(test -f src/middleware/errorHandler.js && echo "✓ exists" || echo "✗ missing")
echo "Helpers:" $(test -f src/utils/helpers.js && echo "✓ exists" || echo "✗ missing")
echo "Redis utils:" $(test -f src/utils/redis.js && echo "✓ exists" || echo "✗ missing")
echo "Phone service:" $(test -f src/services/phoneService.js && echo "✓ exists" || echo "✗ missing")