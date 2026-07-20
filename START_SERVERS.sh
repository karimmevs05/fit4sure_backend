#!/bin/bash

# Start Fit4Sure Backend and Frontend Servers

echo "🚀 Starting Fit4Sure Services..."
echo ""

# Kill any existing processes
pkill -f "npm start" 2>/dev/null || true
pkill -f "http.server.*5173" 2>/dev/null || true
sleep 2

# Terminal 1: Backend
echo "📌 TERMINAL 1 - Run this to start backend:"
echo "cd /Users/karimmevs/Documents/fit4sure_backend && npm start"
echo ""

# Terminal 2: Frontend
echo "📌 TERMINAL 2 - Run this to start frontend:"
echo "cd /Users/karimmevs/Documents/fit4sure-admin-dashboard/dist && python3 -m http.server 5173"
echo ""

echo "✅ After both are running:"
echo "   Backend: http://localhost:3000/health"
echo "   Frontend: http://localhost:5173/financials"
echo ""

# Start them for you
echo "Attempting to start services..."
cd /Users/karimmevs/Documents/fit4sure_backend && npm start &
sleep 5
cd /Users/karimmevs/Documents/fit4sure-admin-dashboard/dist && python3 -m http.server 5173 &
sleep 3

# Test
echo ""
echo "Testing..."
curl -s http://localhost:3000/health 2>&1 | head -1 && echo "✅ Backend OK" || echo "❌ Backend not responding"
curl -s http://localhost:5173 2>&1 | grep -q doctype && echo "✅ Frontend OK" || echo "❌ Frontend not responding"
