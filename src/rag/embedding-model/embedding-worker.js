// Web Worker for EmbeddingGemma model
import { pipeline, env } from '@huggingface/transformers';

// Configure environment
env.allowLocalModels = false;

let embedder = null;

self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    try {
        switch (type) {
            case 'load':
                self.postMessage({ type: 'progress', progress: 0, status: 'Initializing EmbeddingGemma...' });

                embedder = await pipeline(
                    'feature-extraction',
                    'onnx-community/embeddinggemma-300m-ONNX',
                    {
                        dtype: data.dtype || 'q4',
                        device: data.device || 'wasm',
                        progress_callback: (progress) => {
                            if (progress.status === 'progress') {
                                const percent = Math.round((progress.loaded / progress.total) * 100);
                                self.postMessage({
                                    type: 'progress',
                                    progress: percent,
                                    loaded: Math.round(progress.loaded / 1024 / 1024),
                                    total: Math.round(progress.total / 1024 / 1024),
                                    status: `Loading EmbeddingGemma: ${Math.round(progress.loaded / 1024 / 1024)}MB / ${Math.round(progress.total / 1024 / 1024)}MB`
                                });
                            }
                        }
                    }
                );

                self.postMessage({ type: 'ready', status: 'EmbeddingGemma loaded successfully' });
                break;

            case 'embed':
                if (!embedder) {
                    throw new Error('Embedder not loaded');
                }

                const { texts, prefixes } = data;
                const prefixedTexts = texts.map(text => prefixes ? `${prefixes} ${text}` : text);

                const result = await embedder(prefixedTexts, {
                    pooling: 'mean',
                    normalize: true,
                });

                self.postMessage({
                    type: 'embeddings',
                    embeddings: result.tolist()
                });
                break;

            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error.message,
            stack: error.stack
        });
    }
});
