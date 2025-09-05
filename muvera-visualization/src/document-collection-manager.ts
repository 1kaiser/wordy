// Document Collection Manager for small text collections
// Integrates with MuVeRa retrieval system for browser-based search

import { MuVeRaRetrievalSystem, createMuVeRaSystem } from './muvera-retrieval-system.js';
import type { SearchResult } from './muvera-retrieval-system.js';

export interface DocumentItem {
  id: number;
  title: string;
  content: string;
  metadata?: {
    source?: string;
    dateAdded?: Date;
    wordCount?: number;
  };
}

export interface CollectionStats {
  totalDocuments: number;
  totalWords: number;
  avgDocumentLength: number;
  indexedAt: Date;
  searchReady: boolean;
}

// Document Collection Manager
export class DocumentCollectionManager {
  private documents: DocumentItem[] = [];
  private muveraSystem: MuVeRaRetrievalSystem;
  private indexed: boolean = false;
  private indexedAt?: Date;

  constructor() {
    // Create optimized MuVeRa system for small collections
    this.muveraSystem = createMuVeRaSystem({
      useQuantization: false, // No compression needed for small collections
      useApproximateSearch: false, // Use exact search for best quality
      enableReranking: true, // Enable Chamfer re-ranking for quality
      numRepetitions: 15 // Reduced repetitions for faster indexing
    });
  }

  // Add single document to collection
  addDocument(title: string, content: string, metadata?: any): DocumentItem {
    const doc: DocumentItem = {
      id: this.documents.length,
      title: title.trim(),
      content: content.trim(),
      metadata: {
        ...metadata,
        dateAdded: new Date(),
        wordCount: content.trim().split(/\s+/).length
      }
    };

    this.documents.push(doc);
    this.indexed = false; // Mark for re-indexing
    
    console.log(`📄 Added document "${title}" (${doc.metadata?.wordCount} words)`);
    return doc;
  }

  // Add multiple documents at once
  addDocuments(docs: Array<{ title: string, content: string, metadata?: any }>): void {
    for (const doc of docs) {
      this.addDocument(doc.title, doc.content, doc.metadata);
    }
  }

  // Remove document by ID
  removeDocument(docId: number): boolean {
    const index = this.documents.findIndex(doc => doc.id === docId);
    if (index !== -1) {
      const removed = this.documents.splice(index, 1)[0];
      this.indexed = false;
      console.log(`🗑️ Removed document "${removed.title}"`);
      return true;
    }
    return false;
  }

  // Clear all documents
  clearCollection(): void {
    this.documents = [];
    this.indexed = false;
    this.muveraSystem.destroy();
    console.log('🧹 Collection cleared');
  }

  // Index all documents for search
  async indexDocuments(onProgress?: (completed: number, total: number) => void): Promise<void> {
    if (this.documents.length === 0) {
      throw new Error('No documents to index');
    }

    console.log(`🔄 Indexing ${this.documents.length} documents...`);

    // Extract text content for indexing
    const texts = this.documents.map(doc => `${doc.title}\n\n${doc.content}`);
    
    await this.muveraSystem.indexDocuments(texts, onProgress);
    
    this.indexed = true;
    this.indexedAt = new Date();
    
    console.log(`✅ Collection indexed: ${this.documents.length} documents ready for search`);
  }

  // Search the collection
  async search(query: string, k: number = 5): Promise<Array<SearchResult & { document: DocumentItem }>> {
    if (!this.indexed) {
      throw new Error('Collection not indexed. Call indexDocuments() first.');
    }

    if (!query.trim()) {
      return [];
    }

    console.log(`🔍 Searching collection for: "${query}"`);

    const results = await this.muveraSystem.search(query, k);
    
    // Enhance results with document metadata
    return results.map(result => ({
      ...result,
      document: this.documents[result.documentId]
    }));
  }

  // Get collection statistics
  getStats(): CollectionStats {
    const totalWords = this.documents.reduce((sum, doc) => sum + (doc.metadata?.wordCount || 0), 0);
    
    return {
      totalDocuments: this.documents.length,
      totalWords,
      avgDocumentLength: this.documents.length > 0 ? totalWords / this.documents.length : 0,
      indexedAt: this.indexedAt || new Date(0),
      searchReady: this.indexed
    };
  }

  // Get all documents
  getDocuments(): DocumentItem[] {
    return [...this.documents];
  }

  // Get single document by ID
  getDocument(docId: number): DocumentItem | undefined {
    return this.documents.find(doc => doc.id === docId);
  }

  // Check if collection is ready for search
  isReady(): boolean {
    return this.indexed && this.documents.length > 0;
  }

  // Benchmark search performance
  async benchmarkSearch(queries: string[]): Promise<any> {
    if (!this.indexed) {
      throw new Error('Collection not indexed');
    }

    return await this.muveraSystem.benchmark(queries);
  }

