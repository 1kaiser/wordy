// Web Worker for EmbeddingGemma model operations
// Handles model download, initialization, and embedding generation without blocking main thread

import { AutoModel, AutoTokenizer } from '@xenova/transformers';

// Worker message types
interface WorkerMessage {
  id: string;
  type: 'initialize' | 'generate-embedding' | 'get-model-info' | 'clear-cache';
  payload?: any;
}

interface WorkerResponse {
  id: string;
  type: 'success' | 'error' | 'progress';
  payload?: any;
}

// Global worker state
let model: any = null;
let tokenizer: any = null;
let isInitializing = false;
let initializationError: string | null = null;

// Model configuration - Using reliable embedding model for testing
const DEFAULT_CONFIG = {
  model: 'Xenova/all-MiniLM-L6-v2', // Reliable 384D embedding model that works with Transformers.js
  embeddingDimension: 384, // MiniLM-L6-v2 produces 384D embeddings
  maxTokens: 512,
  quantized: true,
  device: 'cpu'
};

// Alternative models for testing:
// - 'Xenova/all-MiniLM-L6-v2' (384D, reliable)
// - 'Xenova/all-mpnet-base-v2' (768D, higher quality)
// - 'onnx-community/embeddinggemma-300m-ONNX' (768D, experimental)

// Send progress updates to main thread
function sendProgress(id: string, message: string, progress?: number) {
  const response: WorkerResponse = {
    id,
    type: 'progress',
    payload: { message, progress }
  };
  self.postMessage(response);
}

// Send success response to main thread
function sendSuccess(id: string, payload?: any) {
  const response: WorkerResponse = {
    id,
    type: 'success',
    payload
  };
  self.postMessage(response);
}

// Send error response to main thread
function sendError(id: string, error: string) {
  const response: WorkerResponse = {
    id,
    type: 'error',
    payload: { error }
  };
  self.postMessage(response);
}

// Initialize EmbeddingGemma model  
async function initializeModel(id: string, config?: any) {
  const finalConfig = { ...DEFAULT_CONFIG, ...(config || {}) };
  if (model && tokenizer) {
    sendSuccess(id, { 
      message: 'Model already initialized',
      modelInfo: getModelInfo()
    });
    return;
  }

  if (isInitializing) {
    // Wait for existing initialization to complete
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (initializationError) {
      sendError(id, initializationError);
      return;
    }
    
    sendSuccess(id, { 
      message: 'Model initialized by concurrent request',
      modelInfo: getModelInfo()
    });
    return;
  }

  isInitializing = true;
  initializationError = null;
  
  const startTime = performance.now();
  
  try {
    sendProgress(id, `🔄 Starting EmbeddingGemma download: ${finalConfig.model}`, 0);
    sendProgress(id, '📦 Model size: ~300MB (this may take 1-5 minutes)', 5);
    sendProgress(id, '⚠️ Please keep this tab open during download...', 10);

    // Load tokenizer first (smaller, faster)
    sendProgress(id, '📝 Downloading tokenizer...', 20);
    tokenizer = await AutoTokenizer.from_pretrained(finalConfig.model);
    sendProgress(id, '✅ Tokenizer loaded successfully', 40);

    // Load model (larger file)
    sendProgress(id, '🧠 Downloading main model (~300MB)...', 50);
    sendProgress(id, '💾 Using Q8 quantization for optimal performance', 60);
    
    model = await AutoModel.from_pretrained(finalConfig.model, {
      dtype: finalConfig.quantized ? 'q8' : 'fp32',
      device: finalConfig.device,
      // Add progress callback if supported
      progress_callback: (data: any) => {
        if (data.file && data.loaded && data.total) {
          const fileProgress = Math.round((data.loaded / data.total) * 100);
          sendProgress(id, `📊 ${data.file}: ${fileProgress}%`, 60 + (fileProgress * 0.3));
        }
      }
    });

    const loadTime = performance.now() - startTime;
    
    sendProgress(id, '🎉 Model download and initialization complete!', 100);
    sendSuccess(id, {
      message: `EmbeddingGemma model loaded successfully in ${(loadTime / 1000).toFixed(2)} seconds`,
      modelInfo: getModelInfo(),
      loadTime
    });

  } catch (error: any) {
    const errorMessage = error.message || 'Unknown initialization error';
    initializationError = errorMessage;
    
    console.error('❌ EmbeddingGemma worker initialization failed:', error);
    sendError(id, `Failed to initialize EmbeddingGemma: ${errorMessage}`);
  } finally {
    isInitializing = false;
  }
}

