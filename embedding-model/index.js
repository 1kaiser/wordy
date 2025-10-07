/**
 * Embedding Model Module - Generate Semantic Text Embeddings
 *
 * A plug-and-play WASM-based text embedding model using Transformers.js
 * Works in any browser, no backend required
 *
 * Model: onnx-community/embeddinggemma-300m-ONNX (768-dimensional embeddings)
 * Size: ~300MB quantized to q4 (downloaded once, cached)
 *
 * @example
 * import { EmbeddingModel } from './embedding-model/index.js';
 *
 * const embedder = new EmbeddingModel();
 * await embedder.load();
 * const embeddings = await embedder.embed(['Hello world', 'AI is amazing']);
 */

export class EmbeddingModel {
    constructor() {
        this.worker = null;
        this.ready = false;
        this.modelLoaded = false;
        this.modelName = 'onnx-community/embeddinggemma-300m-ONNX';
        this.dimensions = 768;
    }

    /**
     * Load the embedding model
     * Downloads model on first use (~50MB, cached afterwards)
     *
     * @returns {Promise<void>}
     *
     * @example
     * const embedder = new EmbeddingModel();
     * await embedder.load(); // May take 10-30s on first load
     */
    async load() {
        return new Promise((resolve, reject) => {
            try {
                this.worker = new Worker(
                    new URL('./embedding-worker.js', import.meta.url),
                    { type: 'module' }
                );

                this.worker.onmessage = (e) => {
                    const { type, error } = e.data;

                    if (type === 'ready') {
                        this.ready = true;
                        this.modelLoaded = true;
                        resolve();
                    } else if (type === 'error') {
                        reject(new Error(error));
                    } else if (type === 'progress') {
                        // Progress callback (optional)
                        if (this.onProgress) {
                            this.onProgress(e.data.progress, e.data.status);
                        }
                    }
                };

                this.worker.onerror = (error) => {
                    reject(new Error(`Embedding worker error: ${error.message}`));
                };

                // Initialize worker
                this.worker.postMessage({ type: 'init' });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Generate embeddings for text(s)
     *
     * @param {string|string[]} texts - Single text or array of texts
     * @param {Object} options - Optional configuration
     * @param {string} options.prefix - Prefix for embeddings (default: 'title: none | text:')
     * @returns {Promise<Float32Array[]>} - Array of embedding vectors (768D each)
     *
     * @example
     * // Single text
     * const embedding = await embedder.embed('Hello world');
     * console.log(embedding[0]); // Float32Array(768)
     *
     * // Multiple texts
     * const embeddings = await embedder.embed([
     *     'First document',
     *     'Second document'
     * ]);
     * console.log(embeddings.length); // 2
     * console.log(embeddings[0].length); // 768
     */
    async embed(texts, options = {}) {
        if (!this.modelLoaded) {
            throw new Error('Model not loaded. Call load() first.');
        }

        // Normalize to array
        const textsArray = Array.isArray(texts) ? texts : [texts];

        return new Promise((resolve, reject) => {
            const handler = (e) => {
                const { type, embeddings, error } = e.data;

                if (type === 'embeddings') {
                    this.worker.removeEventListener('message', handler);
                    resolve(embeddings);
                } else if (type === 'error') {
                    this.worker.removeEventListener('message', handler);
                    reject(new Error(error));
                }
            };

            this.worker.addEventListener('message', handler);

            this.worker.postMessage({
                type: 'embed',
                data: {
                    texts: textsArray,
                    prefixes: options.prefix || 'title: none | text:'
                }
            });
        });
    }

    /**
     * Calculate cosine similarity between two embeddings
     *
     * @param {Float32Array} embedding1 - First embedding vector
     * @param {Float32Array} embedding2 - Second embedding vector
     * @returns {number} - Similarity score (0-1, higher is more similar)
     *
     * @example
     * const emb1 = await embedder.embed('machine learning');
     * const emb2 = await embedder.embed('artificial intelligence');
     * const similarity = embedder.similarity(emb1[0], emb2[0]);
     * console.log(`Similarity: ${(similarity * 100).toFixed(1)}%`);
     */
    similarity(embedding1, embedding2) {
        let dot = 0, mag1 = 0, mag2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dot += embedding1[i] * embedding2[i];
            mag1 += embedding1[i] * embedding1[i];
            mag2 += embedding2[i] * embedding2[i];
        }

        return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
    }

    /**
     * Find most similar texts to a query
     *
     * @param {string} query - Query text
     * @param {string[]} texts - Texts to search
     * @param {number} k - Number of results (default: 5)
     * @returns {Promise<Array<{text: string, score: number, index: number}>>}
     *
     * @example
     * const results = await embedder.findSimilar(
     *     'machine learning',
     *     ['AI is great', 'Deep learning rocks', 'Weather is nice'],
     *     2
     * );
     * // Returns top 2 most similar texts with scores
     */
    async findSimilar(query, texts, k = 5) {
        // Generate embeddings
        const queryEmb = await this.embed(query);
        const textEmbs = await this.embed(texts);

        // Calculate similarities
        const results = texts.map((text, i) => ({
            text,
            score: this.similarity(queryEmb[0], textEmbs[i]),
            index: i
        }));

        // Sort by score and return top k
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, k);
    }

    /**
     * Get model information
     *
     * @returns {{name: string, dimensions: number, loaded: boolean}}
     */
    getInfo() {
        return {
            name: this.modelName,
            dimensions: this.dimensions,
            loaded: this.modelLoaded
        };
    }

    /**
     * Terminate worker and cleanup
     */
    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.ready = false;
        this.modelLoaded = false;
    }
}

export default EmbeddingModel;