  // Compare with exhaustive search for quality evaluation
  async validateSearchQuality(query: string, k: number = 10): Promise<any> {
    if (!this.indexed) {
      throw new Error('Collection not indexed');
    }

    return await this.muveraSystem.compareWithExhaustiveSearch(query, k);
  }
}

// Pre-built document collections for testing
export const SAMPLE_COLLECTIONS = {
  academic: [
    {
      title: "Machine Learning Fundamentals",
      content: "Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed. It involves algorithms that can identify patterns, make predictions, and improve their performance over time. The three main types are supervised learning, unsupervised learning, and reinforcement learning."
    },
    {
      title: "Natural Language Processing",
      content: "Natural Language Processing combines computational linguistics with machine learning to help computers understand human language. NLP applications include sentiment analysis, machine translation, chatbots, and text summarization. Modern approaches use transformer architectures and large language models."
    },
    {
      title: "Computer Vision Applications",
      content: "Computer vision enables machines to interpret and understand visual information from images and videos. Applications range from facial recognition and autonomous vehicles to medical imaging and quality control in manufacturing. Deep convolutional neural networks have revolutionized this field."
    },
    {
      title: "Data Science Methodology",
      content: "Data science combines statistics, programming, and domain expertise to extract insights from data. The typical workflow includes data collection, cleaning, exploratory analysis, modeling, and interpretation. Python and R are popular tools, along with frameworks like pandas, scikit-learn, and TensorFlow."
    },
    {
      title: "Artificial Intelligence Ethics",
      content: "AI ethics addresses the moral implications of artificial intelligence systems. Key concerns include algorithmic bias, privacy, transparency, accountability, and the societal impact of automation. Developing responsible AI requires interdisciplinary collaboration between technologists, ethicists, and policymakers."
    }
  ],

  literature: [
    {
      title: "The Power of Storytelling",
      content: "Stories have shaped human culture for millennia, serving as vehicles for knowledge, values, and entertainment. From oral traditions to digital narratives, storytelling remains fundamental to how we understand ourselves and the world. Great stories create emotional connections and help us process complex experiences."
    },
    {
      title: "Modern Poetry Movement",
      content: "Contemporary poetry embraces diverse voices, experimental forms, and global perspectives. Modern poets challenge traditional structures while exploring themes of identity, technology, climate change, and social justice. Digital platforms have democratized poetry publication and created new communities of readers and writers."
    },
    {
      title: "Historical Fiction Genre",
      content: "Historical fiction transports readers to different time periods while illuminating universal human experiences. Authors research extensively to recreate authentic settings, dialogue, and cultural contexts. The genre helps us understand how past events shape present circumstances and human nature."
    },
    {
      title: "Science Fiction Evolution",
      content: "Science fiction has evolved from early speculative tales to sophisticated explorations of technology, society, and human potential. The genre influences real-world innovation and helps us consider the implications of scientific advancement. Subgenres include cyberpunk, space opera, dystopian fiction, and climate fiction."
    }
  ],

  cooking: [
    {
      title: "Italian Pasta Techniques",
      content: "Authentic Italian pasta-making requires understanding of flour types, egg ratios, and proper kneading techniques. Fresh pasta should be silky, elastic, and roll out evenly. Different shapes pair with specific sauces - long pasta with oil-based sauces, short pasta with chunky vegetables, stuffed pasta with butter or cream."
    },
    {
      title: "French Cooking Foundations",
      content: "French cuisine emphasizes technique, quality ingredients, and precise execution. The five mother sauces form the foundation: béchamel, velouté, espagnole, hollandaise, and tomato. Mise en place preparation, proper knife skills, and understanding of heat control are essential for mastering French cooking methods."
    },
    {
      title: "Asian Flavor Profiles",
      content: "Asian cuisines balance sweet, sour, salty, bitter, and umami flavors through ingredients like soy sauce, fish sauce, miso, and fermented bean pastes. Techniques include stir-frying, steaming, braising, and fermentation. Regional variations span from delicate Japanese dishes to bold Szechuan preparations."
    },
    {
      title: "Baking Science Principles",
      content: "Successful baking relies on understanding chemical reactions between ingredients. Gluten development, leavening agents, fat incorporation, and moisture content all affect final texture and taste. Precise measurements, temperature control, and timing are crucial for consistent results in bread, pastries, and cakes."
    }
  ]
};

// Utility function to load a sample collection
export function loadSampleCollection(collectionName: keyof typeof SAMPLE_COLLECTIONS): DocumentCollectionManager {
  const manager = new DocumentCollectionManager();
  const docs = SAMPLE_COLLECTIONS[collectionName];
  
  manager.addDocuments(docs);
  
  console.log(`📚 Loaded ${collectionName} collection: ${docs.length} documents`);
  return manager;
}