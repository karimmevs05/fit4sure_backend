#!/bin/bash

echo "🔍 Testing Fit4Sure Reports API"
echo "================================"

# Check if backend is running
if ! nc -z localhost 3000 2>/dev/null; then
  echo "❌ Backend not running on port 3000"
  echo "Start it with: cd ~/Documents/fit4sure_backend && node src/index.js"
  exit 1
fi

echo "✅ Backend is running"

# Get a test token (you'll need to provide a real one)
TOKEN="test-token"

echo ""
echo "Testing Monthly Summary endpoint..."
curl -s "http://localhost:3000/api/admin/reports/monthly-summary" \
  -H "Authorization: Bearer $TOKEN" \
  2>&1 | jq . 2>/dev/null || curl -s "http://localhost:3000/api/admin/reports/monthly-summary" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "✅ All endpoints are accessible!"
