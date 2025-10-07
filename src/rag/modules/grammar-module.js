/**
 * Grammar Correction Module
 * Handles grammar checking and correction using T5-base
 *
 * Usage:
 *   import { GrammarModule } from './modules/grammar-module.js';
 *   const grammar = new GrammarModule();
 *   await grammar.init();
 *   const corrected = await grammar.correct("This sentences has has bads grammar.");
 */

export class GrammarModule {
    constructor(config = {}) {
        this.modelId = config.modelId || 'Xenova/t5-base-grammar-correction';
        this.pipeline = null;
        this.ready = false;
        this.maxTokens = config.maxTokens || 100;
    }

    /**
     * Initialize the grammar correction model
     */
    async init() {
        try {
            console.log('🔄 Loading grammar correction model:', this.modelId);

            // Dynamically import transformers.js
            const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');

            // Configure environment for browser usage
            env.allowLocalModels = false;
            env.allowRemoteModels = true;
            env.useBrowserCache = false;  // Disable cache (IndexedDB may not be available in iframes)

            // Create text2text-generation pipeline
            this.pipeline = await pipeline('text2text-generation', this.modelId);

            this.ready = true;
            console.log('✅ Grammar correction model loaded');

            return true;
        } catch (error) {
            console.error('❌ Failed to load grammar correction model:', error);
            throw error;
        }
    }

    /**
     * Correct grammar in text
     * @param {string} text - Input text with grammar errors
     * @param {object} options - Correction options
     * @returns {string} - Corrected text
     */
    async correct(text, options = {}) {
        if (!this.ready) {
            throw new Error('Grammar correction model not initialized. Call init() first.');
        }

        try {
            const {
                maxNewTokens = this.maxTokens,
                numBeams = 5,
                earlyStoppingng = true
            } = options;

            // T5 grammar correction requires "grammar: " prefix
            const prefixedText = text.startsWith('grammar: ') ? text : `grammar: ${text}`;

            // Generate correction
            const result = await this.pipeline(prefixedText, {
                max_new_tokens: maxNewTokens,
                num_beams: numBeams,
                early_stopping: earlyStoppingng
            });

            // Extract corrected text
            const corrected = result[0].generated_text;

            return corrected;
        } catch (error) {
            console.error('❌ Grammar correction failed:', error);
            throw error;
        }
    }

    /**
     * Check if text has grammar errors (compare with corrected version)
     * @param {string} text - Input text
     * @returns {object} - {hasErrors: boolean, original: string, corrected: string}
     */
    async check(text) {
        const corrected = await this.correct(text);
        const hasErrors = text.trim() !== corrected.trim();

        return {
            hasErrors,
            original: text,
            corrected,
            suggestions: hasErrors ? this.getDifferences(text, corrected) : []
        };
    }

    /**
     * Get differences between original and corrected text
     * @param {string} original - Original text
     * @param {string} corrected - Corrected text
     * @returns {Array} - List of differences
     */
    getDifferences(original, corrected) {
        const origWords = original.split(/\s+/);
        const corrWords = corrected.split(/\s+/);

        const differences = [];
        const maxLen = Math.max(origWords.length, corrWords.length);

        for (let i = 0; i < maxLen; i++) {
            if (origWords[i] !== corrWords[i]) {
                differences.push({
                    position: i,
                    original: origWords[i] || '',
                    corrected: corrWords[i] || '',
                    type: !origWords[i] ? 'added' : !corrWords[i] ? 'removed' : 'changed'
                });
            }
        }

        return differences;
    }

    /**
     * Batch correct multiple texts
     * @param {string[]} texts - Array of texts to correct
     * @returns {Array} - Array of corrected texts
     */
    async correctBatch(texts) {
        if (!this.ready) {
            throw new Error('Grammar correction model not initialized. Call init() first.');
        }

        const results = [];
        for (const text of texts) {
            const corrected = await this.correct(text);
            results.push(corrected);
        }

        return results;
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
            maxTokens: this.maxTokens
        };
    }
}
