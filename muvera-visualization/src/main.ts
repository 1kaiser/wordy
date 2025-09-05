import * as d3 from 'd3';
import { TextFDEProcessor } from './text-vectorizer.js';
import { EmbeddingGemmaVectorizer, createEmbeddingGemmaVectorizer } from './embedding-gemma-vectorizer.js';
import { MRLOptimizedVectorizer } from './mrl-optimized-vectorizer.js';
import { BackgroundFDEManager } from './background-fde-manager.js';
import { DocumentCollectionManager, loadSampleCollection } from './document-collection-manager.js';
import type { SearchResult, DocumentItem } from './document-collection-manager.js';

interface AnimationState {
  step: number;
  isRunning: boolean;
  isPaused: false;
  animationType: 'query' | 'document';
}

class MuVeRaAnimation {
  private semanticSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private fdeSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private bottomSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private queryTextDiv: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>;
  
  // Document animation containers
  private semanticSvgDoc: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private fdeSvgDoc: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private bottomSvgDoc: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private queryTextDivDoc: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>;
  private fdeProcessor: TextFDEProcessor;
  private embeddingGemmaVectorizer: EmbeddingGemmaVectorizer | null = null;
  private mrlOptimizedVectorizer: MRLOptimizedVectorizer | null = null;
  private currentEmbeddingMethod: 'hash' | 'gemma' = 'gemma';
  
  // Background FDE processing
  private backgroundFDE: BackgroundFDEManager;
  
  private state: AnimationState = {
    step: 0,
    isRunning: true,
    isPaused: false,
    animationType: 'query'
  };
  
  // Text data - will be updated from input fields
  private queryText = 'What is the height of Mount Everest?';
  private docText = 'Mount Everest is 8,848 meters high.';
  
  // Input control elements
  private queryInput: HTMLInputElement;
  private documentInput: HTMLInputElement;
  private embeddingMethodSelect: HTMLSelectElement;
  private embeddingStatus: HTMLElement;
  
  // Document collection management
  private collectionManager: DocumentCollectionManager | null = null;
  private collectionSelect: HTMLSelectElement;
  private searchQueryInput: HTMLInputElement;
  private loadCollectionBtn: HTMLButtonElement;
  private indexDocumentsBtn: HTMLButtonElement;
  private searchBtn: HTMLButtonElement;
  private collectionStatus: HTMLElement;
  private searchResultsSection: HTMLElement;
  private searchResults: HTMLElement;
  
  // Computed FDE data
  private queryData: any;
  private docData: any;
  
  // Track highlighted sectors
  private highlightedSectors: Set<number> = new Set();
  
  // Track all token positions globally to prevent overlaps
  private allTokenPositions: {x: number, y: number, radius: number}[] = [];
  
  // Pre-calculated animation data
  private preCalculatedQueryData: any = null;
  private preCalculatedDocumentData: any = null;
  
  // Random token alphabets (avoid query word letters)
  private tokenAlphabets = ['z', 'y', 'x', 'v', 't', 'u', 'w', 'k', 'q', 'j'];
  
  // Display colors
  private colors = ['#ea4335', '#4285f4', '#fbbc05', '#34a853', '#9c27b0', '#00bcd4', '#ff5722'];
  
  // Random hyperplane angles for query and document (6 hyperplanes each)
  private queryHyperplanes: number[] = [];
  private documentHyperplanes: number[] = [];
  
  constructor() {
    this.semanticSvg = d3.select('#semantic-svg');
    this.fdeSvg = d3.select('#fde-svg');
    this.bottomSvg = d3.select('#bottom-svg');
    this.queryTextDiv = d3.select('#query-text');
    
    // Initialize document animation containers
    this.semanticSvgDoc = d3.select('#semantic-svg-doc');
    this.fdeSvgDoc = d3.select('#fde-svg-doc');
    this.bottomSvgDoc = d3.select('#bottom-svg-doc');
    this.queryTextDivDoc = d3.select('#query-text-doc');
    this.fdeProcessor = new TextFDEProcessor();
    
    // Initialize background FDE processing
    this.backgroundFDE = new BackgroundFDEManager();
    
    // Initialize input controls
    this.initializeInputControls();
    
    // Initialize document collection controls
    this.initializeDocumentCollection();
    
    // Generate random hyperplanes for both query and document
    this.generateRandomHyperplanes();
    
    // Process texts to get real FDE data
    this.queryData = this.fdeProcessor.processQuery(this.queryText);
    this.docData = this.fdeProcessor.processDocument(this.docText);
    
    console.log('Query FDE Data:', this.queryData);
    console.log('Document FDE Data:', this.docData);
    console.log('FDE Similarity:', this.fdeProcessor.calculateSimilarity(
      this.queryData.fdeVector, 
      this.docData.fdeVector
    ));
    
    // Try to initialize EmbeddingGemma first, fallback to hash if needed
    this.initializeEmbeddingMethod();
    
    // Start background FDE processing in parallel
    this.initializeBackgroundProcessing();
    
    // Update mathematical calculations
    this.updateCalculations();
    
    // Setup both query and document sections initially
    this.setupInitialView('query');
    this.setupDocumentView();
    this.setupPauseButton();
    this.startAnimation();
  }

  private async initializeEmbeddingMethod(): Promise<void> {
    if (this.currentEmbeddingMethod === 'gemma') {
      try {
        console.log('🔄 Attempting to initialize MRL-Optimized EmbeddingGemma by default...');
        
        if (!this.mrlOptimizedVectorizer) {
          this.mrlOptimizedVectorizer = new MRLOptimizedVectorizer({
            performanceMode: 'auto',
            enableCaching: true,
            thresholds: {
              shortText: 50,
              mediumText: 200,
              maxLatency: 150
            }
          });
        }
        
        await this.mrlOptimizedVectorizer.initialize();
        
        // If successful, reprocess with MRL-Optimized EmbeddingGemma
        this.queryData = await this.mrlOptimizedVectorizer.processQuery(this.queryText);
        this.docData = await this.mrlOptimizedVectorizer.processDocument(this.docText);
        
        // Update UI to show success
        if (this.embeddingStatus) {
          this.embeddingStatus.textContent = 'EmbeddingGemma model loaded (semantic embeddings)';
          this.embeddingStatus.style.color = '#2e7d32';
        }
        
        console.log('✅ EmbeddingGemma initialized successfully as default');
        
      } catch (error) {
        console.warn('⚠️ EmbeddingGemma initialization failed, falling back to hash-based:', error);
        
        // Fallback to hash-based
        this.currentEmbeddingMethod = 'hash';
        this.queryData = this.fdeProcessor.processQuery(this.queryText);
        this.docData = this.fdeProcessor.processDocument(this.docText);
        
        // Update UI to show fallback
        if (this.embeddingMethodSelect) {
          this.embeddingMethodSelect.value = 'hash';
        }
        if (this.embeddingStatus) {
          this.embeddingStatus.textContent = 'EmbeddingGemma unavailable, using hash-based embeddings';
          this.embeddingStatus.style.color = '#f57c00';
        }
      }
    }
  }

  private generateRandomHyperplanes(): void {
    // Generate 3 random hyperplane angles for query (0 to π, since hyperplanes extend both ways)
    this.queryHyperplanes = [];
    for (let i = 0; i < 3; i++) {
      this.queryHyperplanes.push(Math.random() * Math.PI);
    }
    // Sort angles for consistent sector numbering
    this.queryHyperplanes.sort((a, b) => a - b);
    
    // Generate 3 different random hyperplane angles for document
    this.documentHyperplanes = [];
    for (let i = 0; i < 3; i++) {
      this.documentHyperplanes.push(Math.random() * Math.PI);
    }
    // Sort angles for consistent sector numbering
    this.documentHyperplanes.sort((a, b) => a - b);
    
    console.log('Query hyperplanes (radians):', this.queryHyperplanes);
    console.log('Document hyperplanes (radians):', this.documentHyperplanes);
  }

  private async initializeBackgroundProcessing(): Promise<void> {
    console.log('🔄 Initializing background FDE processing...');
    
    try {
      // Process query and document in background
      const [queryResult, documentResult] = await Promise.all([
        this.backgroundFDE.processQueryInBackground(this.queryText),
        this.backgroundFDE.processDocumentInBackground(this.docText)
      ]);
      
      // Compute similarity in background
      const similarity = await this.backgroundFDE.computeSimilarityInBackground();
      
      // Get performance metrics
      const metrics = this.backgroundFDE.getPerformanceMetrics();
      
      console.log('✅ Background FDE Processing Complete:');
      console.log('📊 Performance Metrics:', metrics);
      console.log('🎯 FDE Similarity:', similarity.toFixed(6));
      
      // Compare with visual animation results
      this.compareResults(queryResult, documentResult, similarity);
      
      // Display real-time processing stats in UI
      this.displayProcessingStats(metrics, similarity);
      
    } catch (error) {
      console.error('❌ Background FDE Processing Failed:', error);
    }
  }

  private compareResults(queryResult: any, documentResult: any, backgroundSimilarity: number): void {
    console.log('🔍 Comparing Animation vs Background Results:');
    
    // Compare query processing
    const queryComparison = {
      animationWords: this.queryData.words.length,
      backgroundWords: queryResult.words.length,
      animationPartitions: this.queryData.partitions,
      backgroundPartitions: queryResult.partitions
    };
    
    // Compare document processing  
    const documentComparison = {
      animationWords: this.docData.words.length,
      backgroundWords: documentResult.words.length,
      animationPartitions: this.docData.partitions,
      backgroundPartitions: documentResult.partitions
    };
    
    // Compare similarity scores
    const animationSimilarity = this.fdeProcessor.calculateSimilarity(
      this.queryData.fdeVector,
      this.docData.fdeVector
    );
    
    console.log('Query Comparison:', queryComparison);
    console.log('Document Comparison:', documentComparison);
    console.log('Similarity Comparison:', {
      animation: animationSimilarity.toFixed(6),
      background: backgroundSimilarity.toFixed(6),
      difference: Math.abs(animationSimilarity - backgroundSimilarity).toFixed(6)
    });
  }

  private displayProcessingStats(metrics: any, similarity: number): void {
    // Add a real-time stats panel to show background processing results
    const statsPanel = d3.select('body')
      .append('div')
      .attr('class', 'fde-stats-panel')
      .style('position', 'fixed')
      .style('top', '20px')
      .style('left', '20px')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '15px')
      .style('border-radius', '8px')
      .style('font-family', 'Google Sans, monospace')
      .style('font-size', '12px')
      .style('z-index', '1000')
      .style('max-width', '300px');
    
    const statsHTML = `
      <div style="font-weight: bold; margin-bottom: 10px;">🔄 Real-time FDE Processing</div>
      <div>Query Processing: ${metrics.queryProcessingTime.toFixed(2)}ms</div>
      <div>Document Processing: ${metrics.documentProcessingTime.toFixed(2)}ms</div>
      <div>Total Processing: ${metrics.totalProcessingTime.toFixed(2)}ms</div>
      <div style="margin-top: 8px;">Query Vectors: ${metrics.queryVectorCount}</div>
      <div>Document Vectors: ${metrics.documentVectorCount}</div>
      <div>Compression Ratio: ${metrics.fdeCompressionRatio.toFixed(1)}x</div>
      <div style="margin-top: 8px; font-weight: bold;">FDE Similarity: ${similarity.toFixed(6)}</div>
    `;
    
    statsPanel.html(statsHTML);
    
