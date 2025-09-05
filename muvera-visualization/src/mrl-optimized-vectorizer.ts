// MRL (Matryoshka Representation Learning) Optimized Vectorizer
// Implements dynamic embedding dimensions with performance monitoring

import { EmbeddingGemmaVectorizer, createEmbeddingGemmaVectorizer } from './embedding-gemma-vectorizer.js';
import { getEmbeddingGemmaWorkerManager, EmbeddingGemmaWorkerManager } from './embedding-gemma-worker-manager.js';

export type UseCase = 'speed' | 'balanced' | 'quality';
export type PerformanceMode = 'auto' | 'manual';

export interface MRLConfig {
  dimensions: {
    speed: number;      // e.g., 128
    balanced: number;   // e.g., 256  
    quality: number;    // e.g., 768
  };
  thresholds: {
    shortText: number;   // chars
    mediumText: number;  // chars
    maxLatency: number;  // ms
  };
  performanceMode: PerformanceMode;
  enableCaching: boolean;
}

export const DEFAULT_MRL_CONFIG: MRLConfig = {
  dimensions: {
    speed: 128,
    balanced: 256,
    quality: 384  // Updated to match MiniLM-L6-v2 model (384D)
  },
  thresholds: {
    shortText: 100,
    mediumText: 500,
    maxLatency: 100
  },
  performanceMode: 'auto',
  enableCaching: true
};

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  useCase: UseCase;
  processingTime: number;
  cacheHit: boolean;
}

export interface ProcessingStats {
  totalRequests: number;
  cacheHitRate: number;
  averageLatency: number;
  dimensionDistribution: {[key: number]: number};
  performanceScore: number;
}

// Performance monitoring class
class PerformanceMonitor {
  private measurements: number[] = [];
  private dimensionCounts = new Map<number, number>();
  private cacheHits = 0;
  private totalRequests = 0;

  recordMeasurement(latency: number, dimensions: number, cacheHit: boolean): void {
    this.measurements.push(latency);
    this.dimensionCounts.set(dimensions, (this.dimensionCounts.get(dimensions) || 0) + 1);
    this.totalRequests++;
    if (cacheHit) this.cacheHits++;

    // Keep only recent measurements (sliding window)
    if (this.measurements.length > 100) {
      this.measurements.shift();
    }
  }

  getCurrentLoad(): number {
    if (this.measurements.length < 5) return 0;
    
    const recentMeasurements = this.measurements.slice(-10);
    const avgLatency = recentMeasurements.reduce((a, b) => a + b) / recentMeasurements.length;
    
    // Normalize load score (0-100)
    return Math.min(100, (avgLatency / 500) * 100);
  }

  getStats(): ProcessingStats {
    const avgLatency = this.measurements.length > 0 
      ? this.measurements.reduce((a, b) => a + b) / this.measurements.length 
      : 0;

    const dimensionDistribution: {[key: number]: number} = {};
    this.dimensionCounts.forEach((count, dim) => {
      dimensionDistribution[dim] = count;
    });

    const cacheHitRate = this.totalRequests > 0 ? this.cacheHits / this.totalRequests : 0;
    const performanceScore = Math.max(0, 100 - (avgLatency / 10) - (cacheHitRate < 0.3 ? 20 : 0));

    return {
      totalRequests: this.totalRequests,
      cacheHitRate,
      averageLatency: avgLatency,
      dimensionDistribution,
      performanceScore
    };
  }
}

export class MRLOptimizedVectorizer {
  private baseVectorizer: EmbeddingGemmaVectorizer | null = null;
  private workerManager: EmbeddingGemmaWorkerManager | null = null;
  private config: MRLConfig;
  private embeddingCache = new Map<string, {[dim: number]: number[]}>();
  private performanceMonitor = new PerformanceMonitor();
  private isInitialized = false;
  private useWebWorker: boolean;

  constructor(config: Partial<MRLConfig> & { useWebWorker?: boolean } = {}) {
    this.config = { ...DEFAULT_MRL_CONFIG, ...config };
    this.useWebWorker = config.useWebWorker ?? true; // Default to Web Worker for better performance
  }

