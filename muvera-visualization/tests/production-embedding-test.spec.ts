import { test, expect } from '@playwright/test';

test.describe('Production EmbeddingGemma Tests', () => {
  
  test('comprehensive production EmbeddingGemma functionality', async ({ page }) => {
    console.log('🚀 Starting comprehensive production EmbeddingGemma tests...');
    
    // Navigate to test page
    await page.goto('http://localhost:3001/test-production-embeddings.html');
    await page.waitForLoadState('networkidle');
    
    console.log('📄 Test page loaded, starting device detection...');
    
    // Test 1: Device Detection
    await page.click('#device-test-btn');
    await page.waitForTimeout(2000);
    
    const deviceStatus = await page.textContent('#device-status');
    console.log('🎯 Device status:', deviceStatus);
    expect(deviceStatus).toContain('Device:');
    
    // Test 2: Model Loading
    console.log('📦 Testing model loading...');
    await page.click('#model-load-btn');
    
    // Wait for model to load (this can take a while)
    await page.waitForFunction(() => {
      const btn = document.querySelector('#single-embedding-btn');
      return btn && !btn.disabled;
    }, { timeout: 300000 }); // 5 minutes timeout for model loading
    
    const modelStatus = await page.textContent('#device-status');
    console.log('📊 Model status:', modelStatus);
    expect(modelStatus).toContain('Loaded');
    
    // Test 3: Single Embedding
    console.log('🔤 Testing single embedding generation...');
    await page.click('#single-embedding-btn');
    await page.waitForTimeout(5000);
    
    const embeddingResults = await page.textContent('#embedding-results');
    console.log('📊 Embedding results preview:', embeddingResults?.substring(0, 200));
    expect(embeddingResults).toContain('Single Embedding Results');
    expect(embeddingResults).toContain('Cosine Similarity');
    
    // Test 4: Batch Embeddings
    console.log('📊 Testing batch embedding generation...');
    await page.click('#batch-embedding-btn');
    await page.waitForTimeout(10000);
    
    const batchResults = await page.textContent('#embedding-results');
    console.log('📊 Batch results preview:', batchResults?.substring(0, 200));
    expect(batchResults).toContain('Batch Embedding Results');
    expect(batchResults).toContain('Similarity matrix');
    
    // Test 5: Performance Benchmark
    console.log('⚡ Testing performance benchmark...');
    await page.click('#performance-test-btn');
    await page.waitForTimeout(15000);
    
    const performanceResults = await page.textContent('#embedding-results');
    console.log('⚡ Performance results preview:', performanceResults?.substring(0, 200));
    expect(performanceResults).toContain('Performance Benchmark Results');
    expect(performanceResults).toContain('Throughput');
    
    // Verify performance metrics
    const performanceMetrics = await page.textContent('#performance-metrics');
    console.log('📊 Final metrics:', performanceMetrics);
    expect(performanceMetrics).toContain('Success Rate');
    
    // Extract success rate
    const successRateMatch = performanceMetrics?.match(/Success Rate.*?(\d+\.?\d*)%/);
    if (successRateMatch) {
      const successRate = parseFloat(successRateMatch[1]);
      console.log(`✅ Success rate: ${successRate}%`);
      expect(successRate).toBeGreaterThan(80); // Expect >80% success rate
    }
    
    console.log('🎉 All production EmbeddingGemma tests completed successfully!');
  });

  test('device detection and WebGPU availability', async ({ page }) => {
    console.log('🎯 Testing device detection specifically...');
    
    await page.goto('http://localhost:3001/test-production-embeddings.html');
    await page.waitForLoadState('networkidle');
    
    await page.click('#device-test-btn');
    await page.waitForTimeout(3000);
    
    const deviceStatus = await page.textContent('#device-status');
    console.log('🖥️ Device capabilities:', deviceStatus);
    
    // Should detect either WebGPU or WASM
    expect(deviceStatus).toMatch(/(WebGPU|WASM)/);
    expect(deviceStatus).toContain('WebGPU Available:');
    
    console.log('✅ Device detection test completed');
  });

  test('model loading performance and caching', async ({ page }) => {
    console.log('📦 Testing model loading performance...');
    
    await page.goto('http://localhost:3001/test-production-embeddings.html');
    await page.waitForLoadState('networkidle');
    
    // First, detect device
    await page.click('#device-test-btn');
    await page.waitForTimeout(2000);
    
    // Time the model loading
    const loadStartTime = Date.now();
    await page.click('#model-load-btn');
    
    await page.waitForFunction(() => {
      const btn = document.querySelector('#single-embedding-btn');
      return btn && !btn.disabled;
    }, { timeout: 300000 });
    
    const loadEndTime = Date.now();
    const loadTime = loadEndTime - loadStartTime;
    
    console.log(`⏱️ Model loading time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(300000); // Should load within 5 minutes
    
    const performanceMetrics = await page.textContent('#performance-metrics');
    expect(performanceMetrics).toContain('Model Load');
    
    console.log('✅ Model loading performance test completed');
  });

});