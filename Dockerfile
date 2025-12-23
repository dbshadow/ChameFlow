# ==========================================
# Stage 1: Build Frontend
# ==========================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy dependency definitions
COPY frontend/package*.json ./
# Install dependencies
RUN npm ci

# Copy source code
COPY frontend/ ./
# Build for production (output to dist/)
RUN npm run build

# ==========================================
# Stage 2: Runtime Environment (Backend)
# ==========================================
FROM python:3.11-slim

WORKDIR /app

# Set environment variables
# - PYTHONDONTWRITEBYTECODE: Prevent Python from writing pyc files to disc
# - PYTHONUNBUFFERED: Ensure python output is sent straight to terminal (logs)
# - PYTHONPATH: Ensure backend module can be found
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend
# Default ComfyUI server address (override with docker run -e)
ENV COMFY_SERVER="http://192.168.7.150:8188"

# Install system dependencies (if needed, currently minimal)
# RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
# Using direct install to keep image size small, or use requirements.txt
RUN pip install --no-cache-dir fastapi uvicorn websockets requests

# Copy backend code
COPY backend/ ./backend/

# Copy workflow JSON files
COPY *.json ./

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create directory for downloaded images
RUN mkdir -p /app/backend/downloaded_images

# Expose port
EXPOSE 8000

# Start command
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
