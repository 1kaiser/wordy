// Production-ready EmbeddingGemma implementation based on semantic-galaxy
// Includes WebGPU/WASM detection, singleton caching, and adaptive batching

import { env, AutoModel, AutoTokenizer, type PreTrainedModel, type PreTrainedTokenizer, type ProgressInfo } from '@xenova/transformers';

interface EmbeddingGemmaConfig {
  model: string;
  embeddingDimension: number;
  maxTokens: number;
  quantized: boolean;
  device: 'webgpu' | 'wasm' | 'auto';
  batchSize?: number;
}

interface ModelInstance {
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
  device: 'webgpu' | 'wasm';
}

const DEFAULT_EMBEDDINGGEMMA_CONFIG: EmbeddingGemmaConfig = {
  model: 'onnx-community/embeddinggemma-300m-ONNX', // Production EmbeddingGemma model
  embeddingDimension: 768, // Full EmbeddingGemma dimension
  maxTokens: 256, // Optimized for performance
  quantized: true,
  device: 'auto' // Auto-detect WebGPU/WASM
};

// Singleton cache for the model instance and loading promise
const modelCache: {
  instance: ModelInstance | null;
  loadingPromise: Promise<ModelInstance> | null;
} = {
  instance: null,
  loadingPromise: null,
};

// WebGPU availability check
async function checkWebGPUAvailability(): Promise<boolean> {
  try {
    if (!navigator.gpu) return false;
    return !!(await navigator.gpu.requestAdapter());
  } catch (error) {
    console.error('Error checking WebGPU availability:', error);
    return false;
  }
}

export class ProductionEmbeddingGemma {
  private config: EmbeddingGemmaConfig;
  private instance: ModelInstance | null = null;

  constructor(config: Partial<EmbeddingGemmaConfig> = {}) {
    this.config = { ...DEFAULT_EMBEDDINGGEMMA_CONFIG, ...config };
  }

  // Production-ready initialization with singleton caching
  async initialize(progressCallback?: (progress: ProgressInfo) => void): Promise<ModelInstance> {
    if (this.instance) {
      return this.instance;
    }

    if (modelCache.instance) {
      this.instance = modelCache.instance;
      return this.instance;
    }

    if (modelCache.loadingPromise) {
      try {
        const instance = await modelCache.loadingPromise;
        this.instance = instance;
        return instance;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load model';
        console.error('❌ Model loading failed:', errorMessage);
        throw error;
      }
    }

    console.log(`🔄 Loading EmbeddingGemma model: ${this.config.model}`);
    
    const loadingPromise = this.loadModelInstance(progressCallback);
    modelCache.loadingPromise = loadingPromise;
    
    try {
      const instance = await loadingPromise;
      this.instance = instance;
      modelCache.instance = instance;
      modelCache.loadingPromise = null;
      return instance;
    } catch (error) {
      modelCache.loadingPromise = null;
      throw error;
    }
  }

  private async loadModelInstance(progressCallback?: (progress: ProgressInfo) => void): Promise<ModelInstance> {
    const startTime = performance.now();
    
    try {
      // Enhanced progress callback
      const progress_callback = (progress: ProgressInfo) => {
        if (progress.status === 'progress' && progress.file.endsWith('.onnx_data')) {
          const percentage = Math.round((progress.loaded / progress.total) * 100);
          console.log(`📊 Loading model... ${percentage}%`);
        }
        if (progressCallback) {
          progressCallback(progress);
        }
      };

      console.log('📝 Setting up tokenizer...');
      const tokenizer = await AutoTokenizer.from_pretrained(this.config.model);

      console.log('🧠 Loading model...');
      
      // Device detection and optimization
      let device: 'webgpu' | 'wasm';
      if (this.config.device === 'auto') {
        const isWebGPUAvailable = await checkWebGPUAvailability();
        device = isWebGPUAvailable ? 'webgpu' : 'wasm';
        console.log(`🎯 Auto-detected device: ${device}`);
      } else {
        device = this.config.device as 'webgpu' | 'wasm';
      }

      // Configure WASM proxy for non-blocking UI
      if (device === 'wasm') {
        env.backends.onnx.wasm!.proxy = true;
      }

      const model = await AutoModel.from_pretrained(this.config.model, {
        device,
        dtype: 'q4', // Optimal quantization from semantic-galaxy
        model_file_name: device === 'webgpu' ? 'model_no_gather' : 'model',
        progress_callback,
      });

      const instance: ModelInstance = { model, tokenizer, device };
      
      const loadTime = performance.now() - startTime;
      console.log(`✅ EmbeddingGemma model loaded in ${loadTime.toFixed(2)}ms`);
      console.log(`📊 Model: ${this.config.model}`);
      console.log(`🎯 Device: ${device}`);
      console.log(`⚙️ Embedding dimension: ${this.config.embeddingDimension}D`);

      return instance;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load model';
      console.error('❌ Model loading failed:', errorMessage);
      throw error;
    }
  }

