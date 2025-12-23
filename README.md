# ChameFlow

ChameFlow is a minimalist, modern web frontend for [ComfyUI](https://github.com/comfyanonymous/ComfyUI), designed to simplify the image generation workflow. It provides a clean interface for selecting workflows, adjusting parameters, and managing generated images without the complexity of the node-based graph.

![ChameFlow Interface](https://via.placeholder.com/800x450.png?text=ChameFlow+Preview)

## Features

- **Simplified Interface**: A clean, split-screen UI (Settings vs. Preview).
- **Workflow Selection**: Dropdown to choose between different JSON workflows (e.g., Flux, SDXL).
- **Parameter Control**: Easy access to Prompt, Negative Prompt, Dimensions, and Seed.
- **Real-time Progress**: WebSocket integration for real-time generation feedback.
- **History & Download**: Session-based history strip and easy image download.
- **Workflow Mapping**: Intelligent mapping of generic UI inputs to specific ComfyUI nodes via `_meta.title` tags.

## Architecture

- **Frontend**: React (Vite) + Tailwind CSS v3
- **Backend**: Python FastAPI (Acts as an API Gateway and Static File Server)
- **Communication**: WebSocket (for real-time progress) & REST API

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- A running instance of **ComfyUI**.
  - Default: `http://192.168.7.150:8188`
  - **Configurable via `COMFY_SERVER` environment variable.**

## Installation

### 1. Backend Setup

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn websockets requests
# Or using uv
uv sync
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

## Running the Application

### Option A: Development Mode (Hot Reload)

Run backend and frontend separately for development.

**Backend:**
```bash
source .venv/bin/activate
export PYTHONPATH=$PYTHONPATH:$(pwd)/backend
python -m uvicorn backend.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm run dev
# Access at http://localhost:5173
```

### Option B: Production Mode (Integrated)

Build the frontend and serve everything through FastAPI.

1. **Build Frontend:**
   ```bash
   cd frontend
   npm run build
   cd ..
   ```

2. **Run Server:**
   ```bash
   source .venv/bin/activate
   export PYTHONPATH=$PYTHONPATH:$(pwd)/backend
   # Optional: Override ComfyUI server address
   export COMFY_SERVER="http://127.0.0.1:8188"
   python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
   
   Access the full application at **http://localhost:8000**.

### Option C: Docker Deployment (Recommended)

Easily build and run the application in an isolated container.

1. **Build the Image:**
   ```bash
   docker build -t chameflow .
   ```

2. **Run the Container:**
   ```bash
   # Run with default settings
   docker run -d -p 8000:8000 --name chameflow-app chameflow
   
   # Run with custom ComfyUI server address
   docker run -d -p 8000:8000 \
     -e COMFY_SERVER="http://10.0.0.5:8188" \
     --name chameflow-app chameflow
   ```

   Access at **http://localhost:8000**.

   *Note: If your ComfyUI is running on the host machine (not in Docker), you might need to ensure the container can reach it. For Linux, you can add `--network="host"` or reference the host IP.*

## Configuration

To use your own ComfyUI workflows:
1. Save your workflow as **API Format (JSON)** from ComfyUI.
2. Edit the JSON file to add `_meta` titles to nodes you want to control:
   - `user_prompt`: For Positive Prompt (CLIPTextEncode)
   - `user_negative_prompt`: For Negative Prompt (CLIPTextEncode)
   - `user_size`: For EmptyLatentImage (Width/Height)
   - `user_seed`: For KSampler (Seed)
3. Place the `.json` file in the project root directory.

## License

MIT
