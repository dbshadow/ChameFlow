import os
import uuid
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from comfy_client import ComfyRunner

app = FastAPI()

# 允許 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. 圖片下載服務
DOWNLOAD_DIR = os.path.join(os.getcwd(), "backend", "downloaded_images")
if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

app.mount("/images", StaticFiles(directory=DOWNLOAD_DIR), name="images")

# ComfyUI Address Configuration
# Priority: Environment Variable > Default
DEFAULT_SERVER = os.getenv("COMFY_SERVER", "http://192.168.7.150:8188")
print(f"INFO: Connecting to ComfyUI at {DEFAULT_SERVER}")

@app.get("/api/workflows")
def list_workflows():
    # 取得專案根目錄
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    workflows = []
    try:
        for f in os.listdir(base_dir):
            if f.endswith(".json"):
                workflows.append(f)
    except Exception as e:
        print(f"Error listing workflows: {e}")
    return {"workflows": workflows}

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        runner = ComfyRunner(DEFAULT_SERVER, DOWNLOAD_DIR)
        filename = runner.upload_image(contents, file.filename)
        return {"filename": filename}
    except Exception as e:
        print(f"Upload error: {e}")
        return {"error": str(e)}

@app.websocket("/ws/generate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    try:
        data = await websocket.receive_json()
        
        # 解析參數 (不再需要 user/password)
        workflow_file = data.get("workflow")
        prompt = data.get("prompt")
        neg_prompt = data.get("negative_prompt", "")
        width = int(data.get("width", 1024))
        height = int(data.get("height", 1024))
        seed_opt = data.get("seed")
        
        # New parameters for RMBG
        model = data.get("model")
        sensitivity = data.get("sensitivity")
        input_image = data.get("input_image")
        
        extra_params = {
            "model": model,
            "sensitivity": sensitivity,
            "input_image": input_image
        }
        
        # 初始化 ComfyRunner (使用預設內網位址)
        runner = ComfyRunner(DEFAULT_SERVER, DOWNLOAD_DIR)
        
        try:
            wf_data = runner.load_workflow(workflow_file)
            final_wf, used_seed = runner.apply_settings(
                wf_data, prompt, neg_prompt, width, height, seed_opt, extra_params
            )
            await websocket.send_json({"type": "info", "seed": used_seed})
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"Setup failed: {str(e)}"})
            return

        client_id = str(uuid.uuid4())
        async for msg in runner.run_workflow(final_wf, client_id):
            await websocket.send_json(msg)
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WS Error: {e}")

# ==========================================
# 整合前端靜態檔案
# ==========================================
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws/") or full_path.startswith("images/"):
            return {"error": "Not found"}
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    print(f"Warning: Frontend build not found at {FRONTEND_DIST}")