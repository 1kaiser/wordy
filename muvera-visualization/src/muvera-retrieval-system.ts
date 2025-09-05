// Complete MuVeRa Retrieval System
// Integrates FDE generation, MIPS search, and optional re-ranking

import { 
  generateDocumentFDEBatch, 
  generateQueryFDE, 
  DEFAULT_ENHANCED_FDE_CONFIG 
} from './enhanced-fde-algorithm.js';
import type { EnhancedFDEConfig } from './enhanced-fde-algorithm.js';
import { 
  MIPSRetriever, 
  DEFAULT_MIPS_CONFIG,
  SearchProfiler
} from './mips-retrieval.js';

// Import types separately to avoid runtime import errors
import type { Document, SearchResult, MIPSConfig } from './mips-retrieval.js';
import { 
  ProductQuantizer, 
  quantizeFDEBatch
} from './product-quantization.js';
import type { ProductQuantizationConfig, QuantizedFDE } from './product-quantization.js';

export interface MuVeRaConfig {
  fde: EnhancedFDEConfig;
  mips: MIPSConfig;
  productQuantization?: ProductQuantizationConfig;
  useQuantization: boolean;
  enableChamferReranking: boolean;
  rerankTopK: number;
}

export const DEFAULT_MUVERA_CONFIG: MuVeRaConfig = {
  fde: DEFAULT_ENHANCED_FDE_CONFIG,
  mips: DEFAULT_MIPS_CONFIG,
  useQuantization: false,
  enableChamferReranking: false,
  rerankTopK: 20
};

// Simple text vectorizer for browser compatibility
export class SimpleTextVectorizer {
  private vocabMap: Map<string, number[]> = new Map();
  private dimension: number;
  private seed: number;

  constructor(dimension: number = 128, seed: number = 42) {
    this.dimension = dimension;
    this.seed = seed;
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  // Generate consistent word embeddings
  getWordEmbedding(word: string): number[] {
    const normalizedWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (this.vocabMap.has(normalizedWord)) {
      return this.vocabMap.get(normalizedWord)!;
    }

    // Generate deterministic embedding
    const embedding = new Array(this.dimension);
    let wordSeed = this.seed;
    
    for (let i = 0; i < normalizedWord.length; i++) {
      wordSeed += normalizedWord.charCodeAt(i);
    }
    
    for (let i = 0; i < this.dimension; i++) {
      wordSeed = (wordSeed * 9301 + 49297) % 233280;
      embedding[i] = (wordSeed / 233280) * 2 - 1; // Range [-1, 1]
    }

    this.vocabMap.set(normalizedWord, embedding);
    return embedding;
  }

  // Convert text to multi-vector representation
  textToVectors(text: string): number[][] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);

    return words.map(word => this.getWordEmbedding(word));
  }
}

// Chamfer similarity computation (for re-ranking)
export class ChamferSimilarity {
  // Compute chamfer similarity between two multi-vector sets
  static compute(setA: number[][], setB: number[][]): number {
    if (setA.length === 0 || setB.length === 0) return 0;

    // A->B: for each vector in A, find closest in B
    let sumAToB = 0;
    for (const vecA of setA) {
      let maxSim = -Infinity;
      for (const vecB of setB) {
        const sim = this.dotProduct(vecA, vecB);
        maxSim = Math.max(maxSim, sim);
      }
      sumAToB += maxSim;
    }

    // B->A: for each vector in B, find closest in A  
    let sumBToA = 0;
    for (const vecB of setB) {
      let maxSim = -Infinity;
      for (const vecA of setA) {
        const sim = this.dotProduct(vecA, vecB);
        maxSim = Math.max(maxSim, sim);
      }
      sumBToA += maxSim;
    }

    // Average of both directions
    return (sumAToB / setA.length + sumBToA / setB.length) / 2;
  }

  private static dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }
}

// Complete MuVeRa retrieval system
export class MuVeRaRetrievalSystem {
  private config: MuVeRaConfig;
  private vectorizer: SimpleTextVectorizer;
  private mipsRetriever: MIPSRetriever;
  private productQuantizer?: ProductQuantizer;
  private quantizedIndex?: QuantizedFDE;
  private documents: Document[] = [];
  private profiler: SearchProfiler;
  
