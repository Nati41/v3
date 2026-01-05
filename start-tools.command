#!/bin/bash
cd "$(dirname "$0")"

echo "Starting Tofesly Tools..."

# Find free port
PORT=8080
while lsof -i:$PORT >/dev/null 2>&1; do
    PORT=$((PORT + 1))
    if [ $PORT -gt 8099 ]; then
        echo "No free ports 8080-8099"
        exit 1
    fi
done

echo "Using port $PORT"

# Start server
python3 -m http.server $PORT &
SERVER_PID=$!
sleep 1

# Open both tools
open "http://localhost:$PORT/src/mapper-v3/mapper-v3.html"
open "http://localhost:$PORT/src/livefill/livefill.html"

echo ""
echo "Mapper V3: http://localhost:$PORT/src/mapper-v3/mapper-v3.html"
echo "Livefill:  http://localhost:$PORT/src/livefill/livefill.html"
echo ""
echo "Press Ctrl+C to stop"

wait $SERVER_PID
