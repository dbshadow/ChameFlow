import json
import uuid
import random
import os
import asyncio
import base64
import websockets
import requests
import urllib.parse
from typing import Optional, Dict, Any

class ComfyRunner:
    def __init__(self, server_address: str, output_dir: str):
        self.server_address = server_address.rstrip('/')
        self.output_dir = output_dir
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

    def load_workflow(self, workflow_name: str) -> Dict[str, Any]:
        # 安全檢查：只允許讀取當前目錄下的 json
        safe_name = os.path.basename(workflow_name)
        if not safe_name.endswith('.json'):
            safe_name += '.json'
            
        # 搜尋路徑：優先找專案根目錄 (假設 comfy_client.py 在 backend/)
        # 我們往上找一層
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        file_path = os.path.join(base_dir, safe_name)
        
        if not os.path.exists(file_path):
            # Fallback: 試試看當前目錄
            file_path = os.path.join(os.getcwd(), safe_name)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Workflow file {safe_name} not found")
            
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def apply_settings(self, workflow: Dict[str, Any], prompt: str, neg_prompt: str, width: int, height: int, seed: Optional[int] = None, extra_params: Optional[Dict[str, Any]] = None):
        """
        根據 _meta.title 修改工作流參數
        """
        # 產生隨機 Seed 如果未提供
        final_seed = seed if seed is not None else random.randint(1, 10**14)
        if extra_params is None:
            extra_params = {}

        for node_id, node in workflow.items():
            title = node.get('_meta', {}).get('title', '')
            
            if title == 'user_prompt':
                if 'text' in node['inputs']:
                    node['inputs']['text'] = prompt
            
            elif title == 'user_negative_prompt':
                if 'text' in node['inputs']:
                    node['inputs']['text'] = neg_prompt

            elif title == 'user_size':
                if 'width' in node['inputs']:
                    node['inputs']['width'] = width
                if 'height' in node['inputs']:
                    node['inputs']['height'] = height
            
            elif title == 'user_seed':
                if 'seed' in node['inputs']:
                    node['inputs']['seed'] = final_seed
                elif 'noise_seed' in node['inputs']:
                     node['inputs']['noise_seed'] = final_seed
            
            elif title == 'user_input_image':
                if 'image' in node['inputs'] and 'input_image' in extra_params:
                    node['inputs']['image'] = extra_params['input_image']
            
            elif title == 'user_rmbg_settings':
                if 'model' in extra_params:
                    node['inputs']['model'] = extra_params['model']
                if 'sensitivity' in extra_params:
                    node['inputs']['sensitivity'] = extra_params['sensitivity']

        return workflow, final_seed

    def upload_image(self, image_data: bytes, filename: str) -> str:
        url = f"{self.server_address}/upload/image"
        # files tuple format: (filename, fileobj, content_type) or just (filename, fileobj)
        files = {'image': (filename, image_data)}
        # Overwrite if exists to ensure we use the latest
        data = {'overwrite': 'true'}
        
        try:
            req = requests.post(url, files=files, data=data)
            req.raise_for_status()
            res = req.json()
            # Return the filename used by ComfyUI (might be renamed or in subfolder)
            # If subfolder is present, ComfyUI usually expects "subfolder/filename" or just filename if input dir.
            # Usually 'name' is correct.
            return res.get('name', filename)
        except Exception as e:
            print(f"Upload image error: {e}")
            raise

    def queue_prompt(self, workflow: Dict[str, Any], client_id: str) -> str:
        p = {"prompt": workflow, "client_id": client_id}
        url = f"{self.server_address}/prompt"
        
        try:
            req = requests.post(url, json=p)
            req.raise_for_status()
            return req.json()['prompt_id']
        except Exception as e:
            print(f"Queue prompt error: {e}")
            raise

    def download_image(self, filename: str, subfolder: str, folder_type: str) -> str:
        data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url_values = urllib.parse.urlencode(data)
        url = f"{self.server_address}/view?{url_values}"
        
        try:
            with requests.get(url, stream=True) as response:
                response.raise_for_status()
                save_path = os.path.join(self.output_dir, filename)
                with open(save_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=1024):
                        f.write(chunk)
                return filename
        except Exception as e:
            print(f"Download image error: {e}")
            return ""

    async def run_workflow(self, workflow: Dict[str, Any], client_id: str):
        """
        執行工作流並生成即時狀態 (Async Generator)
        """
        ws_protocol = "wss://" if "https" in self.server_address else "ws://"
        ws_host = self.server_address.replace("https://", "").replace("http://", "")
        ws_url = f"{ws_protocol}{ws_host}/ws?clientId={client_id}"
        
        try:
            async with websockets.connect(ws_url) as ws:
                # 1. 送出任務
                prompt_id = self.queue_prompt(workflow, client_id)
                yield {"type": "status", "message": "queued", "prompt_id": prompt_id}

                # 2. 監聽 WebSocket
                while True:
                    out = await ws.recv()
                    if isinstance(out, str):
                        message = json.loads(out)
                        msg_type = message['type']
                        
                        if msg_type == 'executing':
                            data = message['data']
                            if data['node'] is None and data['prompt_id'] == prompt_id:
                                # 任務結束
                                yield {"type": "status", "message": "completed"}
                                break
                            elif data['prompt_id'] == prompt_id:
                                yield {"type": "progress", "node": data['node']}
                        
                        elif msg_type == 'executed':
                            data = message['data']
                            if data['prompt_id'] == prompt_id:
                                output_data = data['output']
                                if 'images' in output_data:
                                    images = []
                                    for image in output_data['images']:
                                        fname = image['filename']
                                        # 下載圖片
                                        local_name = self.download_image(fname, image['subfolder'], image['type'])
                                        images.append(local_name)
                                    yield {"type": "images", "files": images}

        except Exception as e:
            yield {"type": "error", "message": str(e)}