// Enhanced FDE Algorithm - Ported from Python implementation
// Includes batch processing, multiple repetitions, and optimized operations

export enum EncodingType {
  DEFAULT_SUM = 0,
  AVERAGE = 1
}

export enum ProjectionType {
  DEFAULT_IDENTITY = 0,
  AMS_SKETCH = 1
}

export interface EnhancedFDEConfig {
  dimension: number;
  numRepetitions: number;
  numSimhashProjections: number;
  seed: number;
  encodingType: EncodingType;
  projectionType: ProjectionType;
  projectionDimension?: number;
  fillEmptyPartitions: boolean;
  finalProjectionDimension?: number;
}

export const DEFAULT_ENHANCED_FDE_CONFIG: EnhancedFDEConfig = {
  dimension: 64,  // Updated for browser optimization
  numRepetitions: 5,  // Reduced for performance
  numSimhashProjections: 4,  // 2^4 = 16 partitions
  seed: 42,
  encodingType: EncodingType.DEFAULT_SUM,
  projectionType: ProjectionType.DEFAULT_IDENTITY,
  fillEmptyPartitions: false
};

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  normal(mean: number = 0, std: number = 1): number {
    // Box-Muller transformation
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * std + mean;
  }

  randint(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  choice(options: number[]): number {
    const index = Math.floor(this.next() * options.length);
    return options[index];
  }
}

// Gray code operations
function appendToGrayCode(grayCode: number, bit: boolean): number {
  return (grayCode << 1) + (Number(bit) ^ (grayCode & 1));
}

function grayCodeToBinary(num: number): number {
  let mask = num >> 1;
  while (mask !== 0) {
    num = num ^ mask;
    mask >>= 1;
  }
  return num;
}

// Generate SimHash matrix using Gaussian random projections
function simHashMatrixFromSeed(dimension: number, numProjections: number, seed: number): number[][] {
  const rng = new SeededRandom(seed);
  const matrix: number[][] = [];
  
  for (let i = 0; i < dimension; i++) {
    matrix[i] = [];
    for (let j = 0; j < numProjections; j++) {
      matrix[i][j] = rng.normal(0, 1);
    }
  }
  
  return matrix;
}

// Generate AMS Sketch projection matrix
function amsProjectionMatrixFromSeed(dimension: number, projectionDim: number, seed: number): number[][] {
  const rng = new SeededRandom(seed);
  const matrix: number[][] = [];
  
  for (let i = 0; i < dimension; i++) {
    matrix[i] = new Array(projectionDim).fill(0);
    const index = rng.randint(0, projectionDim);
    const sign = rng.choice([-1, 1]);
    matrix[i][index] = sign;
  }
  
  return matrix;
}

// Calculate partition index using SimHash and Gray Code
function simHashPartitionIndexGray(sketchVector: number[]): number {
  let partitionIndex = 0;
  for (const val of sketchVector) {
    partitionIndex = appendToGrayCode(partitionIndex, val > 0);
  }
  return partitionIndex;
}

// Matrix-vector multiplication
function matrixVectorMultiply(matrix: number[][], vector: number[]): number[] {
  const result = new Array(matrix[0].length).fill(0);
  for (let i = 0; i < vector.length; i++) {
    for (let j = 0; j < matrix[0].length; j++) {
      result[j] += matrix[i][j] * vector[i];
    }
  }
  return result;
}

