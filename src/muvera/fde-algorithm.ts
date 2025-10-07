// Fixed Dimensional Encoding (FDE) Algorithm
// Based on muvera-py implementation and Google Research paper
// Reference: https://github.com/sionic-ai/muvera-py

export enum EncodingType {
  DEFAULT_SUM = 0,  // For queries: sum vectors in each partition
  AVERAGE = 1       // For documents: average vectors in each partition
}

export enum ProjectionType {
  DEFAULT_IDENTITY = 0,
  AMS_SKETCH = 1
}

export interface FixedDimensionalEncodingConfig {
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

export const DEFAULT_FDE_CONFIG: FixedDimensionalEncodingConfig = {
  dimension: 64,  // Updated to match BROWSER_OPTIMIZED_CONFIG
  numRepetitions: 5,  // Reduced for browser performance
  numSimhashProjections: 4,  // Reduced to 16 partitions
  seed: 42,
  encodingType: EncodingType.DEFAULT_SUM,
  projectionType: ProjectionType.DEFAULT_IDENTITY,
  fillEmptyPartitions: false
};

// Gray Code implementation from muvera-py
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

// Simple random number generator for reproducibility
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
    // Box-Muller transformation for Gaussian distribution
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * std + mean;
  }
}

// Generate SimHash matrix (Gaussian random projections)
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

// Calculate partition index using Gray Code
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

// Core FDE generation algorithm
export function generateFDE(pointCloud: number[][], config: FixedDimensionalEncodingConfig): number[] {
  // Validate input
  if (!pointCloud.length || pointCloud[0].length !== config.dimension) {
    throw new Error(`Input data shape inconsistent with config dimension ${config.dimension}`);
  }
  
  if (config.numSimhashProjections < 0 || config.numSimhashProjections >= 32) {
    throw new Error(`Number of SimHash projections must be between 0 and 31, got ${config.numSimhashProjections}`);
  }

  const numPartitions = Math.pow(2, config.numSimhashProjections);
  const projectionDim = config.projectionDimension || config.dimension;
  
  let allRepetitions: number[] = [];

  // Process each repetition
  for (let rep = 0; rep < config.numRepetitions; rep++) {
    const repSeed = config.seed + rep;
    
    // Generate SimHash projection matrix
    const simHashMatrix = simHashMatrixFromSeed(config.dimension, config.numSimhashProjections, repSeed);
    
    // Initialize partition aggregation
    const partitionSums = new Map<number, number[]>();
    const partitionCounts = new Map<number, number>();
    
    // Process each vector in the point cloud
    for (const vector of pointCloud) {
      // Apply SimHash projection
      const sketchVector = matrixVectorMultiply(simHashMatrix, vector);
      
      // Calculate partition index using Gray Code
      const partitionIndex = simHashPartitionIndexGray(sketchVector);
      
      // Aggregate vectors by partition
      if (!partitionSums.has(partitionIndex)) {
        partitionSums.set(partitionIndex, new Array(projectionDim).fill(0));
        partitionCounts.set(partitionIndex, 0);
      }
      
      const currentSum = partitionSums.get(partitionIndex)!;
      for (let i = 0; i < Math.min(vector.length, projectionDim); i++) {
        currentSum[i] += vector[i];
      }
      partitionCounts.set(partitionIndex, partitionCounts.get(partitionIndex)! + 1);
    }
    
    // Create FDE output for this repetition
    const repetitionOutput: number[] = [];
    
    for (let partitionId = 0; partitionId < numPartitions; partitionId++) {
      if (partitionSums.has(partitionId) && partitionCounts.get(partitionId)! > 0) {
        const sum = partitionSums.get(partitionId)!;
        const count = partitionCounts.get(partitionId)!;
        
        if (config.encodingType === EncodingType.AVERAGE) {
          // Document FDE: average vectors in partition
          for (let i = 0; i < projectionDim; i++) {
            repetitionOutput.push(sum[i] / count);
          }
        } else {
          // Query FDE: sum vectors in partition
          repetitionOutput.push(...sum);
        }
      } else {
        // Empty partition
        for (let i = 0; i < projectionDim; i++) {
          repetitionOutput.push(0);
        }
      }
    }
    
    allRepetitions.push(...repetitionOutput);
  }

  return allRepetitions;
}

// Convenience functions matching muvera-py API
export function generateQueryFDE(pointCloud: number[][], config: FixedDimensionalEncodingConfig): number[] {
  const queryConfig = { ...config, encodingType: EncodingType.DEFAULT_SUM };
  return generateFDE(pointCloud, queryConfig);
}

export function generateDocumentFDE(pointCloud: number[][], config: FixedDimensionalEncodingConfig): number[] {
  const docConfig = { ...config, encodingType: EncodingType.AVERAGE };
  return generateFDE(pointCloud, docConfig);
}

// Similarity computation (dot product)
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