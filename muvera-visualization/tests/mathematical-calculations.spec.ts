import { test, expect, Page } from '@playwright/test';

test.describe('Mathematical Calculations Display', () => {
  
  test('should display mathematical calculations section', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for page to load
    await page.waitForSelector('#semantic-svg', { timeout: 10000 });
    
    // Check if mathematical calculations section exists
    await expect(page.locator('.calculations-section')).toBeVisible();
    await expect(page.locator('h2')).toContainText('🧮 Live Mathematical Calculations');
    
    // Verify both calculation panels exist
    await expect(page.locator('.calculation-panel')).toHaveCount(2);
    
    // Check query calculations panel
    await expect(page.locator('.calculation-panel').first()).toContainText('📊 Query Processing (SUM Aggregation)');
    
    // Check document calculations panel
    await expect(page.locator('.calculation-panel').last()).toContainText('📈 Document Processing (AVERAGE Aggregation)');
    
    // Verify final similarity section exists
    await expect(page.locator('.similarity-calculation')).toBeVisible();
    await expect(page.locator('.similarity-calculation h3')).toContainText('🎯 Final Similarity Computation');
  });

  test('should populate calculations with real data', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for calculations to be populated (give it time to process)
    await page.waitForTimeout(3000);
    
    // Check query SimHash calculations
    const querySimhashCalcs = await page.locator('#query-simhash-calcs').textContent();
    expect(querySimhashCalcs).toContain('Hyperplane Angles (radians)');
    expect(querySimhashCalcs).toContain('H1:');
    expect(querySimhashCalcs).toContain('rad');
    expect(querySimhashCalcs).not.toBe('Loading...');
    
    // Check document SimHash calculations
    const docSimhashCalcs = await page.locator('#doc-simhash-calcs').textContent();
    expect(docSimhashCalcs).toContain('Hyperplane Angles (radians)');
    expect(docSimhashCalcs).toContain('H1:');
    expect(docSimhashCalcs).not.toBe('Loading...');
    
    // Check partition assignments
    const queryPartitionCalcs = await page.locator('#query-partition-calcs').textContent();
    expect(queryPartitionCalcs).toContain('Word → Partition Assignment');
    expect(queryPartitionCalcs).toContain('Partition');
    expect(queryPartitionCalcs).not.toBe('Loading...');
    
    // Check aggregation calculations show different methods
    const queryAggregationCalcs = await page.locator('#query-aggregation-calcs').textContent();
    expect(queryAggregationCalcs).toContain('SUM Aggregation by Partition');
    
    const docAggregationCalcs = await page.locator('#doc-aggregation-calcs').textContent();
    expect(docAggregationCalcs).toContain('AVERAGE Aggregation by Partition');
    
    // Verify final similarity is calculated
    const finalSimilarity = await page.locator('#final-similarity').textContent();
    expect(finalSimilarity).not.toBe('0.000');
    expect(finalSimilarity).toMatch(/^\d+\.\d+$/); // Should be a decimal number
  });

  test('should show different hyperplane angles for query vs document', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(3000);
    
    // Get hyperplane angles from both panels
    const queryAngles = await page.locator('#query-simhash-calcs').textContent();
    const docAngles = await page.locator('#doc-simhash-calcs').textContent();
    
    // Extract first hyperplane angle from each (rough check)
    const queryAngleMatch = queryAngles?.match(/H1:\s*([\d.]+)rad/);
    const docAngleMatch = docAngles?.match(/H1:\s*([\d.]+)rad/);
    
    if (queryAngleMatch && docAngleMatch) {
      const queryAngle = parseFloat(queryAngleMatch[1]);
      const docAngle = parseFloat(docAngleMatch[1]);
      
      // Angles should be different (very unlikely to be exactly the same with random generation)
      expect(queryAngle).not.toBe(docAngle);
    }
  });

  test('should update calculations when new texts are processed', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    // Get initial similarity value
    const initialSimilarity = await page.locator('#final-similarity').textContent();
    
    // Change input texts
    await page.fill('#query-input', 'Machine learning algorithms process data');
    await page.fill('#document-input', 'Artificial intelligence systems learn patterns');
    
    // Click process button
    await page.click('#process-btn');
    
    // Wait for processing to complete
    await page.waitForTimeout(3000);
    
    // Get new similarity value
    const newSimilarity = await page.locator('#final-similarity').textContent();
    
    // Similarity should have changed (very unlikely to be exactly the same)
    expect(newSimilarity).not.toBe(initialSimilarity);
    
    // Verify calculations were updated with new content
    const queryCalcs = await page.locator('#query-simhash-calcs').textContent();
    expect(queryCalcs).toContain('machine'); // Should contain words from new query
  });

  test('should display mathematical formatting correctly', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(3000);
    
    // Check that calculations use monospace font for math display
    const mathDisplay = page.locator('.math-display').first();
    await expect(mathDisplay).toHaveCSS('font-family', /courier|monospace/i);
    
    // Check that vectors are formatted with brackets
    const queryAggregation = await page.locator('#query-aggregation-calcs').textContent();
    expect(queryAggregation).toContain('[');
    expect(queryAggregation).toContain(']');
    
    // Check that similarity calculation shows dot product notation
    const similarityCalc = await page.locator('#similarity-calculation .math-display').textContent();
    expect(similarityCalc).toContain('Query_FDE · Document_FDE');
  });

  test('should handle edge cases gracefully', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Test with very short texts
    await page.fill('#query-input', 'AI');
    await page.fill('#document-input', 'ML');
    await page.click('#process-btn');
    
    await page.waitForTimeout(2000);
    
    // Should still show calculations without crashing
    const similarity = await page.locator('#final-similarity').textContent();
    expect(similarity).toMatch(/^\d+\.\d+$/);
    
    // Test with longer texts
    await page.fill('#query-input', 'This is a much longer query about machine learning and artificial intelligence systems that process data');
    await page.fill('#document-input', 'Here is an extensive document discussing neural networks, deep learning, and computational methods for pattern recognition');
    await page.click('#process-btn');
    
    await page.waitForTimeout(3000);
    
    // Should handle longer texts and show more words in calculations
    const partitionCalcs = await page.locator('#query-partition-calcs').textContent();
    expect(partitionCalcs).toContain('and'); // Should contain words from longer query
  });
});