    // Auto-hide after 15 seconds
    setTimeout(() => {
      statsPanel.transition()
        .duration(1000)
        .style('opacity', 0)
        .remove();
    }, 15000);
  }

  private updateCalculations(): void {
    // Update query calculations
    this.updateQueryCalculations();
    
    // Update document calculations 
    this.updateDocumentCalculations();
    
    // Update final similarity calculation
    const similarity = this.fdeProcessor.calculateSimilarity(
      this.queryData.fdeVector, 
      this.docData.fdeVector
    );
    
    const finalSimilarityElement = document.getElementById('final-similarity');
    if (finalSimilarityElement) {
      finalSimilarityElement.textContent = similarity.toFixed(6);
    }
  }

  private updateQueryCalculations(): void {
    const queryData = this.queryData;
    
    // Step 1: SimHash Projections
    const simhashCalcs = document.getElementById('query-simhash-calcs');
    if (simhashCalcs) {
      let simhashText = 'Hyperplane Angles (radians):\n';
      this.queryHyperplanes.forEach((angle, i) => {
        simhashText += `  H${i+1}: ${angle.toFixed(3)}rad (${(angle * 180 / Math.PI).toFixed(1)}°)\n`;
      });
      simhashText += '\nProjections for each word:\n';
      
      queryData.words.slice(0, 4).forEach((word: string, i: number) => {
        const vector = queryData.vectors[i];
        simhashText += `  "${word}": [${vector.slice(0, 3).map((v: number) => v.toFixed(2)).join(', ')}...]\n`;
        simhashText += `    → hash = ${Math.abs(vector[0] + vector[1] + vector[2]).toFixed(3)}\n`;
      });
      
      if (queryData.words.length > 4) {
        simhashText += `  ... and ${queryData.words.length - 4} more words\n`;
      }
      
      simhashCalcs.textContent = simhashText;
    }
    
    // Step 2: Partition Assignment
    const partitionCalcs = document.getElementById('query-partition-calcs');
    if (partitionCalcs) {
      let partitionText = 'Word → Partition Assignment:\n';
      
      const partitionCounts = new Array(6).fill(0);
      queryData.words.slice(0, 4).forEach((word: string, i: number) => {
        const partition = queryData.partitions[i];
        partitionCounts[partition - 1]++;
        partitionText += `  "${word}" → Partition ${partition}\n`;
      });
      
      if (queryData.words.length > 4) {
        // Count remaining partitions
        queryData.words.slice(4).forEach((_: any, i: number) => {
          const partition = queryData.partitions[i + 4];
          partitionCounts[partition - 1]++;
        });
        partitionText += `  ... and ${queryData.words.length - 4} more words\n`;
      }
      
      partitionText += '\nPartition Distribution:\n';
      partitionCounts.forEach((count, i) => {
        partitionText += `  P${i+1}: ${count} words\n`;
      });
      
      partitionCalcs.textContent = partitionText;
    }
    
    // Step 3: Vector Aggregation (SUM)
    const aggregationCalcs = document.getElementById('query-aggregation-calcs');
    if (aggregationCalcs) {
      let aggText = 'SUM Aggregation by Partition:\n';
      
      const partitionSums = new Array(6).fill(0).map(() => [0, 0, 0]); // Track first 3 dims
      queryData.words.forEach((word: string, i: number) => {
        const partition = queryData.partitions[i] - 1;
        const vector = queryData.vectors[i];
        partitionSums[partition][0] += vector[0];
        partitionSums[partition][1] += vector[1]; 
        partitionSums[partition][2] += vector[2];
      });
      
      partitionSums.forEach((sum, i) => {
        aggText += `  P${i+1}: [${sum.map(v => v.toFixed(2)).join(', ')}...]\n`;
      });
      
      aggText += '\nQuery FDE (first 12 dimensions):\n';
      aggText += `  [${queryData.fdeVector.slice(0, 12).map((v: number) => v.toFixed(2)).join(', ')}...]\n`;
      aggText += `Total FDE dimensions: ${queryData.fdeVector.length}`;
      
      aggregationCalcs.textContent = aggText;
    }
  }

  private updateDocumentCalculations(): void {
    const docData = this.docData;
    
    // Step 1: SimHash Projections  
    const simhashCalcs = document.getElementById('doc-simhash-calcs');
    if (simhashCalcs) {
      let simhashText = 'Hyperplane Angles (radians):\n';
      this.documentHyperplanes.forEach((angle, i) => {
        simhashText += `  H${i+1}: ${angle.toFixed(3)}rad (${(angle * 180 / Math.PI).toFixed(1)}°)\n`;
      });
      simhashText += '\nProjections for each word:\n';
      
      docData.words.slice(0, 4).forEach((word: string, i: number) => {
        const vector = docData.vectors[i];
        simhashText += `  "${word}": [${vector.slice(0, 3).map((v: number) => v.toFixed(2)).join(', ')}...]\n`;
        simhashText += `    → hash = ${Math.abs(vector[0] + vector[1] + vector[2]).toFixed(3)}\n`;
      });
      
      if (docData.words.length > 4) {
        simhashText += `  ... and ${docData.words.length - 4} more words\n`;
      }
      
      simhashCalcs.textContent = simhashText;
    }
    
    // Step 2: Partition Assignment
    const partitionCalcs = document.getElementById('doc-partition-calcs');
    if (partitionCalcs) {
      let partitionText = 'Word → Partition Assignment:\n';
      
      const partitionCounts = new Array(6).fill(0);
      docData.words.slice(0, 4).forEach((word: string, i: number) => {
        const partition = docData.partitions[i];
        partitionCounts[partition - 1]++;
        partitionText += `  "${word}" → Partition ${partition}\n`;
      });
      
      if (docData.words.length > 4) {
        docData.words.slice(4).forEach((_: any, i: number) => {
          const partition = docData.partitions[i + 4];
          partitionCounts[partition - 1]++;
        });
        partitionText += `  ... and ${docData.words.length - 4} more words\n`;
      }
      
      partitionText += '\nPartition Distribution:\n';
      partitionCounts.forEach((count, i) => {
        partitionText += `  P${i+1}: ${count} words\n`;
      });
      
      partitionCalcs.textContent = partitionText;
    }
    
    // Step 3: Vector Aggregation (AVERAGE)
    const aggregationCalcs = document.getElementById('doc-aggregation-calcs');
    if (aggregationCalcs) {
      let aggText = 'AVERAGE Aggregation by Partition:\n';
      
      const partitionSums = new Array(6).fill(0).map(() => [0, 0, 0]);
      const partitionCounts = new Array(6).fill(0);
      docData.words.forEach((word: string, i: number) => {
        const partition = docData.partitions[i] - 1;
        const vector = docData.vectors[i];
        partitionSums[partition][0] += vector[0];
        partitionSums[partition][1] += vector[1];
        partitionSums[partition][2] += vector[2];
        partitionCounts[partition]++;
      });
      
      partitionSums.forEach((sum, i) => {
        const count = partitionCounts[i] || 1;
        const avg = sum.map(v => v / count);
        aggText += `  P${i+1}: [${avg.map(v => v.toFixed(2)).join(', ')}...] (÷${count})\n`;
      });
      
      aggText += '\nDocument FDE (first 12 dimensions):\n';
      aggText += `  [${docData.fdeVector.slice(0, 12).map((v: number) => v.toFixed(2)).join(', ')}...]\n`;
      aggText += `Total FDE dimensions: ${docData.fdeVector.length}`;
      
      aggregationCalcs.textContent = aggText;
    }
  }

  private initializeInputControls(): void {
    // Get input elements
    this.queryInput = document.getElementById('query-input') as HTMLInputElement;
    this.documentInput = document.getElementById('document-input') as HTMLInputElement;
    this.embeddingMethodSelect = document.getElementById('embedding-method') as HTMLSelectElement;
    this.embeddingStatus = document.getElementById('embedding-status') as HTMLElement;
    
    // Set initial values
    this.queryInput.value = this.queryText;
    this.documentInput.value = this.docText;
    this.embeddingMethodSelect.value = this.currentEmbeddingMethod;
    
    // Setup event listeners
    document.getElementById('process-btn')?.addEventListener('click', () => {
      this.processNewTexts();
    });
    
    document.getElementById('reset-btn')?.addEventListener('click', () => {
      this.resetToDefaults();
    });
    
    document.getElementById('random-btn')?.addEventListener('click', () => {
      this.tryRandomExamples();
    });
    
    // Embedding method change listener
    this.embeddingMethodSelect.addEventListener('change', async () => {
      await this.switchEmbeddingMethod(this.embeddingMethodSelect.value as 'hash' | 'gemma');
    });
  }

  private async switchEmbeddingMethod(method: 'hash' | 'gemma'): Promise<void> {
    if (this.currentEmbeddingMethod === method) return;
    
    console.log(`🔄 Switching to ${method} embedding method...`);
    this.currentEmbeddingMethod = method;
    
    // Update UI status
    if (method === 'gemma') {
      this.embeddingStatus.textContent = 'Loading EmbeddingGemma model...';
      this.embeddingStatus.style.color = '#f57c00';
      
      try {
        // Initialize MRL-Optimized EmbeddingGemma vectorizer
        if (!this.mrlOptimizedVectorizer) {
          this.mrlOptimizedVectorizer = new MRLOptimizedVectorizer({
            performanceMode: 'auto',
            enableCaching: true,
            thresholds: {
              shortText: 50,
              mediumText: 200,
              maxLatency: 150
            }
          });
        }
        
        await this.mrlOptimizedVectorizer.initialize();
        
        this.embeddingStatus.textContent = 'EmbeddingGemma model loaded (semantic embeddings)';
        this.embeddingStatus.style.color = '#2e7d32';
        
        console.log('✅ EmbeddingGemma model loaded successfully');
        
      } catch (error) {
        console.error('❌ Failed to load EmbeddingGemma:', error);
        this.embeddingStatus.textContent = 'Failed to load EmbeddingGemma. Falling back to hash-based.';
        this.embeddingStatus.style.color = '#d32f2f';
        this.currentEmbeddingMethod = 'hash';
        this.embeddingMethodSelect.value = 'hash';
        return;
      }
    } else {
      this.embeddingStatus.textContent = 'Hash-based embeddings loaded (instant processing)';
      this.embeddingStatus.style.color = '#666';
    }
    
    // Reprocess current texts with new embedding method
    await this.reprocessWithCurrentMethod();
  }

  private async reprocessWithCurrentMethod(): Promise<void> {
    console.log(`🔄 Reprocessing texts with ${this.currentEmbeddingMethod} embeddings...`);
    
    try {
      if (this.currentEmbeddingMethod === 'gemma' && this.mrlOptimizedVectorizer) {
        // Use MRL-Optimized EmbeddingGemma
        this.queryData = await this.mrlOptimizedVectorizer.processQuery(this.queryText);
        this.docData = await this.mrlOptimizedVectorizer.processDocument(this.docText);
      } else {
        // Use hash-based processor  
        this.queryData = this.fdeProcessor.processQuery(this.queryText);
        this.docData = this.fdeProcessor.processDocument(this.docText);
      }
      
      console.log(`✅ Texts reprocessed with ${this.currentEmbeddingMethod} embeddings`);
      
      // Regenerate hyperplanes for new data
      this.generateRandomHyperplanes();
      
      // Update calculations
      this.updateCalculations();
      
      // Restart animation
      this.restartAnimationWithNewData();
      
    } catch (error) {
      console.error(`❌ Failed to reprocess with ${this.currentEmbeddingMethod}:`, error);
      alert(`Error switching to ${this.currentEmbeddingMethod} embeddings. Please try again.`);
    }
  }

  private async processNewTexts(): Promise<void> {
    const newQueryText = this.queryInput.value.trim();
    const newDocText = this.documentInput.value.trim();
    
    if (!newQueryText || !newDocText) {
      alert('Please enter both query and document text.');
      return;
    }
    
    console.log('🔄 Processing new texts:', { query: newQueryText, document: newDocText });
    
    // Update internal state
    this.queryText = newQueryText;
    this.docText = newDocText;
    
    // Show processing indicator
    const processBtn = document.getElementById('process-btn') as HTMLButtonElement;
    const originalText = processBtn.textContent;
    processBtn.textContent = '🔄 Processing...';
    processBtn.disabled = true;
    
    try {
      // Reprocess with new texts using current embedding method
      if (this.currentEmbeddingMethod === 'gemma' && this.mrlOptimizedVectorizer) {
        this.queryData = await this.mrlOptimizedVectorizer.processQuery(this.queryText);
        this.docData = await this.mrlOptimizedVectorizer.processDocument(this.docText);
      } else {
        this.queryData = this.fdeProcessor.processQuery(this.queryText);
        this.docData = this.fdeProcessor.processDocument(this.docText);
      }
      
      // Regenerate hyperplanes for new data
      this.generateRandomHyperplanes();
      
      // Update mathematical calculations
      this.updateCalculations();
      
      // Restart animation with new data
      this.restartAnimationWithNewData();
      
      // Process in background
      await this.initializeBackgroundProcessing();
      
    } catch (error) {
      console.error('❌ Error processing new texts:', error);
      alert('Error processing texts. Please try again.');
    } finally {
      // Restore button
      processBtn.textContent = originalText;
      processBtn.disabled = false;
    }
  }

  private resetToDefaults(): void {
    this.queryText = 'What is the height of Mount Everest?';
    this.docText = 'Mount Everest is 8,848 meters high.';
    
    this.queryInput.value = this.queryText;
    this.documentInput.value = this.docText;
    
    this.processNewTexts();
  }

  private tryRandomExamples(): void {
    const examples = [
      {
        query: 'How do neural networks learn?',
        document: 'Neural networks learn through backpropagation and gradient descent optimization.'
      },
      {
        query: 'What causes climate change?',
        document: 'Climate change is primarily caused by greenhouse gas emissions from human activities.'
      },
      {
        query: 'How does photosynthesis work?',
        document: 'Photosynthesis converts sunlight, carbon dioxide, and water into glucose and oxygen.'
      },
      {
        query: 'What is quantum computing?',
        document: 'Quantum computing uses quantum mechanical phenomena to process information exponentially faster.'
      },
      {
        query: 'How do vaccines work?',
        document: 'Vaccines train the immune system to recognize and fight specific pathogens safely.'
      }
    ];
    
    const randomExample = examples[Math.floor(Math.random() * examples.length)];
    
    this.queryText = randomExample.query;
    this.docText = randomExample.document;
    
    this.queryInput.value = this.queryText;
    this.documentInput.value = this.docText;
    
    this.processNewTexts();
  }

  private initializeDocumentCollection(): void {
    // Get collection control elements
    this.collectionSelect = document.getElementById('collection-select') as HTMLSelectElement;
    this.searchQueryInput = document.getElementById('search-query') as HTMLInputElement;
    this.loadCollectionBtn = document.getElementById('load-collection-btn') as HTMLButtonElement;
    this.indexDocumentsBtn = document.getElementById('index-documents-btn') as HTMLButtonElement;
    this.searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
    this.collectionStatus = document.getElementById('collection-status') as HTMLElement;
    this.searchResultsSection = document.getElementById('search-results-section') as HTMLElement;
    this.searchResults = document.getElementById('search-results') as HTMLElement;

    // Setup event listeners
    this.loadCollectionBtn.addEventListener('click', () => {
      this.loadSelectedCollection();
    });

    this.indexDocumentsBtn.addEventListener('click', () => {
      this.indexCurrentCollection();
    });

    this.searchBtn.addEventListener('click', () => {
      this.performSearch();
    });

    // Enable search on Enter key
    this.searchQueryInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !this.searchBtn.disabled) {
        this.performSearch();
      }
    });

    console.log('📚 Document collection controls initialized');
  }

  private async loadSelectedCollection(): Promise<void> {
    const selectedValue = this.collectionSelect.value;
    
    if (!selectedValue) {
      alert('Please select a collection to load.');
      return;
    }

    try {
      console.log(`📚 Loading ${selectedValue} collection...`);
      
      // Show loading state
      this.loadCollectionBtn.textContent = '🔄 Loading...';
      this.loadCollectionBtn.disabled = true;
      this.collectionStatus.textContent = 'Loading collection...';

      // Load the selected collection
      this.collectionManager = loadSampleCollection(selectedValue as 'academic' | 'literature' | 'cooking');
      
      const stats = this.collectionManager.getStats();
      
      // Update status
      this.collectionStatus.innerHTML = `
        ✅ <strong>${selectedValue.charAt(0).toUpperCase() + selectedValue.slice(1)}</strong> collection loaded<br>
        📄 ${stats.totalDocuments} documents, ${stats.totalWords} total words
      `;
      
      // Enable indexing
      this.indexDocumentsBtn.disabled = false;
      this.searchQueryInput.disabled = true; // Still need to index
      this.searchBtn.disabled = true;
      
      console.log(`✅ Collection loaded: ${stats.totalDocuments} documents`);
      
    } catch (error) {
      console.error('❌ Error loading collection:', error);
      this.collectionStatus.textContent = `Error loading collection: ${error}`;
    } finally {
      this.loadCollectionBtn.textContent = '📚 Load Collection';
      this.loadCollectionBtn.disabled = false;
    }
  }

  private async indexCurrentCollection(): Promise<void> {
    if (!this.collectionManager) {
      alert('Please load a collection first.');
      return;
    }

    try {
      console.log('🔄 Indexing documents for search...');
      
      // Show indexing state
      this.indexDocumentsBtn.textContent = '🔄 Indexing...';
      this.indexDocumentsBtn.disabled = true;
      this.collectionStatus.textContent = 'Indexing documents for search...';

      // Index with progress updates
      await this.collectionManager.indexDocuments((completed, total) => {
        const percentage = Math.round((completed / total) * 100);
        this.collectionStatus.textContent = `Indexing... ${completed}/${total} documents (${percentage}%)`;
      });

      const stats = this.collectionManager.getStats();
      
      // Update status
      this.collectionStatus.innerHTML = `
        🎯 Collection indexed and ready for search!<br>
        📊 ${stats.totalDocuments} documents, ${Math.round(stats.avgDocumentLength)} avg words/doc
      `;
      
      // Enable searching
      this.searchQueryInput.disabled = false;
      this.searchBtn.disabled = false;
      this.searchQueryInput.focus();
      
      console.log('✅ Collection indexing complete');
      
    } catch (error) {
      console.error('❌ Error indexing collection:', error);
      this.collectionStatus.textContent = `Error indexing: ${error}`;
    } finally {
      this.indexDocumentsBtn.textContent = '🔄 Index Documents';
      this.indexDocumentsBtn.disabled = false;
    }
  }

  private async performSearch(): Promise<void> {
    if (!this.collectionManager || !this.collectionManager.isReady()) {
      alert('Please load and index a collection first.');
      return;
    }

    const query = this.searchQueryInput.value.trim();
    if (!query) {
      alert('Please enter a search query.');
      return;
    }

    try {
      console.log(`🔍 Searching for: "${query}"`);
      
      // Show searching state
      this.searchBtn.textContent = '🔍 Searching...';
      this.searchBtn.disabled = true;

      // Perform search
      const startTime = performance.now();
      const results = await this.collectionManager.search(query, 5);
      const searchTime = performance.now() - startTime;

      // Display results
      this.displaySearchResults(results, query, searchTime);
      
      console.log(`✅ Search completed: ${results.length} results in ${searchTime.toFixed(2)}ms`);
      
    } catch (error) {
      console.error('❌ Error performing search:', error);
      alert(`Search error: ${error}`);
    } finally {
      this.searchBtn.textContent = '🔍 Search Documents';
      this.searchBtn.disabled = false;
    }
  }

  private displaySearchResults(results: Array<SearchResult & { document: DocumentItem }>, query: string, searchTime: number): void {
    // Show results section
    this.searchResultsSection.style.display = 'block';
    
    if (results.length === 0) {
      this.searchResults.innerHTML = `
        <div style="text-align: center; color: #666; padding: 20px;">
          <h3>No results found for "${query}"</h3>
          <p>Try different keywords or check spelling.</p>
        </div>
      `;
      return;
    }

    // Create results HTML
    let resultsHTML = `
      <div style="margin-bottom: 20px; text-align: center; color: #666; font-size: 14px;">
        Found ${results.length} results for "<strong>${query}</strong>" in ${searchTime.toFixed(2)}ms
      </div>
    `;

    results.forEach((result, index) => {
      const similarity = (result.similarity * 100).toFixed(1);
      const doc = result.document;
      const preview = doc.content.length > 200 ? doc.content.substring(0, 200) + '...' : doc.content;
      
      resultsHTML += `
        <div style="
          border: 2px solid #e0e0e0; 
          margin-bottom: 15px; 
          padding: 20px; 
          background: white;
          position: relative;
        ">
          <div style="
            position: absolute; 
            top: 10px; 
            right: 15px; 
            background: #4285f4; 
            color: white; 
            padding: 4px 8px; 
            font-size: 12px; 
            font-weight: 500;
            border: 1px solid #4285f4;
          ">
            ${similarity}% match
          </div>
          
          <h3 style="
            margin: 0 0 10px 0; 
            color: #333; 
            font-size: 18px; 
            font-weight: 500;
            font-family: 'Google Sans', sans-serif;
          ">
            ${index + 1}. ${doc.title}
          </h3>
          
          <p style="
            margin: 0 0 10px 0; 
            color: #555; 
            line-height: 1.5;
            font-size: 14px;
          ">
            ${preview}
          </p>
          
          <div style="
            font-size: 12px; 
            color: #888; 
            border-top: 1px solid #f0f0f0; 
            padding-top: 8px; 
            margin-top: 10px;
          ">
            📊 ${doc.metadata?.wordCount} words 
            • 📅 ${doc.metadata?.dateAdded?.toLocaleDateString()}
            • 🎯 Document ID: ${doc.id}
          </div>
        </div>
      `;
    });

    this.searchResults.innerHTML = resultsHTML;
    
    // Scroll to results
    this.searchResultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private restartAnimationWithNewData(): void {
    console.log('🔄 Restarting animation with new data...');
    
    // Reset animation state
    this.state.step = 0;
    this.state.animationType = 'query';
    this.highlightedSectors.clear();
    
    // Clear existing visualizations
    this.setupInitialView('query');
    this.setupDocumentView();
    
    // Update titles
    d3.select('#animation-title').text('Query FDE Construction');
    d3.select('#animation-title-doc').text('Document FDE Construction');
    
    // Clear text displays
    this.queryTextDiv.html('');
    this.queryTextDivDoc.html('');
    
    // Pre-calculate token positions
    this.preCalculateTokenPositions();
    
    // Start animation
    setTimeout(() => {
      this.animateLoop();
    }, 1000);
  }
  
  private setupInitialView(animationType: 'query' | 'document'): void {
    console.log(`🎨 Setting up ${animationType} view using pre-calculated data...`);
    
    // Get pre-calculated data
    const preCalcData = animationType === 'query' ? this.preCalculatedQueryData : this.preCalculatedDocumentData;
    
    if (!preCalcData) {
      console.warn(`⚠️ No pre-calculated data available for ${animationType}, falling back to manual calculation`);
      this.setupInitialViewFallback(animationType);
      return;
    }
    
    // Setup semantic space
    this.semanticSvg.selectAll('*').remove();
    
    // Add circular boundary using pre-calculated data
    this.semanticSvg.append('circle')
      .attr('cx', preCalcData.centerX || 200)
      .attr('cy', preCalcData.centerY || 200)
      .attr('r', preCalcData.radius || 140)
      .style('fill', '#f8f9fa')
      .style('stroke', '#999')
      .style('stroke-width', '2px');
    
    // Add coordinate system arrows using pre-calculated data
    this.semanticSvg.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('markerWidth', 10)
      .attr('markerHeight', 7)
      .attr('refX', 9)
      .attr('refY', 3.5)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 10 3.5, 0 7')
      .style('fill', '#666');
    
    // Add coordinate axes using pre-calculated positions
    if (preCalcData.svgElements && preCalcData.svgElements.coordinateAxes) {
      preCalcData.svgElements.coordinateAxes.forEach((axis: any) => {
        this.semanticSvg.append('line')
          .attr('x1', axis.x1)
          .attr('y1', axis.y1)
          .attr('x2', axis.x2)
          .attr('y2', axis.y2)
          .style('stroke', '#666')
          .style('stroke-width', '2px')
          .attr('marker-end', axis.marker);
      });
    }
    
    // Add hyperplane lines using pre-calculated data
    if (preCalcData.svgElements && preCalcData.svgElements.hyperplaneLines) {
      preCalcData.svgElements.hyperplaneLines.forEach((line: any) => {
        this.semanticSvg.append('line')
          .attr('x1', line.x1)
          .attr('y1', line.y1)
          .attr('x2', line.x2)
          .attr('y2', line.y2)
          .style('stroke', '#999')
          .style('stroke-width', '2px');
      });
    }
    
    // Add sector numbers using pre-calculated data
    if (preCalcData.svgElements && preCalcData.svgElements.sectorNumbers) {
      preCalcData.svgElements.sectorNumbers.forEach((sectorData: any) => {
        this.semanticSvg.append('text')
          .attr('x', sectorData.x)
          .attr('y', sectorData.y)
          .text(sectorData.number.toString())
          .style('font-size', '32px')
          .style('font-weight', 'bold')
          .style('fill', '#666')
          .style('text-anchor', 'middle')
          .style('dominant-baseline', 'central')
          .style('font-family', 'Google Sans, sans-serif');
      });
    }
    
    console.log(`✅ ${animationType} view setup complete using pre-calculated data`);
    
    // Setup FDE panel initial view
    this.setupFDEPanel();
    
    // Setup bottom panel initial view
    this.setupBottomPanel();
  }

  private setupInitialViewFallback(animationType: 'query' | 'document'): void {
    console.log(`🔧 Setting up ${animationType} view with fallback method...`);
    // Setup semantic space
    this.semanticSvg.selectAll('*').remove();
    
    const centerX = 200;
    const centerY = 200;
    const radius = 140;
    
    // Select appropriate hyperplanes based on animation type
    const hyperplanes = animationType === 'query' ? this.queryHyperplanes : this.documentHyperplanes;
    
    // Add circular boundary - flat 2D style
    this.semanticSvg.append('circle')
      .attr('cx', centerX)
      .attr('cy', centerY)
      .attr('r', radius)
      .style('fill', '#f8f9fa')
      .style('stroke', '#999')
      .style('stroke-width', '2px');
    
    // Add coordinate system arrows
    this.semanticSvg.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('markerWidth', 10)
      .attr('markerHeight', 7)
      .attr('refX', 9)
      .attr('refY', 3.5)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 10 3.5, 0 7')
      .style('fill', '#666');

    // Horizontal arrow (x-axis)
    this.semanticSvg.append('line')
      .attr('x1', centerX - radius * 0.8)
      .attr('y1', centerY)
      .attr('x2', centerX + radius * 0.8)
      .attr('y2', centerY)
      .style('stroke', '#666')
      .style('stroke-width', '2px')
      .attr('marker-end', 'url(#arrowhead)');

    // Vertical arrow (y-axis)  
    this.semanticSvg.append('line')
      .attr('x1', centerX)
      .attr('y1', centerY + radius * 0.8)
      .attr('x2', centerX)
      .attr('y2', centerY - radius * 0.8)
      .style('stroke', '#666')
      .style('stroke-width', '2px')
      .attr('marker-end', 'url(#arrowhead)');

    // Add 3 hyperplane lines (each extends across full circle creating 6 sectors)
    for (let i = 0; i < 3; i++) {
      const angle = hyperplanes[i];
      // Draw line across entire circle (from one side to the other)
      this.semanticSvg.append('line')
        .attr('x1', centerX - Math.cos(angle) * radius)
        .attr('y1', centerY - Math.sin(angle) * radius)
        .attr('x2', centerX + Math.cos(angle) * radius)
        .attr('y2', centerY + Math.sin(angle) * radius)
        .style('stroke', '#999')
        .style('stroke-width', '2px');
    }
    
    // Create 6 sector boundary angles from 3 hyperplanes
    const sectorBoundaries: number[] = [];
    for (let i = 0; i < 3; i++) {
      sectorBoundaries.push(hyperplanes[i]);           // θ
      sectorBoundaries.push(hyperplanes[i] + Math.PI); // θ + π
    }
    sectorBoundaries.sort((a, b) => a - b); // Sort for proper ordering
    
    // Add partition numbers (positioned between sector boundaries)
    for (let i = 1; i <= 6; i++) {
      // Position sector number between two consecutive boundaries
      const boundary1 = sectorBoundaries[i - 1];
      const boundary2 = sectorBoundaries[i % 6]; // Wrap around for last sector
      
      // Calculate angle in the middle of the sector
      let sectorCenterAngle;
      if (boundary2 > boundary1) {
        sectorCenterAngle = (boundary1 + boundary2) / 2;
      } else {
        // Handle wraparound case
        sectorCenterAngle = (boundary1 + boundary2 + 2 * Math.PI) / 2;
        if (sectorCenterAngle > 2 * Math.PI) sectorCenterAngle -= 2 * Math.PI;
      }
      
      const labelRadius = radius + 25; // Slightly outside the circle
      const x = centerX + Math.cos(sectorCenterAngle) * labelRadius;
      const y = centerY + Math.sin(sectorCenterAngle) * labelRadius;
      
      this.semanticSvg.append('text')
        .attr('x', x)
        .attr('y', y)
        .text(i.toString())
        .style('font-size', '32px') // Larger font size
        .style('font-weight', 'bold')
        .style('fill', '#666')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'central')
        .style('font-family', 'Google Sans, sans-serif');
    }
  }
  
  private setupFDEPanel(): void {
    this.fdeSvg.selectAll('*').remove();
    
    // Initialize empty rows for later sequential filling with larger height
    for (let i = 1; i <= 6; i++) {
      const y = 25 + (i - 1) * 35; // Increased spacing and height
      
      // Create container for each partition row
      const rowGroup = this.fdeSvg.append('g')
        .attr('id', `fde-row-${i}`)
        .style('opacity', 0); // Start invisible
    }
  }
  
  private setupBottomPanel(): void {
    this.bottomSvg.selectAll('*').remove();
    
    // Keep bottom panel empty for now to match original query animation
    // The original frames show this panel remaining empty throughout
  }

  private setupDocumentView(): void {
    console.log(`🎨 Setting up document view using pre-calculated data...`);
    
    // Get pre-calculated data for document
    const preCalcData = this.preCalculatedDocumentData;
    
    if (!preCalcData) {
      console.warn(`⚠️ No pre-calculated data available for document, falling back to manual calculation`);
      this.setupDocumentViewFallback();
      return;
    }
    
    // Setup document semantic space
    this.semanticSvgDoc.selectAll('*').remove();
    
    // Add circular boundary using pre-calculated data
    this.semanticSvgDoc.append('circle')
      .attr('cx', preCalcData.centerX || 200)
      .attr('cy', preCalcData.centerY || 200)
      .attr('r', preCalcData.radius || 140)
      .style('fill', '#f8f9fa')
      .style('stroke', '#999')
      .style('stroke-width', '2px');
    
    // Add coordinate system arrows using pre-calculated data
    this.semanticSvgDoc.append('defs')
      .append('marker')
      .attr('id', 'arrowhead-doc')
      .attr('markerWidth', 10)
      .attr('markerHeight', 7)
      .attr('refX', 9)
      .attr('refY', 3.5)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 10 3.5, 0 7')
      .style('fill', '#666');
    
    // Add coordinate axes using pre-calculated positions
    if (preCalcData.svgElements && preCalcData.svgElements.coordinateAxes) {
      preCalcData.svgElements.coordinateAxes.forEach((axis: any) => {
        this.semanticSvgDoc.append('line')
          .attr('x1', axis.x1)
          .attr('y1', axis.y1)
          .attr('x2', axis.x2)
          .attr('y2', axis.y2)
          .style('stroke', '#666')
          .style('stroke-width', '2px')
          .attr('marker-end', axis.marker);
      });
    }
    
    // Add hyperplane lines using pre-calculated data
    if (preCalcData.svgElements && preCalcData.svgElements.hyperplaneLines) {
      preCalcData.svgElements.hyperplaneLines.forEach((line: any) => {
        this.semanticSvgDoc.append('line')
          .attr('x1', line.x1)
          .attr('y1', line.y1)
          .attr('x2', line.x2)
          .attr('y2', line.y2)
          .style('stroke', '#999')
          .style('stroke-width', '2px');
      });
    }
    
    // Add sector numbers using pre-calculated data (with document-specific styling)
    if (preCalcData.svgElements && preCalcData.svgElements.sectorNumbers) {
      preCalcData.svgElements.sectorNumbers.forEach((sectorData: any) => {
        // Use document-specific styling (grayed out)
        this.semanticSvgDoc.append('text')
          .attr('x', sectorData.x)
          .attr('y', sectorData.y)
          .text(sectorData.number.toString())
          .style('font-size', '32px')
          .style('font-weight', 'bold')
          .style('fill', '#aaa') // Grayed out for document view
          .style('text-anchor', 'middle')
          .style('dominant-baseline', 'central')
          .style('font-family', 'Google Sans, sans-serif');
      });
    }
    
    console.log(`✅ Document view setup complete using pre-calculated data`);
    
    // Clear document text div
    this.queryTextDivDoc.html('');
    
    // Clear and setup document FDE and bottom panels
    this.fdeSvgDoc.selectAll('*').remove();
    this.bottomSvgDoc.selectAll('*').remove();
    
    // Initialize empty rows for document FDE panel
    for (let i = 1; i <= 6; i++) {
      const y = 25 + (i - 1) * 35; // Same spacing as query
      
      // Create container for each partition row with unique doc IDs
      const rowGroup = this.fdeSvgDoc.append('g')
        .attr('id', `fde-row-doc-${i}`)
        .style('opacity', 0); // Start invisible
    }
  }

  private setupDocumentViewFallback(): void {
    console.log(`🔧 Setting up document view with fallback method...`);
    // Setup document semantic space
    this.semanticSvgDoc.selectAll('*').remove();
    
    const centerX = 200;
    const centerY = 200;
    const radius = 140;
    
    // Use document hyperplanes
    const hyperplanes = this.documentHyperplanes;
    
    // Add circular boundary - flat 2D style
    this.semanticSvgDoc.append('circle')
      .attr('cx', centerX)
      .attr('cy', centerY)
      .attr('r', radius)
      .style('fill', '#f8f9fa')
      .style('stroke', '#999')
      .style('stroke-width', '2px');
    
    // Add coordinate system arrows
    this.semanticSvgDoc.append('defs')
      .append('marker')
      .attr('id', 'arrowhead-doc')
      .attr('markerWidth', 10)
      .attr('markerHeight', 7)
      .attr('refX', 9)
      .attr('refY', 3.5)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 10 3.5, 0 7')
      .style('fill', '#666');

    // Horizontal arrow (x-axis)
    this.semanticSvgDoc.append('line')
      .attr('x1', centerX - radius * 0.8)
      .attr('y1', centerY)
      .attr('x2', centerX + radius * 0.8)
      .attr('y2', centerY)
      .style('stroke', '#666')
      .style('stroke-width', '2px')
      .attr('marker-end', 'url(#arrowhead-doc)');

    // Vertical arrow (y-axis)  
    this.semanticSvgDoc.append('line')
      .attr('x1', centerX)
      .attr('y1', centerY + radius * 0.8)
      .attr('x2', centerX)
      .attr('y2', centerY - radius * 0.8)
      .style('stroke', '#666')
      .style('stroke-width', '2px')
      .attr('marker-end', 'url(#arrowhead-doc)');

    // Add 3 hyperplane lines (each extends across full circle creating 6 sectors)
    for (let i = 0; i < 3; i++) {
      const angle = hyperplanes[i];
      // Draw line across entire circle (from one side to the other)
      this.semanticSvgDoc.append('line')
        .attr('x1', centerX - Math.cos(angle) * radius)
        .attr('y1', centerY - Math.sin(angle) * radius)
        .attr('x2', centerX + Math.cos(angle) * radius)
        .attr('y2', centerY + Math.sin(angle) * radius)
        .style('stroke', '#999')
        .style('stroke-width', '2px');
    }
    
    // Create 6 sector boundary angles from 3 hyperplanes
    const sectorBoundaries: number[] = [];
    for (let i = 0; i < 3; i++) {
      sectorBoundaries.push(hyperplanes[i]);           // θ
      sectorBoundaries.push(hyperplanes[i] + Math.PI); // θ + π
    }
    sectorBoundaries.sort((a, b) => a - b); // Sort for proper ordering
    
    // Add partition numbers (positioned between sector boundaries)
    for (let i = 1; i <= 6; i++) {
      // Position sector number between two consecutive boundaries
      const startBoundary = sectorBoundaries[i - 1];
      const endBoundary = sectorBoundaries[i % 6];
      
      let midAngle;
      if (endBoundary > startBoundary) {
        midAngle = (startBoundary + endBoundary) / 2;
      } else {
        midAngle = (startBoundary + (endBoundary + 2 * Math.PI)) / 2;
      }
      
      // Position number at 85% of radius from center
      const labelRadius = radius * 0.85;
      const labelX = centerX + Math.cos(midAngle) * labelRadius;
      const labelY = centerY + Math.sin(midAngle) * labelRadius;
      
      this.semanticSvgDoc.append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-size', '32px')
        .style('font-weight', 'bold')
        .style('fill', '#aaa')
        .style('font-family', 'Google Sans, sans-serif')
        .text(i);
    }
  }
  
  private setupPauseButton(): void {
    d3.select('#pause-btn').on('click', () => {
      this.state.isPaused = !this.state.isPaused;
      d3.select('#pause-btn').text(this.state.isPaused ? '▶' : '⏸');
    });
  }
  
  private startAnimation(): void {
    // Pre-calculate all token positions to prevent overlaps
    this.preCalculateTokenPositions();
    
    // Update comparison panel with real data
    this.updateComparisonPanel();
    
    this.animateLoop();
  }

  private updateComparisonPanel(): void {
    // Update query method
    const queryMethodElement = document.getElementById('query-method');
    if (queryMethodElement) {
      queryMethodElement.textContent = 'SUM aggregation (adds vectors in each sector)';
    }

    // Update document method  
    const docMethodElement = document.getElementById('doc-method');
    if (docMethodElement) {
      docMethodElement.textContent = 'AVERAGE aggregation (averages vectors in each sector)';
    }

    // Update hyperplane angles
    const hyperplaneDiffElement = document.getElementById('hyperplane-diff');
    if (hyperplaneDiffElement && this.queryHyperplanes.length > 0 && this.documentHyperplanes.length > 0) {
      const queryAnglesStr = this.queryHyperplanes.map(a => a.toFixed(3)).join(', ');
      const docAnglesStr = this.documentHyperplanes.map(a => a.toFixed(3)).join(', ');
      hyperplaneDiffElement.innerHTML = `
        <div>Query: [${queryAnglesStr}]</div>
        <div>Document: [${docAnglesStr}]</div>
      `;
    }

    // Compute and update similarity score
    this.computeAndUpdateSimilarity();
  }

  private async computeAndUpdateSimilarity(): Promise<void> {
    const similarityElement = document.getElementById('similarity-score');
    if (!similarityElement) return;

    try {
      // Use background FDE processing to get similarity
      if (this.backgroundFDE) {
        const similarity = await this.backgroundFDE.computeSimilarityInBackground();
        similarityElement.innerHTML = `
          <strong style="color: #4caf50;">${similarity.toFixed(6)}</strong>
          <br><small style="color: #666;">Higher = more similar</small>
        `;
      } else {
        similarityElement.textContent = 'Computing...';
      }
    } catch (error) {
      similarityElement.innerHTML = `
        <span style="color: #f44336;">Error computing</span>
        <br><small style="color: #666;">Try processing texts first</small>
      `;
    }
  }

  private preCalculateTokenPositions(): void {
    console.log('🎯 Pre-calculating all token positions to prevent overlaps...');
    
    // Clear any existing positions
    this.allTokenPositions = [];
    
    const centerX = 200;
    const centerY = 200;
    const circleRadius = 140;
    const tokenRadius = 16;
    
    // Get current animation data
    const animationData = this.state.animationType === 'query' ? this.queryData : this.docData;
    const words = animationData.words;
    const partitions = animationData.partitions;
    const hyperplanes = this.state.animationType === 'query' ? this.queryHyperplanes : this.documentHyperplanes;
    
    // Group tokens by partition first
    const partitionTokens: {[key: number]: number[]} = {};
    words.forEach((word, i) => {
      const partition = partitions[i];
      if (!partitionTokens[partition]) {
        partitionTokens[partition] = [];
      }
      partitionTokens[partition].push(i);
    });
    
    // Pre-calculate positions for each partition
    Object.keys(partitionTokens).forEach(partitionStr => {
      const partitionId = parseInt(partitionStr);
      const tokenIndices = partitionTokens[partitionId];
      
      // Calculate sector boundaries for 6 sectors from 3 hyperplanes
      const sectorBounds = this.getSectorBounds(partitionId, hyperplanes);
      
      // Calculate optimal positions for all tokens in this partition
      tokenIndices.forEach((tokenIndex, positionInSector) => {
        const position = this.findOptimalTokenPosition(
          centerX, centerY, circleRadius, tokenRadius, 
          sectorBounds.startAngle, sectorBounds.width, partitionId, positionInSector
        );
        
        if (position) {
          this.allTokenPositions[tokenIndex] = {
            x: position.x,
            y: position.y,
            radius: tokenRadius
          };
        }
      });
    });
    
    console.log(`✅ Pre-calculated ${this.allTokenPositions.length} token positions`);
  }

  private preCalculateAllData(): void {
    console.log('🎯 Pre-calculating all animation data before D3 rendering...');
    
    // Pre-calculate for both query and document animations
    this.preCalculateAnimationData('query');
    this.preCalculateAnimationData('document');
    
    console.log('✅ All animation data pre-calculated');
  }

  private preCalculateAnimationData(animationType: 'query' | 'document'): void {
    console.log(`📊 Pre-calculating data for ${animationType} animation...`);
    
    const data = animationType === 'query' ? this.queryData : this.docData;
    const hyperplanes = animationType === 'query' ? this.queryHyperplanes : this.documentHyperplanes;
    
    if (!data || !hyperplanes) {
      console.warn(`⚠️ Missing data or hyperplanes for ${animationType}`);
      return;
    }

    // Pre-calculate all visual elements and positions
    const preCalculatedData = {
      animationType,
      hyperplanes: [...hyperplanes],
      tokens: [],
      sectors: this.calculateSectorData(hyperplanes),
      partitionHighlights: [],
      svgElements: {
        hyperplaneLines: [],
        sectorNumbers: [],
        coordinateAxes: []
      }
    };

    // Pre-calculate coordinate axes
    preCalculatedData.svgElements.coordinateAxes = [
      {
        type: 'horizontal',
        x1: 88, y1: 200, x2: 312, y2: 200,
        style: 'stroke: rgb(102, 102, 102); stroke-width: 2px;',
        marker: animationType === 'query' ? 'url(#arrowhead)' : 'url(#arrowhead-doc)'
      },
      {
        type: 'vertical', 
        x1: 200, y1: 312, x2: 200, y2: 88,
        style: 'stroke: rgb(102, 102, 102); stroke-width: 2px;',
        marker: animationType === 'query' ? 'url(#arrowhead)' : 'url(#arrowhead-doc)'
      }
    ];

    // Pre-calculate hyperplane lines
    hyperplanes.forEach((angle, index) => {
      preCalculatedData.svgElements.hyperplaneLines.push({
        id: `hyperplane-${index}`,
        angle,
        x1: 200 - Math.cos(angle) * 140,
        y1: 200 - Math.sin(angle) * 140,
        x2: 200 + Math.cos(angle) * 140,
        y2: 200 + Math.sin(angle) * 140,
        style: 'stroke: rgb(153, 153, 153); stroke-width: 2px;'
      });
    });

    // Pre-calculate sector numbers and positions
    preCalculatedData.sectors.forEach((sector, index) => {
      const sectorNumber = index + 1;
      const centerAngle = sector.startAngle + sector.width / 2;
      const labelRadius = 115;
      
      preCalculatedData.svgElements.sectorNumbers.push({
        number: sectorNumber,
        x: 200 + Math.cos(centerAngle) * labelRadius,
        y: 200 + Math.sin(centerAngle) * labelRadius,
        style: animationType === 'query' 
          ? 'font-size: 32px; font-weight: bold; fill: rgb(102, 102, 102); text-anchor: middle; dominant-baseline: central; font-family: "Google Sans", sans-serif;'
          : 'font-size: 32px; font-weight: bold; fill: rgb(170, 170, 170); text-anchor: middle; dominant-baseline: central; font-family: "Google Sans", sans-serif;'
      });
    });

    // Pre-calculate token positions and animations
    data.words.forEach((word, tokenIndex) => {
      const partitionId = data.partitions[tokenIndex];
      const sector = preCalculatedData.sectors[partitionId - 1]; // partitionId is 1-based
      
      if (!sector) {
        console.warn(`⚠️ No sector found for partition ${partitionId}`);
        return;
      }

      // Count how many tokens are already in this sector
      const tokensInSector = preCalculatedData.tokens.filter(t => t.partitionId === partitionId).length;
      
      const position = this.findOptimalTokenPosition(
        200, 200, 140, 16,
        sector.startAngle, sector.width,
        partitionId, tokensInSector
      );

      if (position) {
        const color = this.getPartitionColor(partitionId);
        
        preCalculatedData.tokens.push({
          id: `token-${tokenIndex}`,
          word,
          partitionId,
          x: position.x,
          y: position.y,
          radius: 16,
          color,
          animationStep: tokenIndex,
          style: {
            fill: color,
            opacity: 1
          },
          label: {
            text: word,
            x: position.x,
            y: position.y,
            style: 'font-size: 14px; font-weight: bold; fill: white; text-anchor: middle; dominant-baseline: central; font-family: "Google Sans", sans-serif; opacity: 1;'
          }
        });

        // Pre-calculate partition highlight
        if (!preCalculatedData.partitionHighlights.find(h => h.partitionId === partitionId)) {
          const highlightPath = this.calculateSectorPath(200, 200, 140, sector.startAngle, sector.width);
          
          preCalculatedData.partitionHighlights.push({
            partitionId,
            path: highlightPath,
            color,
            style: `fill: ${color}; opacity: 0.3;`
          });
        }
      } else {
        console.warn(`⚠️ Could not calculate position for token ${tokenIndex} (${word}) in partition ${partitionId}`);
      }
    });

    // Store pre-calculated data
    if (animationType === 'query') {
      this.preCalculatedQueryData = preCalculatedData;
    } else {
      this.preCalculatedDocumentData = preCalculatedData;
    }

    console.log(`✅ Pre-calculated ${preCalculatedData.tokens.length} tokens for ${animationType}`);
  }

  private calculateSectorData(hyperplanes: number[]): Array<{startAngle: number, width: number}> {
    const sectorBoundaries: number[] = [];
    
    // Create 6 sector boundaries from 3 hyperplanes
    hyperplanes.forEach(angle => {
      sectorBoundaries.push(angle);
      sectorBoundaries.push(angle + Math.PI);
    });
    
    sectorBoundaries.sort((a, b) => a - b);
    
    // Calculate sector start angles and widths
    const sectors = [];
    for (let i = 0; i < 6; i++) {
      const startAngle = sectorBoundaries[i];
      const endAngle = sectorBoundaries[(i + 1) % 6];
      
      let width = endAngle - startAngle;
      if (width <= 0) width += 2 * Math.PI;
      
      sectors.push({ startAngle, width });
    }
    
    return sectors;
  }

  private calculateSectorPath(centerX: number, centerY: number, radius: number, startAngle: number, width: number): string {
    const endAngle = startAngle + width;
    const x1 = centerX + Math.cos(startAngle) * radius;
    const y1 = centerY + Math.sin(startAngle) * radius;
    const x2 = centerX + Math.cos(endAngle) * radius;
    const y2 = centerY + Math.sin(endAngle) * radius;
    
    const largeArcFlag = width > Math.PI ? 1 : 0;
    
    return `M${centerX},${centerY}L${x1},${y1}A${radius},${radius},0,${largeArcFlag},1,${x2},${y2}Z`;
  }

  private getSectorBounds(partitionId: number, hyperplanes: number[]): {startAngle: number, width: number} {
    // Create 6 sector boundaries from 3 hyperplanes
    // Each hyperplane creates two boundaries (at angle and angle + π)
    const allBoundaries: number[] = [];
    
    // Add each hyperplane angle and its opposite
    hyperplanes.forEach(angle => {
      allBoundaries.push(angle);
      allBoundaries.push(angle + Math.PI);
    });
    
    // Sort boundaries to get proper sector divisions
    allBoundaries.sort((a, b) => a - b);
    
    // Normalize angles to 0-2π range
    const normalizedBoundaries = allBoundaries.map(angle => {
      while (angle < 0) angle += 2 * Math.PI;
      while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
      return angle;
    });
    
    normalizedBoundaries.sort((a, b) => a - b);
    
    // Calculate sector bounds for partitionId (1-6)
    const sectorIndex = (partitionId - 1) % 6;
    const startAngle = normalizedBoundaries[sectorIndex];
    const endAngle = normalizedBoundaries[(sectorIndex + 1) % 6];
    
    let width;
    if (endAngle > startAngle) {
      width = endAngle - startAngle;
    } else {
      // Handle wrap-around case
      width = (endAngle + 2 * Math.PI) - startAngle;
    }
    
    return { startAngle, width };
  }

  private findOptimalTokenPosition(
    centerX: number, 
    centerY: number, 
    circleRadius: number, 
    tokenRadius: number,
    sectorStartAngle: number,
    sectorWidth: number,
    partitionId: number,
    positionInSector: number
  ): {x: number, y: number} | null {
    
    console.log(`🎯 Finding position for token ${positionInSector} in sector ${partitionId}`);
    console.log(`  Sector: ${(sectorStartAngle * 180/Math.PI).toFixed(1)}° to ${((sectorStartAngle + sectorWidth) * 180/Math.PI).toFixed(1)}°`);
    
    // Calculate safe positioning boundaries
    const minRadius = 80; // Larger minimum to avoid center clustering
    const maxRadius = circleRadius - tokenRadius - 20; // More margin from boundary
    const sectorMargin = 0.15; // 15% margin from sector edges
    
    // Adjust sector bounds to add safety margins
    const safeStartAngle = sectorStartAngle + (sectorWidth * sectorMargin);
    const safeEndAngle = sectorStartAngle + sectorWidth - (sectorWidth * sectorMargin);
    const safeSectorWidth = safeEndAngle - safeStartAngle;
    
    if (safeSectorWidth <= 0) {
      console.warn('⚠️ Sector too narrow after applying margins');
      return null;
    }
    
    // Create a grid of candidate positions within the safe sector
    const candidatePositions: Array<{x: number, y: number, score: number}> = [];
    
    // Multiple radius rings for distribution
    const numRadiusRings = Math.floor((maxRadius - minRadius) / 25);
    const numAngleSteps = Math.max(3, Math.floor(safeSectorWidth * 8)); // More angular resolution
    
    for (let rIndex = 0; rIndex < numRadiusRings; rIndex++) {
      const radius = minRadius + (rIndex * (maxRadius - minRadius) / (numRadiusRings - 1));
      
      for (let aIndex = 0; aIndex < numAngleSteps; aIndex++) {
        const angle = safeStartAngle + (aIndex * safeSectorWidth / (numAngleSteps - 1));
        
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        // Calculate position quality score
        const score = this.calculatePositionScore(
          x, y, tokenRadius, centerX, centerY, circleRadius, 
          safeStartAngle, safeSectorWidth, partitionId
        );
        
        if (score > 0) {
          candidatePositions.push({ x, y, score });
        }
      }
    }
    
    if (candidatePositions.length === 0) {
      console.warn(`⚠️ No valid positions found for token ${positionInSector} in sector ${partitionId}`);
      return null;
    }
    
    // Sort by score (higher is better) and select best position
    candidatePositions.sort((a, b) => b.score - a.score);
    
    // For first token, use the best position
    // For subsequent tokens, add some variety by choosing from top positions
    const selectionIndex = Math.min(positionInSector, candidatePositions.length - 1);
    const selectedPosition = candidatePositions[selectionIndex];
    
    console.log(`✅ Selected position (${selectedPosition.x.toFixed(1)}, ${selectedPosition.y.toFixed(1)}) with score ${selectedPosition.score.toFixed(2)}`);
    
    return { x: selectedPosition.x, y: selectedPosition.y };
  }

  private calculatePositionScore(
    x: number, 
    y: number, 
    tokenRadius: number,
    centerX: number,
    centerY: number,
    circleRadius: number,
    sectorStartAngle: number,
    sectorWidth: number,
    partitionId: number
  ): number {
    let score = 100; // Start with perfect score
    
    // Check basic geometric constraints
    const distanceFromCenter = Math.sqrt((x - centerX)**2 + (y - centerY)**2);
    const distanceFromBoundary = circleRadius - distanceFromCenter;
    
    // Penalize positions too close to center or boundary
    if (distanceFromCenter < 80) return 0; // Reject center positions
    if (distanceFromBoundary < tokenRadius + 15) return 0; // Reject boundary positions
    
    // Check sector containment with strict validation
    if (!this.isStrictlyWithinSector(x, y, tokenRadius, centerX, centerY, sectorStartAngle, sectorWidth)) {
      return 0; // Reject positions outside sector
    }
    
    // Check overlap with existing tokens
    for (const existingPos of this.allTokenPositions) {
      if (existingPos) {
        const distance = Math.sqrt((x - existingPos.x)**2 + (y - existingPos.y)**2);
        const minDistance = tokenRadius + existingPos.radius + 15; // Required separation
        
        if (distance < minDistance) {
          return 0; // Reject overlapping positions
        }
        
        // Bonus for good spacing
        score += Math.min(10, (distance - minDistance) / 5);
      }
    }
    
    // Check distance from hyperplanes
    const hyperplanes = this.state.animationType === 'query' ? this.queryHyperplanes : this.documentHyperplanes;
    for (const hyperplaneAngle of hyperplanes) {
      const distanceToLine = Math.abs(
        Math.sin(hyperplaneAngle) * (x - centerX) - Math.cos(hyperplaneAngle) * (y - centerY)
      );
      
      if (distanceToLine < tokenRadius + 12) {
        return 0; // Reject positions too close to hyperplanes
      }
      
      // Bonus for good distance from hyperplanes
      score += Math.min(5, (distanceToLine - tokenRadius - 12) / 5);
    }
    
    // Check distance from coordinate axes
    const distanceFromHorizontalAxis = Math.abs(y - centerY);
    const distanceFromVerticalAxis = Math.abs(x - centerX);
    
    if (distanceFromHorizontalAxis < tokenRadius + 10 || distanceFromVerticalAxis < tokenRadius + 10) {
      return 0; // Reject positions too close to axes
    }
    
    // Bonus for being well-centered in the sector
    const currentAngle = Math.atan2(y - centerY, x - centerX);
    let normalizedAngle = currentAngle;
    if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
    
    const sectorCenterAngle = sectorStartAngle + sectorWidth / 2;
    const angleFromSectorCenter = Math.abs(normalizedAngle - sectorCenterAngle);
    score += Math.max(0, 20 - (angleFromSectorCenter * 10)); // Prefer sector center
    
    return score;
  }

  private isStrictlyWithinSector(
    x: number,
    y: number,
    tokenRadius: number,
    centerX: number,
    centerY: number,
    sectorStartAngle: number,
    sectorWidth: number
  ): boolean {
    // Get token center angle
    const tokenAngle = Math.atan2(y - centerY, x - centerX);
    let normalizedTokenAngle = tokenAngle;
    if (normalizedTokenAngle < 0) normalizedTokenAngle += 2 * Math.PI;
    
    // Calculate sector boundaries
    let normalizedStartAngle = sectorStartAngle;
    let normalizedEndAngle = sectorStartAngle + sectorWidth;
    
    // Normalize angles to [0, 2π)
    if (normalizedStartAngle < 0) normalizedStartAngle += 2 * Math.PI;
    if (normalizedEndAngle > 2 * Math.PI) normalizedEndAngle -= 2 * Math.PI;
    
    // Check if token center is within sector
    let withinSector = false;
    if (normalizedStartAngle <= normalizedEndAngle) {
      // Normal case - no wrapping
      withinSector = normalizedTokenAngle >= normalizedStartAngle && normalizedTokenAngle <= normalizedEndAngle;
    } else {
      // Wrapping case - sector crosses 0/2π boundary
      withinSector = normalizedTokenAngle >= normalizedStartAngle || normalizedTokenAngle <= normalizedEndAngle;
    }
    
    if (!withinSector) {
      return false;
    }
    
    // Check if token edges would extend outside sector (strict containment)
    const distanceFromCenter = Math.sqrt((x - centerX)**2 + (y - centerY)**2);
    const angularSize = Math.asin(tokenRadius / distanceFromCenter); // Angular size of token
    
    const tokenStartAngle = normalizedTokenAngle - angularSize;
    const tokenEndAngle = normalizedTokenAngle + angularSize;
    
    // Ensure entire token is within sector bounds
    if (normalizedStartAngle <= normalizedEndAngle) {
      return tokenStartAngle >= normalizedStartAngle && tokenEndAngle <= normalizedEndAngle;
    } else {
      // Wrapping case - more complex check needed
      return (tokenStartAngle >= normalizedStartAngle && tokenEndAngle >= normalizedStartAngle) ||
             (tokenStartAngle <= normalizedEndAngle && tokenEndAngle <= normalizedEndAngle);
    }
  }

  private findEmergencyTokenPosition(
    centerX: number,
    centerY: number, 
    circleRadius: number,
    tokenRadius: number,
    partitionId: number
  ): {x: number, y: number} | null {
    console.log(`🆘 Emergency positioning for partition ${partitionId}`);
    
    // Try to find ANY valid position in the circle, not restricted to specific sector
    const minRadius = 85;
    const maxRadius = circleRadius - tokenRadius - 25;
    const numAttempts = 20;
    
    for (let attempt = 0; attempt < numAttempts; attempt++) {
      // Generate random position
      const angle = Math.random() * 2 * Math.PI;
      const radius = minRadius + Math.random() * (maxRadius - minRadius);
      
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      // Check if this position is acceptable (less strict than sector positioning)
      if (this.isEmergencyPositionValid(x, y, tokenRadius, centerX, centerY, circleRadius)) {
        console.log(`✅ Found emergency position at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        return { x, y };
      }
    }
    
    console.error('❌ Emergency positioning failed');
    return null;
  }

  private isEmergencyPositionValid(
    x: number,
    y: number,
    tokenRadius: number,
    centerX: number,
    centerY: number,
    circleRadius: number
  ): boolean {
    // Basic distance checks
    const distanceFromCenter = Math.sqrt((x - centerX)**2 + (y - centerY)**2);
    if (distanceFromCenter < 85 || distanceFromCenter + tokenRadius > circleRadius - 20) {
      return false;
    }
    
    // Check overlap with existing tokens (more lenient)
    for (const existingPos of this.allTokenPositions) {
      if (existingPos) {
        const distance = Math.sqrt((x - existingPos.x)**2 + (y - existingPos.y)**2);
        if (distance < tokenRadius + existingPos.radius + 10) { // More lenient spacing
          return false;
        }
      }
    }
    
    // Check distance from axes (more lenient)
    const distanceFromHorizontalAxis = Math.abs(y - centerY);
    const distanceFromVerticalAxis = Math.abs(x - centerX);
    
    if (distanceFromHorizontalAxis < tokenRadius + 8 || distanceFromVerticalAxis < tokenRadius + 8) {
      return false;
    }
    
    return true;
  }

  private isValidTokenPositionInSector(
    testX: number,
    testY: number,
    tokenRadius: number,
    centerX: number,
    centerY: number,
    circleRadius: number,
    sectorStartAngle: number,
    sectorWidth: number
  ): boolean {
    // Check basic distance constraints
    const distanceFromCenter = Math.sqrt((testX - centerX)**2 + (testY - centerY)**2);
    if (distanceFromCenter < 60 || distanceFromCenter + tokenRadius > circleRadius - 8) {
      return false;
    }
    
    // Check if token is completely within the sector bounds
    const tokenAngle = Math.atan2(testY - centerY, testX - centerX);
    let normalizedAngle = tokenAngle;
    if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
    
    let sectorEndAngle = sectorStartAngle + sectorWidth;
    
    // Handle angle wrapping
    let normalizedStartAngle = sectorStartAngle;
    let normalizedEndAngle = sectorEndAngle;
    
    if (normalizedStartAngle < 0) normalizedStartAngle += 2 * Math.PI;
    if (normalizedEndAngle > 2 * Math.PI) normalizedEndAngle -= 2 * Math.PI;
    
    // Check if token center is within sector angular bounds
    let withinSector = false;
    if (normalizedStartAngle <= normalizedEndAngle) {
      // Normal case - no wrapping
      withinSector = normalizedAngle >= normalizedStartAngle && normalizedAngle <= normalizedEndAngle;
    } else {
      // Wrapping case - sector crosses 0/2π boundary
      withinSector = normalizedAngle >= normalizedStartAngle || normalizedAngle <= normalizedEndAngle;
    }
    
    if (!withinSector) return false;
    
    // Check angular margin - ensure token edges don't cross sector boundaries
    const angularMargin = Math.asin(tokenRadius / distanceFromCenter); // Approximate angular size of token
    const tokenStartAngle = normalizedAngle - angularMargin;
    const tokenEndAngle = normalizedAngle + angularMargin;
    
    if (normalizedStartAngle <= normalizedEndAngle) {
      if (tokenStartAngle < normalizedStartAngle || tokenEndAngle > normalizedEndAngle) {
        return false;
      }
    } else {
      if (!(tokenStartAngle >= normalizedStartAngle || tokenEndAngle <= normalizedEndAngle)) {
        return false;
      }
    }
    
    // Check overlap with already placed tokens
    for (const pos of this.allTokenPositions) {
      if (pos) {
        const distance = Math.sqrt((testX - pos.x)**2 + (testY - pos.y)**2);
        if (distance < (tokenRadius + pos.radius) * 1.4) { // Slightly tighter spacing
          return false;
        }
      }
    }
    
    // Check distance from hyperplanes
    const hyperplanes = this.state.animationType === 'query' ? this.queryHyperplanes : this.documentHyperplanes;
    for (const hyperplaneAngle of hyperplanes) {
      const distanceToLine = Math.abs(
        Math.sin(hyperplaneAngle) * (testX - centerX) - Math.cos(hyperplaneAngle) * (testY - centerY)
      );
      
      if (distanceToLine < tokenRadius + 10) { // Increased safe distance from hyperplanes
        return false;
      }
    }
    
    // Check distance from coordinate axes
    const distanceToHorizontalAxis = Math.abs(testY - centerY);
    const distanceToVerticalAxis = Math.abs(testX - centerX);
    
    if (distanceToHorizontalAxis < tokenRadius + 8 || distanceToVerticalAxis < tokenRadius + 8) {
      return false;
    }
    
    return true;
  }

  private isValidPreCalculatedPosition(
    testX: number, 
    testY: number, 
    tokenRadius: number, 
    centerX: number, 
    centerY: number, 
    circleRadius: number, 
    partitionId: number
  ): boolean {
    // Check distance from center - ensure not too close to center and not too close to boundary
    const distanceFromCenter = Math.sqrt((testX - centerX)**2 + (testY - centerY)**2);
    if (distanceFromCenter < 60 || distanceFromCenter + tokenRadius > circleRadius - 5) {
      return false;
    }
    
    // Check overlap with already calculated positions
    for (const pos of this.allTokenPositions) {
      if (pos) {
        const distance = Math.sqrt((testX - pos.x)**2 + (testY - pos.y)**2);
        if (distance < (tokenRadius + pos.radius) * 1.5) { // 1.5x for comfortable spacing
          return false;
        }
      }
    }
    
    // Check distance from hyperplanes (3 hyperplanes extending both ways)
    const hyperplanes = this.state.animationType === 'query' ? this.queryHyperplanes : this.documentHyperplanes;
    for (const hyperplaneAngle of hyperplanes) {
      // Check distance to hyperplane line that extends across the entire circle
      const distanceToLine = Math.abs(
        Math.sin(hyperplaneAngle) * (testX - centerX) - Math.cos(hyperplaneAngle) * (testY - centerY)
      );
      
      if (distanceToLine < tokenRadius + 8) {
        return false;
      }
    }
    
    // Check distance from coordinate axes
    const distanceToHorizontalAxis = Math.abs(testY - centerY);
    const distanceToVerticalAxis = Math.abs(testX - centerX);
    
    if (distanceToHorizontalAxis < tokenRadius + 8 || distanceToVerticalAxis < tokenRadius + 8) {
      return false;
    }
    
    return true;
  }
  
  private animateLoop(): void {
    if (this.state.isPaused) {
      setTimeout(() => this.animateLoop(), 100);
      return;
    }
    
    if (this.state.animationType === 'query') {
      this.animateQueryStep();
    } else {
      this.animateDocumentStep();
    }
  }
  
  private animateQueryStep(): void {
    const words = this.queryData.words;
    const partitions = this.queryData.partitions;
    
    if (this.state.step >= words.length) {
      // Query complete - now fill the Semantic Space Dimension panel
      setTimeout(() => {
        this.fillSemanticSpaceDimension();
      }, 1000);
      
      // Animation complete, pause for 3 seconds then switch to document
      setTimeout(() => {
        this.switchToDocumentAnimation();
      }, 5000);
      return;
    }
    
    const currentWord = words[this.state.step];
    const currentPartition = partitions[this.state.step];
    const currentColor = this.colors[this.state.step % this.colors.length];
    const currentToken = this.tokenAlphabets[this.state.step % this.tokenAlphabets.length]; // Use random token alphabet
    
    console.log(`Query Step ${this.state.step}: ${currentWord} (${currentToken}) → Partition ${currentPartition}`);
    
    // Update query text
    this.updateQueryText();
    
    // Highlight partition only if not already highlighted
    if (!this.highlightedSectors.has(currentPartition)) {
      this.highlightPartition(currentPartition, currentColor);
      this.highlightedSectors.add(currentPartition);
    }
    
    // Add token to partition
    this.addToken(currentToken, currentPartition, currentColor);
    
    // Skip FDE panel updates for query animation to match original
    // this.updateFDEPanelQuery();
    
    this.state.step++;
    
    // Continue animation after delay
    setTimeout(() => this.animateLoop(), 2000);
  }
  
  private animateDocumentStep(): void {
    const words = this.docData.words;
    const partitions = this.docData.partitions;
    
    if (this.state.step >= words.length) {
      // Document complete - now fill the Semantic Space Dimension panel with averaging logic
      setTimeout(() => {
        this.fillSemanticSpaceDimensionDocument();
      }, 1000);
      
      // Animation complete, pause for 3 seconds then restart with query
      setTimeout(() => {
        this.resetAnimation();
      }, 5000);
      return;
    }
    
    const currentWord = words[this.state.step];
    const currentPartition = partitions[this.state.step];
    const currentColor = this.colors[this.state.step % this.colors.length];
    const currentToken = currentWord.charAt(0).toLowerCase();
    
    console.log(`Doc Step ${this.state.step}: ${currentWord} (${currentToken}) → Partition ${currentPartition}`);
    
    // Update document text
    this.updateDocumentText();
    
    // Highlight partition
    this.highlightPartition(currentPartition, currentColor);
    
    // Add token to partition
    this.addToken(currentToken, currentPartition, currentColor);
    
    this.state.step++;
    
    // Continue animation after delay
    setTimeout(() => this.animateLoop(), 2000);
  }
  
  private updateQueryText(): void {
    const currentWords = this.queryData.words.slice(0, this.state.step + 1);
    const text = currentWords.join(' ');
    
    // Create colored text
    let coloredHTML = '';
    currentWords.forEach((word, i) => {
      const color = this.colors[i % this.colors.length];
      coloredHTML += `<span style="color: ${color}; font-weight: bold;">${word}</span>`;
      if (i < currentWords.length - 1) coloredHTML += ' ';
    });
    
    this.queryTextDiv.html(coloredHTML);
  }
  
  private updateDocumentText(): void {
    const currentWords = this.docData.words.slice(0, this.state.step + 1);
    const text = currentWords.join(' ');
    
    // Create colored text
    let coloredHTML = '';
    currentWords.forEach((word, i) => {
      const color = this.colors[i % this.colors.length];
      coloredHTML += `<span style="color: ${color}; font-weight: bold;">${word}</span>`;
      if (i < currentWords.length - 1) coloredHTML += ' ';
    });
    
    this.queryTextDivDoc.html(coloredHTML);
  }
  
  private highlightPartition(partitionId: number, color: string): void {
    const centerX = 200;
    const centerY = 200;
    const radius = 140;
    
    // Calculate partition sector using random hyperplanes
    const currentAnimationType = this.state.animationType;
    const hyperplanes = currentAnimationType === 'query' ? this.queryHyperplanes : this.documentHyperplanes;
    const currentSemanticSvg = currentAnimationType === 'query' ? this.semanticSvg : this.semanticSvgDoc;
    
    // Get sector bounds from 3 hyperplanes creating 6 sectors
    const sectorBounds = this.getSectorBounds(partitionId, hyperplanes);
    const startAngle = sectorBounds.startAngle;
    const endAngle = startAngle + sectorBounds.width;
    
    // Create partition path
    const path = d3.path();
    path.moveTo(centerX, centerY);
    path.arc(centerX, centerY, radius, startAngle, endAngle);
    path.closePath();
    
    currentSemanticSvg.append('path')
      .attr('class', `partition-highlight partition-${partitionId}`)
      .attr('d', path.toString())
      .style('fill', color)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .style('opacity', 0.3); // Much lighter highlighting
  }
  
  private addToken(token: string, partitionId: number, color: string): void {
    // Use pre-calculated position for this token
    const tokenIndex = this.state.step;
    const preCalculatedPosition = this.allTokenPositions[tokenIndex];
    
    let x, y;
    if (preCalculatedPosition) {
      x = preCalculatedPosition.x;
      y = preCalculatedPosition.y;
      console.log(`📍 Using pre-calculated position for token ${tokenIndex}: (${x.toFixed(1)}, ${y.toFixed(1)})`);
    } else {
      // Fallback: try to find a position dynamically
      console.warn(`⚠️ No pre-calculated position for token ${tokenIndex}, attempting dynamic fallback`);
      
      const fallbackPosition = this.findEmergencyTokenPosition(200, 200, 140, 16, partitionId);
      if (fallbackPosition) {
        x = fallbackPosition.x;
        y = fallbackPosition.y;
        console.log(`🆘 Emergency fallback position: (${x.toFixed(1)}, ${y.toFixed(1)})`);
      } else {
        // Last resort: place outside the circle to make the issue visible
        console.error(`❌ Could not find any position for token ${tokenIndex}, placing outside circle`);
        x = 350; // Outside the main circle
        y = 350;
      }
    }
    
    // Select appropriate SVG container based on animation type
    const currentSemanticSvg = this.state.animationType === 'query' ? this.semanticSvg : this.semanticSvgDoc;
    
    // Add token circle - no boundary, filled
    currentSemanticSvg.append('circle')
      .attr('class', `token token-p${partitionId}`)
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', 16)
      .style('fill', color)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .style('opacity', 1);
    
    // Add token letter - centered in circle
    currentSemanticSvg.append('text')
      .attr('class', `token-label token-p${partitionId}`)
      .attr('x', x)
      .attr('y', y)
      .text(token)
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .style('fill', 'white')
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'central')
      .style('font-family', 'Google Sans, sans-serif')
      .style('opacity', 0)
      .transition()
      .duration(500)
      .style('opacity', 1);
  }

  private isValidTokenPosition(
    testX: number, 
    testY: number, 
    tokenRadius: number, 
    centerX: number, 
    centerY: number, 
    circleRadius: number, 
    partitionId: number, 
    existingTokens: d3.Selection<d3.BaseType, unknown, HTMLElement, any>
  ): boolean {
    // Check 1: Token must be within main circle with buffer
    const distanceFromCenter = Math.sqrt((testX - centerX)**2 + (testY - centerY)**2);
    if (distanceFromCenter + tokenRadius > circleRadius - 5) {
      return false;
    }
    
    // Check 2: Token must not overlap with existing tokens
    let hasOverlap = false;
    existingTokens.each(function() {
      const existingX = +d3.select(this).attr('cx');
      const existingY = +d3.select(this).attr('cy');
      const distance = Math.sqrt((testX - existingX)**2 + (testY - existingY)**2);
      
      if (distance < tokenRadius * 2.5) { // 2.5 for more comfortable spacing
        hasOverlap = true;
      }
    });
    if (hasOverlap) return false;
    
    // Check 3: Token must not be too close to hyperplanes
    const currentAnimationType = this.state.animationType;
    const hyperplanes = currentAnimationType === 'query' ? this.queryHyperplanes : this.documentHyperplanes;
    
    for (let i = 0; i < 3; i++) {
      const hyperplaneAngle = hyperplanes[i];
      
      // Calculate distance from point to hyperplane (line from center)
      const lineStartX = centerX;
      const lineStartY = centerY;
      const lineEndX = centerX + Math.cos(hyperplaneAngle) * circleRadius;
      const lineEndY = centerY + Math.sin(hyperplaneAngle) * circleRadius;
      
      // Distance from point to line formula
      const A = lineEndY - lineStartY;
      const B = lineStartX - lineEndX;
      const C = lineEndX * lineStartY - lineStartX * lineEndY;
      
      const distanceToLine = Math.abs(A * testX + B * testY + C) / Math.sqrt(A * A + B * B);
      
      // Token must be at least tokenRadius + buffer away from hyperplane
      if (distanceToLine < tokenRadius + 8) {
        return false;
      }
    }
    
    // Check 4: Token must not be too close to coordinate axes
    const distanceToHorizontalAxis = Math.abs(testY - centerY);
    const distanceToVerticalAxis = Math.abs(testX - centerX);
    
    if (distanceToHorizontalAxis < tokenRadius + 8 || distanceToVerticalAxis < tokenRadius + 8) {
      return false;
    }
    
    return true;
  }
  
  private updateFDEPanelQuery(): void {
    // Group tokens by partition using real FDE data
    const partitionGroups: {[key: number]: string[]} = {};
    
    for (let i = 0; i <= this.state.step; i++) {
      const partition = this.queryData.partitions[i];
      const token = this.queryData.words[i].charAt(0).toLowerCase();
      
      if (!partitionGroups[partition]) {
        partitionGroups[partition] = [];
      }
      partitionGroups[partition].push(token);
    }
    
    // Update each partition row
    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      const tokens = partitionGroups[partitionId] || [];
      const text = tokens.length === 0 ? '000000000' : tokens.join(' + ');
      const textColor = tokens.length === 0 ? '#ccc' : '#333';
      
      d3.select(`#fde-text-${partitionId}`)
        .transition()
        .duration(300)
        .style('opacity', 0)
        .transition()
        .duration(300)
        .text(text)
        .style('fill', textColor)
        .style('opacity', 1);
      
      if (tokens.length > 0) {
        d3.select(`#fde-bg-${partitionId}`)
          .transition()
          .duration(300)
          .style('fill', '#e3f2fd')
          .style('stroke', '#1976d2')
          .style('stroke-width', '1px');
      }
    }
  }
  
  private updateFDEPanelDocument(): void {
    // Group tokens by partition using real FDE data
    const partitionGroups: {[key: number]: string[]} = {};
    
    for (let i = 0; i <= this.state.step; i++) {
      const partition = this.docData.partitions[i];
      const token = this.docData.words[i].charAt(0).toLowerCase();
      
      if (!partitionGroups[partition]) {
        partitionGroups[partition] = [];
      }
      partitionGroups[partition].push(token);
    }
    
    // Update each partition row
    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      const tokens = partitionGroups[partitionId] || [];
      let text = '';
      
      if (tokens.length === 0) {
        text = '000000000';
      } else if (tokens.length === 1) {
        text = tokens[0];
      } else {
        text = `(${tokens.join(' + ')}) / ${tokens.length}`;
      }
      
      const textColor = tokens.length === 0 ? '#ccc' : '#333';
      
      d3.select(`#fde-text-${partitionId}`)
        .transition()
        .duration(300)
        .style('opacity', 0)
        .transition()
        .duration(300)
        .text(text)
        .style('fill', textColor)
        .style('opacity', 1);
      
      if (tokens.length > 0) {
        d3.select(`#fde-bg-${partitionId}`)
          .transition()
          .duration(300)
          .style('fill', '#e8f5e8')
          .style('stroke', '#4caf50')
          .style('stroke-width', '1px');
      }
    }
  }
  
  private switchToDocumentAnimation(): void {
    console.log('🔄 Switching to Document animation...');
    
    // Update document title
    d3.select('#animation-title-doc').text('Document FDE Construction');
    
    // Clear document animation containers (query stays intact)
    this.semanticSvgDoc.selectAll('.partition-highlight, .token, .token-label').remove();
    
    this.state.animationType = 'document';
    this.state.step = 0;
    
    // Pre-calculate token positions for document animation
    this.preCalculateTokenPositions();
    
    // Continue animation
    setTimeout(() => this.animateLoop(), 1000);
  }
  
  // Store pre-drawn SVG groups for reuse
  private partitionSVGGroups: {[key: number]: d3.Selection<SVGGElement, unknown, HTMLElement, any>} = {};

  private fillSemanticSpaceDimension(): void {
    console.log('📊 Filling Semantic Space Dimension panel...');
    
    // Group tokens by partition
    const partitionGroups: {[key: number]: {tokens: string[], colors: string[]}} = {};
    
    for (let i = 0; i < this.queryData.words.length; i++) {
      const partition = this.queryData.partitions[i];
      const token = this.tokenAlphabets[i % this.tokenAlphabets.length];
      const color = this.colors[i % this.colors.length];
      
      if (!partitionGroups[partition]) {
        partitionGroups[partition] = {tokens: [], colors: []};
      }
      partitionGroups[partition].tokens.push(token);
      partitionGroups[partition].colors.push(color);
    }
    
    // Create pre-drawn SVG groups first
    this.createPreDrawnSVGGroups(partitionGroups);
    
    // Fill rows sequentially with delay using pre-drawn groups
    let delay = 0;
    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      setTimeout(() => {
        this.displayPartitionRow(partitionId, partitionGroups[partitionId] || null);
      }, delay);
      delay += 300; // 300ms between each row
    }
    
    // After dimension panel is complete, fill bottom panel using same SVG elements
    setTimeout(() => {
      this.fillBottomPanelWithSVGGroups(partitionGroups);
    }, delay + 500);
  }

  private createPreDrawnSVGGroups(partitionGroups: {[key: number]: {tokens: string[], colors: string[]}}): void {
    // Create a persistent hidden SVG container for storing reusable groups
    const hiddenSvg = d3.select('body')
      .append('svg')
      .attr('id', 'hidden-svg-container')
      .style('position', 'absolute')
      .style('top', '-10000px')
      .style('left', '-10000px')
      .style('width', '1px')
      .style('height', '1px')
      .style('visibility', 'hidden');

    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      const data = partitionGroups[partitionId];
      
      // Create SVG group in format: [sector_number_tokencircle1_+_tokencircle2_+...]
      const svgGroup = hiddenSvg.append('g')
        .attr('id', `partition-template-${partitionId}`);
      
      if (!data || data.tokens.length === 0) {
        // Empty partition: sector_number + "000000000"
        this.createEmptyPartitionSVG(svgGroup, partitionId);
      } else {
        // Active partition: sector_number + tokencircle1 + "+" + tokencircle2 + "+" + ...
        this.createActivePartitionSVG(svgGroup, partitionId, data);
      }
      
      // Store the group for reuse (keep reference to the persistent element)
      this.partitionSVGGroups[partitionId] = svgGroup;
    }
  }

  private createEmptyPartitionSVG(group: d3.Selection<SVGGElement, unknown, HTMLElement, any>, partitionId: number): void {
    // Format: [space+sectornumber+space+space+000000+space]
    let currentX = 10; // Start with space
    
    // Sector number inside the SVG box
    group.append('text')
      .attr('class', 'sector-number')
      .attr('x', currentX)
      .attr('y', 0)
      .text(partitionId.toString())
      .style('font-size', '24px') // Smaller to fit inside box
      .style('font-weight', 'bold')
      .style('fill', '#ccc')
      .style('font-family', 'Google Sans, sans-serif')
      .style('text-anchor', 'start')
      .style('dominant-baseline', 'central');
    
    currentX += 40; // Space after sector number
    
    // Deep grey 000000000 text
    group.append('text')
      .attr('class', 'empty-text')
      .attr('x', currentX)
      .attr('y', 0)
      .text('000000000')
      .style('font-size', '20px') // Smaller font to fit
      .style('font-weight', 'bold')
      .style('fill', '#999')
      .style('font-family', 'Google Sans, sans-serif')
      .style('text-anchor', 'start')
      .style('dominant-baseline', 'central');
  }

  private createActivePartitionSVG(
    group: d3.Selection<SVGGElement, unknown, HTMLElement, any>, 
    partitionId: number, 
    data: {tokens: string[], colors: string[]}
  ): void {
    // Format: [space+sectornumber+space+space+tokencircle1+space+plus+space+tokencircle2+space+plus+...+space]
    let currentX = 10; // Start with space
    
    // Sector number inside the SVG box
    group.append('text')
      .attr('class', 'sector-number')
      .attr('x', currentX)
      .attr('y', 0)
      .text(partitionId.toString())
      .style('font-size', '24px') // Smaller to fit inside box
      .style('font-weight', 'bold')
      .style('fill', '#666')
      .style('font-family', 'Google Sans, sans-serif')
      .style('text-anchor', 'start')
      .style('dominant-baseline', 'central');
    
    currentX += 50; // Space after sector number
    
    // Token circles with + symbols positioned between circle centers
    data.tokens.forEach((token, i) => {
      // Token circle - no boundary, centered text
      const circleX = currentX + 12;
      group.append('circle')
        .attr('class', `token-circle-${i}`)
        .attr('cx', circleX)
        .attr('cy', 0)
        .attr('r', 12) // Smaller radius to fit in box
        .style('fill', data.colors[i]);
      
      // Token letter - centered in circle
      group.append('text')
        .attr('class', `token-text-${i}`)
        .attr('x', circleX)
        .attr('y', 0)
        .text(token)
        .style('font-size', '12px') // Smaller font
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'central')
        .style('font-family', 'Google Sans, sans-serif');
      
      currentX += 24; // Space for circle (24 = diameter)
      
      // Add + symbol between circle centers if not last token
      if (i < data.tokens.length - 1) {
        const nextCircleX = currentX + 12; // Position of next circle center
        const plusX = (circleX + nextCircleX) / 2; // Exactly between circle centers
        
        group.append('text')
          .attr('class', `plus-symbol-${i}`)
          .attr('x', plusX)
          .attr('y', 0)
          .text('+')
          .style('font-size', '14px')
          .style('font-weight', 'bold')
          .style('fill', '#333')
          .style('text-anchor', 'middle')
          .style('dominant-baseline', 'central')
          .style('font-family', 'Google Sans, sans-serif');
      }
    });
  }

  private calculateSVGElementWidth(numTokens: number): number {
    // Enhanced calculation for precise SVG element width
    // Format: [startSpace + sectorNumber + midSpace + tokenCircles + plusSymbols + endSpace]
    
    if (numTokens === 0) {
      // Empty partition: space + sector + space + "000000000" + space
      return 10 + 40 + 10 + 100 + 10; // = 170px
    }
    
    // Constants for layout elements
    const startSpace = 10;        // Initial padding
    const sectorNumberWidth = 40; // Width for sector number
    const midSpace = 20;          // Space after sector number
    const tokenCircleDiameter = 24; // Diameter of each token circle
    const plusSymbolWidth = 20;   // Width allocated for each plus symbol
    const endSpace = 10;          // Final padding
    
    // Calculate total width for tokens and plus symbols
    // Token circles: n circles of 24px each
    const tokenCirclesWidth = numTokens * tokenCircleDiameter;
    
    // Plus symbols: (n-1) plus symbols of 20px each (placed between circles)
    const plusSymbolsWidth = Math.max(0, numTokens - 1) * plusSymbolWidth;
    
    // Total width calculation
    const totalWidth = startSpace + sectorNumberWidth + midSpace + 
                      tokenCirclesWidth + plusSymbolsWidth + endSpace;
    
    console.log(`📏 SVG width for ${numTokens} tokens: ${totalWidth}px`);
    return totalWidth;
  }

  private calculateDocumentSVGElementWidth(numTokens: number): number {
    // Calculate width for document averaging box format: [5] (i + c + g + h) / 4
    
    if (numTokens === 0) {
      // Empty partition: sector + "000000000"
      return 150; // Compact width for empty
    }
    
    if (numTokens === 1) {
      // Single token: sector + token circle
      return 80; // Compact width for single token
    }
    
    // Multiple tokens: sector + "(" + tokens + "+" + ")" + "/" + count
    const sectorWidth = 40;        // Width for sector number
    const parenWidth = 15;         // Each parenthesis
    const tokenCircleWidth = 20;   // Each token circle (diameter + spacing)
    const plusWidth = 15;          // Each plus symbol
    const divisionWidth = 30;      // "/ n" text
    const padding = 20;            // Left and right padding
    
    const tokensWidth = numTokens * tokenCircleWidth;
    const plusesWidth = (numTokens - 1) * plusWidth;
    
    const totalWidth = padding + sectorWidth + parenWidth + tokensWidth + 
                      plusesWidth + parenWidth + divisionWidth;
    
    console.log(`📏 Document SVG width for ${numTokens} tokens: ${totalWidth}px`);
    return totalWidth;
  }

  private displayPartitionRow(partitionId: number, data: {tokens: string[], colors: string[]} | null): void {
    const y = 25 + (partitionId - 1) * 35; // Updated positioning for larger height
    const rowGroup = d3.select(`#fde-row-${partitionId}`);
    
    // Calculate dynamic width based on actual content or maximum possible
    const actualWidth = this.calculateSVGElementWidth(data ? data.tokens.length : 0);
    const maxPossibleWidth = this.calculateSVGElementWidth(8); // Support up to 8 tokens maximum
    
    // Use the maximum width for consistent layout
    const boxWidth = maxPossibleWidth;
    
    // Add SVG box background rectangle with calculated maximum width
    rowGroup.append('rect')
      .attr('x', 10)
      .attr('y', y - 18) // Larger height
      .attr('width', boxWidth)
      .attr('height', 36) // Larger height for sector numbers
      .style('fill', data && data.tokens.length > 0 ? '#f0f8ff' : '#f8f9fa') // Light blue for active
      .style('stroke', '#e0e0e0')
      .style('stroke-width', '1px');
    
    // Clone and position the pre-drawn SVG group inside the box
    const preDrawnGroup = this.partitionSVGGroups[partitionId];
    if (preDrawnGroup) {
      const clonedGroup = rowGroup.append('g')
        .attr('transform', `translate(10, ${y})`) // Position inside box
        .html(preDrawnGroup.html());
    }
    
    // Animate row appearance
    rowGroup.transition()
      .duration(500)
      .style('opacity', 1);
  }

  private fillBottomPanelWithSVGGroups(partitionGroups: {[key: number]: {tokens: string[], colors: string[]}}): void {
    console.log('📊 Filling bottom panel with complete SVG box elements...');
    
    let currentX = 10;
    const boxHeight = 30; // Height for bottom boxes
    const boxY = 25; // Vertical position for boxes
    
    // Show complete SVG boxes from semantic list (including background rectangles) for ALL 6 sectors
    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      const data = partitionGroups[partitionId];
      
      // Calculate box width using enhanced calculation method
      const boxWidth = this.calculateSVGElementWidth(data ? data.tokens.length : 0);
      
      // Add background rectangle (same as semantic boxes) for ALL sectors
      this.bottomSvg.append('rect')
        .attr('x', currentX)
        .attr('y', boxY - 15)
        .attr('width', boxWidth)
        .attr('height', boxHeight)
        .style('fill', '#f0f8ff') // Light blue background
        .style('stroke', '#e0e0e0')
        .style('stroke-width', '1px')
        .style('opacity', 0)
        .transition()
        .duration(300)
        .style('opacity', 1);
      
      const preDrawnGroup = this.partitionSVGGroups[partitionId];
      if (preDrawnGroup) {
        // Clone the complete group (including sector number for now, then remove)
        const clonedGroup = this.bottomSvg.append('g')
          .attr('transform', `translate(${currentX + 5}, ${boxY})`)
          .html(preDrawnGroup.html());
        
        // Remove sector number but keep all other elements
        clonedGroup.selectAll('.sector-number').remove();
        
        // Adjust sizes for bottom panel
        clonedGroup.selectAll('circle')
          .attr('r', 10) // Medium size for bottom
          .attr('cy', 0);
        clonedGroup.selectAll('text:not(.sector-number)')
          .style('font-size', '11px') // Readable size for bottom
          .attr('y', 0); // Center text in circles
        
        // Animate appearance
        clonedGroup.style('opacity', 0)
          .transition()
          .duration(300)
          .style('opacity', 1);
      }
      
      currentX += boxWidth + 15; // Space between boxes
    }
  }

  private fillSemanticSpaceDimensionDocument(): void {
    console.log('📊 Filling Semantic Space Dimension panel with Document averaging logic...');
    
    // Group tokens by partition
    const partitionGroups: {[key: number]: {tokens: string[], colors: string[]}} = {};
    
    for (let i = 0; i < this.docData.words.length; i++) {
      const partition = this.docData.partitions[i];
      const token = this.docData.words[i].charAt(0).toLowerCase();
      const color = this.colors[i % this.colors.length];
      
      if (!partitionGroups[partition]) {
        partitionGroups[partition] = {tokens: [], colors: []};
      }
      partitionGroups[partition].tokens.push(token);
      partitionGroups[partition].colors.push(color);
    }
    
    // Create pre-drawn SVG groups with document-specific averaging display
    this.createPreDrawnSVGGroupsDocument(partitionGroups);
    
    // Fill rows sequentially with delay using document-specific groups
    let delay = 0;
    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      setTimeout(() => {
        this.displayPartitionRowDocument(partitionId, partitionGroups[partitionId] || null);
      }, delay);
      delay += 300;
    }
    
    // Fill bottom panel with document averaging format
    setTimeout(() => {
      this.fillBottomPanelDocument(partitionGroups);
    }, delay + 500);
  }

  private createPreDrawnSVGGroupsDocument(partitionGroups: {[key: number]: {tokens: string[], colors: string[]}}): void {
    // Remove existing hidden container if it exists
    d3.select('#hidden-svg-container-doc').remove();
    
    // Create new hidden SVG container for document groups
    const hiddenSvg = d3.select('body')
      .append('svg')
      .attr('id', 'hidden-svg-container-doc')
      .style('position', 'absolute')
      .style('top', '-10000px')
      .style('left', '-10000px')
      .style('width', '1px')
      .style('height', '1px')
      .style('visibility', 'hidden');

    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      const data = partitionGroups[partitionId];
      
      const svgGroup = hiddenSvg.append('g')
        .attr('id', `partition-doc-template-${partitionId}`);
      
      if (!data || data.tokens.length === 0) {
        this.createEmptyPartitionSVG(svgGroup, partitionId);
      } else {
        this.createActivePartitionSVGDocument(svgGroup, partitionId, data);
      }
      
      // Store in the same groups object but with different ID for document
      this.partitionSVGGroups[partitionId] = svgGroup;
    }
  }

  private createActivePartitionSVGDocument(
    group: d3.Selection<SVGGElement, unknown, HTMLElement, any>, 
    partitionId: number, 
    data: {tokens: string[], colors: string[]}
  ): void {
    // Calculate box dimensions for single SVG element
    const boxWidth = this.calculateDocumentSVGElementWidth(data.tokens.length);
    const boxHeight = 30;
    const boxX = 0;
    const boxY = -15;
    
    // Create single background rectangle for the entire expression
    group.append('rect')
      .attr('class', 'averaging-box')
      .attr('x', boxX)
      .attr('y', boxY)
      .attr('width', boxWidth)
      .attr('height', boxHeight)
      .style('fill', '#e8f5e8') // Light green background for document
      .style('stroke', '#4caf50')
      .style('stroke-width', '2px');
    
    // Start positioning elements inside the box
    let currentX = 10; // Start with padding from left edge
    
    // Sector number inside the box
    group.append('text')
      .attr('class', 'sector-number')
      .attr('x', currentX + 15)
      .attr('y', 0)
      .text(partitionId.toString())
      .style('font-size', '20px')
      .style('font-weight', 'bold')
      .style('fill', '#666')
      .style('font-family', 'Google Sans, sans-serif')
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'central');
    
    currentX += 40; // Move past sector number
    
    if (data.tokens.length === 1) {
      // Single token - no averaging needed, just show the token
      group.append('circle')
        .attr('class', 'token-circle-0')
        .attr('cx', currentX + 12)
        .attr('cy', 0)
        .attr('r', 12)
        .style('fill', data.colors[0])
        .style('stroke', 'white')
        .style('stroke-width', '2px');
      
      group.append('text')
        .attr('class', 'token-text-0')
        .attr('x', currentX + 12)
        .attr('y', 0)
        .text(data.tokens[0])
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'central')
        .style('font-family', 'Google Sans, sans-serif');
    } else {
      // Multiple tokens - show complete averaging expression in single box: (a + b + c) / n
      
      // Opening parenthesis
      group.append('text')
        .attr('class', 'paren-open')
        .attr('x', currentX)
        .attr('y', 0)
        .text('(')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .style('fill', '#333')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'central')
        .style('font-family', 'Google Sans, sans-serif');
      currentX += 15;
      
      // Token circles with + symbols - more compact spacing
      data.tokens.forEach((token, i) => {
        // Token circle
        group.append('circle')
          .attr('class', `token-circle-${i}`)
          .attr('cx', currentX + 10)
          .attr('cy', 0)
          .attr('r', 10)
          .style('fill', data.colors[i])
          .style('stroke', 'white')
          .style('stroke-width', '1px');
        
        // Token letter
        group.append('text')
          .attr('class', `token-text-${i}`)
          .attr('x', currentX + 10)
          .attr('y', 0)
          .text(token)
          .style('font-size', '10px')
          .style('font-weight', 'bold')
          .style('fill', 'white')
          .style('text-anchor', 'middle')
          .style('dominant-baseline', 'central')
          .style('font-family', 'Google Sans, sans-serif');
        
        currentX += 20; // Compact spacing
        
        // Add + symbol if not last token
        if (i < data.tokens.length - 1) {
          group.append('text')
            .attr('class', `plus-symbol-${i}`)
            .attr('x', currentX)
            .attr('y', 0)
            .text('+')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .style('fill', '#333')
            .style('text-anchor', 'middle')
            .style('dominant-baseline', 'central')
            .style('font-family', 'Google Sans, sans-serif');
          currentX += 15;
        }
      });
      
      // Closing parenthesis
      group.append('text')
        .attr('class', 'paren-close')
        .attr('x', currentX)
        .attr('y', 0)
        .text(')')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .style('fill', '#333')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'central')
        .style('font-family', 'Google Sans, sans-serif');
      currentX += 20;
      
      // Division symbol and count
      group.append('text')
        .attr('class', 'division')
        .attr('x', currentX)
        .attr('y', 0)
        .text(`/ ${data.tokens.length}`)
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .style('fill', '#333')
        .style('text-anchor', 'start')
        .style('dominant-baseline', 'central')
        .style('font-family', 'Google Sans, sans-serif');
    }
  }

  private displayPartitionRowDocument(partitionId: number, data: {tokens: string[], colors: string[]} | null): void {
    const y = 25 + (partitionId - 1) * 35; // Match query panel spacing
    const rowGroup = d3.select(`#fde-row-doc-${partitionId}`);
    
    // Add background rectangle
    if (!data || data.tokens.length === 0) {
      rowGroup.append('rect')
        .attr('x', 30)
        .attr('y', y - 12)
        .attr('width', 300)
        .attr('height', 20)
        .style('fill', '#f8f9fa')
        .style('stroke', '#e9ecef');
    } else {
      const sectorColor = data.colors[0];
      rowGroup.append('rect')
        .attr('x', 30)
        .attr('y', y - 12)
        .attr('width', 300)
        .attr('height', 20)
        .style('fill', '#e8f5e8')  // Document uses green background
        .style('opacity', 0.2)
        .style('stroke', '#4caf50');
    }
    
    // Clone and position the document-specific pre-drawn SVG group
    const preDrawnGroup = this.partitionSVGGroups[partitionId];
    if (preDrawnGroup) {
      const clonedGroup = rowGroup.append('g')
        .attr('transform', `translate(20, ${y})`)
        .html(preDrawnGroup.html());
    }
    
    // Animate row appearance
    rowGroup.transition()
      .duration(500)
      .style('opacity', 1);
  }

  private fillBottomPanelDocument(partitionGroups: {[key: number]: {tokens: string[], colors: string[]}}): void {
    console.log('📊 Filling bottom panel with document averaging format (complete SVG boxes)...');
    
    let currentX = 10;
    const boxHeight = 30; // Height for bottom boxes
    const boxY = 25; // Vertical position for boxes
    
    // Show complete SVG boxes from semantic list (including background rectangles) for ALL 6 sectors
    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      const data = partitionGroups[partitionId];
      
      // Calculate box width using enhanced calculation method
      const boxWidth = this.calculateSVGElementWidth(data ? data.tokens.length : 0);
      
      // Add background rectangle (document uses green background) for ALL sectors
      this.bottomSvgDoc.append('rect')
        .attr('x', currentX)
        .attr('y', boxY - 15)
        .attr('width', boxWidth)
        .attr('height', boxHeight)
        .style('fill', '#e8f5e8') // Light green background for document
        .style('stroke', '#e0e0e0')
        .style('stroke-width', '1px')
        .style('opacity', 0)
        .transition()
        .duration(300)
        .style('opacity', 1);
      
      const preDrawnGroup = this.partitionSVGGroups[partitionId];
      if (preDrawnGroup) {
        // Clone the complete group
        const clonedGroup = this.bottomSvgDoc.append('g')
          .attr('transform', `translate(${currentX + 5}, ${boxY})`)
          .html(preDrawnGroup.html());
        
        // Remove sector number but keep all other elements including parentheses
        clonedGroup.selectAll('.sector-number').remove();
        
        // Adjust sizes for bottom panel
        clonedGroup.selectAll('circle')
          .attr('r', 10) // Medium size for bottom
          .attr('cy', 0);
        clonedGroup.selectAll('text:not(.sector-number)')
          .style('font-size', '11px') // Readable size for bottom
          .attr('y', 0); // Center text in circles
        
        // Animate appearance
        clonedGroup.style('opacity', 0)
          .transition()
          .duration(300)
          .style('opacity', 1);
      }
      
      currentX += boxWidth + 15; // Space between boxes
    }
  }

  private resetAnimation(): void {
    console.log('🔄 Restarting Query animation...');
    
    // Update title back to query
    d3.select('#animation-title').text('Query FDE Construction');
    
    this.state.animationType = 'query';
    
    // Clear everything
    this.setupInitialView('query'); // Use query hyperplanes
    this.queryTextDiv.html('');
    this.highlightedSectors.clear();
    
    this.state.step = 0;
    
    // Pre-calculate all animation data
    this.preCalculateAllData();
    
    // Restart background FDE processing for the new cycle
    this.initializeBackgroundProcessing();
    
    // Restart animation
    setTimeout(() => this.animateLoop(), 2000);
  }

  // Cleanup method for proper resource management
  public cleanup(): void {
    if (this.backgroundFDE) {
      this.backgroundFDE.destroy();
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MuVeRaAnimation();
});