  constructor(config: MuVeRaConfig = DEFAULT_MUVERA_CONFIG) {
    this.config = config;
    this.vectorizer = new SimpleTextVectorizer(config.fde.dimension);
    this.mipsRetriever = new MIPSRetriever(config.mips);
    this.profiler = new SearchProfiler();
    
    if (config.useQuantization && config.productQuantization) {
      this.productQuantizer = new ProductQuantizer(config.productQuantization);
    }
    
    console.log('🚀 MuVeRa Retrieval System initialized');
  }
  
  // Index a collection of text documents
  async indexDocuments(texts: string[], onProgress?: (completed: number, total: number) => void): Promise<void> {
    console.log(`📚 Indexing ${texts.length} documents...`);
    
    // Convert texts to multi-vector representations
    const multiVectorDocs = this.profiler.profile('text_vectorization', () => {
      return texts.map((text, id) => ({
        id,
        text,
        vectors: this.vectorizer.textToVectors(text)
      }));
    }, { numDocs: texts.length });
    
    // Generate FDEs for all documents
    const documentVectors = multiVectorDocs.map(doc => doc.vectors);
    const documentFDEs = this.profiler.profile('fde_generation', () => {
      return generateDocumentFDEBatch(
        documentVectors, 
        this.config.fde,
        onProgress
      );
    }, { 
      numDocs: texts.length,
      avgVectorsPerDoc: documentVectors.reduce((sum, vecs) => sum + vecs.length, 0) / documentVectors.length
    });
    
    // Create document objects with FDEs
    this.documents = multiVectorDocs.map((doc, i) => ({
      ...doc,
      fde: documentFDEs[i]
    }));
    
    // Apply product quantization if enabled
    if (this.config.useQuantization && this.productQuantizer) {
      const { quantized, stats } = this.profiler.profile('product_quantization', () => {
        return quantizeFDEBatch(documentFDEs, this.config.productQuantization!);
      }, { compressionTarget: '32x' });
      
      this.quantizedIndex = quantized;
      console.log(`🗜️ Applied product quantization: ${stats.memoryReduction} reduction`);
    }
    
    // Build MIPS index
    this.profiler.profile('mips_indexing', () => {
      this.mipsRetriever.addDocuments(this.documents);
    }, { indexType: this.config.mips.useApproximateSearch ? 'approximate' : 'linear' });
    
    console.log(`✅ Successfully indexed ${this.documents.length} documents`);
    console.log(`📊 Index stats:`, this.mipsRetriever.getStats());
  }
  
  // Search for similar documents
  async search(query: string, k: number = 10): Promise<SearchResult[]> {
    if (this.documents.length === 0) {
      throw new Error('No documents indexed. Call indexDocuments() first.');
    }
    
    console.log(`🔍 Searching for: "${query}" (top-${k})`);
    
    // Convert query to multi-vector representation
    const queryVectors = this.profiler.profile('query_vectorization', () => {
      return this.vectorizer.textToVectors(query);
    }, { queryLength: query.length });
    
    // Generate query FDE
    const queryFDE = this.profiler.profile('query_fde_generation', () => {
      return generateQueryFDE([queryVectors], this.config.fde);
    }, { queryVectors: queryVectors.length });
    
    // MIPS candidate retrieval
    const candidateK = this.config.enableChamferReranking ? 
      Math.max(k * 2, this.config.rerankTopK) : k;
    
    const candidates = this.profiler.profile('mips_search', () => {
      return this.mipsRetriever.search(queryFDE, candidateK);
    }, { 
      candidateK,
      indexSize: this.documents.length,
      useApproximate: this.config.mips.useApproximateSearch
    });
    
    let finalResults = candidates;
    
    // Optional Chamfer similarity re-ranking
    if (this.config.enableChamferReranking && candidates.length > k) {
      finalResults = this.profiler.profile('chamfer_reranking', () => {
        const rerankedCandidates = candidates.map(candidate => {
          const docVectors = this.documents.find(d => d.id === candidate.documentId)?.vectors || [];
          const chamferSim = ChamferSimilarity.compute(queryVectors, docVectors);
          
          return {
            ...candidate,
            similarity: chamferSim, // Replace FDE similarity with Chamfer
            fdeSimiliarity: candidate.similarity // Keep original FDE similarity
          };
        });
        
        // Re-sort by Chamfer similarity
        rerankedCandidates.sort((a, b) => b.similarity - a.similarity);
        return rerankedCandidates.slice(0, k);
      }, { candidateCount: candidates.length });
      
      console.log(`🔄 Applied Chamfer re-ranking: ${candidates.length} → ${finalResults.length}`);
    }
    
    const searchTime = this.profiler.getReport().totalTime;
    console.log(`⚡ Search completed in ${searchTime}ms`);
    
    return finalResults.slice(0, k);
  }
  
