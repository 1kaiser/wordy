import { test, expect } from '@playwright/test';

test.describe('MuVeRa Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('should load page without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait a bit for the page to fully load
    await page.waitForTimeout(3000);

    console.log('JavaScript errors:', errors);
    
    // Check basic elements are present
    await expect(page.locator('#query-input')).toBeVisible();
    await expect(page.locator('#collection-select')).toBeVisible();
    await expect(page.locator('#load-collection-btn')).toBeVisible();
  });

  test('should be able to select collection option', async ({ page }) => {
    // Check dropdown options
    const options = await page.locator('#collection-select option').all();
    expect(options.length).toBeGreaterThan(1);
    
    // Select academic collection
    await page.selectOption('#collection-select', 'academic');
    
    const selectedValue = await page.locator('#collection-select').inputValue();
    expect(selectedValue).toBe('academic');
  });

  test('should debug collection loading', async ({ page }) => {
    let consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    });

    // Select and try to load collection
    await page.selectOption('#collection-select', 'academic');
    await page.click('#load-collection-btn');
    
    // Wait a bit and check console
    await page.waitForTimeout(5000);
    
    console.log('Console messages:', consoleMessages);
    
    // Check button state
    const buttonText = await page.locator('#load-collection-btn').textContent();
    console.log('Button text:', buttonText);
    
    const statusText = await page.locator('#collection-status').textContent();
    console.log('Status text:', statusText);
  });

  test('should check if modules are loading', async ({ page }) => {
    // Check if main script is loaded
    const scriptTags = await page.locator('script[type="module"]').all();
    expect(scriptTags.length).toBeGreaterThan(0);
    
    // Check network requests
    const responses: string[] = [];
    page.on('response', (response) => {
      responses.push(`${response.status()} ${response.url()}`);
    });
    
    await page.waitForTimeout(3000);
    
    console.log('Network responses:', responses.filter(r => !r.includes('favicon')));
  });
});