  async initialize(onProgress?: (message: string, progress?: number) => void): Promise<void> {
    if (this.isInitialized) return;

    console.log('🔄 Initializing MRL-Optimized Vectorizer...');
    
    try {
      if (this.useWebWorker) {
        console.log('🔧 Using Web Worker for EmbeddingGemma operations');
        this.workerManager = getEmbeddingGemmaWorkerManager();
        
        await this.workerManager.initialize(
          {
            embeddingDimension: this.config.dimensions.quality, // Will be 384 for MiniLM-L6-v2
            maxTokens: 512,
            quantized: true
          },
          onProgress
        );
        
        console.log('✅ MRL-Optimized Vectorizer initialized with Web Worker');
      } else {
        console.log('🔧 Using main thread for EmbeddingGemma operations');
        this.baseVectorizer = createEmbeddingGemmaVectorizer({
          embeddingDimension: this.config.dimensions.quality, // Always use max dimension for base
          maxTokens: 512,
          quantized: true
        });
        
        await this.baseVectorizer.initialize();
        console.log('✅ MRL-Optimized Vectorizer initialized on main thread');
      }
      
      this.isInitialized = true;
      console.log(`📊 Dimensions: ${this.config.dimensions.speed}D (speed) → ${this.config.dimensions.balanced}D (balanced) → ${this.config.dimensions.quality}D (quality)`);
      
    } catch (error) {
      console.error('❌ MRL Vectorizer initialization failed:', error);
      throw error;
    }
  }

