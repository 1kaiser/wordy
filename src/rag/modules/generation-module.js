/**
 * Generation Module
 * Handles text generation using Gemma 3 270M
 *
 * Usage:
 *   import { GenerationModule } from './modules/generation-module.js';
 *   const generator = new GenerationModule();
 *   await generator.init();
 *   const response = await generator.generate("Explain the word 'ephemeral'");
 */

export class GenerationModule {
    constructor(config = {}) {
        this.modelId = config.modelId || 'onnx-community/gemma-3-270m-it-ONNX';
        this.dtype = config.dtype || 'q4';  // q4 is smallest available (fp32 too large, q8 doesn't exist)
        this.device = config.device || undefined;  // Auto-detect webgpu/wasm
        this.pipeline = null;
        this.ready = false;
        this.maxTokens = config.maxTokens || 256;
    }

    /**
     * Initialize the generation model
     */
    async init() {
        try {
            // Detect WebGPU availability
            const hasWebGPU = 'gpu' in navigator;
            if (!this.device && hasWebGPU) {
                console.log('🎮 WebGPU detected, will try to use it for 2-3x faster generation');
                this.device = 'webgpu';
            }

            console.log('🔄 Loading generation model:', this.modelId);
            console.log('   Device:', this.device || 'auto-detect (WASM fallback)');
            console.log('   Quantization:', this.dtype);

            // Dynamically import transformers.js v3 (supports Gemma 3)
            const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');

            // Configure environment for browser usage
            env.allowLocalModels = false;   // Force remote model loading (prevents "DOCTYPE" error)
            env.allowRemoteModels = true;   // Enable downloading from Hugging Face Hub
            env.useBrowserCache = false;    // Disable cache (IndexedDB may not be available in iframes)

            console.log('⚠️ Browser cache disabled - models will re-download each session');
            console.log('   (IndexedDB may be blocked in iframe contexts)');

            // Create text generation pipeline (auto-selects webgpu/wasm)
            const pipelineConfig = { dtype: this.dtype };
            if (this.device) {
                pipelineConfig.device = this.device;
            }

            this.pipeline = await pipeline('text-generation', this.modelId, pipelineConfig);

            this.ready = true;
            console.log('✅ Generation model loaded successfully');
            console.log(`   Using: ${this.device || 'WASM'} backend`);

            return true;
        } catch (error) {
            console.error('❌ Failed to load generation model:', error);
            console.warn('💡 Available quantizations: fp32 (large), fp16 (medium), q4 (small), q4f16');
            console.warn('💡 Current dtype:', this.dtype);

            throw error;
        }
    }

    /**
     * Generate text from prompt
     * @param {string|Array} prompt - Text prompt or chat messages
     * @param {object} options - Generation options
     * @returns {string} - Generated text
     */
    async generate(prompt, options = {}) {
        if (!this.ready) {
            throw new Error('Generation model not initialized. Call init() first.');
        }

        try {
            const {
                maxNewTokens = this.maxTokens,
                temperature = 0.7,
                topK = 50,
                topP = 0.9,
                doSample = true,
                repetitionPenalty = 1.1
            } = options;

            // Format prompt for chat model
            let formattedPrompt;
            if (Array.isArray(prompt)) {
                // Chat format: [{role: 'user', content: '...'}]
                formattedPrompt = this.formatChatPrompt(prompt);
            } else {
                // Plain text prompt
                formattedPrompt = prompt;
            }

            // Generate response
            const output = await this.pipeline(formattedPrompt, {
                max_new_tokens: maxNewTokens,
                temperature: temperature,
                top_k: topK,
                top_p: topP,
                do_sample: doSample,
                repetition_penalty: repetitionPenalty,
                return_full_text: false
            });

            // Extract generated text
            const generated = output[0].generated_text;

            return generated;
        } catch (error) {
            console.error('❌ Text generation failed:', error);
            throw error;
        }
    }

    /**
     * Format chat messages for Gemma 3
     * @param {Array} messages - [{role, content}]
     * @returns {string} - Formatted prompt
     */
    formatChatPrompt(messages) {
        // Gemma 3 chat format
        let prompt = '';

        for (const msg of messages) {
            if (msg.role === 'user') {
                prompt += `<start_of_turn>user\n${msg.content}<end_of_turn>\n`;
            } else if (msg.role === 'assistant') {
                prompt += `<start_of_turn>model\n${msg.content}<end_of_turn>\n`;
            } else if (msg.role === 'system') {
                // System message at the start
                prompt = `<start_of_turn>system\n${msg.content}<end_of_turn>\n` + prompt;
            }
        }

        // Add model turn
        prompt += '<start_of_turn>model\n';

        return prompt;
    }

    /**
     * Generate with context (for RAG)
     * @param {string} query - User query
     * @param {Array} context - Retrieved context [{word, similarity}]
     * @param {string} systemPrompt - Optional system prompt
     * @returns {string} - Generated response
     */
    async generateWithContext(query, context, systemPrompt = null) {
        if (!this.ready) {
            throw new Error('Generation model not initialized. Call init() first.');
        }

        // Format context
        const contextText = context
            .map((item, idx) => `${idx + 1}. ${item.word} (${(item.similarity * 100).toFixed(1)}% similar)`)
            .join('\n');

        // Build messages
        const messages = [];

        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt
            });
        }

        messages.push({
            role: 'user',
            content: `Context (similar words):\n${contextText}\n\nQuery: ${query}`
        });

        return await this.generate(messages);
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
            dtype: this.dtype,
            device: this.device,
            ready: this.ready,
            maxTokens: this.maxTokens
        };
    }

    /**
     * Stream generation (for future implementation)
     * Note: Transformers.js doesn't support streaming yet,
     * but this structure is ready for when it does
     */
    async *streamGenerate(prompt, options = {}) {
        // Placeholder for streaming implementation
        const result = await this.generate(prompt, options);
        yield result;
    }
}
