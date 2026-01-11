#!/bin/bash

# --- 顏色設定 ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}   ChameFlow 一鍵啟動腳本 (Deployment)   ${NC}"
echo -e "${BLUE}=======================================${NC}"

# 1. 檢查並啟用虛擬環境
if [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo -e "${YELLOW}⚠️ 找不到 .venv，正在建立並安裝依賴...${NC}"
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e .
fi

# 確保安裝了新增的 python-multipart
pip install python-multipart -q

# 2. 設定 Python Path
export PYTHONPATH=$PYTHONPATH:$(pwd)/backend

# 3. 處理前端 (若 dist 不存在則編譯)
if [ ! -d "frontend/dist" ]; then
    echo -e "${YELLOW}📦 偵測到未編譯前端，正在進行 Build...${NC}"
    cd frontend
    npm install
    npm run build
    cd ..
fi

# 4. 殺死舊的 process
echo -e "${BLUE}🧹 正在清理舊的程序...${NC}"
pkill -f "uvicorn backend.main:app"

# 5. 啟動服務 (整合模式)
echo -e "${GREEN}🚀 服務啟動中...${NC}"
echo -e "${GREEN}🌐 存取位址: http://localhost:8000${NC}"
echo -e "${YELLOW}📄 日誌紀錄於 backend.log${NC}"

# 使用 Production 模式啟動，不帶 --reload 以提高穩定性
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!

echo -e "${BLUE}=======================================${NC}"
echo "Backend PID: $BACKEND_PID"
echo "按下 Ctrl+C 停止服務"

# 捕捉中斷訊號
trap "echo -e '\n${YELLOW}🛑 正在停止服務...${NC}'; kill $BACKEND_PID; exit" INT
wait