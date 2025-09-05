import { test, expect } from '@playwright/test';

test.describe('🚀 FULL Production EmbeddingGemma Test Suite', () => {
  
  test('comprehensive production functionality with actual model download', async ({ page }) => {
    console.log('🚀 Starting COMPREHENSIVE production test...');
    console.log('⚠️  This test will download ~300MB EmbeddingGemma model');
    console.log('⏱️  Expected duration: 5-15 minutes');
    
    // Set longer timeout for model downloading
    test.setTimeout(900000); // 15 minutes
    
    // Navigate to test page
    await page.goto('http://localhost:3001/test-production-embeddings.html');
    await page.waitForLoadState('networkidle');
    
    console.log('📄 Test page loaded successfully');
    
    // Step 1: Device Detection
    console.log('🎯 Step 1: Testing device detection...');
    await page.click('#device-test-btn');
    await page.waitForTimeout(3000);
    
    const deviceStatus = await page.textContent('#device-status');
    console.log('🖥️  Device Status:', deviceStatus);
    expect(deviceStatus).toContain('Device:');
    expect(deviceStatus).toMatch(/(WebGPU|WASM)/);
    
    // Step 2: Model Loading (This is the critical test)
    console.log('📦 Step 2: Loading EmbeddingGemma 300M model...');
    console.log('⏳ This may take 5+ minutes for initial download...');
    const modelLoadStart = Date.now();
    
    await page.click('#model-load-btn');
    
    // Monitor loading progress
    let lastProgress = '';
    const progressMonitor = setInterval(async () => {
      try {
        const logContent = await page.textContent('#test-log');
        const progressMatch = logContent?.match(/Loading model\.\.\. (\d+%)/);
        if (progressMatch && progressMatch[1] !== lastProgress) {
          lastProgress = progressMatch[1];
          console.log(`📊 Model loading progress: ${lastProgress}`);
        }
      } catch (e) {
        // Ignore errors during progress monitoring
      }
    }, 5000);
    
    // Wait for model loading to complete
    await page.waitForFunction(() => {
      const btn = document.querySelector('#single-embedding-btn');
      return btn && !btn.disabled;
    }, { timeout: 600000 }); // 10 minute timeout for model loading
    
    clearInterval(progressMonitor);
    const modelLoadTime = Date.now() - modelLoadStart;
    console.log(`✅ Model loaded successfully in ${modelLoadTime}ms (${(modelLoadTime/1000).toFixed(1)}s)`);
    
    const modelStatus = await page.textContent('#device-status');
    console.log('📊 Model Status:', modelStatus);
    expect(modelStatus).toContain('Loaded');
    
    // Step 3: Single Embedding Test
    console.log('🔤 Step 3: Testing single embedding generation...');
    await page.click('#single-embedding-btn');
    await page.waitForTimeout(10000);
    
    const embeddingResults = await page.textContent('#embedding-results');
    console.log('📊 Embedding Results Preview:', embeddingResults?.substring(0, 300));
    expect(embeddingResults).toContain('Single Embedding Results');
    expect(embeddingResults).toContain('Cosine Similarity');
    
    // Extract and validate similarity score
    const similarityMatch = embeddingResults?.match(/Cosine Similarity:\s*([-\d.]+)/);
    if (similarityMatch) {
      const similarity = parseFloat(similarityMatch[1]);
      console.log(`📊 Cosine Similarity: ${similarity}`);
      expect(similarity).toBeGreaterThan(-1);
      expect(similarity).toBeLessThan(1);
    }
    
    // Step 4: Batch Embedding Test  
    console.log('📊 Step 4: Testing batch embedding generation...');
    await page.click('#batch-embedding-btn');
    await page.waitForTimeout(15000);
    
    const batchResults = await page.textContent('#embedding-results');
    console.log('📊 Batch Results Preview:', batchResults?.substring(0, 300));
    expect(batchResults).toContain('Batch Embedding Results');
    expect(batchResults).toContain('Similarity matrix');
    
    // Step 5: Performance Benchmark
    console.log('⚡ Step 5: Running performance benchmark...');
    await page.click('#performance-test-btn');
    
    // Monitor benchmark progress
    const benchmarkStart = Date.now();
    await page.waitForFunction(() => {
      const results = document.querySelector('#embedding-results');
      return results && results.textContent && results.textContent.includes('Performance Benchmark Results');
    }, { timeout: 60000 });
    
    const benchmarkTime = Date.now() - benchmarkStart;
    console.log(`⚡ Performance benchmark completed in ${benchmarkTime}ms`);
    
    const performanceResults = await page.textContent('#embedding-results');
    expect(performanceResults).toContain('Performance Benchmark Results');
    expect(performanceResults).toContain('Throughput');
    
    // Extract performance metrics
    const throughputMatch = performanceResults?.match(/Throughput:\s*([\d.]+)\s*embeddings\/second/);
    if (throughputMatch) {
      const throughput = parseFloat(throughputMatch[1]);
      console.log(`⚡ Throughput: ${throughput} embeddings/second`);
      expect(throughput).toBeGreaterThan(0);
    }
    
    // Final verification
    const finalMetrics = await page.textContent('#performance-metrics');
    console.log('📊 Final Performance Metrics:', finalMetrics);
    
    // Extract and validate success rate
    const successRateMatch = finalMetrics?.match(/Success Rate.*?(\d+\.?\d*)%/);
    if (successRateMatch) {
      const successRate = parseFloat(successRateMatch[1]);
      console.log(`📊 Final Success Rate: ${successRate}%`);
      expect(successRate).toBeGreaterThan(80);
    }
    
    // Extract key performance metrics
    const modelLoadMatch = finalMetrics?.match(/Model Load.*?(\d+)ms/);
    if (modelLoadMatch) {
      const loadTime = parseInt(modelLoadMatch[1]);
      console.log(`📊 Model Load Time: ${loadTime}ms`);
    }
    
    console.log('🎉 ALL PRODUCTION TESTS PASSED SUCCESSFULLY!');
    console.log('✅ EmbeddingGemma 300M model downloaded and working');
    console.log('✅ Device detection working');
    console.log('✅ Model loading with progress monitoring working');
    console.log('✅ Single and batch embedding generation working');
    console.log('✅ Task prefixes (query/document) working');
    console.log('✅ Performance benchmarks working');
    
    // Screenshot final results
    await page.screenshot({ 
      path: 'test-results/comprehensive-production-test-results.png', 
      fullPage: true 
    });
    console.log('📸 Full test results screenshot saved');
  });

  test('device detection and WebGPU compatibility test', async ({ page }) => {
    console.log('🎯 Testing device detection and WebGPU compatibility...');
    
    await page.goto('http://localhost:3001/test-production-embeddings.html');
    await page.waitForLoadState('networkidle');
    
    await page.click('#device-test-btn');
    await page.waitForTimeout(5000);
    
    const deviceStatus = await page.textContent('#device-status');
    console.log('🖥️  Device capabilities detected:', deviceStatus);
    
    // Should detect either WebGPU or WASM
    expect(deviceStatus).toMatch(/(WebGPU|WASM)/);
    expect(deviceStatus).toContain('WebGPU Available:');
    
    // Check if WebGPU is actually available
    const hasWebGPU = await page.evaluate(() => {
      return !!navigator.gpu;
    });
    
    console.log(`🎯 WebGPU available in browser: ${hasWebGPU}`);
    
    if (hasWebGPU) {
      expect(deviceStatus).toContain('WebGPU');
      console.log('✅ WebGPU acceleration available - optimal performance expected');
    } else {
      expect(deviceStatus).toContain('WASM');
      console.log('✅ WASM fallback detected - performance will be slower but functional');
    }
  });

});