// Matrix multiplication (for batch processing)
function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < A.length; i++) {
    result[i] = [];
    for (let j = 0; j < B[0].length; j++) {
      result[i][j] = 0;
      for (let k = 0; k < B.length; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

// Core internal FDE generation
export function generateFDEInternal(pointCloud: number[][], config: EnhancedFDEConfig): number[] {
  const numPoints = pointCloud.length;
  const originalDim = pointCloud[0].length;
  
  // Validate input
  if (originalDim !== config.dimension) {
    throw new Error(`Input dimension ${originalDim} doesn't match config dimension ${config.dimension}`);
  }
  
  if (config.numSimhashProjections < 0 || config.numSimhashProjections >= 32) {
    throw new Error(`numSimhashProjections must be between 0 and 31, got ${config.numSimhashProjections}`);
  }
  
  const numPartitions = Math.pow(2, config.numSimhashProjections);
  const useIdentityProj = config.projectionType === ProjectionType.DEFAULT_IDENTITY;
  const projectionDim = useIdentityProj ? originalDim : (config.projectionDimension || originalDim);
  
  const finalFdeDim = config.numRepetitions * numPartitions * projectionDim;
  const outFde = new Array(finalFdeDim).fill(0);
  
  console.log(`🔄 Generating FDE: ${numPoints} points, ${config.numRepetitions} repetitions, ${numPartitions} partitions`);
  
  for (let repNum = 0; repNum < config.numRepetitions; repNum++) {
    const currentSeed = config.seed + repNum;
    
    // Generate SimHash projection matrix
    const simHashMatrix = simHashMatrixFromSeed(originalDim, config.numSimhashProjections, currentSeed);
    
    // Calculate sketches for all points
    const sketches: number[][] = [];
    for (const point of pointCloud) {
      sketches.push(matrixVectorMultiply(simHashMatrix, point));
    }
    
    // Determine projected matrix
    let projectedMatrix: number[][];
    if (useIdentityProj) {
      projectedMatrix = pointCloud;
    } else if (config.projectionType === ProjectionType.AMS_SKETCH) {
      const amsMatrix = amsProjectionMatrixFromSeed(originalDim, projectionDim, currentSeed);
      projectedMatrix = [];
      for (const point of pointCloud) {
        projectedMatrix.push(matrixVectorMultiply(amsMatrix, point));
      }
    } else {
      projectedMatrix = pointCloud;
    }
    
    // Initialize partition aggregation
    const repFdeSum = new Array(numPartitions * projectionDim).fill(0);
    const partitionCounts = new Array(numPartitions).fill(0);
    
    // Calculate partition indices and aggregate
    for (let i = 0; i < numPoints; i++) {
      const partitionIndex = simHashPartitionIndexGray(sketches[i]);
      const startIdx = partitionIndex * projectionDim;
      
      for (let j = 0; j < projectionDim; j++) {
        repFdeSum[startIdx + j] += projectedMatrix[i][j];
      }
      partitionCounts[partitionIndex]++;
    }
    
    // Apply encoding type (averaging for documents)
    if (config.encodingType === EncodingType.AVERAGE) {
      for (let i = 0; i < numPartitions; i++) {
        const startIdx = i * projectionDim;
        if (partitionCounts[i] > 0) {
          for (let j = 0; j < projectionDim; j++) {
            repFdeSum[startIdx + j] /= partitionCounts[i];
          }
        }
      }
    }
    
    // Fill empty partitions if requested
    if (config.fillEmptyPartitions) {
      for (let i = 0; i < numPartitions; i++) {
        if (partitionCounts[i] === 0) {
          const startIdx = i * projectionDim;
          for (let j = 0; j < projectionDim; j++) {
            repFdeSum[startIdx + j] = 0.001; // Small non-zero value
          }
        }
      }
    }
    
    // Add this repetition to output
    const repStartIdx = repNum * numPartitions * projectionDim;
    for (let i = 0; i < repFdeSum.length; i++) {
      outFde[repStartIdx + i] = repFdeSum[i];
    }
  }
  
  console.log(`✅ FDE generation complete: output dimension ${outFde.length}`);
  return outFde;
}

// Generate query FDE (uses sum aggregation)
export function generateQueryFDE(pointCloud: number[][], config: EnhancedFDEConfig): number[] {
  const queryConfig = { ...config, encodingType: EncodingType.DEFAULT_SUM };
  return generateFDEInternal(pointCloud, queryConfig);
}

// Generate document FDE (uses average aggregation)
export function generateDocumentFDE(pointCloud: number[][], config: EnhancedFDEConfig): number[] {
  const docConfig = { ...config, encodingType: EncodingType.AVERAGE };
  return generateFDEInternal(pointCloud, docConfig);
}

// Batch processing for multiple documents
export function generateDocumentFDEBatch(
  docEmbeddingsList: number[][][], 
  config: EnhancedFDEConfig,
  onProgress?: (completed: number, total: number) => void
): number[][] {
  const startTime = performance.now();
  const numDocs = docEmbeddingsList.length;
  
  console.log(`🔄 Starting batch FDE generation for ${numDocs} documents`);
  
  // Validate documents
  const validDocs = docEmbeddingsList.filter((doc, i) => {
    if (doc.length === 0) {
      console.warn(`Document ${i} has no vectors, skipping`);
      return false;
    }
    if (doc[0].length !== config.dimension) {
      throw new Error(`Document ${i} has incorrect dimension: expected ${config.dimension}, got ${doc[0].length}`);
    }
    return true;
  });
  
  if (validDocs.length === 0) {
    console.warn('No valid documents after filtering');
    return [];
  }
  
  const results: number[][] = [];
  
  for (let i = 0; i < validDocs.length; i++) {
    const docFde = generateDocumentFDE(validDocs[i], config);
    results.push(docFde);
    
    if (onProgress) {
      onProgress(i + 1, validDocs.length);
    }
    
    if (i % 10 === 0) {
      console.log(`📊 Batch progress: ${i + 1}/${validDocs.length} documents processed`);
    }
  }
  
  const totalTime = performance.now() - startTime;
  console.log(`✅ Batch generation complete: ${results.length} documents in ${totalTime.toFixed(2)}ms`);
  console.log(`📊 Average time per document: ${(totalTime / results.length).toFixed(2)}ms`);
  
  return results;
}

// Similarity computation using dot product
export function computeFDESimilarity(queryFDE: number[], documentFDE: number[]): number {
  if (queryFDE.length !== documentFDE.length) {
    throw new Error('FDE vectors must have same dimension for similarity computation');
  }
  
  let similarity = 0;
  for (let i = 0; i < queryFDE.length; i++) {
    similarity += queryFDE[i] * documentFDE[i];
  }
  
  return similarity;
}

// Compute similarities between a query and multiple documents
export function computeBatchSimilarities(queryFDE: number[], documentFDEs: number[][]): number[] {
  return documentFDEs.map(docFDE => computeFDESimilarity(queryFDE, docFDE));
}

// Performance profiling utility
export function profileFDEGeneration(
  pointClouds: number[][][], 
  config: EnhancedFDEConfig
): { results: number[][], timing: any } {
  const timings: any = {
    total: 0,
    perDocument: [],
    average: 0,
    throughput: 0
  };
  
  const startTime = performance.now();
  const results = generateDocumentFDEBatch(pointClouds, config, (completed, total) => {
    const elapsed = performance.now() - startTime;
    const avgTime = elapsed / completed;
    timings.perDocument.push(avgTime);
    console.log(`📊 Progress: ${completed}/${total}, avg: ${avgTime.toFixed(2)}ms/doc`);
  });
  
  timings.total = performance.now() - startTime;
  timings.average = timings.total / pointClouds.length;
  timings.throughput = 1000 / timings.average; // docs per second
  
  console.log(`📊 FDE Generation Profile:
    Total time: ${timings.total.toFixed(2)}ms
    Average per doc: ${timings.average.toFixed(2)}ms
    Throughput: ${timings.throughput.toFixed(1)} docs/sec
  `);
  
  return { results, timing: timings };
}