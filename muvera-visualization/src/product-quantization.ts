// Product Quantization for FDE compression
// Enables 32x memory reduction with minimal quality loss

export interface ProductQuantizationConfig {
  numSubvectors: number;        // Number of subvectors (e.g., 8)
  codebookSize: number;         // Size of each codebook (e.g., 256)
  seed: number;
}

export const DEFAULT_PQ_CONFIG: ProductQuantizationConfig = {
  numSubvectors: 8,
  codebookSize: 256,
  seed: 42
};

// Quantized FDE representation
export interface QuantizedFDE {
  codes: Uint8Array[];          // Quantization codes for each subvector
  codebooks: number[][][];      // Learned codebooks
  originalDimension: number;
  subvectorDim: number;
  config: ProductQuantizationConfig;
}

// K-means clustering for codebook learning
class KMeans {
  private centroids: number[][];
  private assignments: number[] = [];
  
  constructor(private k: number, private seed: number = 42) {
    this.centroids = [];
  }
  
  private seededRandom(): number {
    // Simple PRNG for reproducibility
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  
  fit(data: number[][], maxIterations: number = 50): number[][] {
    const numPoints = data.length;
    const dimensions = data[0].length;
    
    // Initialize centroids randomly
    this.centroids = [];
    for (let i = 0; i < this.k; i++) {
      const centroid: number[] = [];
      for (let j = 0; j < dimensions; j++) {
        centroid.push(this.seededRandom() * 2 - 1); // Random [-1, 1]
      }
      this.centroids.push(centroid);
    }
    
    let converged = false;
    let iteration = 0;
    
    while (!converged && iteration < maxIterations) {
      const newAssignments = new Array(numPoints);
      
      // Assign points to nearest centroids
      for (let i = 0; i < numPoints; i++) {
        let minDistance = Infinity;
        let bestCentroid = 0;
        
        for (let j = 0; j < this.k; j++) {
          const distance = this.euclideanDistance(data[i], this.centroids[j]);
          if (distance < minDistance) {
            minDistance = distance;
            bestCentroid = j;
          }
        }
        
        newAssignments[i] = bestCentroid;
      }
      
      // Check for convergence
      converged = this.assignments.length === numPoints && 
                 this.assignments.every((val, idx) => val === newAssignments[idx]);
      
      this.assignments = newAssignments;
      
      // Update centroids
      const newCentroids: number[][] = [];
      for (let i = 0; i < this.k; i++) {
        const clusterPoints = data.filter((_, idx) => this.assignments[idx] === i);
        
        if (clusterPoints.length === 0) {
          // Keep old centroid if no points assigned
          newCentroids.push([...this.centroids[i]]);
        } else {
          // Compute mean of cluster points
          const centroid = new Array(dimensions).fill(0);
          for (const point of clusterPoints) {
            for (let j = 0; j < dimensions; j++) {
              centroid[j] += point[j];
            }
          }
          for (let j = 0; j < dimensions; j++) {
            centroid[j] /= clusterPoints.length;
          }
          newCentroids.push(centroid);
        }
      }
      
      this.centroids = newCentroids;
      iteration++;
    }
    
    console.log(`K-means converged in ${iteration} iterations`);
    return this.centroids;
  }
  
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }
  
  predict(point: number[]): number {
    let minDistance = Infinity;
    let bestCentroid = 0;
    
    for (let i = 0; i < this.centroids.length; i++) {
      const distance = this.euclideanDistance(point, this.centroids[i]);
      if (distance < minDistance) {
        minDistance = distance;
        bestCentroid = i;
      }
    }
    
    return bestCentroid;
  }
}

// Product Quantization class
export class ProductQuantizer {
  private config: ProductQuantizationConfig;
  private codebooks: number[][][] = [];
  private subvectorDim: number = 0;
  
  constructor(config: ProductQuantizationConfig = DEFAULT_PQ_CONFIG) {
    this.config = config;
  }
  
  // Train codebooks on a batch of FDE vectors
  train(fdeVectors: number[][]): void {
    const numVectors = fdeVectors.length;
    const fdeDimension = fdeVectors[0].length;
    
    // Calculate subvector dimension
    this.subvectorDim = Math.ceil(fdeDimension / this.config.numSubvectors);
    
    console.log(`🔄 Training Product Quantization:
      - Vectors: ${numVectors}
      - Original dimension: ${fdeDimension}
      - Subvectors: ${this.config.numSubvectors}
      - Subvector dimension: ${this.subvectorDim}
      - Codebook size: ${this.config.codebookSize}`);
    
    this.codebooks = [];
    
    // Train one codebook per subvector
    for (let s = 0; s < this.config.numSubvectors; s++) {
      const startDim = s * this.subvectorDim;
      const endDim = Math.min(startDim + this.subvectorDim, fdeDimension);
      
      // Extract subvectors for this subspace
      const subvectors: number[][] = [];
      for (const vector of fdeVectors) {
        const subvector = vector.slice(startDim, endDim);
        // Pad with zeros if needed
        while (subvector.length < this.subvectorDim) {
          subvector.push(0);
        }
        subvectors.push(subvector);
      }
      
      // Train codebook using k-means
      const kmeans = new KMeans(this.config.codebookSize, this.config.seed + s);
      const codebook = kmeans.fit(subvectors);
      this.codebooks.push(codebook);
      
      console.log(`📚 Trained codebook ${s + 1}/${this.config.numSubvectors}`);
    }
    
    console.log(`✅ Product Quantization training complete!`);
  }
  