  // Benchmark search performance
  async benchmark(queries: string[], k: number = 10): Promise<any> {
    console.log(`🏃 Running benchmark with ${queries.length} queries...`);
    
    this.profiler.reset();
    const results = [];
    const startTime = performance.now();
    
    for (const query of queries) {
      const queryResults = await this.search(query, k);
      results.push({
        query,
        numResults: queryResults.length,
        avgSimilarity: queryResults.reduce((sum, r) => sum + r.similarity, 0) / queryResults.length
      });
    }
    
    const totalTime = performance.now() - startTime;
    const report = this.profiler.getReport();
    
    return {
      queries: queries.length,
      totalTime: totalTime.toFixed(2),
      avgTimePerQuery: (totalTime / queries.length).toFixed(2),
      throughputQPS: (1000 * queries.length / totalTime).toFixed(2),
      results,
      detailedProfile: report,
      indexStats: this.mipsRetriever.getStats()
    };
  }
  
  // Compare with exhaustive multi-vector search (for validation)
  async compareWithExhaustiveSearch(query: string, k: number = 10): Promise<any> {
    const queryVectors = this.vectorizer.textToVectors(query);
    
    // Exhaustive Chamfer similarity computation
    const exhaustiveStart = performance.now();
    const exhaustiveResults: SearchResult[] = [];
    
    for (const doc of this.documents) {
      const chamferSim = ChamferSimilarity.compute(queryVectors, doc.vectors);
      exhaustiveResults.push({
        documentId: doc.id,
        similarity: chamferSim,
        originalText: doc.text
      });
    }
    
    exhaustiveResults.sort((a, b) => b.similarity - a.similarity);
    const exhaustiveTop = exhaustiveResults.slice(0, k);
    const exhaustiveTime = performance.now() - exhaustiveStart;
    
    // MuVeRa search
    const muveraStart = performance.now();
    const muveraResults = await this.search(query, k);
    const muveraTime = performance.now() - muveraStart;
    
    // Calculate overlap
    const exhaustiveIds = new Set(exhaustiveTop.map(r => r.documentId));
    const overlap = muveraResults.filter(r => exhaustiveIds.has(r.documentId)).length;
    const overlapPercent = (overlap / k) * 100;
    
    return {
      query,
      exhaustive: {
        time: exhaustiveTime.toFixed(2),
        results: exhaustiveTop.slice(0, 3) // Top 3 for comparison
      },
      muvera: {
        time: muveraTime.toFixed(2),
        speedup: (exhaustiveTime / muveraTime).toFixed(1),
        results: muveraResults.slice(0, 3)
      },
      quality: {
        overlapPercent: overlapPercent.toFixed(1),
        overlap: `${overlap}/${k}`
      }
    };
  }
  
  // Get system statistics
  getStats(): any {
    return {
      config: this.config,
      documents: this.documents.length,
      indexStats: this.mipsRetriever.getStats(),
      quantizationEnabled: this.config.useQuantization,
      chamferRerankingEnabled: this.config.enableChamferReranking
    };
  }
  
  // Clean up resources
  destroy(): void {
    this.documents = [];
    this.quantizedIndex = undefined;
    console.log('🧹 MuVeRa system cleaned up');
  }
}

// Utility function to create a pre-configured MuVeRa system
export function createMuVeRaSystem(options: {
  useQuantization?: boolean;
  useApproximateSearch?: boolean;
  enableReranking?: boolean;
  numRepetitions?: number;
} = {}): MuVeRaRetrievalSystem {
  const config: MuVeRaConfig = {
    ...DEFAULT_MUVERA_CONFIG,
    fde: {
      ...DEFAULT_ENHANCED_FDE_CONFIG,
      numRepetitions: options.numRepetitions || 20
    },
    mips: {
      ...DEFAULT_MIPS_CONFIG,
      useApproximateSearch: options.useApproximateSearch || false
    },
    useQuantization: options.useQuantization || false,
    enableChamferReranking: options.enableReranking || false
  };
  
  return new MuVeRaRetrievalSystem(config);
}