// EmbeddingGemma-based text vectorization using Transformers.js
// Replaces hash-based embeddings with state-of-the-art semantic understanding

import { pipeline, Pipeline } from '@xenova/transformers';
import { generateQueryFDE, generateDocumentFDE, DEFAULT_FDE_CONFIG } from './fde-algorithm.js';

interface EmbeddingGemmaConfig {
  model: string;
  embeddingDimension: number;
  maxTokens: number;
  quantized: boolean;
  device: 'cpu' | 'gpu';
}

const DEFAULT_EMBEDDINGGEMMA_CONFIG: EmbeddingGemmaConfig = {
  model: 'Xenova/bge-small-en-v1.5', // Using BGE as EmbeddingGemma ONNX not yet available
  embeddingDimension: 384, // BGE small dimension
  maxTokens: 512,
  quantized: true,
  device: 'cpu'
};

// Cache for loaded pipeline
let cachedPipeline: Pipeline | null = null;
let isLoading = false;

export class EmbeddingGemmaVectorizer {
  private config: EmbeddingGemmaConfig;
  private pipeline: Pipeline | null = null;
  private fdeConfig: any;

  constructor(config: Partial<EmbeddingGemmaConfig> = {}) {
    this.config = { ...DEFAULT_EMBEDDINGGEMMA_CONFIG, ...config };
    this.fdeConfig = {
      ...DEFAULT_FDE_CONFIG,
      dimension: this.config.embeddingDimension
    };
  }

  // Initialize the embedding model
  async initialize(): Promise<void> {
    if (cachedPipeline) {
      this.pipeline = cachedPipeline;
      return;
    }

    if (isLoading) {
      // Wait for existing loading to complete
      while (isLoading && !cachedPipeline) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.pipeline = cachedPipeline;
      return;
    }

    isLoading = true;
    console.log('🔄 Loading EmbeddingGemma model...');
    const startTime = performance.now();

    try {
      // Load pipeline with feature extraction task
      this.pipeline = await pipeline(
        'feature-extraction',
        this.config.model,
        {
          quantized: this.config.quantized,
          device: this.config.device,
          revision: 'main'
        }
      );

      cachedPipeline = this.pipeline;
      const loadTime = performance.now() - startTime;
      console.log(`✅ EmbeddingGemma model loaded in ${loadTime.toFixed(2)}ms`);
      console.log(`📊 Model: ${this.config.model}`);
      console.log(`📏 Embedding dimension: ${this.config.embeddingDimension}`);
      console.log(`💾 Quantized: ${this.config.quantized}`);
      
    } catch (error) {
      console.error('❌ Failed to load EmbeddingGemma model:', error);
      throw new Error(`EmbeddingGemma initialization failed: ${error}`);
    } finally {
      isLoading = false;
    }
  }

