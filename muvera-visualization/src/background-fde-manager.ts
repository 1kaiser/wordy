// Background FDE Manager - handles Web Worker communication and real FDE processing
import { computeFDESimilarity } from './fde-algorithm.js';

interface FDEResult {
  words: string[];
  vectors: number[][];
  partitions: number[];
  fdeVector: number[];
  processingTime: number;
  processingType: 'query' | 'document';
  config: any;
  metadata: {
    vectorCount: number;
    fdeLength: number;
    avgMagnitude: number;
  };
}

interface SimilarityResult {
  similarity: number;
  queryFDE: number[];
  documentFDE: number[];
}

export class BackgroundFDEManager {
  private worker: Worker | null = null;
  private pendingTasks: Map<string, { resolve: Function; reject: Function }> = new Map();
  private isReady = false;
  private queryResult: FDEResult | null = null;
  private documentResult: FDEResult | null = null;

  constructor() {
    this.initializeWorker();
  }

  private async initializeWorker() {
    try {
      // Create worker from the fde-worker.ts file
      this.worker = new Worker(new URL('./fde-worker.ts', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = (event) => {
        const { type, payload, taskId } = event.data;
        
        if (taskId === 'init' && payload.status === 'ready') {
          this.isReady = true;
          console.log('🔄 Background FDE Worker initialized and ready');
          return;
        }

        const task = this.pendingTasks.get(taskId);
        if (!task) return;

        this.pendingTasks.delete(taskId);

        if (type === 'ERROR') {
          task.reject(new Error(payload.error));
        } else {
          task.resolve(payload);
        }
      };

      this.worker.onerror = (error) => {
        console.error('❌ FDE Worker Error:', error);
      };

    } catch (error) {
      console.error('❌ Failed to initialize FDE Worker:', error);
      this.isReady = false;
    }
  }

  // Send message to worker and return promise
  private sendWorkerMessage(type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.isReady) {
        reject(new Error('FDE Worker not ready'));
        return;
      }

      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.pendingTasks.set(taskId, { resolve, reject });

      this.worker.postMessage({ type, payload, taskId });
    });
  }

  // Process query in background
  async processQueryInBackground(queryText: string): Promise<FDEResult> {
    const result = await this.sendWorkerMessage('PROCESS_QUERY', { text: queryText });
    this.queryResult = result;
    console.log('🔍 Query FDE processed in background:', {
      words: result.words.length,
      processingTime: `${result.processingTime.toFixed(2)}ms`,
      fdeLength: result.fdeVector.length
    });
    return result;
  }

  // Process document in background  
  async processDocumentInBackground(documentText: string): Promise<FDEResult> {
    const result = await this.sendWorkerMessage('PROCESS_DOCUMENT', { text: documentText });
    this.documentResult = result;
    console.log('📄 Document FDE processed in background:', {
      words: result.words.length, 
      processingTime: `${result.processingTime.toFixed(2)}ms`,
      fdeLength: result.fdeVector.length
    });
    return result;
  }

  // Compute similarity between query and document FDEs
  async computeSimilarityInBackground(): Promise<number> {
    if (!this.queryResult || !this.documentResult) {
      throw new Error('Both query and document must be processed first');
    }

    const result = await this.sendWorkerMessage('COMPUTE_SIMILARITY', {
      queryFDE: this.queryResult.fdeVector,
      documentFDE: this.documentResult.fdeVector
    });

    console.log('🎯 FDE Similarity computed:', {
      similarity: result.similarity.toFixed(4),
      queryMagnitude: this.queryResult.metadata.avgMagnitude.toFixed(4),
      docMagnitude: this.documentResult.metadata.avgMagnitude.toFixed(4)
    });

    return result.similarity;
  }

  // Get current query result
  getQueryResult(): FDEResult | null {
    return this.queryResult;
  }

  // Get current document result
  getDocumentResult(): FDEResult | null {
    return this.documentResult;
  }

  // Get processing status
  isWorkerReady(): boolean {
    return this.isReady;
  }

  // Process batch of texts
  async processBatch(texts: string[], isQuery: boolean = false): Promise<any> {
    return await this.sendWorkerMessage('PROCESS_BATCH', { texts, isQuery });
  }

  // Get performance metrics
  getPerformanceMetrics() {
    if (!this.queryResult || !this.documentResult) {
      return null;
    }

    return {
      queryProcessingTime: this.queryResult.processingTime,
      documentProcessingTime: this.documentResult.processingTime,
      totalProcessingTime: this.queryResult.processingTime + this.documentResult.processingTime,
      queryVectorCount: this.queryResult.metadata.vectorCount,
      documentVectorCount: this.documentResult.metadata.vectorCount,
      fdeCompressionRatio: (this.queryResult.vectors.length * this.queryResult.vectors[0].length) / this.queryResult.fdeVector.length
    };
  }

  // Cleanup worker
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingTasks.clear();
    this.isReady = false;
  }
}