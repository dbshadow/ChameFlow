# ChameFlow

ChameFlow is a minimalist, modern web frontend for [ComfyUI](https://github.com/comfyanonymous/ComfyUI), designed to simplify the image generation and processing workflow. It abstracts the complexity of node graphs into a clean, intuitive interface for both creation (Text-to-Image) and processing (Image-to-Image/Batch).

## Features

### 🎨 Image Generation
- **Simplified Interface**: Clean split-screen UI.
- **Workflow Support**: Ready for Flux, SDXL, Z-Image, and more.
- **Parameter Control**: Easy access to Prompt, Negative Prompt, Dimensions, and Seed.
- **Real-time Progress**: WebSocket integration for instant feedback.

### 🖼️ Background Removal (RMBG)
- **Single Mode**: Upload an image and instantly remove its background.
- **Model Selection**: Choose between **RMBG-2.0**, **INSPYRENET**, or **BEN2**.
- **Adjustable Sensitivity**: Fine-tune the removal precision.
- **Interactive Preview**: See the uploaded image and result instantly.

### 📦 Batch Processing
- **Bulk Upload**: Drag & drop or select multiple images at once.
- **Queue System**: Visual queue table showing status (Pending, Processing, Done, Failed).
- **Sequential Processing**: Smart scheduling to prevent server overload.
- **One-Click Download**: Automatically package all processed images into a **ZIP archive** with organized filenames (`Rmbg_[OriginalName]`).

## Architecture

- **Frontend**: React (Vite) + Tailwind CSS v3 + JSZip
- **Backend**: Python FastAPI (API Gateway + Static File Server)
- **Communication**: WebSocket (Real-time) & REST API (Uploads)

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- A running instance of **ComfyUI** with necessary custom nodes installed (e.g., ComfyUI-RMBG).
  - Default: `http://192.168.7.150:8188`
  - **Configurable via `COMFY_SERVER` environment variable.**

## Quick Start (One-Click)

We provide a robust script to handle setup, build, and execution automatically.

```bash
# 1. Clone repository
git clone https://github.com/your-repo/chameflow.git
cd chameflow

# 2. Make script executable
chmod +x start.sh

# 3. Run (Auto-installs dependencies & builds frontend)
./start.sh
```
Access the application at: **http://localhost:8000**

---

## Manual Installation

### 1. Backend Setup

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install fastapi uvicorn websockets requests python-multipart
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run build  # For production
```

## Configuration

### Adding Custom Workflows
1. Save your workflow as **API Format (JSON)** from ComfyUI.
2. Edit the JSON file to add `_meta` titles to nodes you want to control:
   - `user_prompt`: Positive Prompt
   - `user_negative_prompt`: Negative Prompt
   - `user_size`: EmptyLatentImage (Width/Height)
   - `user_seed`: KSampler (Seed)
   - `user_input_image`: LoadImage (For Image-to-Image)
   - `user_rmbg_settings`: RMBG Node (Model/Sensitivity)
3. Place the `.json` file in the project root directory.

## License

MIT