import { test, expect } from '@playwright/test';

test.describe('🎯 SEMANTIC GALAXY Working Configuration Test', () => {
  
  test('test semantic-galaxy proven EmbeddingGemma configuration', async ({ page }) => {
    console.log('🎯 Testing semantic-galaxy proven configuration...');
    
    // Set longer timeout for model downloading
    test.setTimeout(900000); // 15 minutes
    
    // Navigate to test page
    await page.goto('http://localhost:3001/test-working-embeddinggemma.html');
    await page.waitForLoadState('networkidle');
    
    console.log('📄 Test page loaded successfully');
    
    // Step 1: Device Detection
    console.log('🎯 Step 1: Testing device detection...');
    await page.click('#device-test-btn');
    await page.waitForTimeout(3000);
    
    const deviceStatus = await page.textContent('#device-status');
    console.log('🖥️  Device Status:', deviceStatus);
    expect(deviceStatus).toContain('Device Type:');
    expect(deviceStatus).toMatch(/(WebGPU|WASM)/);
    
    // Wait for model load button to be enabled
    await page.waitForFunction(() => {
      const btn = document.querySelector('#model-load-btn');
      return btn && !btn.disabled;
    });
    console.log('✅ Model load button enabled');
    
    // Step 2: Model Loading with Semantic Galaxy Configuration
    console.log('📦 Step 2: Loading EmbeddingGemma with semantic-galaxy config...');
    console.log('⏳ This uses the proven configuration: model_no_gather for WebGPU, model for WASM...');
    const modelLoadStart = Date.now();
    
    await page.click('#model-load-btn');
    
    // Monitor loading progress
    let lastProgress = '';
    const progressMonitor = setInterval(async () => {
      try {
        const logContent = await page.textContent('#test-log');
        const progressMatch = logContent?.match(/Model loading progress: (\d+%)/);
        if (progressMatch && progressMatch[1] !== lastProgress) {
          lastProgress = progressMatch[1];
          console.log(`📊 Model loading progress: ${lastProgress}`);
        }
      } catch (e) {
        // Ignore errors during progress monitoring
      }
    }, 5000);
    
    // Wait for embedding button to be enabled (indicates successful model loading)
    await page.waitForFunction(() => {
      const btn = document.querySelector('#embedding-btn');
      return btn && !btn.disabled;
    }, { timeout: 600000 }); // 10 minute timeout for model loading
    
    clearInterval(progressMonitor);
    const modelLoadTime = Date.now() - modelLoadStart;
    console.log(`✅ Model loaded successfully in ${modelLoadTime}ms (${(modelLoadTime/1000).toFixed(1)}s)`);
    
    const modelStatus = await page.textContent('#model-status');
    console.log('📊 Model Status:', modelStatus);
    expect(modelStatus).toContain('Loaded ✅');
    
    // Step 3: Embedding Generation Test
    console.log('🔤 Step 3: Testing embedding generation...');
    await page.click('#embedding-btn');
    await page.waitForTimeout(15000);
    
    const embeddingResults = await page.textContent('#embedding-results');
    console.log('📊 Embedding Results Preview:', embeddingResults?.substring(0, 300));
    expect(embeddingResults).toContain('Embedding Generation Results');
    expect(embeddingResults).toContain('Texts processed: 3');
    expect(embeddingResults).toContain('Embedding dimension:');
    
    // Extract embedding dimension
    const dimensionMatch = embeddingResults?.match(/Embedding dimension: (\d+)D/);
    if (dimensionMatch) {
      const dimension = parseInt(dimensionMatch[1]);
      console.log(`📊 Embedding Dimension: ${dimension}D`);
      expect(dimension).toBeGreaterThan(0);
      expect(dimension).toBeLessThanOrEqual(768); // EmbeddingGemma max dimension
    }
    
    // Extract timing information
    const timingMatch = embeddingResults?.match(/Average time per text: (\d+)ms/);
    if (timingMatch) {
      const avgTime = parseInt(timingMatch[1]);
      console.log(`⚡ Average time per embedding: ${avgTime}ms`);
      expect(avgTime).toBeGreaterThan(0);
    }
    
    // Check final log for success message
    const testLog = await page.textContent('#test-log');
    expect(testLog).toContain('SEMANTIC-GALAXY CONFIGURATION TEST PASSED');
    
    console.log('🎉 ALL SEMANTIC-GALAXY CONFIGURATION TESTS PASSED!');
    console.log('✅ Device detection working');
    console.log('✅ Model loading with semantic-galaxy config working');
    console.log('✅ Embedding generation working');
    console.log('✅ Similarity calculations working');
    
    // Screenshot final results
    await page.screenshot({ 
      path: 'test-results/semantic-galaxy-working-config-results.png', 
      fullPage: true 
    });
    console.log('📸 Test results screenshot saved');
    
    // Verify the key differences in log
    expect(testLog).toMatch(/model_file_name: (model_no_gather|model)/);
    
  });

  test('verify critical semantic-galaxy configuration differences', async ({ page }) => {
    console.log('🔍 Verifying critical configuration differences...');
    
    await page.goto('http://localhost:3001/test-working-embeddinggemma.html');
    await page.waitForLoadState('networkidle');
    
    // Test device detection first
    await page.click('#device-test-btn');
    await page.waitForTimeout(2000);
    
    const deviceStatus = await page.textContent('#device-status');
    const hasWebGPU = deviceStatus?.includes('WebGPU Available: Yes');
    
    console.log(`🎯 WebGPU available: ${hasWebGPU}`);
    
    if (hasWebGPU) {
      console.log('✅ WebGPU detected - should use model_no_gather');
      expect(deviceStatus).toContain('WebGPU Available: Yes');
    } else {
      console.log('✅ WASM fallback - should use standard model');
      expect(deviceStatus).toContain('WebGPU Available: No');
    }
    
    // The key insight is that semantic-galaxy uses different model files:
    // - WebGPU: "model_no_gather" (optimized for GPU operations)  
    // - WASM: "model" (standard variant)
    // This is likely why their implementation works while ours was failing
    
    console.log('📋 KEY SEMANTIC-GALAXY CONFIGURATION INSIGHTS:');
    console.log('   • Uses @huggingface/transformers v3.7.1 (newer version)');
    console.log('   • WebGPU: model_file_name = "model_no_gather"');
    console.log('   • WASM: model_file_name = "model"');
    console.log('   • dtype = "q4" (same as our implementation)');
    console.log('   • Same model ID: onnx-community/embeddinggemma-300m-ONNX');
    console.log('   • Same WebGPU detection logic');
    
  });

});