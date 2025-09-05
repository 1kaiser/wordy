/**
 * MuVeRa Demonstration Integration
 * 
 * Practical implementation demonstrating how MuVeRa core works with 
 * real text processing for browser-based multi-vector retrieval.
 * 
 * Designed for educational visualization and practical deployment.
 */

import { 
  MuVeRaCore, 
  MuVeRaBrowserUtils, 
  EncodingType, 
  ProjectionType,
  BROWSER_OPTIMIZED_CONFIG,
  type MultiVector,
  type FixedDimensionalEncoding 
} from './muvera-core.js';

// Sample book pages for demonstration (10 paragraphs from different topics)
export const SAMPLE_BOOK_PAGES = [
  {
    page: 1,
    topic: "Machine Learning Basics",
    paragraphs: [
      "Machine learning algorithms learn patterns from data through iterative training processes. They identify relationships between input features and target outputs, enabling predictions on new, unseen data. The learning process involves adjusting internal parameters to minimize prediction errors.",
      "Supervised learning uses labeled training data to teach algorithms the correct outputs. Examples include classification tasks like spam detection and regression problems like price prediction. The algorithm learns from input-output pairs to generalize to new examples."
    ]
  },
  {
    page: 2,
    topic: "Neural Networks",
    paragraphs: [
      "Neural networks are inspired by biological neurons and consist of interconnected nodes organized in layers. Each connection has a weight that determines the strength of signal transmission. Networks learn by adjusting these weights during training.",
      "Deep learning uses networks with many hidden layers to learn complex patterns. These deep architectures can automatically extract features from raw data, eliminating the need for manual feature engineering in many applications."
    ]
  },
  {
    page: 3,
    topic: "Natural Language Processing",
    paragraphs: [
      "Natural language processing enables computers to understand and generate human language. It combines computational linguistics with machine learning to process text and speech. Applications include translation, sentiment analysis, and chatbots.",
      "Word embeddings represent words as dense vectors in high-dimensional space. Similar words have similar vector representations, enabling machines to understand semantic relationships. These embeddings form the foundation of modern NLP systems."
    ]
  },
  {
    page: 4,
    topic: "Computer Vision",
    paragraphs: [
      "Computer vision algorithms analyze and interpret visual information from images and videos. They can detect objects, recognize faces, and understand scenes. Convolutional neural networks have revolutionized computer vision performance.",
      "Image classification assigns labels to entire images, while object detection locates and identifies specific objects within images. Semantic segmentation goes further by classifying every pixel in an image."
    ]
  },
  {
    page: 5,
    topic: "Data Science",
    paragraphs: [
      "Data science combines statistics, programming, and domain expertise to extract insights from data. It involves collecting, cleaning, analyzing, and visualizing data to support decision-making. Data scientists use various tools and techniques.",
      "Exploratory data analysis helps understand data characteristics and identify patterns. Statistical methods test hypotheses and measure relationships. Visualization techniques communicate findings effectively to stakeholders and guide further analysis."
    ]
  }
];

export interface DemoResults {
  queryFDE: FixedDimensionalEncoding;
  documentFDEs: FixedDimensionalEncoding[];
  similarities: number[];
  rankings: { document: string; score: number; rank: number }[];
  performance: {
    fdeGenerationTime: number;
    searchTime: number;
    compressionStats: any;
  };
}

/**
 * MuVeRa Demonstration Class
 * Shows practical usage with real text processing and search
 */
export class MuVeRaDemo {
  private muvera: MuVeRaCore;
  private indexedDocuments: FixedDimensionalEncoding[] = [];
  private documentMetadata: { text: string; topic: string; page: number }[] = [];
  
  constructor() {
    // Use browser-optimized configuration for demo
    this.muvera = new MuVeRaCore(BROWSER_OPTIMIZED_CONFIG);
  }
  
