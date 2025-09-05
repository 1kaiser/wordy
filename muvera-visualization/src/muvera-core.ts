/**
 * MuVeRa (Multi-Vector Retrieval via Fixed Dimensional Encodings) Core Implementation
 * 
 * Browser-optimized TypeScript implementation based on:
 * - https://arxiv.org/abs/2405.19504 (Google Research paper)
 * - https://github.com/sionic-ai/muvera-py (Python implementation)
 * - https://github.com/google/graph-mining/tree/main/sketching/point_cloud (Google C++ implementation)
 * 
 * Key Specializations for Browser Environment:
 * 1. TypedArrays for efficient numeric computations
 * 2. Web Workers compatible for background processing
 * 3. Memory-conscious implementations for large document collections
 * 4. Real-time visualization support for educational purposes
 */

// Configuration enums and interfaces
export enum EncodingType {
  DEFAULT_SUM = 'default_sum',    // For queries: sum vectors in partitions
  AVERAGE = 'average'             // For documents: average vectors in partitions
}

export enum ProjectionType {
  DEFAULT_IDENTITY = 'default_identity',  // No dimensionality reduction
  AMS_SKETCH = 'ams_sketch'               // Sketch-based reduction
}

export interface FixedDimensionalEncodingConfig {
  dimension: number;                // Original vector dimension (default: 128)
  num_repetitions: number;          // Independent runs for robustness (default: 10)
  num_simhash_projections: number;  // Partition granularity (default: 6)
  seed: number;                     // Random seed for reproducibility (default: 42)
  encoding_type: EncodingType;      // Sum vs Average aggregation
  projection_type: ProjectionType;  // Dimensionality reduction method
  projection_dimension?: number;    // Target dimension for AMS sketch (optional)
}

export interface MultiVector {
  vectors: Float32Array[];          // Array of token vectors
  metadata?: any;                   // Optional metadata (token strings, positions, etc.)
}

export interface FixedDimensionalEncoding {
  fde: Float32Array;               // The compressed single vector
  config: FixedDimensionalEncodingConfig;
  metadata?: any;
}

/**
 * Random number generator with seed for reproducible results
 * Essential for consistent partitioning across query and document processing
 */
class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  // Linear Congruential Generator for reproducible randomness
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 2**32;
    return this.seed / 2**32;
  }
  
  // Box-Muller transform for Gaussian distribution (needed for SimHash)
  gaussian(): number {
    const u = 0.01 + this.next() * 0.98; // Avoid 0 and 1
    const v = this.next();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}

/**
 * Core MuVeRa Implementation
 * Handles the conversion of multi-vector representations to Fixed Dimensional Encodings
 */
export class MuVeRaCore {
  private config: FixedDimensionalEncodingConfig;
  private simhashMatrices: Float32Array[] = [];
  private amsProjectionMatrix?: Float32Array;
  private rng: SeededRandom;
  
  constructor(config: Partial<FixedDimensionalEncodingConfig> = {}) {
    // Default configuration optimized for browser performance
    this.config = {
      dimension: 128,
      num_repetitions: 10,
      num_simhash_projections: 6,  // Creates 2^6 = 64 partitions
      seed: 42,
      encoding_type: EncodingType.DEFAULT_SUM,
      projection_type: ProjectionType.DEFAULT_IDENTITY,
      ...config
    };
    
    this.rng = new SeededRandom(this.config.seed);
    this.initializeProjections();
  }
  
  /**
   * Initialize SimHash projection matrices and AMS sketching if needed
   * Called once during construction for efficiency
   */
  private initializeProjections(): void {
    console.log('🔧 Initializing MuVeRa projections...');
    
    // Generate SimHash projection matrices (Gaussian random)
    for (let rep = 0; rep < this.config.num_repetitions; rep++) {
      const matrix = new Float32Array(this.config.dimension * this.config.num_simhash_projections);
      
      for (let i = 0; i < matrix.length; i++) {
        matrix[i] = this.rng.gaussian();
      }
      
      this.simhashMatrices.push(matrix);
    }
    
    // Initialize AMS projection if needed
    if (this.config.projection_type === ProjectionType.AMS_SKETCH) {
      this.initializeAMSProjection();
    }
    
    console.log(`✅ Initialized ${this.config.num_repetitions} SimHash matrices`);
  }
  
  /**
   * Initialize AMS sketch projection matrix
   * Sparse random matrix with one non-zero per row for dimensionality reduction
   */
  private initializeAMSProjection(): void {
    if (!this.config.projection_dimension) {
      throw new Error('AMS sketch requires projection_dimension to be specified');
    }
    
    const fdeSize = this.getFDESize();
    const projSize = this.config.projection_dimension;
    
    this.amsProjectionMatrix = new Float32Array(projSize * fdeSize);
    
    // Sparse projection: one random ±1 per row
    for (let row = 0; row < projSize; row++) {
      const col = Math.floor(this.rng.next() * fdeSize);
      const sign = this.rng.next() > 0.5 ? 1 : -1;
      this.amsProjectionMatrix[row * fdeSize + col] = sign;
    }
    
    console.log(`✅ Initialized AMS projection: ${fdeSize} → ${projSize} dimensions`);
  }
  
