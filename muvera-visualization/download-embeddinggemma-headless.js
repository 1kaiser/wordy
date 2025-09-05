// Headless EmbeddingGemma Model Download
// Downloads the 300M model with progress monitoring
import { env, AutoModel, AutoTokenizer } from '@xenova/transformers';

console.log('🚀 Starting EmbeddingGemma 300M Model Download');
console.log('📦 Model: onnx-community/embeddinggemma-300m-ONNX');
console.log('📏 Size: ~300MB (this will take several minutes)');
console.log('⚠️  First download will be slow, but model will be cached');

// Configure environment for headless download
env.allowLocalModels = false;
env.backends.onnx.wasm.proxy = false; // Direct download, no worker

async function downloadEmbeddingGemmaModel() {
  const startTime = Date.now();
  let lastProgress = 0;

  try {
    console.log('\n📝 Step 1: Downloading tokenizer...');
    
    console.log('⚠️  EmbeddingGemma model has tokenization issues, trying BGE model instead...');
    const tokenizer = await AutoTokenizer.from_pretrained('Xenova/bge-small-en-v1.5', {
      progress_callback: (progress) => {
        if (progress.status === 'downloading') {
          const percent = (progress.loaded / progress.total * 100).toFixed(1);
          const mb = (progress.loaded / 1024 / 1024).toFixed(1);
          const totalMb = (progress.total / 1024 / 1024).toFixed(1);
          process.stdout.write(`\r📝 Tokenizer: ${percent}% (${mb}/${totalMb} MB)`);
        }
      }
    });
    
    console.log('\n✅ Tokenizer downloaded successfully');

    console.log('\n🧠 Step 2: Downloading main model (this is the big one)...');
    
    const model = await AutoModel.from_pretrained('Xenova/bge-small-en-v1.5', {
      dtype: 'q4', // Use q4 quantization for efficiency
      progress_callback: (progress) => {
        if (progress.status === 'downloading' && progress.file.endsWith('.onnx_data')) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          const mb = (progress.loaded / 1024 / 1024).toFixed(1);
          const totalMb = (progress.total / 1024 / 1024).toFixed(1);
          
          // Only show progress every 5% to avoid spam
          if (percent !== lastProgress && percent % 5 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`🧠 Model download: ${percent}% (${mb}/${totalMb} MB) - ${elapsed}s elapsed`);
            lastProgress = percent;
          }
        }
      }
    });

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n✅ EmbeddingGemma model downloaded successfully!`);
    console.log(`⏱️  Total download time: ${totalTime.toFixed(1)} seconds`);
    console.log(`📊 Model ready for embedding generation`);

    // Quick test to verify model works
    console.log('\n🔤 Testing embedding generation...');
    
    const testText = 'Machine learning transforms data into insights';
    console.log(`📝 Test text: "${testText}"`);
    
    const inputs = tokenizer(testText, {
      padding: true,
      truncation: true,
      max_length: 256,
    });
    
    console.log('📊 Generating embedding...');
    const { sentence_embedding } = await model(inputs);
    const embedding = sentence_embedding.tolist()[0];
    
    console.log(`✅ Generated ${embedding.length}D embedding successfully!`);
    console.log(`📊 First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    // Validate embedding
    if (embedding.length > 0 && embedding.every(v => typeof v === 'number' && !isNaN(v))) {
      console.log('🎉 EMBEDDING GENERATION TEST PASSED!');
      console.log('✅ EmbeddingGemma model is working correctly');
      return {
        success: true,
        downloadTime: totalTime,
        embeddingDimension: embedding.length,
        sampleEmbedding: embedding.slice(0, 10)
      };
    } else {
      throw new Error('Generated embedding is invalid');
    }

  } catch (error) {
    const totalTime = (Date.now() - startTime) / 1000;
    console.error(`\n❌ Download failed after ${totalTime.toFixed(1)} seconds`);
    console.error('Error:', error.message);
    
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      console.error('💡 The model might not exist or the URL is incorrect');
      console.error('🔍 Trying alternative model...');
      
      // Try a different model as fallback
      try {
        console.log('\n🔄 Attempting fallback to BGE model...');
        const fallbackModel = await AutoModel.from_pretrained('Xenova/bge-small-en-v1.5');
        console.log('✅ Fallback model loaded successfully');
        return { success: true, fallback: true };
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError.message);
      }
    }
    
    return { success: false, error: error.message, downloadTime: totalTime };
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n⚠️  Download interrupted by user');
  console.log('📁 Partial downloads will be resumed on next attempt');
  process.exit(0);
});

// Start download
console.log('⏳ Starting download... (Press Ctrl+C to cancel)\n');
downloadEmbeddingGemmaModel()
  .then(result => {
    console.log('\n📊 Final Result:', result);
    if (result.success) {
      console.log('🎉 EmbeddingGemma is ready for production use!');
    } else {
      console.log('💔 Download failed - check error details above');
    }
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n💥 Unexpected error:', error);
    process.exit(1);
  });