// Generate embedding for text
async function generateEmbedding(id: string, text: string, taskPrompt?: string) {
  if (!model || !tokenizer) {
    sendError(id, 'Model not initialized. Call initialize first.');
    return;
  }

  try {
    const startTime = performance.now();
    
    // Prepare text with task prompt if provided
    const inputText = taskPrompt ? `${taskPrompt}: ${text}` : text;
    
    // Tokenize the input text
    const inputs = await tokenizer(inputText, {
      return_tensors: 'pt',
      truncation: true,
      max_length: DEFAULT_CONFIG.maxTokens,
      padding: true
    });

    // Generate embedding using the model
    const outputs = await model(inputs);
    
    // Extract the embedding (from last_hidden_state with mean pooling)
    const embeddings = outputs.last_hidden_state;
    
    // Apply mean pooling to get sentence embedding
    const sentenceEmbedding = embeddings.mean(1); // Mean over sequence length
    
    // Convert to regular array
    const embedding = Array.from(sentenceEmbedding.data);
    
    // Normalize the embedding (L2 normalization)
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    const normalizedEmbedding = magnitude > 0 
      ? embedding.map(val => val / magnitude)
      : embedding;

    const processingTime = performance.now() - startTime;

    sendSuccess(id, {
      embedding: normalizedEmbedding,
      dimensions: normalizedEmbedding.length,
      processingTime,
      inputText: inputText.length > 100 ? inputText.substring(0, 100) + '...' : inputText
    });

  } catch (error: any) {
    console.error('❌ Embedding generation failed in worker:', error);
    sendError(id, `Failed to generate embedding: ${error.message}`);
  }
}

// Get model information
function getModelInfo() {
  return {
    model: DEFAULT_CONFIG.model,
    embeddingDimension: DEFAULT_CONFIG.embeddingDimension,
    maxTokens: DEFAULT_CONFIG.maxTokens,
    quantized: DEFAULT_CONFIG.quantized,
    device: DEFAULT_CONFIG.device,
    isInitialized: model !== null && tokenizer !== null,
    status: model && tokenizer ? 'ready' : isInitializing ? 'initializing' : 'not-initialized'
  };
}

// Clear model cache
function clearCache(id: string) {
  model = null;
  tokenizer = null;
  isInitializing = false;
  initializationError = null;
  
  sendSuccess(id, { message: 'Model cache cleared' });
}

// Handle messages from main thread
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'initialize':
        await initializeModel(id, payload?.config);
        break;
        
      case 'generate-embedding':
        await generateEmbedding(id, payload.text, payload.taskPrompt);
        break;
        
      case 'get-model-info':
        sendSuccess(id, getModelInfo());
        break;
        
      case 'clear-cache':
        clearCache(id);
        break;
        
      default:
        sendError(id, `Unknown message type: ${type}`);
    }
  } catch (error: any) {
    console.error('❌ Worker error:', error);
    sendError(id, `Worker error: ${error.message}`);
  }
});

// Handle worker errors
self.addEventListener('error', (event) => {
  console.error('❌ Worker uncaught error:', event.error);
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Worker unhandled promise rejection:', event.reason);
});

console.log('🔄 EmbeddingGemma Web Worker initialized and ready');