  /**
   * Calculate FDE output size based on configuration
   * Size = num_partitions * dimension * num_repetitions
   */
  private getFDESize(): number {
    const numPartitions = 2 ** this.config.num_simhash_projections;
    return numPartitions * this.config.dimension * this.config.num_repetitions;
  }
  
  /**
   * Generate SimHash partition index using Gray code
   * Maps a vector to a partition ID based on hyperplane cuts
   */
  private getPartitionIndex(vector: Float32Array, repetition: number): number {
    const matrix = this.simhashMatrices[repetition];
    const projections = new Float32Array(this.config.num_simhash_projections);
    
    // Compute dot product with each projection vector
    for (let proj = 0; proj < this.config.num_simhash_projections; proj++) {
      let dotProduct = 0;
      for (let d = 0; d < this.config.dimension; d++) {
        dotProduct += vector[d] * matrix[proj * this.config.dimension + d];
      }
      projections[proj] = dotProduct;
    }
    
    // Convert to binary using sign and then to Gray code
    let binaryCode = 0;
    for (let i = 0; i < this.config.num_simhash_projections; i++) {
      if (projections[i] > 0) {
        binaryCode |= (1 << i);
      }
    }
    
    // Convert binary to Gray code for better partition distribution
    return binaryCode ^ (binaryCode >> 1);
  }
  
  /**
   * Generate Fixed Dimensional Encoding for a multi-vector
   * Core algorithm that compresses multiple vectors into a single FDE
   */
  public generateFDE(
    multiVector: MultiVector, 
    encodingType: EncodingType = this.config.encoding_type
  ): FixedDimensionalEncoding {
    console.log(`🎯 Generating FDE for ${multiVector.vectors.length} vectors...`);
    
    const fdeSize = this.getFDESize();
    const fde = new Float32Array(fdeSize);
    const numPartitions = 2 ** this.config.num_simhash_projections;
    
    // Process each repetition independently
    for (let rep = 0; rep < this.config.num_repetitions; rep++) {
      const repOffset = rep * numPartitions * this.config.dimension;
      
      // Count vectors per partition for averaging
      const partitionCounts = new Int32Array(numPartitions);
      
      // Accumulate vectors by partition
      for (const vector of multiVector.vectors) {
        if (vector.length !== this.config.dimension) {
          throw new Error(`Vector dimension mismatch: expected ${this.config.dimension}, got ${vector.length}`);
        }
        
        const partitionId = this.getPartitionIndex(vector, rep);
        const partitionOffset = repOffset + partitionId * this.config.dimension;
        
        partitionCounts[partitionId]++;
        
        // Accumulate vector components into the partition
        for (let d = 0; d < this.config.dimension; d++) {
          fde[partitionOffset + d] += vector[d];
        }
      }
      
      // Apply encoding type (sum vs average)
      if (encodingType === EncodingType.AVERAGE) {
        for (let partition = 0; partition < numPartitions; partition++) {
          const count = partitionCounts[partition];
          if (count > 0) {
            const partitionOffset = repOffset + partition * this.config.dimension;
            for (let d = 0; d < this.config.dimension; d++) {
              fde[partitionOffset + d] /= count;
            }
          }
        }
      }
      // For DEFAULT_SUM, no normalization needed (already accumulated)
    }
    
    // Apply AMS projection if configured
    let finalFDE = fde;
    if (this.config.projection_type === ProjectionType.AMS_SKETCH && this.amsProjectionMatrix) {
      finalFDE = this.applyAMSProjection(fde);
    }
    
    console.log(`✅ Generated FDE: ${multiVector.vectors.length} vectors → ${finalFDE.length} dimensions`);
    
    return {
      fde: finalFDE,
      config: { ...this.config },
      metadata: multiVector.metadata
    };
  }
  
  /**
   * Apply AMS sketch projection for dimensionality reduction
   */
  private applyAMSProjection(fde: Float32Array): Float32Array {
    if (!this.amsProjectionMatrix || !this.config.projection_dimension) {
      throw new Error('AMS projection not initialized');
    }
    
    const projectedFDE = new Float32Array(this.config.projection_dimension);
    const fdeSize = fde.length;
    
    // Matrix multiplication: projected = projection * fde
    for (let row = 0; row < this.config.projection_dimension; row++) {
      let sum = 0;
      for (let col = 0; col < fdeSize; col++) {
        sum += this.amsProjectionMatrix[row * fdeSize + col] * fde[col];
      }
      projectedFDE[row] = sum;
    }
    
    return projectedFDE;
  }
  
  /**
   * Generate query FDE (uses sum aggregation by default)
   */
  public generateQueryFDE(multiVector: MultiVector): FixedDimensionalEncoding {
    return this.generateFDE(multiVector, EncodingType.DEFAULT_SUM);
  }
  
  /**
   * Generate document FDE (uses average aggregation by default)
   */
  public generateDocumentFDE(multiVector: MultiVector): FixedDimensionalEncoding {
    return this.generateFDE(multiVector, EncodingType.AVERAGE);
  }
  