  // Encode FDE vector using trained codebooks
  encode(fdeVector: number[]): Uint8Array[] {
    if (this.codebooks.length === 0) {
      throw new Error('Codebooks not trained yet. Call train() first.');
    }
    
    const codes: Uint8Array[] = [];
    
    for (let s = 0; s < this.config.numSubvectors; s++) {
      const startDim = s * this.subvectorDim;
      const endDim = Math.min(startDim + this.subvectorDim, fdeVector.length);
      
      // Extract subvector
      let subvector = fdeVector.slice(startDim, endDim);
      // Pad with zeros if needed
      while (subvector.length < this.subvectorDim) {
        subvector.push(0);
      }
      
      // Find nearest centroid
      let minDistance = Infinity;
      let bestCode = 0;
      
      for (let c = 0; c < this.config.codebookSize; c++) {
        const centroid = this.codebooks[s][c];
        let distance = 0;
        for (let i = 0; i < subvector.length; i++) {
          distance += (subvector[i] - centroid[i]) ** 2;
        }
        
        if (distance < minDistance) {
          minDistance = distance;
          bestCode = c;
        }
      }
      
      codes.push(new Uint8Array([bestCode]));
    }
    
    return codes;
  }
  
  // Decode quantized codes back to approximate FDE vector
  decode(codes: Uint8Array[]): number[] {
    if (this.codebooks.length === 0) {
      throw new Error('Codebooks not trained yet.');
    }
    
    const decodedVector: number[] = [];
    
    for (let s = 0; s < this.config.numSubvectors; s++) {
      const code = codes[s][0];
      const centroid = this.codebooks[s][code];
      decodedVector.push(...centroid);
    }
    
    return decodedVector;
  }
  
  // Encode multiple FDE vectors
  encodeBatch(fdeVectors: number[][]): QuantizedFDE {
    const allCodes: Uint8Array[] = [];
    
    for (const vector of fdeVectors) {
      const codes = this.encode(vector);
      allCodes.push(...codes);
    }
    
    return {
      codes: allCodes,
      codebooks: this.codebooks,
      originalDimension: fdeVectors[0].length,
      subvectorDim: this.subvectorDim,
      config: this.config
    };
  }
  
  // Compute similarity between query FDE and quantized document FDE
  static computeQuantizedSimilarity(
    queryFDE: number[], 
    quantizedDoc: QuantizedFDE,
    docIndex: number
  ): number {
    // Decode the document FDE
    const docCodes = quantizedDoc.codes.slice(
      docIndex * quantizedDoc.config.numSubvectors,
      (docIndex + 1) * quantizedDoc.config.numSubvectors
    );
    
    const decodedDoc: number[] = [];
    for (let s = 0; s < quantizedDoc.config.numSubvectors; s++) {
      const code = docCodes[s][0];
      const centroid = quantizedDoc.codebooks[s][code];
      decodedDoc.push(...centroid);
    }
    
    // Truncate to match original dimension
    const truncatedDoc = decodedDoc.slice(0, quantizedDoc.originalDimension);
    
    // Compute dot product similarity
    let similarity = 0;
    for (let i = 0; i < Math.min(queryFDE.length, truncatedDoc.length); i++) {
      similarity += queryFDE[i] * truncatedDoc[i];
    }
    
    return similarity;
  }
  
  // Get compression statistics
  getCompressionStats(originalDimension: number): any {
    const originalBytes = originalDimension * 4; // 32-bit floats
    const compressedBytes = this.config.numSubvectors * 1; // 8-bit codes
    const codebookBytes = this.config.numSubvectors * this.config.codebookSize * this.subvectorDim * 4;
    
    return {
      originalBytes,
      compressedBytes,
      codebookBytes,
      compressionRatio: originalBytes / compressedBytes,
      totalReduction: originalBytes / (compressedBytes + codebookBytes),
      memoryReduction: `${((1 - (compressedBytes + codebookBytes) / originalBytes) * 100).toFixed(1)}%`
    };
  }
}

// Utility function to apply product quantization to FDE batch
export function quantizeFDEBatch(
  fdeVectors: number[][], 
  config: ProductQuantizationConfig = DEFAULT_PQ_CONFIG
): { quantized: QuantizedFDE, stats: any } {
  const pq = new ProductQuantizer(config);
  
  // Train on the data
  pq.train(fdeVectors);
  
  // Encode all vectors
  const quantized = pq.encodeBatch(fdeVectors);
  
  // Get compression statistics
  const stats = pq.getCompressionStats(fdeVectors[0].length);
  
  console.log(`📊 Product Quantization Results:
    - Original size: ${stats.originalBytes} bytes per vector
    - Compressed size: ${stats.compressedBytes} bytes per vector  
    - Compression ratio: ${stats.compressionRatio.toFixed(1)}x
    - Memory reduction: ${stats.memoryReduction}`);
  
  return { quantized, stats };
}