  // Generate embedding for a single text
  async generateEmbedding(text: string, taskPrompt?: string): Promise<number[]> {
    if (!this.pipeline) {
      await this.initialize();
    }

    if (!this.pipeline) {
      throw new Error('EmbeddingGemma pipeline not initialized');
    }

    try {
      // Prepare text with task prompt if provided
      const inputText = taskPrompt ? `${taskPrompt}: ${text}` : text;
      
      // Truncate if too long
      const truncatedText = inputText.length > this.config.maxTokens * 4 
        ? inputText.substring(0, this.config.maxTokens * 4)
        : inputText;

      // Generate embedding
      const result = await this.pipeline(truncatedText, { 
        pooling: 'mean',
        normalize: true 
      });

      // Extract embedding array
      let embedding: number[];
      if (Array.isArray(result) && result[0]?.data) {
        embedding = Array.from(result[0].data);
      } else if (result?.data) {
        embedding = Array.from(result.data);
      } else if (Array.isArray(result)) {
        embedding = result;
      } else {
        throw new Error('Unexpected embedding format');
      }

      // Validate dimension
      if (embedding.length !== this.config.embeddingDimension) {
        console.warn(`Expected ${this.config.embeddingDimension}D, got ${embedding.length}D embedding`);
        // Truncate or pad if needed
        if (embedding.length > this.config.embeddingDimension) {
          embedding = embedding.slice(0, this.config.embeddingDimension);
        } else {
          while (embedding.length < this.config.embeddingDimension) {
            embedding.push(0);
          }
        }
      }

      return embedding;

    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  // Tokenize text into words and generate embeddings for each
  async textToVectors(text: string, taskPrompt?: string): Promise<{ words: string[], vectors: number[][] }> {
    // Simple word tokenization
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);

    if (words.length === 0) {
      return { words: [], vectors: [] };
    }

    console.log(`🔄 Generating embeddings for ${words.length} words...`);
    const startTime = performance.now();

    try {
      // Generate embeddings for each word
      const vectors = await Promise.all(
        words.map(word => this.generateEmbedding(word, taskPrompt))
      );

      const processingTime = performance.now() - startTime;
      console.log(`✅ Generated ${vectors.length} embeddings in ${processingTime.toFixed(2)}ms`);
      console.log(`📊 Average time per embedding: ${(processingTime / vectors.length).toFixed(2)}ms`);

      return { words, vectors };

    } catch (error) {
      console.error('❌ Text vectorization failed:', error);
      throw error;
    }
  }

  // Process query text with appropriate task prompt
  async processQuery(queryText: string): Promise<{
    words: string[],
    vectors: number[][],
    partitions: number[],
    fdeVector: number[]
  }> {
    console.log('🔍 Processing query with EmbeddingGemma...');
    
    const { words, vectors } = await this.textToVectors(queryText, 'Retrieval-query');
    
    // Generate query FDE
    const fdeVector = generateQueryFDE(vectors, this.fdeConfig);
    
    // Calculate partitions based on embedding vectors
    const partitions = vectors.map((vector, index) => {
      // Use first 3 dimensions to determine partition (1-6 for display)
      const hash = Math.abs(vector[0] + vector[1] + vector[2]);
      return Math.floor(hash * 6) % 6 + 1;
    });

    console.log(`✅ Query processed: ${words.length} words, ${fdeVector.length}D FDE`);
    return { words, vectors, partitions, fdeVector };
  }

  // Process document text with appropriate task prompt
  async processDocument(documentText: string): Promise<{
    words: string[],
    vectors: number[][],
    partitions: number[],
    fdeVector: number[]
  }> {
    console.log('📄 Processing document with EmbeddingGemma...');
    
    const { words, vectors } = await this.textToVectors(documentText, 'Retrieval-document');
    
    // Generate document FDE
    const fdeVector = generateDocumentFDE(vectors, this.fdeConfig);
    
    // Calculate partitions based on embedding vectors
    const partitions = vectors.map((vector, index) => {
      const hash = Math.abs(vector[0] + vector[1] + vector[2]);
      return Math.floor(hash * 6) % 6 + 1;
    });

    console.log(`✅ Document processed: ${words.length} words, ${fdeVector.length}D FDE`);
    return { words, vectors, partitions, fdeVector };
  }

  // Calculate similarity between two FDE vectors
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

  // Get performance metrics
  getModelInfo(): {
    model: string,
    embeddingDimension: number,
    maxTokens: number,
    quantized: boolean,
    device: string,
    isInitialized: boolean
  } {
    return {
      model: this.config.model,
      embeddingDimension: this.config.embeddingDimension,
      maxTokens: this.config.maxTokens,
      quantized: this.config.quantized,
      device: this.config.device,
      isInitialized: this.pipeline !== null
    };
  }

  // Clear cache (useful for testing)
  static clearCache(): void {
    cachedPipeline = null;
    isLoading = false;
  }
}

// Factory function for easy instantiation
export function createEmbeddingGemmaVectorizer(config?: Partial<EmbeddingGemmaConfig>): EmbeddingGemmaVectorizer {
  return new EmbeddingGemmaVectorizer(config);
}

// Performance comparison helper
export async function compareEmbeddingMethods(
  texts: string[],
  hashVectorizer: any,
  gemmaVectorizer: EmbeddingGemmaVectorizer
): Promise<{
  hashResults: any[],
  gemmaResults: any[],
  hashTime: number,
  gemmaTime: number,
  qualityComparison: any
}> {
  console.log('🔄 Comparing embedding methods...');

  // Test hash-based approach
  const hashStartTime = performance.now();
  const hashResults = texts.map(text => hashVectorizer.processQuery ? hashVectorizer.processQuery(text) : null);
  const hashTime = performance.now() - hashStartTime;

  // Test EmbeddingGemma approach
  const gemmaStartTime = performance.now();
  const gemmaResults = await Promise.all(
    texts.map(text => gemmaVectorizer.processQuery(text))
  );
  const gemmaTime = performance.now() - gemmaStartTime;

  const qualityComparison = {
    embeddingDimensions: {
      hash: hashResults[0]?.vectors?.[0]?.length || 'unknown',
      gemma: gemmaResults[0]?.vectors?.[0]?.length || 'unknown'
    },
    processingSpeed: {
      hash: `${(hashTime / texts.length).toFixed(2)}ms per text`,
      gemma: `${(gemmaTime / texts.length).toFixed(2)}ms per text`
    },
    semanticUnderstanding: {
      hash: 'Hash-based approximation',
      gemma: 'True semantic embedding'
    }
  };

  console.log('📊 Embedding method comparison:', qualityComparison);

  return {
    hashResults,
    gemmaResults,
    hashTime,
    gemmaTime,
    qualityComparison
  };
}