  /**
   * Compute similarity between two FDEs using dot product
   * This approximates the original multi-vector Chamfer similarity
   */
  public static computeSimilarity(fde1: FixedDimensionalEncoding, fde2: FixedDimensionalEncoding): number {
    if (fde1.fde.length !== fde2.fde.length) {
      throw new Error('FDE dimension mismatch');
    }
    
    let dotProduct = 0;
    for (let i = 0; i < fde1.fde.length; i++) {
      dotProduct += fde1.fde[i] * fde2.fde[i];
    }
    
    return dotProduct;
  }
  
  /**
   * Batch process multiple multi-vectors into FDEs
   * Optimized for browser performance with progress callbacks
   */
  public async batchGenerateFDEs(
    multiVectors: MultiVector[],
    encodingType: EncodingType = this.config.encoding_type,
    progressCallback?: (progress: number) => void
  ): Promise<FixedDimensionalEncoding[]> {
    const results: FixedDimensionalEncoding[] = [];
    
    for (let i = 0; i < multiVectors.length; i++) {
      results.push(this.generateFDE(multiVectors[i], encodingType));
      
      // Yield to browser event loop periodically
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      if (progressCallback) {
        progressCallback((i + 1) / multiVectors.length);
      }
    }
    
    return results;
  }
  
  /**
   * Get configuration details for debugging and analysis
   */
  public getConfig(): FixedDimensionalEncodingConfig {
    return { ...this.config };
  }
  
  /**
   * Get compression statistics
   */
  public getCompressionStats(originalVectorCount: number): {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    memoryReduction: string;
  } {
    const originalSize = originalVectorCount * this.config.dimension;
    const compressedSize = this.config.projection_type === ProjectionType.AMS_SKETCH && this.config.projection_dimension
      ? this.config.projection_dimension
      : this.getFDESize();
    
    const compressionRatio = originalSize / compressedSize;
    const memoryReduction = `${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`;
    
    return {
      originalSize,
      compressedSize,
      compressionRatio,
      memoryReduction
    };
  }
}

/**
 * Browser-specific utilities for MuVeRa
 */
export class MuVeRaBrowserUtils {
  /**
   * Convert text tokens to multi-vector using a simple embedding function
   * For demo purposes - in practice, use proper embedding models
   */
  static async textToMultiVector(
    text: string,
    dimension: number = 128,
    embeddingFn?: (token: string) => Promise<Float32Array>
  ): Promise<MultiVector> {
    const tokens = text.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const vectors: Float32Array[] = [];
    
    for (const token of tokens) {
      let vector: Float32Array;
      
      if (embeddingFn) {
        vector = await embeddingFn(token);
      } else {
        // Simple hash-based embedding for demo
        vector = this.hashTokenToVector(token, dimension);
      }
      
      vectors.push(vector);
    }
    
    return {
      vectors,
      metadata: { originalText: text, tokens }
    };
  }
  
  /**
   * Simple deterministic hash-based embedding for demo purposes
   */
  private static hashTokenToVector(token: string, dimension: number): Float32Array {
    const vector = new Float32Array(dimension);
    let hash = 0;
    
    // Simple string hash
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) & 0x7fffffff;
    }
    
    // Use hash as seed for reproducible "embedding"
    const rng = new SeededRandom(hash);
    for (let i = 0; i < dimension; i++) {
      vector[i] = rng.gaussian();
    }
    
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < dimension; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] /= norm;
      }
    }
    
    return vector;
  }
  
  /**
   * Export FDEs to JSON for storage/transmission
   */
  static exportFDEs(fdes: FixedDimensionalEncoding[]): string {
    return JSON.stringify(fdes.map(fde => ({
      fde: Array.from(fde.fde),
      config: fde.config,
      metadata: fde.metadata
    })));
  }
  
  /**
   * Import FDEs from JSON
   */
  static importFDEs(json: string): FixedDimensionalEncoding[] {
    const data = JSON.parse(json);
    return data.map((item: any) => ({
      fde: new Float32Array(item.fde),
      config: item.config,
      metadata: item.metadata
    }));
  }
}

// Export default configuration for common use cases
export const DEFAULT_MUVERA_CONFIG: FixedDimensionalEncodingConfig = {
  dimension: 128,
  num_repetitions: 10,
  num_simhash_projections: 6,
  seed: 42,
  encoding_type: EncodingType.DEFAULT_SUM,
  projection_type: ProjectionType.DEFAULT_IDENTITY
};

export const BROWSER_OPTIMIZED_CONFIG: FixedDimensionalEncodingConfig = {
  dimension: 64,          // Smaller for browser memory constraints
  num_repetitions: 5,     // Fewer repetitions for faster processing
  num_simhash_projections: 4, // 16 partitions vs 64
  seed: 42,
  encoding_type: EncodingType.DEFAULT_SUM,
  projection_type: ProjectionType.AMS_SKETCH,
  projection_dimension: 256  // Aggressive compression
};