  // Generate embeddings with adaptive batching
  async generateEmbeddings(texts: string[], taskType: 'query' | 'document' = 'document'): Promise<number[][]> {
    if (!this.instance) {
      await this.initialize();
    }

    if (!this.instance) {
      throw new Error('EmbeddingGemma model not initialized');
    }

    const startTime = performance.now();
    const embeddings: number[][] = [];
    
    // Adaptive batching based on device
    const batchSize = this.config.batchSize || (this.instance.device === 'webgpu' ? 8 : 1);
    
    console.log(`🔄 Generating embeddings for ${texts.length} texts with batch size ${batchSize}`);

    try {
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const progress = ((i + batch.length) / texts.length) * 100;

        // Apply task prefixes
        const prefixedBatch = batch.map(text => {
          return taskType === 'query' ? `search_query: ${text}` : `search_document: ${text}`;
        });

        const inputs = this.instance.tokenizer(prefixedBatch, {
          padding: true,
          truncation: true,
          max_length: this.config.maxTokens,
        });

        const { sentence_embedding } = await this.instance.model(inputs);
        embeddings.push(...sentence_embedding.tolist());
        
        if (texts.length > 1) {
          console.log(`📊 Progress: ${progress.toFixed(0)}%`);
        }
      }

      const endTime = performance.now();
      const embeddingTime = endTime - startTime;
      console.log(`✅ Generated ${embeddings.length} embeddings in ${embeddingTime.toFixed(2)}ms`);
      console.log(`⚡ Average time per embedding: ${(embeddingTime / embeddings.length).toFixed(2)}ms`);

      // Validate dimensions
      if (embeddings.length > 0) {
        const actualDim = embeddings[0].length;
        if (actualDim !== this.config.embeddingDimension && actualDim < this.config.embeddingDimension) {
          console.log(`📏 Embedding dimension: ${actualDim}D (truncated from ${this.config.embeddingDimension}D)`);
        }
      }

      return embeddings;

    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      throw error;
    }
  }

  // Generate single embedding
  async generateEmbedding(text: string, taskType: 'query' | 'document' = 'document'): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text], taskType);
    return embeddings[0];
  }

  // Get model status and performance info
  getStatus(): any {
    return {
      isInitialized: !!this.instance,
      device: this.instance?.device || 'not_loaded',
      model: this.config.model,
      embeddingDimension: this.config.embeddingDimension,
      maxTokens: this.config.maxTokens,
      quantized: this.config.quantized,
      batchSize: this.config.batchSize || (this.instance?.device === 'webgpu' ? 8 : 1)
    };
  }

  // Clear cache (useful for testing)
  static clearCache(): void {
    modelCache.instance = null;
    modelCache.loadingPromise = null;
  }
}

// Factory function for easy instantiation
export function createProductionEmbeddingGemma(config?: Partial<EmbeddingGemmaConfig>): ProductionEmbeddingGemma {
  return new ProductionEmbeddingGemma(config);
}