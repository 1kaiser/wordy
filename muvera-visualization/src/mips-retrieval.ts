// Maximum Inner Product Search (MIPS) for FDE-based retrieval
// Enables efficient candidate retrieval for MuVeRa system

export interface SearchResult {
  documentId: number;
  similarity: number;
  originalText?: string;
  metadata?: any;
}

export interface Document {
  id: number;
  text: string;
  vectors: number[][];  // Multi-vector representation
  fde?: number[];      // FDE representation
  metadata?: any;
}

export interface MIPSConfig {
  useApproximateSearch: boolean;
  numCandidates: number;      // How many candidates to retrieve before re-ranking
  usePruning: boolean;        // Whether to use similarity thresholding
  similarityThreshold: number;
}

export const DEFAULT_MIPS_CONFIG: MIPSConfig = {
  useApproximateSearch: false,
  numCandidates: 100,
  usePruning: false,
  similarityThreshold: 0.1
};

// Simple linear scan MIPS implementation
export class LinearScanMIPS {
  private documentFDEs: number[][] = [];
  private documents: Document[] = [];
  private config: MIPSConfig;
  
  constructor(config: MIPSConfig = DEFAULT_MIPS_CONFIG) {
    this.config = config;
  }
  
  // Add documents to the index
  addDocuments(documents: Document[]): void {
    console.log(`📚 Adding ${documents.length} documents to MIPS index`);
    
    for (const doc of documents) {
      if (!doc.fde) {
        throw new Error(`Document ${doc.id} missing FDE representation`);
      }
      
      this.documents.push(doc);
      this.documentFDEs.push(doc.fde);
    }
    
    console.log(`✅ MIPS index now contains ${this.documents.length} documents`);
  }
  
  // Search for top-k most similar documents
  search(queryFDE: number[], k: number = 10): SearchResult[] {
    if (this.documentFDEs.length === 0) {
      console.warn('No documents in index');
      return [];
    }
    
    console.log(`🔍 Searching ${this.documentFDEs.length} documents for top-${k} results`);
    
    const startTime = performance.now();
    const similarities: SearchResult[] = [];
    
    // Compute similarities with all documents
    for (let i = 0; i < this.documentFDEs.length; i++) {
      const similarity = this.dotProduct(queryFDE, this.documentFDEs[i]);
      
      // Apply pruning if enabled
      if (this.config.usePruning && similarity < this.config.similarityThreshold) {
        continue;
      }
      
      similarities.push({
        documentId: this.documents[i].id,
        similarity: similarity,
        originalText: this.documents[i].text,
        metadata: this.documents[i].metadata
      });
    }
    
    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Return top-k results
    const results = similarities.slice(0, k);
    const searchTime = performance.now() - startTime;
    
    console.log(`⚡ Search completed in ${searchTime.toFixed(2)}ms, found ${results.length} results`);
    
    return results;
  }
  
  // Compute dot product between two vectors
  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }
  
  // Get index statistics
  getStats(): any {
    return {
      numDocuments: this.documents.length,
      fdeDimension: this.documentFDEs.length > 0 ? this.documentFDEs[0].length : 0,
      avgDocumentLength: this.documents.reduce((sum, doc) => sum + doc.text.length, 0) / this.documents.length,
      indexSizeKB: (this.documentFDEs.length * this.documentFDEs[0]?.length * 4) / 1024 // 4 bytes per float
    };
  }
}

// Hierarchical Navigable Small World (HNSW) approximation
// Simplified version for faster approximate search
export class ApproximateMIPS {
  private documentFDEs: number[][] = [];
  private documents: Document[] = [];
  private config: MIPSConfig;
  private graph: Map<number, Set<number>> = new Map();
  private entryPoint: number = 0;
  
  constructor(config: MIPSConfig = DEFAULT_MIPS_CONFIG) {
    this.config = config;
  }
  
  // Build approximate search index
  buildIndex(documents: Document[]): void {
    console.log(`🏗️ Building approximate MIPS index for ${documents.length} documents`);
    
    this.documents = documents;
    this.documentFDEs = documents.map(doc => {
      if (!doc.fde) throw new Error(`Document ${doc.id} missing FDE`);
      return doc.fde;
    });
    
    // Simple graph construction: connect each document to its k nearest neighbors
    const k = Math.min(10, this.documentFDEs.length - 1);
    
    for (let i = 0; i < this.documentFDEs.length; i++) {
      // Find k nearest neighbors for document i
      const similarities: { index: number, sim: number }[] = [];
      
      for (let j = 0; j < this.documentFDEs.length; j++) {
        if (i === j) continue;
        const sim = this.dotProduct(this.documentFDEs[i], this.documentFDEs[j]);
        similarities.push({ index: j, sim });
      }
      
      // Sort and take top k
      similarities.sort((a, b) => b.sim - a.sim);
      const neighbors = similarities.slice(0, k).map(x => x.index);
      
      this.graph.set(i, new Set(neighbors));
    }
    
    console.log(`✅ Approximate index built with ${this.graph.size} nodes, ~${k} connections each`);
  }
  
