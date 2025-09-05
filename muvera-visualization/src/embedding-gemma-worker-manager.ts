// Manager for EmbeddingGemma Web Worker
// Provides a clean interface to the Web Worker with promises and progress callbacks

interface WorkerMessage {
  id: string;
  type: 'initialize' | 'generate-embedding' | 'get-model-info' | 'clear-cache';
  payload?: any;
}

interface WorkerResponse {
  id: string;
  type: 'success' | 'error' | 'progress';
  payload?: any;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  onProgress?: (message: string, progress?: number) => void;
}

export class EmbeddingGemmaWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private isWorkerReady = false;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    try {
      // Create worker from the TypeScript file (Vite will handle compilation)
      this.worker = new Worker(
        new URL('./embedding-gemma-worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
      this.worker.addEventListener('error', this.handleWorkerError.bind(this));
      this.isWorkerReady = true;
      
      console.log('✅ EmbeddingGemma Web Worker manager initialized');
    } catch (error) {
      console.error('❌ Failed to create EmbeddingGemma Web Worker:', error);
      throw new Error(`Failed to create Web Worker: ${error}`);
    }
  }

  private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
    const { id, type, payload } = event.data;
    const request = this.pendingRequests.get(id);

    if (!request) {
      console.warn(`Received response for unknown request ID: ${id}`);
      return;
    }

    switch (type) {
      case 'success':
        this.pendingRequests.delete(id);
        request.resolve(payload);
        break;

      case 'error':
        this.pendingRequests.delete(id);
        request.reject(new Error(payload.error));
        break;

      case 'progress':
        if (request.onProgress) {
          request.onProgress(payload.message, payload.progress);
        }
        break;
    }
  }

  private handleWorkerError(error: ErrorEvent) {
    console.error('❌ Web Worker error:', error);
    
    // Reject all pending requests
    this.pendingRequests.forEach(request => {
      request.reject(new Error(`Web Worker error: ${error.message}`));
    });
    this.pendingRequests.clear();
  }

  private generateRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  private sendMessage(
    type: WorkerMessage['type'],
    payload?: any,
    onProgress?: (message: string, progress?: number) => void
  ): Promise<any> {
    if (!this.worker || !this.isWorkerReady) {
      return Promise.reject(new Error('Web Worker not ready'));
    }

    const id = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      // Store the request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        onProgress
      });

      // Send message to worker
      const message: WorkerMessage = { id, type, payload };
      this.worker!.postMessage(message);
    });
  }

  // Initialize the EmbeddingGemma model
  async initialize(
    config?: any,
    onProgress?: (message: string, progress?: number) => void
  ): Promise<any> {
    console.log('🔄 Initializing EmbeddingGemma model in Web Worker...');
    
    try {
      const result = await this.sendMessage('initialize', { config }, onProgress);
      console.log('✅ EmbeddingGemma model initialized successfully');
      return result;
    } catch (error) {
      console.error('❌ Failed to initialize EmbeddingGemma model:', error);
      throw error;
    }
  }

  // Generate embedding for text
  async generateEmbedding(
    text: string,
    taskPrompt?: string,
    onProgress?: (message: string, progress?: number) => void
  ): Promise<{
    embedding: number[],
    dimensions: number,
    processingTime: number,
    inputText: string
  }> {
    if (!text.trim()) {
      throw new Error('Text cannot be empty');
    }

    try {
      const result = await this.sendMessage(
        'generate-embedding',
        { text, taskPrompt },
        onProgress
      );
      return result;
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error);
      throw error;
    }
  }

  // Get model information and status
  async getModelInfo(): Promise<{
    model: string,
    embeddingDimension: number,
    maxTokens: number,
    quantized: boolean,
    device: string,
    isInitialized: boolean,
    status: string
  }> {
    try {
      const result = await this.sendMessage('get-model-info');
      return result;
    } catch (error) {
      console.error('❌ Failed to get model info:', error);
      throw error;
    }
  }

  // Clear model cache
  async clearCache(): Promise<void> {
    try {
      await this.sendMessage('clear-cache');
      console.log('🗑️ EmbeddingGemma model cache cleared');
    } catch (error) {
      console.error('❌ Failed to clear cache:', error);
      throw error;
    }
  }

  // Process multiple texts with progress tracking
  async processTexts(
    texts: string[],
    taskPrompt?: string,
    onProgress?: (message: string, progress?: number) => void
  ): Promise<Array<{
    text: string,
    embedding: number[],
    dimensions: number,
    processingTime: number
  }>> {
    if (texts.length === 0) {
      return [];
    }

    const results = [];
    const totalTexts = texts.length;

    for (let i = 0; i < totalTexts; i++) {
      const text = texts[i];
      const progressPercent = Math.round((i / totalTexts) * 100);
      
      if (onProgress) {
        onProgress(`Processing text ${i + 1}/${totalTexts}: "${text.substring(0, 50)}..."`, progressPercent);
      }

      try {
        const result = await this.generateEmbedding(text, taskPrompt);
        results.push({
          text,
          embedding: result.embedding,
          dimensions: result.dimensions,
          processingTime: result.processingTime
        });
      } catch (error) {
        console.error(`❌ Failed to process text ${i + 1}:`, error);
        // Continue with other texts
      }
    }

    if (onProgress) {
      onProgress(`Completed processing ${results.length}/${totalTexts} texts`, 100);
    }

    return results;
  }

  // Terminate the worker
  terminate() {
    if (this.worker) {
      // Reject all pending requests
      this.pendingRequests.forEach(request => {
        request.reject(new Error('Web Worker terminated'));
      });
      this.pendingRequests.clear();

      this.worker.terminate();
      this.worker = null;
      this.isWorkerReady = false;
      
      console.log('🔄 EmbeddingGemma Web Worker terminated');
    }
  }

  // Check if worker is ready
  isReady(): boolean {
    return this.isWorkerReady && this.worker !== null;
  }
}

// Singleton instance for global use
let globalWorkerManager: EmbeddingGemmaWorkerManager | null = null;

export function getEmbeddingGemmaWorkerManager(): EmbeddingGemmaWorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new EmbeddingGemmaWorkerManager();
  }
  return globalWorkerManager;
}

export function terminateGlobalWorkerManager() {
  if (globalWorkerManager) {
    globalWorkerManager.terminate();
    globalWorkerManager = null;
  }
}