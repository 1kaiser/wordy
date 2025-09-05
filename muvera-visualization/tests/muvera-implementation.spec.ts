import { test, expect } from '@playwright/test';

test.describe('MuVeRa Implementation Tests', () => {
  test('should load and execute MuVeRa core functionality', async ({ page }) => {
    // Navigate to the page
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Test MuVeRa implementation by executing it in the browser
    const result = await page.evaluate(async () => {
      // Import our MuVeRa implementation
      const { MuVeRaCore, MuVeRaBrowserUtils, EncodingType, BROWSER_OPTIMIZED_CONFIG } = await import('./src/muvera-core.js');
      
      try {
        // Create MuVeRa instance
        const muvera = new MuVeRaCore(BROWSER_OPTIMIZED_CONFIG);
        
        // Test text-to-multi-vector conversion
        const testText = "Machine learning algorithms learn patterns from data";
        const multiVector = await MuVeRaBrowserUtils.textToMultiVector(testText, 64);
        
        // Generate FDEs
        const queryFDE = muvera.generateQueryFDE(multiVector);
        const docFDE = muvera.generateDocumentFDE(multiVector);
        
        // Compute similarity
        const similarity = MuVeRaCore.computeSimilarity(queryFDE, docFDE);
        
        // Get compression stats
        const stats = muvera.getCompressionStats(multiVector.vectors.length);
        
        return {
          success: true,
          multiVectorSize: multiVector.vectors.length,
          queryFDESize: queryFDE.fde.length,
          docFDESize: docFDE.fde.length,
          similarity: similarity,
          compressionRatio: stats.compressionRatio,
          memoryReduction: stats.memoryReduction,
          config: muvera.getConfig()
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    console.log('MuVeRa Test Results:', result);
    
    // Verify the implementation works
    expect(result.success).toBe(true);
    expect(result.multiVectorSize).toBeGreaterThan(0);
    expect(result.queryFDESize).toBeGreaterThan(0);
    expect(result.docFDESize).toBeGreaterThan(0);
    expect(result.similarity).toBeGreaterThan(0); // Should have positive similarity with itself
    expect(result.compressionRatio).toBeGreaterThan(1); // Should compress data
    
    console.log(`✅ MuVeRa Implementation Test: SUCCESS!`);
    console.log(`📊 Stats: ${result.multiVectorSize} vectors → ${result.queryFDESize} dimensions`);
    console.log(`🗜️ Compression: ${result.compressionRatio.toFixed(1)}x ratio, ${result.memoryReduction} reduction`);
    console.log(`🎯 Self-similarity: ${result.similarity.toFixed(6)}`);
  });
  
  test('should demonstrate MuVeRa search functionality', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    const searchResult = await page.evaluate(async () => {
      const { MuVeRaDemo, SAMPLE_QUERIES } = await import('./src/muvera-demo.js');
      
      try {
        // Create demo instance
        const demo = new MuVeRaDemo();
        
        // Index sample documents
        await demo.indexDocuments();
        
        // Search with a sample query
        const query = SAMPLE_QUERIES[0]; // "machine learning algorithms"
        const results = await demo.search(query, 3);
        
        return {
          success: true,
          query: query,
          topResults: results.rankings.slice(0, 3),
          performance: results.performance,
          stats: demo.getStatistics()
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    console.log('MuVeRa Search Results:', searchResult);
    
    // Verify search functionality
    expect(searchResult.success).toBe(true);
    expect(searchResult.topResults.length).toBe(3);
    expect(searchResult.topResults[0].score).toBeGreaterThan(0);
    expect(searchResult.performance.searchTime).toBeLessThan(100); // Should be fast
    
    console.log(`✅ MuVeRa Search Test: SUCCESS!`);
    console.log(`🔍 Query: "${searchResult.query}"`);
    console.log(`🏆 Top result: "${searchResult.topResults[0].document.substring(0, 60)}..."`);
    console.log(`⚡ Search time: ${searchResult.performance.searchTime.toFixed(1)}ms`);
    console.log(`📚 Documents indexed: ${searchResult.stats.documentsIndexed}`);
  });
  
  test('should validate encoding type differences', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    const encodingResult = await page.evaluate(async () => {
      const { MuVeRaDemo } = await import('./src/muvera-demo.js');
      
      try {
        const demo = new MuVeRaDemo();
        const testText = "neural networks deep learning artificial intelligence machine learning";
        
        const comparison = await demo.demonstrateEncodingTypes(testText);
        
        return {
          success: true,
          sumMagnitude: comparison.comparison.sumMagnitude,
          averageMagnitude: comparison.comparison.averageMagnitude,
          difference: comparison.comparison.difference,
          dimension: comparison.comparison.dimension
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    console.log('Encoding Type Comparison:', encodingResult);
    
    // Verify encoding differences
    expect(encodingResult.success).toBe(true);
    expect(encodingResult.sumMagnitude).toBeGreaterThan(encodingResult.averageMagnitude);
    expect(encodingResult.difference).toBeGreaterThan(0);
    
    console.log(`✅ Encoding Types Test: SUCCESS!`);
    console.log(`📏 SUM magnitude: ${encodingResult.sumMagnitude.toFixed(4)}`);
    console.log(`📏 AVERAGE magnitude: ${encodingResult.averageMagnitude.toFixed(4)}`);
    console.log(`📊 Difference: ${encodingResult.difference.toFixed(4)}`);
  });
  
  test('should handle browser memory constraints', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    const memoryResult = await page.evaluate(async () => {
      const { MuVeRaCore, MuVeRaBrowserUtils, BROWSER_OPTIMIZED_CONFIG } = await import('./src/muvera-core.js');
      
      try {
        const muvera = new MuVeRaCore(BROWSER_OPTIMIZED_CONFIG);
        
        // Test with larger text (simulate multi-page document)
        const largeText = "Machine learning algorithms learn patterns from data through iterative training processes. ".repeat(50);
        const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
        
        const multiVector = await MuVeRaBrowserUtils.textToMultiVector(largeText, 64);
        const fde = muvera.generateQueryFDE(multiVector);
        
        const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
        const memoryUsed = endMemory - startMemory;
        
        const stats = muvera.getCompressionStats(multiVector.vectors.length);
        
        return {
          success: true,
          originalVectors: multiVector.vectors.length,
          compressedSize: fde.fde.length,
          memoryUsed: memoryUsed,
          compressionRatio: stats.compressionRatio,
          memoryReduction: stats.memoryReduction
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    console.log('Memory Constraint Test:', memoryResult);
    
    // Verify memory efficiency
    expect(memoryResult.success).toBe(true);
    expect(memoryResult.compressionRatio).toBeGreaterThan(1);
    
    console.log(`✅ Memory Test: SUCCESS!`);
    console.log(`🗜️ Compression: ${memoryResult.originalVectors} → ${memoryResult.compressedSize} (${memoryResult.compressionRatio.toFixed(1)}x)`);
    console.log(`💾 Memory reduction: ${memoryResult.memoryReduction}`);
  });
});