  // Dynamic embedding dimension selection based on use case
  async generateOptimizedEmbedding(
    text: string, 
    useCase?: UseCase,
    taskPrompt?: string
  ): Promise<EmbeddingResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.baseVectorizer && !this.workerManager) {
      throw new Error('Neither base vectorizer nor worker manager initialized');
    }

    const startTime = performance.now();
    const cacheKey = `${text}:${taskPrompt || ''}`;
    
    // Determine optimal use case if not specified
    const finalUseCase = useCase || this.determineOptimalUseCase(text);
    const targetDimensions = this.config.dimensions[finalUseCase];

    // Check cache first
    if (this.config.enableCaching && this.embeddingCache.has(cacheKey)) {
      const cachedEmbeddings = this.embeddingCache.get(cacheKey)!;
      if (cachedEmbeddings[targetDimensions]) {
        const processingTime = performance.now() - startTime;
        this.performanceMonitor.recordMeasurement(processingTime, targetDimensions, true);
        
        return {
          embedding: cachedEmbeddings[targetDimensions],
          dimensions: targetDimensions,
          useCase: finalUseCase,
          processingTime,
          cacheHit: true
        };
      }
    }

    try {
      // Generate full-dimension embedding using appropriate method
      let fullEmbedding: number[];
      
      if (this.workerManager) {
        // Use Web Worker for embedding generation
        const result = await this.workerManager.generateEmbedding(text, taskPrompt);
        fullEmbedding = result.embedding;
      } else if (this.baseVectorizer) {
        // Use main thread vectorizer
        fullEmbedding = await this.baseVectorizer.generateEmbedding(text, taskPrompt);
      } else {
        throw new Error('No embedding method available');
      }
      
      // Apply Matryoshka truncation
      const truncatedEmbedding = fullEmbedding.slice(0, targetDimensions);
      
      // Normalize truncated embedding (important for MRL)
      const normalizedEmbedding = this.normalizeEmbedding(truncatedEmbedding);
      
      // Cache the results for different dimensions
      if (this.config.enableCaching) {
        if (!this.embeddingCache.has(cacheKey)) {
          this.embeddingCache.set(cacheKey, {});
        }
        this.embeddingCache.get(cacheKey)![targetDimensions] = normalizedEmbedding;
      }

      const processingTime = performance.now() - startTime;
      this.performanceMonitor.recordMeasurement(processingTime, targetDimensions, false);

      return {
        embedding: normalizedEmbedding,
        dimensions: targetDimensions,
        useCase: finalUseCase,
        processingTime,
        cacheHit: false
      };

    } catch (error) {
      console.error('❌ MRL embedding generation failed:', error);
      throw error;
    }
  }

  // Determine optimal use case based on text characteristics and system load
  private determineOptimalUseCase(text: string): UseCase {
    if (this.config.performanceMode === 'manual') {
      return 'balanced'; // Default for manual mode
    }

    const textLength = text.length;
    const systemLoad = this.performanceMonitor.getCurrentLoad();

    // Auto mode: consider text length and system performance
    if (textLength < this.config.thresholds.shortText && systemLoad > 75) {
      return 'speed';
    } else if (textLength < this.config.thresholds.mediumText && systemLoad > 50) {
      return 'balanced';
    } else if (systemLoad < 25) {
      return 'quality';
    } else {
      return 'balanced';
    }
  }

  // Adaptive processing based on latency budget
  async processBatch(
    texts: string[], 
    maxLatency: number = this.config.thresholds.maxLatency
  ): Promise<EmbeddingResult[]> {
    const estimatedTime = this.estimateProcessingTime(texts.length, this.config.dimensions.quality);
    
    let targetUseCase: UseCase;
    if (estimatedTime <= maxLatency) {
      targetUseCase = 'quality';
    } else if (estimatedTime <= maxLatency * 2) {
      targetUseCase = 'balanced';
    } else {
      targetUseCase = 'speed';
    }

    console.log(`🔄 Batch processing ${texts.length} texts with ${targetUseCase} quality (estimated: ${estimatedTime.toFixed(2)}ms, budget: ${maxLatency}ms)`);

    return Promise.all(
      texts.map(text => this.generateOptimizedEmbedding(text, targetUseCase))
    );
  }

  // Estimate processing time based on text count and target dimensions
  private estimateProcessingTime(textCount: number, dimensions: number): number {
    const stats = this.performanceMonitor.getStats();
    const baseLatency = stats.averageLatency || 50; // Default estimate
    
    // Rough estimate: higher dimensions = more time, more texts = linear scaling
    const dimensionFactor = dimensions / this.config.dimensions.balanced;
    return textCount * baseLatency * dimensionFactor;
  }

  // Normalize embedding vector (L2 normalization)
  private normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return embedding;
    
    return embedding.map(val => val / magnitude);
  }

  // Get performance statistics
  getPerformanceStats(): ProcessingStats {
    return this.performanceMonitor.getStats();
  }

  // Clear cache (useful for memory management)
  clearCache(): void {
    this.embeddingCache.clear();
    console.log('🗑️ MRL embedding cache cleared');
  }

  // Get cache info
  getCacheInfo(): { size: number, keys: string[] } {
    return {
      size: this.embeddingCache.size,
      keys: Array.from(this.embeddingCache.keys()).slice(0, 10) // First 10 keys for debugging
    };
  }

  // Process query with optimal settings
  async processQuery(queryText: string): Promise<{
    words: string[],
    vectors: number[][],
    partitions: number[],
    fdeVector: number[],
    mrlStats: EmbeddingResult[]
  }> {
    console.log('🔍 Processing query with MRL optimization...');
    
    // Tokenize
    const words = queryText.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);

    // Generate optimized embeddings for each word
    const embeddingResults = await Promise.all(
      words.map(word => this.generateOptimizedEmbedding(word, 'balanced', 'Retrieval-query'))
    );

    const vectors = embeddingResults.map(result => result.embedding);
    
    // Calculate partitions (simplified)
    const partitions = vectors.map((vector) => {
      const hash = Math.abs(vector[0] + vector[1] + vector[2]);
      return Math.floor(hash * 6) % 6 + 1;
    });

    // Generate FDE (using full vectors)
    const { generateQueryFDE, DEFAULT_FDE_CONFIG } = await import('./fde-algorithm.js');
    const fdeVector = generateQueryFDE(vectors, {
      ...DEFAULT_FDE_CONFIG,
      dimension: vectors[0].length
    });

    console.log(`✅ Query processed: ${words.length} words, avg ${embeddingResults[0].dimensions}D embeddings`);

    return { words, vectors, partitions, fdeVector, mrlStats: embeddingResults };
  }

  // Process document with optimal settings
  async processDocument(documentText: string): Promise<{
    words: string[],
    vectors: number[][],
    partitions: number[],
    fdeVector: number[],
    mrlStats: EmbeddingResult[]
  }> {
    console.log('📄 Processing document with MRL optimization...');
    
    const words = documentText.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);

    const embeddingResults = await Promise.all(
      words.map(word => this.generateOptimizedEmbedding(word, 'balanced', 'Retrieval-document'))
    );

    const vectors = embeddingResults.map(result => result.embedding);
    
    const partitions = vectors.map((vector) => {
      const hash = Math.abs(vector[0] + vector[1] + vector[2]);
      return Math.floor(hash * 6) % 6 + 1;
    });

    const { generateDocumentFDE, DEFAULT_FDE_CONFIG } = await import('./fde-algorithm.js');
    const fdeVector = generateDocumentFDE(vectors, {
      ...DEFAULT_FDE_CONFIG,
      dimension: vectors[0].length
    });

    console.log(`✅ Document processed: ${words.length} words, avg ${embeddingResults[0].dimensions}D embeddings`);

    return { words, vectors, partitions, fdeVector, mrlStats: embeddingResults };
  }

  // Calculate similarity between FDE vectors
  calculateSimilarity(queryFDE: number[], documentFDE: number[]): number {
    if (queryFDE.length !== documentFDE.length) {
      throw new Error(`FDE dimension mismatch: query=${queryFDE.length}, doc=${documentFDE.length}`);
    }

    let similarity = 0;
    for (let i = 0; i < queryFDE.length; i++) {
      similarity += queryFDE[i] * documentFDE[i];
    }

    return similarity;
  }
}