/**
 * Combined Corpus Builder
 *
 * Combines WordNet + Oxford Science Dictionary into a single corpus
 * Generates embeddings and prepares for UMAP + Voy Search
 */

import { WordNetExtractor } from './wordnet-extractor/index.js';
import { ScienceDictExtractor } from './science-dict-extractor/index.js';
import { EmbeddingModel } from './embedding-model/index.js';

export class CombinedCorpusBuilder {
    constructor() {
        this.wordNetExtractor = new WordNetExtractor('dict');
        this.scienceExtractor = new ScienceDictExtractor('32145473.txt');
        this.embedder = null;

        // Combined data
        this.allWords = [];
        this.allMetadata = [];
        this.embeddings = [];

        // Progress tracking
        this.progressCallback = null;
    }

    /**
     * Set progress callback
     * @param {Function} callback - Called with (phase, current, total, message)
     */
    onProgress(callback) {
        this.progressCallback = callback;
    }

    /**
     * Report progress
     */
    reportProgress(phase, current, total, message) {
        if (this.progressCallback) {
            this.progressCallback(phase, current, total, message);
        }
        console.log(`[${phase}] ${message} (${current}/${total})`);
    }

    /**
     * Extract all words from both sources
     */
    async extractAllWords() {
        this.reportProgress('extraction', 0, 2, 'Starting word extraction...');

        // Extract WordNet words
        this.reportProgress('extraction', 0, 2, 'Extracting WordNet words...');
        const wordnetData = await this.wordNetExtractor.extractAndSerialize();

        // Extract Science Dictionary terms
        this.reportProgress('extraction', 1, 2, 'Extracting Science Dictionary terms...');
        const scienceData = await this.scienceExtractor.extractAndSerialize();

        // Combine and deduplicate
        const wordSet = new Set();
        this.allWords = [];
        this.allMetadata = [];

        // Add WordNet words
        for (let i = 0; i < wordnetData.words.length; i++) {
            const word = wordnetData.words[i].toLowerCase();
            if (!wordSet.has(word)) {
                wordSet.add(word);
                this.allWords.push(word);
                this.allMetadata.push({
                    source: 'wordnet',
                    pos: wordnetData.metadata[i].pos,
                    posIndex: wordnetData.metadata[i].labelIndex,
                    category: null,
                    categoryIndex: null
                });
            }
        }

        // Add Science Dictionary words (mark duplicates)
        for (let i = 0; i < scienceData.terms.length; i++) {
            const word = scienceData.terms[i].toLowerCase();
            const isNew = !wordSet.has(word);

            if (isNew) {
                wordSet.add(word);
                this.allWords.push(word);
            }

            // Mark as science term (even if duplicate)
            const idx = this.allWords.indexOf(word);
            this.allMetadata[idx] = {
                ...this.allMetadata[idx],
                source: isNew ? 'science' : 'both',
                category: scienceData.metadata[i].category,
                categoryIndex: scienceData.metadata[i].labelIndex
            };
        }

        this.reportProgress('extraction', 2, 2, `Extracted ${this.allWords.length} unique words`);

        return {
            totalWords: this.allWords.length,
            wordnetOnly: wordnetData.words.length,
            scienceOnly: scienceData.terms.length,
            overlap: wordnetData.words.length + scienceData.terms.length - this.allWords.length
        };
    }

    /**
     * Generate embeddings for all words
     * @param {number} batchSize - Batch size for embedding generation
     */
    async generateEmbeddings(batchSize = 50) {
        if (this.allWords.length === 0) {
            await this.extractAllWords();
        }

        this.reportProgress('embeddings', 0, this.allWords.length, 'Loading embedding model...');

        // Load model
        this.embedder = new EmbeddingModel();
        await this.embedder.load();

        this.reportProgress('embeddings', 0, this.allWords.length, 'Generating embeddings...');

        // Generate embeddings in batches
        this.embeddings = [];
        const totalBatches = Math.ceil(this.allWords.length / batchSize);

        for (let i = 0; i < this.allWords.length; i += batchSize) {
            const batch = this.allWords.slice(i, i + batchSize);
            const batchEmbeddings = await this.embedder.embed(batch);

            this.embeddings.push(...batchEmbeddings);

            const currentBatch = Math.floor(i / batchSize) + 1;
            const progress = Math.floor((i / this.allWords.length) * 100);

            this.reportProgress(
                'embeddings',
                i + batch.length,
                this.allWords.length,
                `Batch ${currentBatch}/${totalBatches} (${progress}%)`
            );

            // Save progress to IndexedDB periodically
            if (i % (batchSize * 10) === 0) {
                await this.saveProgressToCache();
            }
        }

        this.reportProgress('embeddings', this.allWords.length, this.allWords.length, 'Embeddings complete!');

        return this.embeddings;
    }

    /**
     * Save progress to IndexedDB
     */
    async saveProgressToCache() {
        const db = await this.openDatabase();
        const tx = db.transaction('embeddings', 'readwrite');
        const store = tx.objectStore('embeddings');

        await store.put({
            id: 'corpus-embeddings',
            words: this.allWords,
            metadata: this.allMetadata,
            embeddings: this.embeddings,
            timestamp: Date.now(),
            version: '1.0'
        });

        await tx.done;
        console.log('Progress saved to cache');
    }

    /**
     * Load progress from IndexedDB
     */
    async loadProgressFromCache() {
        try {
            const db = await this.openDatabase();
            const tx = db.transaction('embeddings', 'readonly');
            const store = tx.objectStore('embeddings');
            const data = await store.get('corpus-embeddings');

            if (data) {
                this.allWords = data.words;
                this.allMetadata = data.metadata;
                this.embeddings = data.embeddings;
                console.log(`Loaded ${this.embeddings.length} embeddings from cache`);
                return true;
            }
        } catch (error) {
            console.error('Error loading from cache:', error);
        }
        return false;
    }

    /**
     * Open IndexedDB database
     */
    async openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('WordNetScienceCorpus', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('embeddings')) {
                    db.createObjectStore('embeddings', { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Build complete corpus with embeddings
     * @param {boolean} useCache - Try to load from cache first
     */
    async buildCorpus(useCache = true) {
        // Try loading from cache
        if (useCache) {
            const loaded = await this.loadProgressFromCache();
            if (loaded && this.embeddings.length === this.allWords.length) {
                this.reportProgress('cache', 1, 1, 'Loaded complete corpus from cache');
                return this.getCorpusData();
            }
        }

        // Extract words
        const stats = await this.extractAllWords();

        // Generate embeddings
        await this.generateEmbeddings();

        // Save to cache
        await this.saveProgressToCache();

        return this.getCorpusData();
    }

    /**
     * Get corpus data
     */
    getCorpusData() {
        return {
            words: this.allWords,
            metadata: this.allMetadata,
            embeddings: this.embeddings,
            statistics: this.getStatistics()
        };
    }

    /**
     * Get statistics
     */
    getStatistics() {
        const stats = {
            total: this.allWords.length,
            sources: {
                wordnet: 0,
                science: 0,
                both: 0
            },
            pos: {},
            categories: {}
        };

        for (const meta of this.allMetadata) {
            stats.sources[meta.source]++;

            if (meta.pos) {
                stats.pos[meta.pos] = (stats.pos[meta.pos] || 0) + 1;
            }

            if (meta.category) {
                stats.categories[meta.category] = (stats.categories[meta.category] || 0) + 1;
            }
        }

        return stats;
    }
}

export default CombinedCorpusBuilder;
