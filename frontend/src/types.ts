export interface Workflow {
  name: string;
  filename: string;
}

export interface GeneratedImage {
  id: string;
  url: string; // 完整的後端 URL
  filename: string;
  timestamp: number;
}

export interface GenerationStatus {
  isConnecting: boolean;
  isGenerating: boolean;
  progressNode: string | null; // 目前執行到的節點 ID
  message: string;
  seed: number | null;
}
