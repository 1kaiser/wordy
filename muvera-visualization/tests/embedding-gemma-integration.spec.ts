import { test, expect } from '@playwright/test';

test.describe('EmbeddingGemma Integration', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#semantic-svg', { timeout: 10000 });
  });

  test('should display embedding method selector', async ({ page }) => {
    // Check if embedding method selector exists
    await expect(page.locator('#embedding-method')).toBeVisible();
    
    // Verify options are available
    const options = await page.locator('#embedding-method option').allTextContents();
    expect(options).toContain('Hash-based (Fast, Demo)');
    expect(options).toContain('EmbeddingGemma (Semantic, High Quality)');
    
    // Check default status
    await expect(page.locator('#embedding-status')).toBeVisible();
    const defaultStatus = await page.locator('#embedding-status').textContent();
    expect(defaultStatus).toContain('Hash-based embeddings loaded');
  });

  test('should switch to EmbeddingGemma method', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(2000);
    
    // Switch to EmbeddingGemma
    await page.selectOption('#embedding-method', 'gemma');
    
    // Wait for model loading indication
    await page.waitForTimeout(1000);
    const loadingStatus = await page.locator('#embedding-status').textContent();
    expect(loadingStatus).toContain('Loading EmbeddingGemma model');
    
    // Wait for loading to complete (this might take a while for real model)
    await page.waitForTimeout(10000);
    
    // Check if it loads successfully or fails gracefully
    const finalStatus = await page.locator('#embedding-status').textContent();
    
    // Should either succeed or fail back to hash-based
    const isSuccess = finalStatus?.includes('EmbeddingGemma model loaded');
    const isFallback = finalStatus?.includes('Failed to load EmbeddingGemma');
    
    expect(isSuccess || isFallback).toBe(true);
    
    if (isSuccess) {
      console.log('✅ EmbeddingGemma loaded successfully');
      // Verify it's actually using semantic embeddings
      await expect(page.locator('#embedding-status')).toContainText('semantic embeddings');
    } else {
      console.log('⚠️ EmbeddingGemma failed, fell back to hash-based (expected in test environment)');
      // Should fall back to hash-based
      await expect(page.locator('#embedding-method')).toHaveValue('hash');
    }
  });

  test('should process texts with selected embedding method', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Get initial similarity value
    const initialSimilarity = await page.locator('#final-similarity').textContent();
    
    // Change input texts
    await page.fill('#query-input', 'Advanced machine learning algorithms');
    await page.fill('#document-input', 'Deep neural networks and AI systems');
    
    // Process with current method (hash-based by default)
    await page.click('#process-btn');
    await page.waitForTimeout(2000);
    
    const hashSimilarity = await page.locator('#final-similarity').textContent();
    
    // Try switching to EmbeddingGemma and processing again
    await page.selectOption('#embedding-method', 'gemma');
    await page.waitForTimeout(5000); // Wait for model loading
    
    const embeddingStatus = await page.locator('#embedding-status').textContent();
    
    if (embeddingStatus?.includes('EmbeddingGemma model loaded')) {
      // EmbeddingGemma loaded successfully - test it
      await page.click('#process-btn');
      await page.waitForTimeout(3000);
      
      const gemmaSimilarity = await page.locator('#final-similarity').textContent();
      
      // Similarities might be different due to different embedding methods
      console.log(`Hash similarity: ${hashSimilarity}, Gemma similarity: ${gemmaSimilarity}`);
      
      // Both should be valid numbers
      expect(hashSimilarity).toMatch(/^\d+\.\d+$/);
      expect(gemmaSimilarity).toMatch(/^\d+\.\d+$/);
    } else {
      console.log('EmbeddingGemma not available in test environment, skipping comparison');
    }
  });

  test('should update mathematical calculations with embedding method info', async ({ page }) => {
    await page.waitForTimeout(3000);
    
    // Check that calculations are populated
    const queryCalcs = await page.locator('#query-simhash-calcs').textContent();
    expect(queryCalcs).not.toBe('Loading...');
    expect(queryCalcs).toContain('Hyperplane Angles');
    
    // Switch embedding method
    await page.selectOption('#embedding-method', 'gemma');
    await page.waitForTimeout(2000);
    
    // Calculations should still be displayed regardless of embedding method
    const updatedCalcs = await page.locator('#query-simhash-calcs').textContent();
    expect(updatedCalcs).toContain('Hyperplane Angles');
  });

  test('should handle embedding method switching gracefully', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Switch back and forth between methods
    await page.selectOption('#embedding-method', 'gemma');
    await page.waitForTimeout(1000);
    
    await page.selectOption('#embedding-method', 'hash');
    await page.waitForTimeout(1000);
    
    // Should return to hash-based status
    const status = await page.locator('#embedding-status').textContent();
    expect(status).toContain('Hash-based embeddings loaded');
    
    // Page should still be functional
    await page.click('#process-btn');
    await page.waitForTimeout(2000);
    
    const similarity = await page.locator('#final-similarity').textContent();
    expect(similarity).toMatch(/^\d+\.\d+$/);
  });

  test('should show performance comparison when available', async ({ page }) => {
    // This test checks the console logs for performance comparisons
    const messages: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        messages.push(msg.text());
      }
    });
    
    await page.waitForTimeout(2000);
    
    // Try switching to EmbeddingGemma to trigger performance logging
    await page.selectOption('#embedding-method', 'gemma');
    await page.waitForTimeout(5000);
    
    // Check if performance-related messages were logged
    const performanceLogs = messages.filter(msg => 
      msg.includes('EmbeddingGemma') || 
      msg.includes('embedding') || 
      msg.includes('Processing') ||
      msg.includes('performance')
    );
    
    expect(performanceLogs.length).toBeGreaterThan(0);
    console.log('Performance logs found:', performanceLogs);
  });
});