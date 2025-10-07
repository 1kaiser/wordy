// Text vectorization and tokenization for real FDE computation
import { generateQueryFDE, generateDocumentFDE, DEFAULT_FDE_CONFIG } from './fde-algorithm.js';

// Simple word embeddings generator (in practice, would use pre-trained embeddings)
class SimpleWordEmbedder {
  private dimension: number;
  private vocabMap: Map<string, number[]>;
  private seed: number;

  constructor(dimension: number = 128, seed: number = 42) {
    this.dimension = dimension;
    this.vocabMap = new Map();
    this.seed = seed;
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  // Generate consistent embeddings for words
  getWordEmbedding(word: string): number[] {
    const normalizedWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (this.vocabMap.has(normalizedWord)) {
      return this.vocabMap.get(normalizedWord)!;
    }

    // Generate embedding based on word characters (deterministic)
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

  // Tokenize and vectorize text
  textToVectors(text: string): { words: string[], vectors: number[][] } {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);

    const vectors = words.map(word => this.getWordEmbedding(word));
    
    return { words, vectors };
  }
}

// Real FDE computation for text
export class TextFDEProcessor {
  private embedder: SimpleWordEmbedder;
  private fdeConfig: any;

  constructor() {
    this.embedder = new SimpleWordEmbedder(64, 42);  // Updated to 64 dimensions
    this.fdeConfig = {
      ...DEFAULT_FDE_CONFIG,
      numSimhashProjections: 4, // 2^4 = 16 partitions (but we display 6 for visualization)
      numRepetitions: 1
    };
  }

  // Process query text and return partition information
  processQuery(queryText: string): {
    words: string[],
    vectors: number[][],
    partitions: number[],
    fdeVector: number[]
  } {
    const { words, vectors } = this.embedder.textToVectors(queryText);
    
    // Generate query FDE
    const fdeVector = generateQueryFDE(vectors, this.fdeConfig);
    
    // Calculate which partition each word goes to (simplified for visualization)
    const partitions = vectors.map((vector, index) => {
      // Use first 3 dimensions to determine partition (1-6 for display)
      const hash = Math.abs(vector[0] + vector[1] + vector[2]);
      return Math.floor(hash * 6) % 6 + 1;
    });

    return { words, vectors, partitions, fdeVector };
  }

  // Process document text
  processDocument(documentText: string): {
    words: string[],
    vectors: number[][],
    partitions: number[],
    fdeVector: number[]
  } {
    const { words, vectors } = this.embedder.textToVectors(documentText);
    
    // Generate document FDE
    const fdeVector = generateDocumentFDE(vectors, this.fdeConfig);
    
    // Calculate partitions (same logic as query)
    const partitions = vectors.map((vector, index) => {
      const hash = Math.abs(vector[0] + vector[1] + vector[2]);
      return Math.floor(hash * 6) % 6 + 1;
    });

    return { words, vectors, partitions, fdeVector };
  }

  // Calculate similarity between query and document FDEs
  calculateSimilarity(queryFDE: number[], documentFDE: number[]): number {
    if (queryFDE.length !== documentFDE.length) {
      return 0;
    }
    
    let similarity = 0;
    for (let i = 0; i < queryFDE.length; i++) {
      similarity += queryFDE[i] * documentFDE[i];
    }
    
    // Normalize by vector lengths
    const queryNorm = Math.sqrt(queryFDE.reduce((sum, val) => sum + val * val, 0));
    const docNorm = Math.sqrt(documentFDE.reduce((sum, val) => sum + val * val, 0));
    
    if (queryNorm === 0 || docNorm === 0) return 0;
    
    return similarity / (queryNorm * docNorm);
  }
}