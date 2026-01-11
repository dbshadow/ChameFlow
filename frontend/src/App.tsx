import { useState, useEffect, useRef } from 'react';
import { Settings, Image as ImageIcon, Download, RefreshCw, History, CheckCircle2, Upload, X, Trash2, File as FileIcon, Archive } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import JSZip from 'jszip';
import type { GeneratedImage, GenerationStatus, BatchItem } from './types';

// Utility for Tailwind classes
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// 修改為相對路徑，這樣部署到任何 Server/IP 都能運作
const API_BASE = "";

const WORKFLOW_MAP: Record<string, string> = {
  "rmbg.json": "去除背景 (單張)",
  "rmbg_batch.json": "去除背景 (批次)",
  "z_image.json": "Z-Image",
  "flux.json": "Flux"
};

function App() {
  // --- States: Settings ---
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [negPrompt, setNegPrompt] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [seed, setSeed] = useState<string>(""); // Empty string means random
  const [useRandomSeed, setUseRandomSeed] = useState(true);

  // --- States: RMBG Specific ---
  const [selectedModel, setSelectedModel] = useState<string>("RMBG-2.0");
  const [sensitivity, setSensitivity] = useState<number>(0.5);
  const [inputImageFile, setInputImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // --- States: Batch Specific ---
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // --- States: Runtime ---
  const [status, setStatus] = useState<GenerationStatus>({
    isConnecting: false,
    isGenerating: false,
    progressNode: null,
    message: "就緒",
    seed: null,
  });
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  
  // --- Refs ---
  const wsRef = useRef<WebSocket | null>(null);

  // --- Effects ---
  
  // 1. Fetch Workflows on Load
  useEffect(() => {
    fetch(`${API_BASE}/api/workflows`)
      .then(res => res.json())
      .then(data => {
        let fetchedWorkflows: string[] = data.workflows;
        
        // Only include workflows defined in the map
        const mapKeys = Object.keys(WORKFLOW_MAP);
        fetchedWorkflows = fetchedWorkflows.filter(wf => mapKeys.includes(wf));

        // Sort based on WORKFLOW_MAP keys order to keep a consistent UI order
        fetchedWorkflows.sort((a, b) => {
            return mapKeys.indexOf(a) - mapKeys.indexOf(b);
        });

        setWorkflows(fetchedWorkflows);
        
        // Default selection logic: Prefer rmbg.json, then others
        if (fetchedWorkflows.includes("rmbg.json")) {
            setSelectedWorkflow("rmbg.json");
        } else if (fetchedWorkflows.length > 0) {
            setSelectedWorkflow(fetchedWorkflows[0]);
        }
      })
      .catch(err => console.error("Failed to fetch workflows:", err));
  }, []);

  // 2. Handle Workflow Change
  const isNegativePromptAvailable = selectedWorkflow.includes("flux");
  const isRmbgWorkflow = selectedWorkflow === "rmbg.json";
  const isBatchWorkflow = selectedWorkflow === "rmbg_batch.json";

  // --- Handlers ---

  const handleClearHistory = () => {
    if (confirm("確定要清空本次生成的歷史紀錄嗎？")) {
        setHistory([]);
        setCurrentImage(null);
    }
  };

  const handleClearInputImage = (e: React.MouseEvent) => {
      e.stopPropagation();
      setInputImageFile(null);
      setPreviewUrl(null);
      const fileInput = document.getElementById('image-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
  };

  const handleGenerate = async () => {
    if (!selectedWorkflow) return;
    
    setStatus(prev => ({ ...prev, isGenerating: true, message: "初始化...", progressNode: null, seed: null }));

    // For RMBG, upload image first
    let uploadedImageName = null;
    if (isRmbgWorkflow) {
        if (!inputImageFile) {
            alert("請先上傳圖片");
            setStatus(prev => ({ ...prev, isGenerating: false, message: "請上傳圖片" }));
            return;
        }

        setStatus(prev => ({ ...prev, message: "正在上傳圖片..." }));
        const formData = new FormData();
        formData.append('file', inputImageFile);

        try {
            const res = await fetch(`${API_BASE}/api/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error) {
                throw new Error(data.error);
            }
            uploadedImageName = data.filename;
        } catch (e: any) {
            console.error("Upload failed", e);
            alert(`上傳失敗: ${e.message}`);
            setStatus(prev => ({ ...prev, isGenerating: false, message: "上傳失敗" }));
            return;
        }
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/generate`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus(prev => ({ ...prev, message: "發送任務中..." }));
      
      const payload: any = {
        workflow: selectedWorkflow,
        prompt,
        negative_prompt: isNegativePromptAvailable ? negPrompt : "",
        width,
        height,
        seed: useRandomSeed ? null : parseInt(seed) || null
      };

      if (isRmbgWorkflow) {
          payload.model = selectedModel;
          payload.sensitivity = sensitivity;
          payload.input_image = uploadedImageName;
      }
      
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'status') {
        setStatus(prev => ({ ...prev, message: data.message === 'queued' ? "排隊中..." : "任務完成" }));
        if (data.message === 'completed') {
             setStatus(prev => ({ ...prev, isGenerating: false }));
        }
      } else if (data.type === 'progress') {
        setStatus(prev => ({ ...prev, message: `正在執行節點: ${data.node}`, progressNode: data.node }));
      } else if (data.type === 'info') {
        setStatus(prev => ({ ...prev, seed: data.seed }));
      } else if (data.type === 'images') {
        const newImages = data.files.map((file: string) => ({
          id: Math.random().toString(36).substr(2, 9),
          url: `${API_BASE}/images/${file}`,
          filename: file,
          timestamp: Date.now()
        }));
        
        setHistory(prev => [...newImages, ...prev]);
        setCurrentImage(newImages[0]);
        setStatus(prev => ({ ...prev, message: "圖片已生成！" }));
      } else if (data.type === 'error') {
        setStatus(prev => ({ ...prev, isGenerating: false, message: `錯誤: ${data.message}` }));
        alert(`生成錯誤: ${data.message}`);
      }
    };

    ws.onerror = (e) => {
      console.error("WS Error", e);
      setStatus(prev => ({ ...prev, isGenerating: false, message: "連線發生錯誤" }));
    };
  };

  const handleDownload = async (img: GeneratedImage) => {
    try {
      const response = await fetch(img.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = img.filename;
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
      window.open(img.url, '_blank');
    }
  };

  const handleBatchFiles = (files: FileList | null) => {
      if (!files) return;
      const newItems: BatchItem[] = Array.from(files).map(file => ({
          id: Math.random().toString(36).substr(2, 9),
          file,
          originalName: file.name,
          status: 'pending',
          previewUrl: URL.createObjectURL(file),
          resultUrl: null,
          resultFilename: null
      }));
      setBatchQueue(prev => [...prev, ...newItems]);
  };

  const handleClearBatch = () => {
      if (confirm("確定要清空所有批次任務嗎？")) {
          setBatchQueue([]);
      }
  };

  const processBatchQueue = async () => {
      if (isBatchProcessing) return;
      setIsBatchProcessing(true);

      // 複製一份 Queue 以便更新
      const queue = [...batchQueue];
      
      // 依序處理
      for (let i = 0; i < queue.length; i++) {
          if (queue[i].status !== 'pending') continue;

          // 1. Update status to uploading
          setBatchQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'uploading' } : item));
          
          try {
              // 2. Upload
              const formData = new FormData();
              formData.append('file', queue[i].file);
              const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
              const uploadData = await uploadRes.json();
              if (uploadData.error) throw new Error(uploadData.error);
              
              const uploadedFilename = uploadData.filename;

              // 3. Update status to processing
              setBatchQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'processing' } : item));

              // 4. Generate via WebSocket (One-off connection)
              await new Promise<void>((resolve, reject) => {
                  const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/generate`);
                  
                  ws.onopen = () => {
                      ws.send(JSON.stringify({
                          workflow: selectedWorkflow,
                          prompt: "",
                          negative_prompt: "",
                          width: 1024,
                          height: 1024,
                          seed: null,
                          model: selectedModel,
                          sensitivity: sensitivity,
                          input_image: uploadedFilename
                      }));
                  };

                  ws.onmessage = (event) => {
                      const data = JSON.parse(event.data);
                      if (data.type === 'images') {
                          const resultFilename = data.files[0];
                          const resultUrl = `${API_BASE}/images/${resultFilename}`;
                          
                          setBatchQueue(prev => prev.map((item, idx) => idx === i ? { 
                              ...item, 
                              status: 'done', 
                              resultUrl,
                              resultFilename 
                          } : item));
                          ws.close();
                          resolve();
                      } else if (data.type === 'error') {
                          ws.close();
                          reject(new Error(data.message));
                      }
                  };

                  ws.onerror = () => {
                      reject(new Error("WebSocket Error"));
                  };
              });

          } catch (error: any) {
              console.error("Batch Item Failed", error);
              setBatchQueue(prev => prev.map((item, idx) => idx === i ? { 
                  ...item, 
                  status: 'failed', 
                  error: error.message 
              } : item));
          }
      }

      setIsBatchProcessing(false);
  };

  const handleBatchDownload = async () => {
      const zip = new JSZip();
      const completedItems = batchQueue.filter(item => item.status === 'done' && item.resultUrl);
      
      if (completedItems.length === 0) {
          alert("沒有已完成的圖片可供下載");
          return;
      }

      for (const item of completedItems) {
          if (!item.resultUrl) continue;
          const response = await fetch(item.resultUrl);
          const blob = await response.blob();
          const filename = `Rmbg_${item.originalName}`;
          zip.file(filename, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `batch_rmbg_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- Render ---

  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-800 font-sans overflow-hidden">
      
      {/* --- Left Panel: Controls --- */}
      <div className="w-[400px] flex-shrink-0 flex flex-col border-r border-gray-200 bg-white h-full shadow-sm z-10">
        
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
            <span className="w-3 h-3 bg-primary-400 rounded-full animate-pulse"></span>
            ChameFlow
          </h1>
          <p className="text-[10px] text-gray-400 mt-1 ml-5 font-medium uppercase tracking-widest">極簡風格影像生成介面</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Section: Workflow */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Settings size={14} className="text-gray-300" /> 參數設定
            </h2>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase">選擇模型</label>
              <div className="relative">
                <select 
                  value={selectedWorkflow}
                  onChange={e => setSelectedWorkflow(e.target.value)}
                  className="w-full px-3 py-2.5 appearance-none bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 cursor-pointer transition-all"
                >
                  {workflows.map(wf => (
                    <option key={wf} value={wf}>{WORKFLOW_MAP[wf] || wf}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-3 pointer-events-none text-gray-400">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>

            {isBatchWorkflow ? (
                // --- Batch RMBG Controls ---
                <>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">批次上傳圖片</label>
                        <div className="relative border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:bg-gray-50 hover:border-primary-300 transition-all cursor-pointer overflow-hidden group" onClick={() => document.getElementById('batch-upload')?.click()}>
                            <input 
                                id="batch-upload"
                                type="file" 
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={e => handleBatchFiles(e.target.files)}
                            />
                            <div className="flex flex-col items-center gap-3 py-4 text-gray-400 group-hover:text-primary-400 transition-colors">
                                <div className="p-3 bg-gray-50 rounded-full group-hover:bg-primary-50 transition-colors">
                                    <Upload size={24} />
                                </div>
                                <span className="text-xs font-medium">點擊選擇多張圖片</span>
                                <span className="text-[10px] text-gray-300">支援拖放多個檔案</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">佇列: {batchQueue.length} 張</span>
                            {batchQueue.length > 0 && (
                                <button onClick={handleClearBatch} className="text-[10px] text-red-400 hover:text-red-500 flex items-center gap-1">
                                    <Trash2 size={12} /> 清空
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">去背模型</label>
                        <div className="relative">
                            <select 
                                value={selectedModel}
                                onChange={e => setSelectedModel(e.target.value)}
                                className="w-full px-3 py-2.5 appearance-none bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 cursor-pointer transition-all"
                            >
                                <option value="RMBG-2.0">RMBG-2.0</option>
                                <option value="INSPYRENET">INSPYRENET</option>
                                <option value="BEN2">BEN2</option>
                            </select>
                            <div className="absolute right-3 top-3 pointer-events-none text-gray-400">
                                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-gray-500 uppercase">靈敏度</label>
                            <span className="text-[11px] font-mono text-primary-500 font-bold">{sensitivity}</span>
                        </div>
                        <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={sensitivity}
                            onChange={e => setSensitivity(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-primary-400"
                        />
                    </div>
                </>
            ) : isRmbgWorkflow ? (
                // --- RMBG Controls ---
                <>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">上傳圖片</label>
                        <div className="relative border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:bg-gray-50 hover:border-primary-300 transition-all cursor-pointer overflow-hidden group" onClick={() => document.getElementById('image-upload')?.click()}>
                            <input 
                                id="image-upload"
                                type="file" 
                                accept="image/*"
                                className="hidden"
                                onChange={e => {
                                    if (e.target.files && e.target.files[0]) {
                                        const file = e.target.files[0];
                                        setInputImageFile(file);
                                        const reader = new FileReader();
                                        reader.onload = (e) => {
                                            setPreviewUrl(e.target?.result as string);
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }}
                            />
                            {previewUrl ? (
                                <div className="relative w-full max-h-48 flex items-center justify-center">
                                    <img src={previewUrl} alt="Preview" className="max-w-full max-h-48 object-contain rounded-lg shadow-sm" />
                                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all flex items-center justify-center text-white opacity-0 group-hover:opacity-100 rounded-lg">
                                        <div className="flex gap-4">
                                            <div className="p-2 bg-white/20 rounded-full backdrop-blur-md">
                                                <RefreshCw size={20} />
                                            </div>
                                            <button 
                                                onClick={handleClearInputImage}
                                                className="p-2 bg-red-500/80 rounded-full backdrop-blur-md hover:bg-red-500 transition-colors"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-3 py-4 text-gray-400 group-hover:text-primary-400 transition-colors">
                                    <div className="p-3 bg-gray-50 rounded-full group-hover:bg-primary-50 transition-colors">
                                        <Upload size={24} />
                                    </div>
                                    <span className="text-xs font-medium">點擊或拖放圖片至此</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">去背模型</label>
                        <div className="relative">
                            <select 
                                value={selectedModel}
                                onChange={e => setSelectedModel(e.target.value)}
                                className="w-full px-3 py-2.5 appearance-none bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 cursor-pointer transition-all"
                            >
                                <option value="RMBG-2.0">RMBG-2.0</option>
                                <option value="INSPYRENET">INSPYRENET</option>
                                <option value="BEN2">BEN2</option>
                            </select>
                            <div className="absolute right-3 top-3 pointer-events-none text-gray-400">
                                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-gray-500 uppercase">靈敏度</label>
                            <span className="text-[11px] font-mono text-primary-500 font-bold">{sensitivity}</span>
                        </div>
                        <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={sensitivity}
                            onChange={e => setSensitivity(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-primary-400"
                        />
                    </div>
                </>
            ) : (
                // --- Standard Controls ---
                <>
                    <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 uppercase">提示詞</label>
                    <textarea 
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        rows={5}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 resize-none transition-all"
                        placeholder="描述你想要生成的畫面..."
                    />
                    </div>

                    {isNegativePromptAvailable && (
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">負面提示詞</label>
                        <textarea 
                        value={negPrompt}
                        onChange={e => setNegPrompt(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 resize-none transition-all"
                        placeholder="不想看到的內容..."
                        />
                    </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">寬度</label>
                        <input 
                        type="number" 
                        value={width}
                        max={2048}
                        onChange={e => setWidth(Math.min(2048, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 transition-all"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">高度</label>
                        <input 
                        type="number" 
                        value={height}
                        max={2048}
                        onChange={e => setHeight(Math.min(2048, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 transition-all"
                        />
                    </div>
                    </div>

                    <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">種子碼</label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                            type="checkbox" 
                            checked={useRandomSeed}
                            onChange={e => setUseRandomSeed(e.target.checked)}
                            className="w-3.5 h-3.5 text-primary-500 rounded-md border-gray-300 focus:ring-primary-400 transition-all"
                            />
                            <span className="text-xs font-medium text-gray-500 group-hover:text-primary-500 transition-colors">隨機</span>
                        </label>
                    </div>
                    {!useRandomSeed && (
                        <input 
                        type="number"
                        value={seed}
                        onChange={e => setSeed(e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 transition-all"
                        placeholder="輸入 Seed 數值"
                        />
                    )}
                    {status.seed && <div className="text-[10px] font-mono text-gray-400 text-right uppercase">Last Seed: {status.seed}</div>}
                    </div>
                </>
            )}

          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-white">
          <button
            onClick={isBatchWorkflow ? processBatchQueue : handleGenerate}
            disabled={isBatchWorkflow ? (isBatchProcessing || batchQueue.length === 0) : status.isGenerating}
            className={cn(
              "w-full py-3.5 px-4 rounded-2xl text-white font-bold shadow-lg shadow-primary-100 transition-all flex items-center justify-center gap-2.5",
              (isBatchWorkflow ? (isBatchProcessing || batchQueue.length === 0) : status.isGenerating)
                ? "bg-gray-200 cursor-not-allowed shadow-none text-gray-400"
                : "bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 hover:shadow-xl hover:shadow-primary-200 active:scale-[0.98]"
            )}
          >
            {isBatchWorkflow ? (
                isBatchProcessing ? (
                    <>
                        <RefreshCw className="animate-spin" size={20} />
                        <span>處理中...</span>
                    </>
                ) : (
                    <>
                        <CheckCircle2 size={20} />
                        <span>開始批次處理</span>
                    </>
                )
            ) : status.isGenerating ? (
              <>
                <RefreshCw className="animate-spin" size={20} />
                <span>{status.message}</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={20} />
                <span>開始生成</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* --- Right Panel: Preview --- */}
      <div className="flex-1 flex flex-col bg-gray-50 relative">
        
        {isBatchWorkflow ? (
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-8 py-5 border-b border-gray-200 bg-white flex justify-between items-center shadow-sm z-10">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                            批次處理佇列
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">已完成: {batchQueue.filter(i => i.status === 'done').length} / {batchQueue.length}</p>
                    </div>
                    <button 
                        onClick={handleBatchDownload}
                        disabled={batchQueue.filter(i => i.status === 'done').length === 0}
                        className="bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all shadow-lg shadow-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Archive size={18} /> 下載全部 (ZIP)
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {batchQueue.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50">
                            <div className="p-6 bg-white rounded-full shadow-sm mb-4">
                                <FileIcon size={48} className="text-gray-200" />
                            </div>
                            <p className="text-lg font-medium">佇列是空的</p>
                            <p className="text-sm opacity-60 mt-1">請從左側上傳圖片開始批次處理</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {batchQueue.map((item) => (
                                <div key={item.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-4 group hover:shadow-md transition-all">
                                    <div className="w-16 h-16 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0 border border-gray-100 relative">
                                        <img src={item.previewUrl || ''} className="w-full h-full object-cover opacity-80" />
                                        {item.status === 'done' && (
                                            <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
                                                <CheckCircle2 size={20} className="text-white drop-shadow-md" />
                                            </div>
                                        )}
                                        {item.status === 'processing' && (
                                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                                <RefreshCw size={20} className="text-white animate-spin" />
                                            </div>
                                        )}
                                        {item.status === 'failed' && (
                                            <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                                                <X size={20} className="text-white" />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-gray-700 truncate text-sm">{item.originalName}</h3>
                                            <span className={cn(
                                                "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                                                item.status === 'pending' && "bg-gray-100 text-gray-500",
                                                item.status === 'uploading' && "bg-blue-50 text-blue-500",
                                                item.status === 'processing' && "bg-purple-50 text-purple-500",
                                                item.status === 'done' && "bg-green-50 text-green-500",
                                                item.status === 'failed' && "bg-red-50 text-red-500",
                                            )}>
                                                {item.status === 'pending' && "等待中"}
                                                {item.status === 'uploading' && "上傳中"}
                                                {item.status === 'processing' && "處理中"}
                                                {item.status === 'done' && "完成"}
                                                {item.status === 'failed' && "失敗"}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 font-mono">
                                            {item.resultFilename || (item.status === 'failed' ? item.error : '---')}
                                        </p>
                                    </div>

                                    {item.status === 'done' && item.resultUrl && (
                                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2">
                                            <a 
                                                href={item.resultUrl} 
                                                download={`Rmbg_${item.originalName}`}
                                                className="p-2 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors block"
                                                title="單獨下載"
                                            >
                                                <Download size={20} />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <>
        <div className="flex-1 flex items-center justify-center p-12 overflow-hidden relative">
          
          {currentImage ? (
             <div className="relative group max-w-full max-h-full shadow-2xl shadow-gray-200 rounded-2xl overflow-hidden border-4 border-white">
                <img 
                  src={currentImage.url} 
                  alt="Generated" 
                  className="max-w-full max-h-[75vh] object-contain bg-white" 
                />
                
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all flex justify-end">
                   <button 
                     onClick={() => handleDownload(currentImage)}
                     className="bg-white hover:bg-primary-50 text-gray-800 px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                   >
                     <Download size={18} className="text-primary-500" /> 下載原圖
                   </button>
                </div>
             </div>
          ) : (
            <div className="text-center text-gray-300 select-none animate-in fade-in duration-700">
              <div className="w-24 h-24 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6">
                <ImageIcon size={48} className="opacity-20" />
              </div>
              <p className="text-xl font-bold text-gray-400">等待生成中</p>
              <p className="text-sm mt-2 font-medium opacity-60">請在左側調整參數並點擊開始按鈕</p>
            </div>
          )}

          {status.isGenerating && (
             <div className="absolute inset-0 bg-white/40 backdrop-blur-md z-20 flex flex-col items-center justify-center">
                <div className="relative">
                    <div className="w-20 h-20 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 bg-primary-500/10 rounded-full animate-pulse"></div>
                    </div>
                </div>
                <p className="mt-6 font-bold text-primary-600 text-lg tracking-tight animate-pulse">{status.message}</p>
             </div>
          )}
        </div>

        <div className="h-40 bg-white border-t border-gray-100 flex flex-col flex-shrink-0 shadow-2xl shadow-black/5">
          <div className="px-6 py-3 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <History size={14} className="text-gray-300" /> 歷史紀錄
            </div>
            {history.length > 0 && (
                <button 
                    onClick={handleClearHistory}
                    className="text-[10px] font-bold text-red-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                >
                    <Trash2 size={12} /> 清空紀錄
                </button>
            )}
          </div>
          <div className="flex-1 overflow-x-auto p-4 flex gap-4 custom-scrollbar">
             {history.length === 0 && (
               <div className="w-full flex items-center justify-center text-gray-300 text-[11px] font-medium italic">
                 尚未生成任何影像
               </div>
             )}
             {history.map((img) => (
               <button 
                 key={img.id}
                 onClick={() => setCurrentImage(img)}
                 className={cn(
                   "relative h-full min-w-[70px] rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 group bg-gray-50 shadow-sm",
                   currentImage?.id === img.id ? "border-primary-400 ring-4 ring-primary-50" : "border-transparent hover:border-gray-200"
                 )}
               >
                 <img src={img.url} className="h-full w-auto object-contain mx-auto" loading="lazy" />
                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
               </button>
             ))}
          </div>
        </div>
        </>
        )}

      </div>
    </div>
  );
}

export default App;