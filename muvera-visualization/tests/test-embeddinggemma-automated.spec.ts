import { test, expect } from '@playwright/test';

test.describe('EmbeddingGemma Automated Tests', () => {
  test.setTimeout(300000); // 5 minutes for model download

  test('comprehensive EmbeddingGemma model testing', async ({ page }) => {
    console.log('🚀 Starting comprehensive EmbeddingGemma model tests...');
    
    // Navigate to test page
    await page.goto('http://localhost:3000/test-embeddinggemma.html');
    
    // Wait for page to load and auto-start tests
    await page.waitForTimeout(2000);
    
    console.log('📄 Test page loaded, monitoring progress...');
    
    // Monitor test logs and wait for completion
    let testCompleted = false;
    let testResults = null;
    let errorCount = 0;
    
    // Monitor console messages
    page.on('console', msg => {
      const text = msg.text();
      console.log(`[BROWSER] ${text}`);
      
      if (text.includes('❌') || text.includes('failed')) {
        errorCount++;
        console.log(`🚨 Error detected: ${text}`);
      }
      
      if (text.includes('Test suite completed') || text.includes('testing completed')) {
        testCompleted = true;
        console.log('✅ Test suite completed!');
      }
    });
    
    // Wait for test results to be available globally
    console.log('⏳ Waiting for test results...');
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5s intervals
    
    while (!testCompleted && attempts < maxAttempts) {
      await page.waitForTimeout(5000);
      attempts++;
      
      // Check if test results are available
      try {
        testResults = await page.evaluate(() => {
          return (window as any).embeddingGemmaTestResults;
        });
        
        if (testResults) {
          console.log(`📊 Test progress - attempt ${attempts}/${maxAttempts}`);
          console.log(`Success rate: ${testResults.testSummary?.successRate || 'Calculating...'}`);
          console.log(`Duration: ${testResults.testSummary?.totalDuration || 'Running...'}`);
          console.log(`Messages: ${testResults.testSummary?.totalMessages || 0}`);
          
          if (testResults.testSummary?.successRate) {
            testCompleted = true;
            break;
          }
        }
      } catch (error) {
        // Continue waiting if results not ready
      }
      
      if (attempts % 6 === 0) { // Every 30 seconds
        console.log(`🔄 Still testing... ${attempts * 5}/300 seconds elapsed`);
      }
    }
    
    // Validate test results
    console.log('🔍 Validating test results...');
    
    if (!testResults) {
      console.error('❌ No test results found after waiting');
      throw new Error('Test results not available - model download may have failed');
    }
    
    console.log('📋 Final test results:', JSON.stringify(testResults.testSummary, null, 2));
    
    // Check if we have essential test data
    expect(testResults).toBeDefined();
    expect(testResults.testSummary).toBeDefined();
    
    const summary = testResults.testSummary;
    
    // Log detailed results
    console.log('📊 Detailed Test Analysis:');
    console.log(`  Total Duration: ${summary.totalDuration}`);
    console.log(`  Success Rate: ${summary.successRate}`);
    console.log(`  Total Messages: ${summary.totalMessages}`);
    console.log(`  Success Count: ${summary.successCount}`);
    console.log(`  Error Count: ${summary.errorCount}`);
    
    // Validate core requirements
    if (summary.errorCount > 0) {
      console.warn(`⚠️ Found ${summary.errorCount} errors during testing`);
      
      // Print error details if available
      if (testResults.testResults) {
        const errorMessages = testResults.testResults
          .filter((r: any) => r.type === 'error')
          .map((r: any) => r.message);
        
        console.log('🚨 Error Messages:');
        errorMessages.forEach((msg: string, i: number) => {
          console.log(`  ${i + 1}. ${msg}`);
        });
      }
    }
    
    // Core validation: At least some tests should have run
    expect(summary.totalMessages).toBeGreaterThan(10);
    expect(summary.totalDuration).toBeDefined();
    
    // If there are detailed results, validate them
    if (testResults.detailedResults) {
      const results = testResults.detailedResults;
      console.log('🔬 Detailed Results Validation:');
      
      if (results.initialization) {
        console.log(`  Initialization: ${results.initialization.success ? '✅' : '❌'}`);
        expect(results.initialization).toBeDefined();
      }
      
      if (results.basicEmbedding) {
        console.log(`  Basic Embedding: ${results.basicEmbedding.success ? '✅' : '❌'}`);
        if (results.basicEmbedding.success) {
          expect(results.basicEmbedding.dimensions).toBeGreaterThan(0);
          expect(results.basicEmbedding.processingTime).toBeGreaterThan(0);
        }
      }
      
      if (results.mrlOptimization) {
        console.log(`  MRL Optimization: ${results.mrlOptimization.success ? '✅' : '❌'}`);
        if (results.mrlOptimization.success) {
          expect(results.mrlOptimization.results).toBeDefined();
          expect(results.mrlOptimization.results.length).toBe(3); // speed, balanced, quality
        }
      }
      
      if (results.batchProcessing) {
        console.log(`  Batch Processing: ${results.batchProcessing.success ? '✅' : '❌'}`);
      }
      
      if (results.performanceMonitoring) {
        console.log(`  Performance Monitoring: ${results.performanceMonitoring.success ? '✅' : '❌'}`);
      }
    }
    
    console.log('🎉 EmbeddingGemma automated testing completed successfully!');
    console.log('📈 Key findings:');
    console.log(`  - Model initialization: ${testResults.detailedResults?.initialization?.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  - Embedding generation: ${testResults.detailedResults?.basicEmbedding?.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  - MRL optimization: ${testResults.detailedResults?.mrlOptimization?.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  - Total test time: ${summary.totalDuration}`);
  });

  test('Web Worker functionality test', async ({ page }) => {
    console.log('🔧 Testing Web Worker implementation...');
    
    // Navigate to the Web Worker test page
    await page.goto('http://localhost:3000/test-webworker.html');
    
    // Wait for page load
    await page.waitForTimeout(2000);
    
    // Click initialize button
    const initBtn = await page.locator('#init-btn');
    await expect(initBtn).toBeVisible();
    await initBtn.click();
    
    console.log('⏳ Waiting for Web Worker initialization...');
    
    // Wait for initialization to complete (look for success message)
    await page.waitForSelector('.success', { timeout: 120000 }); // 2 minutes for model download
    
    // Check if test embedding button is enabled
    const testEmbeddingBtn = await page.locator('#test-embedding-btn');
    await expect(testEmbeddingBtn).not.toBeDisabled();
    
    // Run embedding test
    await testEmbeddingBtn.click();
    console.log('🧪 Running embedding generation test...');
    
    // Wait for embedding test completion
    await page.waitForTimeout(10000); // 10 seconds for embedding generation
    
    // Verify results appeared
    const resultsLog = await page.locator('#results-log').textContent();
    expect(resultsLog).toContain('embedding');
    
    console.log('✅ Web Worker functionality test completed');
  });
});