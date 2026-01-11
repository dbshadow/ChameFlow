#!/bin/bash

# --- 顏色設定 ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}        ChameFlow 啟動工具             ${NC}"
echo -e "${BLUE}=======================================${NC}"

# 1. 檢查虛擬環境
if [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo -e "${RED}❌ 找不到 .venv，請先執行 uv sync 或建立虛擬環境${NC}"
    exit 1
fi

export PYTHONPATH=$PYTHONPATH:$(pwd)/backend

# 2. 檢查並編譯前端
echo -e "${BLUE}📦 檢查前端狀態...${NC}"
if [ ! -d "frontend/dist" ] || [ "$1" == "--build" ]; then
    echo -e "${YELLOW}🛠️  正在編譯前端介面 (此步驟只需要執行一次)...${NC}"
    cd frontend
    npm install
    npm run build
    cd ..
else
    echo -e "${GREEN}✨ 偵測到已編譯版本，直接啟動 (使用 --build 可重新編譯)${NC}"
fi

# 3. 殺死舊程序
pkill -f "uvicorn backend.main:app" > /dev/null 2>&1

# 4. 啟動整合式服務
echo -e "${GREEN}🚀 服務正式啟動！${NC}"
echo -e "${GREEN}🌐 請在瀏覽器打開: http://localhost:8000${NC}"
echo -e "${YELLOW}📄 輸出紀錄將顯示在下方 (Ctrl+C 停止)${NC}"
echo -e "${BLUE}=======================================${NC}"

# 啟動整合伺服器
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
