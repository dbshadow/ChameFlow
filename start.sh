#!/bin/bash

# 啟用虛擬環境
source .venv/bin/activate

# 設定 Python Path
export PYTHONPATH=$PYTHONPATH:$(pwd)/backend

# 殺死舊的 process (避免 port 佔用)
pkill -f "uvicorn backend.main:app"
pkill -f "vite"

echo "🚀 Starting Backend on port 8000..."
python -m uvicorn backend.main:app --reload --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!

echo "🚀 Starting Frontend on port 5173..."
cd frontend
npm run dev -- --host 0.0.0.0 > ../frontend.log 2>&1 &
FRONTEND_PID=$!

echo "✅ All services started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "-----------------------------------"
echo "🌐 Open your browser at: http://localhost:5173"
echo "📄 Logs are in backend.log and frontend.log"
echo "-----------------------------------"
echo "Press Ctrl+C to stop everything."

# 等待 Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
