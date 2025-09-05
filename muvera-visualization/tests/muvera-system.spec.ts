import { test, expect } from '@playwright/test';

test.describe('MuVeRa Document Collection System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('should load page with all required elements', async ({ page }) => {
    // Check main title
    await expect(page.locator('h1')).toContainText('Query FDE Construction');
    
    // Check input controls
    await expect(page.locator('#query-input')).toBeVisible();
    await expect(page.locator('#document-input')).toBeVisible();
    
    // Check document collection controls
    await expect(page.locator('#collection-select')).toBeVisible();
    await expect(page.locator('#search-query')).toBeVisible();
    await expect(page.locator('#load-collection-btn')).toBeVisible();
    await expect(page.locator('#index-documents-btn')).toBeVisible();
    await expect(page.locator('#search-btn')).toBeVisible();
    
    // Check collection status
    await expect(page.locator('#collection-status')).toContainText('Ready to load a document collection');
  });

  test('should load academic collection successfully', async ({ page }) => {
    // Select academic collection
    await page.selectOption('#collection-select', 'academic');
    
    // Load collection
    await page.click('#load-collection-btn');
    
    // Wait for loading to complete
    await page.waitForFunction(() => {
      const btn = document.querySelector('#load-collection-btn') as HTMLButtonElement;
      return btn && !btn.disabled && btn.textContent?.includes('Load Collection');
    }, { timeout: 10000 });
    
    // Check status message
    await expect(page.locator('#collection-status')).toContainText('Academic collection loaded');
    await expect(page.locator('#collection-status')).toContainText('5 documents');
    
    // Check that index button is enabled
    await expect(page.locator('#index-documents-btn')).toBeEnabled();
  });

  test('should index documents and enable search', async ({ page }) => {
    // Load academic collection first
    await page.selectOption('#collection-select', 'academic');
    await page.click('#load-collection-btn');
    
    // Wait for collection to load
    await page.waitForFunction(() => {
      const status = document.querySelector('#collection-status')?.textContent;
      return status?.includes('Academic collection loaded');
    }, { timeout: 10000 });
    
    // Index documents
    await page.click('#index-documents-btn');
    
    // Wait for indexing to complete
    await page.waitForFunction(() => {
      const status = document.querySelector('#collection-status')?.textContent;
      return status?.includes('indexed and ready for search');
    }, { timeout: 30000 }); // Give more time for FDE processing
    
    // Check status
    await expect(page.locator('#collection-status')).toContainText('Collection indexed and ready for search');
    
    // Check that search controls are enabled
    await expect(page.locator('#search-query')).toBeEnabled();
    await expect(page.locator('#search-btn')).toBeEnabled();
  });

  test('should perform search and display results', async ({ page }) => {
    // Load and index academic collection
    await page.selectOption('#collection-select', 'academic');
    await page.click('#load-collection-btn');
    
    await page.waitForFunction(() => {
      const status = document.querySelector('#collection-status')?.textContent;
      return status?.includes('Academic collection loaded');
    }, { timeout: 10000 });
    
    await page.click('#index-documents-btn');
    
    await page.waitForFunction(() => {
      const status = document.querySelector('#collection-status')?.textContent;
      return status?.includes('indexed and ready for search');
    }, { timeout: 30000 });
    
    // Perform search
    await page.fill('#search-query', 'machine learning algorithms');
    await page.click('#search-btn');
    
    // Wait for search to complete
    await page.waitForFunction(() => {
      const btn = document.querySelector('#search-btn') as HTMLButtonElement;
      return btn && !btn.disabled && btn.textContent?.includes('Search Documents');
    }, { timeout: 15000 });
    
    // Check search results appear
    await expect(page.locator('#search-results-section')).toBeVisible();
    await expect(page.locator('#search-results')).toContainText('Found');
    await expect(page.locator('#search-results')).toContainText('results for');
    await expect(page.locator('#search-results')).toContainText('machine learning algorithms');
    
    // Check that we have result cards with similarity scores
    const resultCards = page.locator('#search-results > div[style*="border"]');
    await expect(resultCards).toHaveCount({ min: 1 });
    
    // Check similarity scores are displayed
    await expect(page.locator('#search-results')).toContainText('% match');
  });

  test('should test different collections', async ({ page }) => {
    // Test literature collection
    await page.selectOption('#collection-select', 'literature');
    await page.click('#load-collection-btn');
    
    await page.waitForFunction(() => {
      const status = document.querySelector('#collection-status')?.textContent;
      return status?.includes('Literature collection loaded');
    }, { timeout: 10000 });
    
    await expect(page.locator('#collection-status')).toContainText('Literature collection loaded');
    await expect(page.locator('#collection-status')).toContainText('4 documents');
    
    // Test cooking collection
    await page.selectOption('#collection-select', 'cooking');
    await page.click('#load-collection-btn');
    
    await page.waitForFunction(() => {
      const status = document.querySelector('#collection-status')?.textContent;
      return status?.includes('Cooking collection loaded');
    }, { timeout: 10000 });
    
    await expect(page.locator('#collection-status')).toContainText('Cooking collection loaded');
    await expect(page.locator('#collection-status')).toContainText('4 documents');
  });

  test('should handle search workflow step by step', async ({ page }) => {
    // Initially search should be disabled
    await expect(page.locator('#search-query')).toBeDisabled();
    await expect(page.locator('#search-btn')).toBeDisabled();
    await expect(page.locator('#index-documents-btn')).toBeDisabled();
    
    // Load collection enables indexing
    await page.selectOption('#collection-select', 'academic');
    await page.click('#load-collection-btn');
    
    await page.waitForTimeout(2000); // Wait for loading
    await expect(page.locator('#index-documents-btn')).toBeEnabled();
    await expect(page.locator('#search-query')).toBeDisabled();
    
    // Index enables search
    await page.click('#index-documents-btn');
    
    await page.waitForFunction(() => {
      const searchInput = document.querySelector('#search-query') as HTMLInputElement;
      const searchBtn = document.querySelector('#search-btn') as HTMLButtonElement;
      return searchInput && !searchInput.disabled && searchBtn && !searchBtn.disabled;
    }, { timeout: 30000 });
    
    await expect(page.locator('#search-query')).toBeEnabled();
    await expect(page.locator('#search-btn')).toBeEnabled();
  });

  test('should validate search performance metrics', async ({ page }) => {
    // Setup collection and search
    await page.selectOption('#collection-select', 'academic');
    await page.click('#load-collection-btn');
    
    await page.waitForFunction(() => {
      const status = document.querySelector('#collection-status')?.textContent;
      return status?.includes('Academic collection loaded');
    }, { timeout: 10000 });
    
    await page.click('#index-documents-btn');
    
    await page.waitForFunction(() => {
      const status = document.querySelector('#collection-status')?.textContent;
      return status?.includes('indexed and ready for search');
    }, { timeout: 30000 });
    
    // Perform search and measure
    const searchStart = Date.now();
    await page.fill('#search-query', 'artificial intelligence ethics');
    await page.click('#search-btn');
    
    await page.waitForFunction(() => {
      const results = document.querySelector('#search-results')?.textContent;
      return results?.includes('Found') && results?.includes('results for');
    }, { timeout: 15000 });
    
    const searchEnd = Date.now();
    const searchTime = searchEnd - searchStart;
    
    // Validate search completed in reasonable time (should be fast)
    expect(searchTime).toBeLessThan(10000); // Less than 10 seconds total
    
    // Check performance metrics in results
    const resultsText = await page.locator('#search-results').textContent();
    expect(resultsText).toMatch(/\d+ms/); // Should show millisecond timing
    
    // Check similarity scores are reasonable percentages
    expect(resultsText).toMatch(/\d+\.\d+% match/);
  });

  test('should test text input integration with FDE animation', async ({ page }) => {
    // Test the original FDE animation input
    await page.fill('#query-input', 'How does machine learning work?');
    await page.fill('#document-input', 'Machine learning uses algorithms to find patterns in data.');
    
    await page.click('#process-btn');
    
    // Wait for processing to complete
    await page.waitForFunction(() => {
      const btn = document.querySelector('#process-btn') as HTMLButtonElement;
      return btn && !btn.disabled && btn.textContent?.includes('Process New Texts');
    }, { timeout: 10000 });
    
    // Check that query text is displayed
    await expect(page.locator('#query-text')).toBeVisible();
    
    // Check that both animations are running
    await expect(page.locator('#animation-title')).toContainText('Query FDE Construction');
    await expect(page.locator('#animation-title-doc')).toContainText('Document FDE Construction');
  });

  test('should handle edge cases and errors gracefully', async ({ page }) => {
    // Try to search without loading collection
    await page.fill('#search-query', 'test query');
    await page.click('#search-btn');
    
    // Should show alert (we'll check button remains disabled)
    await expect(page.locator('#search-btn')).toBeDisabled();
    
    // Try to index without loading collection
    await page.click('#index-documents-btn');
    await expect(page.locator('#index-documents-btn')).toBeDisabled();
    
    // Load collection but try empty search
    await page.selectOption('#collection-select', 'academic');
    await page.click('#load-collection-btn');
    
    await page.waitForTimeout(2000);
    await page.click('#index-documents-btn');
    
    await page.waitForFunction(() => {
      const searchBtn = document.querySelector('#search-btn') as HTMLButtonElement;
      return searchBtn && !searchBtn.disabled;
    }, { timeout: 30000 });
    
    // Clear search query and try to search
    await page.fill('#search-query', '');
    await page.click('#search-btn');
    
    // Should remain functional (likely shows alert, query stays empty)
    await expect(page.locator('#search-query')).toHaveValue('');
  });
});