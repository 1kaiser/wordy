/**
 * Retrieval Module
 * Handles semantic search and similarity calculations
 *
 * Usage:
 *   import { RetrievalModule } from './modules/retrieval-module.js';
 *   const retriever = new RetrievalModule(corpusData);
 *   const results = retriever.search(queryEmbedding, topK=5);
 */

export class RetrievalModule {
    constructor(config = {}) {
        this.corpus = config.corpus || { words: [], embeddings: null };
        this.embeddingDim = config.embeddingDim || 768;
        this.cache = new Map();  // Cache search results
    }

    /**
     * Load corpus data
     * @param {object} corpus - {words: string[], embeddings: Float32Array}
     */
    loadCorpus(corpus) {
        this.corpus = corpus;
        this.cache.clear();
        console.log(`✅ Loaded corpus: ${corpus.words.length} words`);
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param {Float32Array} a - First vector
     * @param {Float32Array} b - Second vector
     * @returns {number} - Similarity score (0-1)
     */
    cosineSimilarity(a, b) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Search for similar words/documents
     * @param {Float32Array|string} query - Query embedding or word
     * @param {number} topK - Number of results to return
     * @param {object} options - Additional options
     * @returns {Array} - [{word, similarity, index}]
     */
    search(query, topK = 5, options = {}) {
        const { excludeQuery = true, minSimilarity = 0.0 } = options;

        // Get query embedding
        let queryEmbedding;
        let queryWord = null;

        if (typeof query === 'string') {
            // Query is a word, get its embedding from corpus
            const queryIndex = this.corpus.words.indexOf(query);
            if (queryIndex === -1) {
                console.warn(`Word "${query}" not found in corpus`);
                return [];
            }

            queryWord = query;
            queryEmbedding = this.corpus.embeddings.slice(
                queryIndex * this.embeddingDim,
                (queryIndex + 1) * this.embeddingDim
            );

            // Check cache
            const cacheKey = `${query}_${topK}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }
        } else {
            // Query is an embedding
            queryEmbedding = query;
        }

        // Calculate similarities
        const similarities = [];
        const numWords = this.corpus.words.length;

        for (let i = 0; i < numWords; i++) {
            const word = this.corpus.words[i];

            // Skip query word if specified
            if (excludeQuery && word === queryWord) continue;

            const candidateEmbedding = this.corpus.embeddings.slice(
                i * this.embeddingDim,
                (i + 1) * this.embeddingDim
            );

            const similarity = this.cosineSimilarity(queryEmbedding, candidateEmbedding);

            if (similarity >= minSimilarity) {
                similarities.push({
                    word: word,
                    similarity: similarity,
                    index: i
                });
            }
        }

        // Sort by similarity (highest first)
        similarities.sort((a, b) => b.similarity - a.similarity);

        // Return top K results
        const results = similarities.slice(0, topK);

        // Cache results if query was a word
        if (queryWord) {
            const cacheKey = `${queryWord}_${topK}`;
            this.cache.set(cacheKey, results);
        }

        return results;
    }

    /**
     * Batch search for multiple queries
     * @param {Array} queries - Array of query embeddings or words
     * @param {number} topK - Number of results per query
     * @returns {Array} - Array of result arrays
     */
    batchSearch(queries, topK = 5, options = {}) {
        return queries.map(query => this.search(query, topK, options));
    }

    /**
     * Get embedding for a word in corpus
     * @param {string} word - Word to get embedding for
     * @returns {Float32Array|null} - Embedding or null if not found
     */
    getEmbedding(word) {
        const index = this.corpus.words.indexOf(word);
        if (index === -1) return null;

        return this.corpus.embeddings.slice(
            index * this.embeddingDim,
            (index + 1) * this.embeddingDim
        );
    }

    /**
     * Check if word exists in corpus
     * @param {string} word - Word to check
     * @returns {boolean}
     */
    hasWord(word) {
        return this.corpus.words.includes(word);
    }

    /**
     * Get corpus statistics
     * @returns {object}
     */
    getStats() {
        return {
            totalWords: this.corpus.words.length,
            embeddingDim: this.embeddingDim,
            cacheSize: this.cache.size,
            memoryUsage: this.corpus.embeddings ? this.corpus.embeddings.byteLength : 0
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('✅ Cache cleared');
    }
}