  /**
   * Index all sample documents for searching
   */
  async indexDocuments(progressCallback?: (progress: number) => void): Promise<void> {
    console.log('📚 Indexing sample book pages with MuVeRa...');
    const startTime = performance.now();
    
    this.indexedDocuments = [];
    this.documentMetadata = [];
    
    let processed = 0;
    const totalParagraphs = SAMPLE_BOOK_PAGES.reduce((sum, page) => sum + page.paragraphs.length, 0);
    
    for (const page of SAMPLE_BOOK_PAGES) {
      for (const paragraph of page.paragraphs) {
        // Convert paragraph to multi-vector representation
        const multiVector = await MuVeRaBrowserUtils.textToMultiVector(
          paragraph, 
          BROWSER_OPTIMIZED_CONFIG.dimension
        );
        
        // Generate document FDE (uses averaging)
        const fde = this.muvera.generateDocumentFDE(multiVector);
        
        this.indexedDocuments.push(fde);
        this.documentMetadata.push({
          text: paragraph,
          topic: page.topic,
          page: page.page
        });
        
        processed++;
        if (progressCallback) {
          progressCallback(processed / totalParagraphs);
        }
        
        // Yield to prevent UI blocking
        if (processed % 2 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
    }
    
    const indexTime = performance.now() - startTime;
    console.log(`✅ Indexed ${this.indexedDocuments.length} paragraphs in ${indexTime.toFixed(1)}ms`);
  }
  
  /**
   * Search indexed documents using MuVeRa
   */
  async search(query: string, topK: number = 5): Promise<DemoResults> {
    if (this.indexedDocuments.length === 0) {
      throw new Error('No documents indexed. Call indexDocuments() first.');
    }
    
    console.log(`🔍 Searching for: "${query}"`);
    const searchStartTime = performance.now();
    
    // Generate query FDE (uses sum aggregation)
    const fdeStartTime = performance.now();
    const queryMultiVector = await MuVeRaBrowserUtils.textToMultiVector(
      query, 
      BROWSER_OPTIMIZED_CONFIG.dimension
    );
    const queryFDE = this.muvera.generateQueryFDE(queryMultiVector);
    const fdeGenerationTime = performance.now() - fdeStartTime;
    
    // Compute similarities with all documents
    const similarities = this.indexedDocuments.map(docFDE => 
      MuVeRaCore.computeSimilarity(queryFDE, docFDE)
    );
    
    const searchTime = performance.now() - searchStartTime;
    
    // Rank results
    const rankings = similarities
      .map((score, index) => ({
        document: this.documentMetadata[index].text,
        topic: this.documentMetadata[index].topic,
        page: this.documentMetadata[index].page,
        score,
        rank: 0
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((result, index) => ({ ...result, rank: index + 1 }));
    
    // Get compression statistics
    const compressionStats = this.muvera.getCompressionStats(
      queryMultiVector.vectors.length
    );
    
    console.log(`✅ Search completed in ${searchTime.toFixed(1)}ms`);
    console.log(`📊 Top result: "${rankings[0].document.substring(0, 80)}..." (score: ${rankings[0].score.toFixed(4)})`);
    
    return {
      queryFDE,
      documentFDEs: this.indexedDocuments,
      similarities,
      rankings,
      performance: {
        fdeGenerationTime,
        searchTime,
        compressionStats
      }
    };
  }
  
  /**
   * Compare MuVeRa search with naive similarity
   */
  async compareWithNaive(query: string): Promise<{
    muveraResults: DemoResults;
    naiveTime: number;
    speedup: number;
  }> {
    // MuVeRa search
    const muveraResults = await this.search(query);
    
    // Naive exhaustive search (for comparison)
    const naiveStartTime = performance.now();
    const queryTokens = query.toLowerCase().split(/\s+/);
    
    const naiveScores = this.documentMetadata.map(doc => {
      const docTokens = doc.text.toLowerCase().split(/\s+/);
      // Simple Jaccard similarity
      const intersection = queryTokens.filter(token => docTokens.includes(token));
      return intersection.length / (queryTokens.length + docTokens.length - intersection.length);
    });
    
    const naiveTime = performance.now() - naiveStartTime;
    const speedup = naiveTime / muveraResults.performance.searchTime;
    
    console.log(`⚡ MuVeRa vs Naive: ${speedup.toFixed(1)}x speedup`);
    
    return {
      muveraResults,
      naiveTime,
      speedup
    };
  }
  
  /**
   * Demonstrate different encoding types
   */
  async demonstrateEncodingTypes(text: string): Promise<{
    sumEncoding: FixedDimensionalEncoding;
    averageEncoding: FixedDimensionalEncoding;
    comparison: {
      dimension: number;
      sumMagnitude: number;
      averageMagnitude: number;
      difference: number;
    };
  }> {
    const multiVector = await MuVeRaBrowserUtils.textToMultiVector(
      text, 
      BROWSER_OPTIMIZED_CONFIG.dimension
    );
    
    // Generate both encoding types
    const sumEncoding = this.muvera.generateFDE(multiVector, EncodingType.DEFAULT_SUM);
    const averageEncoding = this.muvera.generateFDE(multiVector, EncodingType.AVERAGE);
    
    // Compare magnitudes
    const sumMagnitude = Math.sqrt(sumEncoding.fde.reduce((sum, val) => sum + val * val, 0));
    const averageMagnitude = Math.sqrt(averageEncoding.fde.reduce((sum, val) => sum + val * val, 0));
    
    // Compute difference
    let difference = 0;
    for (let i = 0; i < sumEncoding.fde.length; i++) {
      difference += Math.abs(sumEncoding.fde[i] - averageEncoding.fde[i]);
    }
    
    return {
      sumEncoding,
      averageEncoding,
      comparison: {
        dimension: sumEncoding.fde.length,
        sumMagnitude,
        averageMagnitude,
        difference
      }
    };
  }
  
  /**
   * Get demo statistics for visualization
   */
  getStatistics(): {
    documentsIndexed: number;
    config: any;
    memoryUsage: string;
    compressionRatio: number;
  } {
    const stats = this.muvera.getCompressionStats(50); // Average 50 words per paragraph
    
    return {
      documentsIndexed: this.indexedDocuments.length,
      config: this.muvera.getConfig(),
      memoryUsage: `${(this.indexedDocuments.length * BROWSER_OPTIMIZED_CONFIG.projection_dimension! * 4 / 1024).toFixed(1)}KB`,
      compressionRatio: stats.compressionRatio
    };
  }
  
  /**
   * Export indexed data for persistence
   */
  exportIndex(): string {
    return MuVeRaBrowserUtils.exportFDEs(this.indexedDocuments);
  }
  
  /**
   * Import previously indexed data
   */
  importIndex(data: string): void {
    this.indexedDocuments = MuVeRaBrowserUtils.importFDEs(data);
    console.log(`📥 Imported ${this.indexedDocuments.length} indexed documents`);
  }
}

/**
 * Visualization Integration Helpers
 */
export class MuVeRaVisualizationHelpers {
  /**
   * Get partition distribution for visualization
   */
  static async getPartitionDistribution(
    text: string,
    config = BROWSER_OPTIMIZED_CONFIG
  ): Promise<{ partition: number; count: number; tokens: string[] }[]> {
    const muvera = new MuVeRaCore(config);
    const multiVector = await MuVeRaBrowserUtils.textToMultiVector(text, config.dimension);
    
    // Track which tokens go to which partitions (simplified for first repetition)
    const partitionMap = new Map<number, string[]>();
    
    // This would require exposing the getPartitionIndex method or refactoring
    // For demo purposes, we'll simulate the distribution
    const numPartitions = 2 ** config.num_simhash_projections;
    const tokens = text.split(/\s+/);
    
    tokens.forEach((token, index) => {
      // Simplified partition assignment based on hash
      const hash = token.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const partition = hash % numPartitions;
      
      if (!partitionMap.has(partition)) {
        partitionMap.set(partition, []);
      }
      partitionMap.get(partition)!.push(token);
    });
    
    return Array.from(partitionMap.entries()).map(([partition, tokens]) => ({
      partition,
      count: tokens.length,
      tokens
    }));
  }
  
  /**
   * Generate similarity heatmap data
   */
  static generateSimilarityMatrix(
    fdes: FixedDimensionalEncoding[]
  ): number[][] {
    const n = fdes.length;
    const matrix: number[][] = [];
    
    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1.0;
        } else {
          matrix[i][j] = MuVeRaCore.computeSimilarity(fdes[i], fdes[j]);
        }
      }
    }
    
    return matrix;
  }
}

// Sample queries for testing
export const SAMPLE_QUERIES = [
  "machine learning algorithms",
  "neural network training",
  "natural language processing",
  "computer vision applications",
  "data analysis techniques",
  "deep learning models",
  "image classification",
  "word embeddings",
  "statistical methods",
  "pattern recognition"
];