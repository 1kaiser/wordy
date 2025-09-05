import { test, expect } from '@playwright/test';

test.describe('JavaScript Debug', () => {
  test('should debug JavaScript execution', async ({ page }) => {
    let consoleMessages: string[] = [];
    let errors: string[] = [];
    
    page.on('console', (msg) => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      errors.push(`Page Error: ${error.message}`);
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Wait for JavaScript to execute
    await page.waitForTimeout(5000);
    
    console.log('All console messages:');
    consoleMessages.forEach(msg => console.log('  ', msg));
    
    console.log('Errors:');
    errors.forEach(error => console.log('  ERROR:', error));
    
    // Check if DOM elements exist
    const queryInput = await page.locator('#query-input').count();
    const collectionSelect = await page.locator('#collection-select').count();
    const loadBtn = await page.locator('#load-collection-btn').count();
    
    console.log('DOM Elements found:');
    console.log('  query-input:', queryInput);
    console.log('  collection-select:', collectionSelect);
    console.log('  load-collection-btn:', loadBtn);
    
    // Try to execute JavaScript in the page context
    const jsResult = await page.evaluate(() => {
      const btn = document.getElementById('load-collection-btn');
      return {
        btnExists: !!btn,
        btnDisabled: btn?.disabled || false,
        btnText: btn?.textContent?.trim() || 'not found',
        hasClickListener: btn && btn.onclick !== null
      };
    });
    
    console.log('JavaScript evaluation result:', jsResult);
    
    // Test if we can manually trigger collection loading
    await page.evaluate(() => {
      console.log('Manual test: Attempting to trigger collection loading...');
      const select = document.getElementById('collection-select') as HTMLSelectElement;
      const btn = document.getElementById('load-collection-btn') as HTMLButtonElement;
      
      if (select && btn) {
        select.value = 'academic';
        console.log('Selected value:', select.value);
        btn.click();
        console.log('Button clicked');
      } else {
        console.log('Elements not found:', { select: !!select, btn: !!btn });
      }
    });
    
    // Wait a bit more to see if anything happens
    await page.waitForTimeout(3000);
    
    const finalStatus = await page.locator('#collection-status').textContent();
    console.log('Final status:', finalStatus);
  });
});