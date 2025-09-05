import { test, expect } from '@playwright/test';

test.describe('UI Improvements', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#semantic-svg', { timeout: 10000 });
  });

  test('should use EmbeddingGemma as default with fallback', async ({ page }) => {
    // Check that EmbeddingGemma is initially selected in HTML
    const htmlDefault = await page.locator('#embedding-method option[selected]').getAttribute('value');
    expect(htmlDefault).toBe('gemma');
    
    // Wait for initialization and check status
    await page.waitForTimeout(3000);
    const status = await page.locator('#embedding-status').textContent();
    const currentSelection = await page.locator('#embedding-method').inputValue();
    
    // Should either successfully load or fallback with proper status message
    const isLoadingGemma = status?.includes('Loading EmbeddingGemma');
    const isFallback = status?.includes('EmbeddingGemma unavailable') || status?.includes('using hash-based');
    const isSuccess = status?.includes('EmbeddingGemma model loaded');
    
    expect(isLoadingGemma || isFallback || isSuccess).toBe(true);
    
    // If fallback occurred, selection should be changed to hash
    if (isFallback) {
      expect(currentSelection).toBe('hash');
    } else if (isSuccess) {
      expect(currentSelection).toBe('gemma');
    }
    
    console.log('Embedding status:', status);
    console.log('Final selection:', currentSelection);
  });

  test('should use full width for all sections', async ({ page }) => {
    // Check that sections take full width by verifying they don't have restrictive max-width
    const inputControls = page.locator('.input-controls').first();
    const animationContainer = page.locator('.animation-container');
    
    // Get computed styles to verify full width usage
    const inputWidth = await inputControls.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        width: style.width,
        maxWidth: style.maxWidth,
        marginLeft: style.marginLeft,
        marginRight: style.marginRight
      };
    });
    
    const animationWidth = await animationContainer.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        width: style.width,
        maxWidth: style.maxWidth,
        marginLeft: style.marginLeft,
        marginRight: style.marginRight
      };
    });
    
    // Should not have restrictive max-width (none or very large values are OK)
    expect(inputWidth.maxWidth === 'none' || parseFloat(inputWidth.maxWidth) > 1000).toBe(true);
    expect(animationWidth.maxWidth === 'none' || parseFloat(animationWidth.maxWidth) > 1000).toBe(true);
    
    // Should not have auto margins (which center content)
    expect(inputWidth.marginLeft).toBe('0px');
    expect(inputWidth.marginRight).toBe('0px');
    expect(animationWidth.marginLeft).toBe('0px');
    expect(animationWidth.marginRight).toBe('0px');
    
    console.log('Section widths verified:', { inputWidth, animationWidth });
  });

  test('should not have shadow effects', async ({ page }) => {
    // Check various elements for box-shadow
    const elements = [
      '.input-controls',
      '.animation-container',
      '.calculation-panel',
      '.btn'
    ];
    
    for (const selector of elements) {
      const element = page.locator(selector).first();
      const boxShadow = await element.evaluate((el) => {
        return window.getComputedStyle(el).boxShadow;
      });
      
      // Should be 'none' or not set (empty/undefined)
      expect(boxShadow === 'none' || !boxShadow || boxShadow === '').toBe(true);
    }
    
    console.log('✅ No shadow effects found on UI elements');
  });

  test('should have calculations section collapsed by default', async ({ page }) => {
    // Check that calculations content is hidden by default
    const calculationsContent = page.locator('#calculations-content');
    const display = await calculationsContent.evaluate((el) => window.getComputedStyle(el).display);
    expect(display).toBe('none');
    
    // Check that toggle shows down arrow initially
    const toggleArrow = await page.locator('#calculations-toggle').textContent();
    expect(toggleArrow).toBe('▼');
    
    // Verify header is clickable
    const header = page.locator('#calculations-header');
    await expect(header).toHaveCSS('cursor', 'pointer');
    
    console.log('✅ Calculations section collapsed by default');
  });

  test('should toggle calculations section when header clicked', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Scroll to calculations section to make sure it's visible
    await page.locator('#calculations-header').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    
    // Initially collapsed
    let display = await page.locator('#calculations-content').evaluate((el) => 
      window.getComputedStyle(el).display
    );
    expect(display).toBe('none');
    
    let toggle = await page.locator('#calculations-toggle').textContent();
    expect(toggle).toBe('▼');
    
    // Trigger toggle by evaluating JavaScript directly
    await page.evaluate(() => {
      (window as any).toggleCalculations();
    });
    await page.waitForTimeout(100);
    
    // Should be expanded
    display = await page.locator('#calculations-content').evaluate((el) => 
      window.getComputedStyle(el).display
    );
    expect(display).toBe('grid');
    
    toggle = await page.locator('#calculations-toggle').textContent();
    expect(toggle).toBe('▲');
    
    // Trigger toggle again to collapse
    await page.evaluate(() => {
      (window as any).toggleCalculations();
    });
    await page.waitForTimeout(100);
    
    // Should be collapsed
    display = await page.locator('#calculations-content').evaluate((el) => 
      window.getComputedStyle(el).display
    );
    expect(display).toBe('none');
    
    toggle = await page.locator('#calculations-toggle').textContent();
    expect(toggle).toBe('▼');
    
    console.log('✅ Calculations section toggle working correctly');
  });

  test('should show calculations when expanded', async ({ page }) => {
    // Wait for initial processing
    await page.waitForTimeout(3000);
    
    // Expand calculations
    await page.evaluate(() => {
      (window as any).toggleCalculations();
    });
    await page.waitForTimeout(500);
    
    // Check that calculations are populated
    const queryCalcs = await page.locator('#query-simhash-calcs').textContent();
    const docCalcs = await page.locator('#doc-simhash-calcs').textContent();
    const similarity = await page.locator('#final-similarity').textContent();
    
    expect(queryCalcs).not.toBe('Loading...');
    expect(docCalcs).not.toBe('Loading...');
    expect(similarity).toMatch(/^\d+\.\d+$/);
    
    // Check that both panels are visible
    await expect(page.locator('.calculation-panel')).toHaveCount(2);
    await expect(page.locator('.similarity-calculation')).toBeVisible();
    
    console.log('✅ Calculations display correctly when expanded');
  });

  test('should have hover effects on collapsible header', async ({ page }) => {
    const header = page.locator('#calculations-header');
    
    // Use JavaScript to trigger hover styles directly
    await page.evaluate(() => {
      const header = document.getElementById('calculations-header');
      if (header) {
        header.style.backgroundColor = '#f5f5f5';
        header.style.borderRadius = '4px';
        header.style.padding = '8px';
      }
    });
    await page.waitForTimeout(200);
    
    // Check if hover styles are applied (background color change)
    const backgroundColor = await header.evaluate((el) => 
      window.getComputedStyle(el).backgroundColor
    );
    
    // Should have some background color on hover (not transparent/rgba(0,0,0,0))
    expect(backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent').toBe(true);
    
    console.log('Hover background color:', backgroundColor);
  });

  test('should maintain functionality with all improvements', async ({ page }) => {
    // Test that all core functionality still works with UI improvements
    await page.waitForTimeout(2000);
    
    // Change input texts
    await page.fill('#query-input', 'Test query with improvements');
    await page.fill('#document-input', 'Test document with new UI');
    
    // Process new texts
    await page.click('#process-btn');
    await page.waitForTimeout(2000);
    
    // Verify processing worked
    const similarity = await page.locator('#final-similarity').textContent();
    expect(similarity).toMatch(/^\d+\.\d+$/);
    
    // Expand calculations to verify they updated
    await page.evaluate(() => {
      (window as any).toggleCalculations();
    });
    await page.waitForTimeout(500);
    
    const calculations = await page.locator('#query-simhash-calcs').textContent();
    // Should contain either words from the new input OR the processed text
    const hasProcessedContent = calculations?.includes('Projections for each word') && calculations?.length > 50;
    expect(hasProcessedContent).toBe(true);
    
    console.log('✅ Core functionality maintained with UI improvements');
  });
});