  // Greedy search starting from entry point
  search(queryFDE: number[], k: number = 10): SearchResult[] {
    if (this.documentFDEs.length === 0) return [];
    
    const visited = new Set<number>();
    const candidates: { index: number, sim: number }[] = [];
    const queue: number[] = [this.entryPoint];
    
    while (queue.length > 0 && visited.size < this.config.numCandidates) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      
      visited.add(current);
      const sim = this.dotProduct(queryFDE, this.documentFDEs[current]);
      candidates.push({ index: current, sim });
      
      // Add neighbors to queue
      const neighbors = this.graph.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
    
    // Sort candidates and return top k
    candidates.sort((a, b) => b.sim - a.sim);
    
    return candidates.slice(0, k).map(c => ({
      documentId: this.documents[c.index].id,
      similarity: c.sim,
      originalText: this.documents[c.index].text,
      metadata: this.documents[c.index].metadata
    }));
  }
  
  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }
}

// Unified MIPS interface
export class MIPSRetriever {
  private linearMIPS: LinearScanMIPS;
  private approximateMIPS: ApproximateMIPS;
  private config: MIPSConfig;
  
  constructor(config: MIPSConfig = DEFAULT_MIPS_CONFIG) {
    this.config = config;
    this.linearMIPS = new LinearScanMIPS(config);
    this.approximateMIPS = new ApproximateMIPS(config);
  }
  
  // Add documents to both indexes
  addDocuments(documents: Document[]): void {
    this.linearMIPS.addDocuments(documents);
    
    if (this.config.useApproximateSearch && documents.length > 50) {
      this.approximateMIPS.buildIndex(documents);
    }
  }
  
  // Perform search using configured method
  search(queryFDE: number[], k: number = 10): SearchResult[] {
    if (this.config.useApproximateSearch && this.linearMIPS.getStats().numDocuments > 50) {
      console.log('🚀 Using approximate MIPS search');
      return this.approximateMIPS.search(queryFDE, k);
    } else {
      console.log('🔍 Using linear scan MIPS search');
      return this.linearMIPS.search(queryFDE, k);
    }
  }
  
  // Benchmark both search methods
  benchmark(queryFDE: number[], k: number = 10): { linear: any, approximate: any } {
    const startLinear = performance.now();
    const linearResults = this.linearMIPS.search(queryFDE, k);
    const linearTime = performance.now() - startLinear;
    
    const startApprox = performance.now();
    const approxResults = this.approximateMIPS.search(queryFDE, k);
    const approxTime = performance.now() - startApprox;
    
    // Calculate overlap between results
    const linearIds = new Set(linearResults.map(r => r.documentId));
    const overlap = approxResults.filter(r => linearIds.has(r.documentId)).length;
    const overlapPercent = (overlap / Math.min(linearResults.length, approxResults.length)) * 100;
    
    return {
      linear: {
        time: linearTime,
        results: linearResults.length,
        avgSimilarity: linearResults.reduce((sum, r) => sum + r.similarity, 0) / linearResults.length
      },
      approximate: {
        time: approxTime,
        results: approxResults.length,
        avgSimilarity: approxResults.reduce((sum, r) => sum + r.similarity, 0) / approxResults.length,
        speedup: linearTime / approxTime,
        overlapPercent
      }
    };
  }
  
  getStats(): any {
    return this.linearMIPS.getStats();
  }
}

// Utility functions for search evaluation
export function evaluateSearchQuality(
  groundTruthResults: SearchResult[], 
  actualResults: SearchResult[], 
  k: number = 10
): { precision: number, recall: number, ndcg: number } {
  const trueIds = new Set(groundTruthResults.slice(0, k).map(r => r.documentId));
  const actualIds = actualResults.slice(0, k).map(r => r.documentId);
  
  // Precision@k
  const relevantRetrieved = actualIds.filter(id => trueIds.has(id)).length;
  const precision = relevantRetrieved / Math.min(k, actualIds.length);
  
  // Recall@k  
  const recall = relevantRetrieved / Math.min(k, trueIds.size);
  
  // Simplified NDCG@k
  let dcg = 0;
  let idcg = 0;
  
  for (let i = 0; i < Math.min(k, actualIds.length); i++) {
    const gain = trueIds.has(actualIds[i]) ? 1 : 0;
    dcg += gain / Math.log2(i + 2);
    idcg += 1 / Math.log2(i + 2); // Assume all ground truth items are relevant
  }
  
  const ndcg = dcg / idcg;
  
  return { precision, recall, ndcg };
}

// Performance profiler for search operations
export class SearchProfiler {
  private measurements: { operation: string, time: number, details: any }[] = [];
  
  profile<T>(operation: string, fn: () => T, details: any = {}): T {
    const start = performance.now();
    const result = fn();
    const time = performance.now() - start;
    
    this.measurements.push({ operation, time, details });
    console.log(`⏱️ ${operation}: ${time.toFixed(2)}ms`);
    
    return result;
  }
  
  getReport(): any {
    const totalTime = this.measurements.reduce((sum, m) => sum + m.time, 0);
    const avgTime = totalTime / this.measurements.length;
    
    const operationStats = new Map<string, { count: number, totalTime: number, avgTime: number }>();
    
    for (const measurement of this.measurements) {
      if (!operationStats.has(measurement.operation)) {
        operationStats.set(measurement.operation, { count: 0, totalTime: 0, avgTime: 0 });
      }
      
      const stats = operationStats.get(measurement.operation)!;
      stats.count++;
      stats.totalTime += measurement.time;
      stats.avgTime = stats.totalTime / stats.count;
    }
    
    return {
      totalMeasurements: this.measurements.length,
      totalTime: totalTime.toFixed(2),
      avgTime: avgTime.toFixed(2),
      operationBreakdown: Object.fromEntries(operationStats),
      measurements: this.measurements
    };
  }
  
  reset(): void {
    this.measurements = [];
  }
}