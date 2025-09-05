// Model Download Script - Downloads EmbeddingGemma model for caching
import { AutoModel, AutoTokenizer } from '@xenova/transformers';

console.log('🚀 Starting EmbeddingGemma model download...');
console.log('📦 Model: onnx-community/EmbeddingGemma-bge-small-ONNX (384D embeddings)');
console.log('⚠️  This will download ~120MB - please wait...');

const startTime = Date.now();

async function downloadAndCacheModel() {
  try {
    console.log('📝 Step 1/2: Downloading tokenizer...');
    const tokenizer = await AutoTokenizer.from_pretrained('onnx-community/EmbeddingGemma-bge-small-ONNX', {
      progress_callback: (progress) => {
        if (progress.status === 'downloading') {
          const percent = (progress.loaded / progress.total * 100).toFixed(1);
          process.stdout.write(`\r📝 Tokenizer download: ${percent}%`);
        }
      }
    });
    console.log('\n✅ Tokenizer downloaded and cached');

    console.log('🧠 Step 2/2: Downloading model...');
    const model = await AutoModel.from_pretrained('onnx-community/EmbeddingGemma-bge-small-ONNX', {
      dtype: 'q8', // Quantized for smaller size
      progress_callback: (progress) => {
        if (progress.status === 'downloading') {
          const percent = (progress.loaded / progress.total * 100).toFixed(1);
          const mb = (progress.loaded / 1024 / 1024).toFixed(1);
          const totalMb = (progress.total / 1024 / 1024).toFixed(1);
          process.stdout.write(`\r🧠 Model download: ${percent}% (${mb}/${totalMb} MB)`);
        }
      }
    });
    console.log('\n✅ Model downloaded and cached');

    // Test the model works
    console.log('🔧 Testing model functionality...');
    const testText = 'Hello world test embedding';
    
    const inputs = await tokenizer(testText, {
      return_tensors: 'pt',
      truncation: true,
      max_length: 512,
      padding: true
    });
    
    const outputs = await model(inputs);
    const embeddings = outputs.last_hidden_state;
    
    console.log('🔍 Tensor shape:', embeddings.dims);
    console.log('🔍 Available methods:', Object.getOwnPropertyNames(embeddings));
    
    // Manual mean pooling - more reliable
    const batchData = Array.from(embeddings.data);
    const seqLength = embeddings.dims[1];
    const hiddenSize = embeddings.dims[2];
    const embedding = new Array(hiddenSize).fill(0);
    
    // Average across sequence length (mean pooling)
    for (let i = 0; i < hiddenSize; i++) {
      let sum = 0;
      for (let j = 0; j < seqLength; j++) {
        sum += batchData[j * hiddenSize + i];
      }
      embedding[i] = sum / seqLength;
    }
    
    console.log(`✅ Test successful! Generated ${embedding.length}D embedding`);
    console.log(`📊 First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    const downloadTime = (Date.now() - startTime) / 1000;
    console.log(`⏱️  Total download time: ${downloadTime.toFixed(1)} seconds`);
    console.log('🎉 Model download complete! Tests can now run without timeout.');

  } catch (error) {
    console.error('❌ Download failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n⚠️  Download interrupted by user');
  process.exit(0);
});

downloadAndCacheModel();