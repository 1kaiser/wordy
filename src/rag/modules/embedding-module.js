/**
 * Embedding Module
 * Handles text embedding generation using EmbeddingGemma
 *
 * Usage:
 *   import { EmbeddingModule } from './modules/embedding-module.js';
 *   const embedder = new EmbeddingModule();
 *   await embedder.init();
 *   const embedding = await embedder.embed("hello world");
 */

export class EmbeddingModule {
    constructor(config = {}) {
        // Use EmbeddingGemma 300M for better quality (768D embeddings)
        // Alternative: 'Xenova/paraphrase-albert-small-v2' (smaller, faster)
        this.modelId = config.modelId || 'onnx-community/embeddinggemma-300m-ONNX';
        this.dtype = config.dtype || 'q8';  // Options: fp32, q8, q4 (fp16 not supported)
        this.pipeline = null;
        this.tokenizer = null;
        this.model = null;
        this.ready = false;
        this.useEmbeddingGemma = this.modelId.includes('embeddinggemma');
    }

    /**
     * Initialize the embedding model
     */
    async init() {
        try {
            console.log('🔄 Loading embedding model:', this.modelId);
            console.log('   dtype:', this.dtype);

            // Dynamically import transformers.js v3 (supports Gemma 3 & EmbeddingGemma)
            const transformersModule = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
            const { pipeline, env, AutoTokenizer, AutoModel } = transformersModule;

            // Configure environment for browser usage
            env.allowLocalModels = false;   // Force remote model loading (prevents "DOCTYPE" error)
            env.allowRemoteModels = true;   // Enable downloading from Hugging Face Hub
            env.useBrowserCache = false;    // Disable cache (IndexedDB may not be available in iframes)

            console.log('⚠️ Browser cache disabled - models will re-download each session');
            console.log('   (IndexedDB may be blocked in iframe contexts)');

            if (this.useEmbeddingGemma) {
                // EmbeddingGemma requires AutoModel approach (not pipeline)
                console.log('🔄 Using EmbeddingGemma with AutoModel...');

                // Load tokenizer and model separately
                this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);
                this.model = await AutoModel.from_pretrained(this.modelId, {
                    dtype: this.dtype,
                    device: 'wasm'  // EmbeddingGemma works with WASM
                });

                console.log('✅ EmbeddingGemma model loaded (768D embeddings)');
            } else {
                // Standard models use feature-extraction pipeline
                console.log('🔄 Using standard feature-extraction pipeline...');
                this.pipeline = await pipeline('feature-extraction', this.modelId);
                console.log('✅ Embedding model loaded');
            }

            this.ready = true;
            return true;

        } catch (error) {
            console.error('❌ Failed to load embedding model:', error);
            throw error;
        }
    }

    /**
     * Generate embedding for text
     * @param {string} text - Input text
     * @returns {Float32Array} - 768D embedding vector
     */
    async embed(text) {
        if (!this.ready) {
            throw new Error('Embedding model not initialized. Call init() first.');
        }

        try {
            if (this.useEmbeddingGemma) {
                // EmbeddingGemma: tokenize → model → pool → normalize
                const inputs = await this.tokenizer(text);
                const outputs = await this.model(inputs);

                // Mean pooling over sequence
                const embeddings = outputs.last_hidden_state;
                const pooled = this.meanPooling(embeddings, inputs.attention_mask);

                // Normalize
                const normalized = this.normalize(pooled);

                return new Float32Array(normalized.data);

            } else {
                // Standard models: use pipeline
                const output = await this.pipeline(text, {
                    pooling: 'mean',
                    normalize: true
                });

                return new Float32Array(output.data);
            }

        } catch (error) {
            console.error('❌ Embedding generation failed:', error);
            throw error;
        }
    }

    /**
     * Mean pooling over sequence (for EmbeddingGemma)
     * Works with raw tensor data in browser
     */
    meanPooling(lastHiddenState, attentionMask) {
        // Get dimensions - convert from BigInt to Number if needed
        const dims = lastHiddenState.dims.map(d => typeof d === 'bigint' ? Number(d) : d);
        const [batchSize, seqLength, hiddenSize] = dims;

        // Get raw data arrays
        const hiddenData = lastHiddenState.data;
        const maskData = attentionMask.data;

        // Initialize output array
        const pooled = new Float32Array(hiddenSize);

        // Sum embeddings weighted by attention mask
        for (let i = 0; i < seqLength; i++) {
            // Convert mask to Number if BigInt
            const mask = typeof maskData[i] === 'bigint' ? Number(maskData[i]) : maskData[i];
            if (mask > 0) {
                for (let j = 0; j < hiddenSize; j++) {
                    const hiddenIdx = i * hiddenSize + j;
                    const hiddenVal = typeof hiddenData[hiddenIdx] === 'bigint'
                        ? Number(hiddenData[hiddenIdx])
                        : hiddenData[hiddenIdx];
                    pooled[j] += hiddenVal * mask;
                }
            }
        }

        // Calculate sum of mask (number of non-padded tokens)
        let maskSum = 0;
        for (let i = 0; i < seqLength; i++) {
            const mask = typeof maskData[i] === 'bigint' ? Number(maskData[i]) : maskData[i];
            maskSum += mask;
        }

        // Avoid division by zero
        if (maskSum < 1e-9) maskSum = 1e-9;

        // Divide by mask sum to get mean
        for (let i = 0; i < hiddenSize; i++) {
            pooled[i] /= maskSum;
        }

        // Return in format expected by normalize function
        return { data: pooled, dims: [1, hiddenSize] };
    }

    /**
     * L2 normalize embeddings
     */
    normalize(embeddings) {
        const data = embeddings.data;
        let norm = 0;

        // Calculate L2 norm
        for (let i = 0; i < data.length; i++) {
            norm += data[i] * data[i];
        }
        norm = Math.sqrt(norm);

        // Avoid division by zero
        if (norm < 1e-12) norm = 1e-12;

        // Normalize
        const normalized = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            normalized[i] = data[i] / norm;
        }

        return { data: normalized };
    }

    /**
     * Generate embeddings for multiple texts (batch)
     * @param {string[]} texts - Array of input texts
     * @returns {Float32Array[]} - Array of embeddings
     */
    async embedBatch(texts) {
        if (!this.ready) {
            throw new Error('Embedding model not initialized. Call init() first.');
        }

        const embeddings = [];
        for (const text of texts) {
            const embedding = await this.embed(text);
            embeddings.push(embedding);
        }

        return embeddings;
    }

    /**
     * Check if model is ready
     * @returns {boolean}
     */
    isReady() {
        return this.ready;
    }

    /**
     * Get model info
     * @returns {object}
     */
    getInfo() {
        return {
            modelId: this.modelId,
            ready: this.ready,
            dimensions: 768
        };
    }
}
