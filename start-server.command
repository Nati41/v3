#!/bin/bash
cd "$(dirname "$0")"

echo "🚀 Starting Tofesly Mapper..."
echo ""

# Find an available port starting from 8080
find_free_port() {
    local port=8080
    while lsof -i:$port >/dev/null 2>&1; do
        echo "⚠️  Port $port is busy, trying next..." >&2
        port=$((port + 1))
        if [ $port -gt 8099 ]; then
            echo "❌ No free ports found between 8080-8099" >&2
            exit 1
        fi
    done
    echo $port
}

PORT=$(find_free_port)
echo "✅ Using port $PORT"
echo ""

# Start server in background
echo "🌐 Server running at http://localhost:$PORT"
echo "📐 Mapper: http://localhost:$PORT/src/mapper/mapper.html"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Open browser after short delay (give server time to start)
(sleep 1.5 && open "http://localhost:$PORT/src/mapper/mapper.html") &

# Start the HTTP server
python3 -m http.server $PORT
