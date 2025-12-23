import { useState, useEffect, useRef } from 'react';
import { Settings, Image as ImageIcon, Download, RefreshCw, History, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { GeneratedImage, GenerationStatus } from './types';

// Utility for Tailwind classes
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// 修改為相對路徑，這樣部署到任何 Server/IP 都能運作
const API_BASE = "";

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
        setWorkflows(data.workflows);
        if (data.workflows.length > 0) {
          setSelectedWorkflow(data.workflows[0]);
        }
      })
      .catch(err => console.error("Failed to fetch workflows:", err));
  }, []);

  // 2. Handle Workflow Change
  const isNegativePromptAvailable = selectedWorkflow.includes("flux");

  // --- Handlers ---

  const handleGenerate = () => {
    if (!selectedWorkflow) return;
    
    setStatus(prev => ({ ...prev, isGenerating: true, message: "初始化連線...", progressNode: null, seed: null }));

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
      
      const payload = {
        workflow: selectedWorkflow,
        prompt,
        negative_prompt: isNegativePromptAvailable ? negPrompt : "",
        width,
        height,
        seed: useRandomSeed ? null : parseInt(seed) || null
      };
      
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

  // --- Render ---

  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-800 font-sans overflow-hidden">
      
      {/* --- Left Panel: Controls --- */}
      <div className="w-[400px] flex-shrink-0 flex flex-col border-r border-gray-200 bg-white h-full shadow-sm z-10">
        
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="w-3 h-3 bg-primary-400 rounded-full animate-pulse"></span>
            ChameFlow
          </h1>
          <p className="text-xs text-gray-500 mt-1 ml-5">ComfyUI Frontend Generator</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Section: Workflow */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Settings size={14} /> 參數設定
            </h2>
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">選擇模型 (Workflow)</label>
              <div className="relative">
                <select 
                  value={selectedWorkflow}
                  onChange={e => setSelectedWorkflow(e.target.value)}
                  className="w-full px-3 py-2 appearance-none bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 cursor-pointer"
                >
                  {workflows.map(wf => (
                    <option key={wf} value={wf}>{wf}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-2.5 pointer-events-none text-gray-400">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">提示詞 (Positive)</label>
              <textarea 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 resize-none"
                placeholder="描述你想要生成的畫面..."
              />
            </div>

            {isNegativePromptAvailable && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">負面提示詞 (Negative)</label>
                <textarea 
                  value={negPrompt}
                  onChange={e => setNegPrompt(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 resize-none"
                  placeholder="不想看到的內容..."
                />
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">寬度 (Width)</label>
                <input 
                  type="number" 
                  value={width}
                  max={2048}
                  onChange={e => setWidth(Math.min(2048, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">高度 (Height)</label>
                <input 
                  type="number" 
                  value={height}
                  max={2048}
                  onChange={e => setHeight(Math.min(2048, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
              </div>
            </div>

            <div className="space-y-2">
               <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">種子 (Seed)</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={useRandomSeed}
                      onChange={e => setUseRandomSeed(e.target.checked)}
                      className="w-3 h-3 text-primary-500 rounded focus:ring-primary-400"
                    />
                    <span className="text-xs text-gray-500">隨機</span>
                  </label>
               </div>
               {!useRandomSeed && (
                 <input 
                   type="number"
                   value={seed}
                   onChange={e => setSeed(e.target.value)}
                   className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                   placeholder="輸入 Seed 數值"
                 />
               )}
               {status.seed && <div className="text-[10px] text-gray-400 text-right">Last Seed: {status.seed}</div>}
            </div>

          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={handleGenerate}
            disabled={status.isGenerating}
            className={cn(
              "w-full py-3 px-4 rounded-xl text-white font-medium shadow-md transition-all flex items-center justify-center gap-2",
              status.isGenerating 
                ? "bg-gray-300 cursor-not-allowed shadow-none"
                : "bg-primary-400 hover:bg-primary-500 hover:shadow-lg active:scale-[0.98]"
            )}
          >
            {status.isGenerating ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                {status.message}
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                開始生成
              </>
            )}
          </button>
        </div>
      </div>

      {/* --- Right Panel: Preview --- */}
      <div className="flex-1 flex flex-col bg-gray-100/50 relative">
        
        <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
          
          {currentImage ? (
             <div className="relative group max-w-full max-h-full shadow-2xl rounded-lg overflow-hidden">
                <img 
                  src={currentImage.url} 
                  alt="Generated" 
                  className="max-w-full max-h-[80vh] object-contain bg-white" 
                />
                
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                   <button 
                     onClick={() => handleDownload(currentImage)}
                     className="bg-white/90 hover:bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2"
                   >
                     <Download size={16} /> 下載原圖
                   </button>
                </div>
             </div>
          ) : (
            <div className="text-center text-gray-300 select-none">
              <ImageIcon size={64} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-light">等待生成...</p>
              <p className="text-sm opacity-60">請在左側輸入提示詞並點擊開始</p>
            </div>
          )}

          {status.isGenerating && (
             <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-primary-600">
                <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4"></div>
                <p className="font-medium animate-pulse">{status.message}</p>
             </div>
          )}
        </div>

        <div className="h-32 bg-white border-t border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
            <History size={12} /> 歷史紀錄 (本次)
          </div>
          <div className="flex-1 overflow-x-auto p-3 flex gap-3 custom-scrollbar">
             {history.length === 0 && (
               <div className="w-full flex items-center justify-center text-gray-300 text-xs italic">
                 暫無歷史圖片
               </div>
             )}
             {history.map((img) => (
               <button 
                 key={img.id}
                 onClick={() => setCurrentImage(img)}
                 className={cn(
                   "relative h-full aspect-square rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 group",
                   currentImage?.id === img.id ? "border-primary-400 ring-2 ring-primary-100" : "border-gray-100 hover:border-gray-300"
                 )}
               >
                 <img src={img.url} className="w-full h-full object-cover" loading="lazy" />
                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
               </button>
             ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
