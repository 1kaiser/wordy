const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3004/wordy/';

test.describe('Wordy - Minimal Search Integration Tests', () => {

  // Capture console messages for debugging
  let consoleMessages = [];
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleMessages = [];
    consoleErrors = [];

    // Capture console logs
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push({ type: msg.type(), text });
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      consoleErrors.push(`Page Error: ${error.message}`);
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Log console messages if test failed
    if (testInfo.status !== 'passed') {
      console.log('\n=== Console Messages ===');
      consoleMessages.forEach(msg => {
        console.log(`[${msg.type}] ${msg.text}`);
      });
      console.log('\n=== Console Errors ===');
      consoleErrors.forEach(err => console.error(err));
    }
  });

  test('Minimal search interface loads correctly', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Wait for Vue app to initialize
    await page.waitForTimeout(1000);

    // Capture page load
    await page.screenshot({ path: 'test-results/01-minimal-search-main.png', fullPage: true });

    // Check title
    await expect(page).toHaveTitle(/WordNet - Minimal Search/);

    // Check for toggle buttons
    const muveraBtn = page.locator('.muvera-toggle-btn');
    const ragBtn = page.locator('.rag-toggle-btn');

    await expect(muveraBtn).toBeVisible();
    await expect(ragBtn).toBeVisible();
    await expect(muveraBtn).toContainText('MuVeRa');
    await expect(ragBtn).toContainText('RAG');

    // Check for text input
    const textInput = page.locator('#text-input');
    await expect(textInput).toBeVisible();

    // Check for instructions
    const instructions = page.locator('#instructions');
    await expect(instructions).toBeVisible();
    await expect(instructions).toContainText('Type or paste text');

    // Verify no critical console errors
    const criticalErrors = consoleErrors.filter(err =>
      !err.includes('[vite]') &&
      !err.includes('DevTools') &&
      !err.includes('WebSocket')
    );

    console.log('Console messages:', consoleMessages.length);
    expect(criticalErrors.length).toBe(0);
  });

  test('MuVeRa panel slides in and out correctly', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/02-before-muvera-open.png', fullPage: true });

    // Click MuVeRa button
    const muveraBtn = page.locator('.muvera-toggle-btn');
    await muveraBtn.click();

    // Wait for slide animation
    await page.waitForTimeout(600);

    // Check if panel is visible
    const muveraContainer = page.locator('#muvera-container');
    await expect(muveraContainer).toHaveClass(/visible/);

    // Check button text changed
    await expect(muveraBtn).toContainText('Back to Search');

    await page.screenshot({ path: 'test-results/03-muvera-panel-open.png', fullPage: true });

    // Click button again to close
    await muveraBtn.click();
    await page.waitForTimeout(600);

    // Verify panel is closed
    await expect(muveraContainer).not.toHaveClass(/visible/);
    await expect(muveraBtn).toContainText('MuVeRa');

    await page.screenshot({ path: 'test-results/04-muvera-panel-closed.png', fullPage: true });
  });

  test('RAG panel slides in and out correctly', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/05-before-rag-open.png', fullPage: true });

    // Click RAG button
    const ragBtn = page.locator('.rag-toggle-btn');
    await ragBtn.click();

    // Wait for slide animation
    await page.waitForTimeout(600);

    // Check if panel is visible
    const ragContainer = page.locator('#rag-demo-container');
    await expect(ragContainer).toHaveClass(/visible/);

    // Check button text changed
    await expect(ragBtn).toContainText('Back to Search');

    await page.screenshot({ path: 'test-results/06-rag-panel-open.png', fullPage: true });

    // Click button again to close
    await ragBtn.click();
    await page.waitForTimeout(600);

    // Verify panel is closed
    await expect(ragContainer).not.toHaveClass(/visible/);
    await expect(ragBtn).toContainText('RAG');

    await page.screenshot({ path: 'test-results/07-rag-panel-closed.png', fullPage: true });
  });

  test('Only one panel can be open at a time', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Open MuVeRa panel
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(600);

    // Verify MuVeRa is open
    await expect(page.locator('#muvera-container')).toHaveClass(/visible/);
    await page.screenshot({ path: 'test-results/08-muvera-open-first.png', fullPage: true });

    // Open RAG panel (should close MuVeRa)
    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(600);

    // Verify MuVeRa is closed and RAG is open
    await expect(page.locator('#muvera-container')).not.toHaveClass(/visible/);
    await expect(page.locator('#rag-demo-container')).toHaveClass(/visible/);

    await page.screenshot({ path: 'test-results/09-rag-open-muvera-closed.png', fullPage: true });
  });

  test('ESC key closes MuVeRa panel', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Open MuVeRa panel
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(600);

    // Verify panel is open
    await expect(page.locator('#muvera-container')).toHaveClass(/visible/);

    // Press ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // Verify panel is closed
    await expect(page.locator('#muvera-container')).not.toHaveClass(/visible/);

    await page.screenshot({ path: 'test-results/10-esc-closes-muvera.png', fullPage: true });
  });

  test('ESC key closes RAG panel', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Open RAG panel
    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(600);

    // Verify panel is open
    await expect(page.locator('#rag-demo-container')).toHaveClass(/visible/);

    // Press ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // Verify panel is closed
    await expect(page.locator('#rag-demo-container')).not.toHaveClass(/visible/);

    await page.screenshot({ path: 'test-results/11-esc-closes-rag.png', fullPage: true });
  });

  test('MuVeRa iframe loads on first click', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Check iframe has data-src but no src initially
    const muveraIframe = page.locator('#muvera-iframe');
    const initialSrc = await muveraIframe.getAttribute('src');
    expect(initialSrc).toBeNull();

    // Click to open panel
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(1000);

    // Check iframe now has src
    const loadedSrc = await muveraIframe.getAttribute('src');
    expect(loadedSrc).toBe('muvera.html');

    await page.screenshot({ path: 'test-results/12-muvera-iframe-loaded.png', fullPage: true });
  });

  test('RAG iframe loads on first click', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Check iframe has data-src but no src initially
    const ragIframe = page.locator('#rag-iframe');
    const initialSrc = await ragIframe.getAttribute('src');
    expect(initialSrc).toBeNull();

    // Click to open panel
    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(1000);

    // Check iframe now has src
    const loadedSrc = await ragIframe.getAttribute('src');
    expect(loadedSrc).toBe('rag-demo.html');

    await page.screenshot({ path: 'test-results/13-rag-iframe-loaded.png', fullPage: true });
  });

  test('Text input accepts typing', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Wait for corpus to be ready
    await page.waitForTimeout(2000);

    const textInput = page.locator('#text-input');

    // Type some text
    await textInput.fill('The quick brown fox jumps');
    await page.waitForTimeout(500);

    // Verify input has text
    const inputValue = await textInput.inputValue();
    expect(inputValue).toBe('The quick brown fox jumps');

    await page.screenshot({ path: 'test-results/14-text-input-filled.png', fullPage: true });
  });

  test('Buttons have correct styling', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const muveraBtn = page.locator('.muvera-toggle-btn');
    const ragBtn = page.locator('.rag-toggle-btn');

    // Check MuVeRa button is positioned correctly
    const muveraBtnBox = await muveraBtn.boundingBox();
    expect(muveraBtnBox).not.toBeNull();

    // Check RAG button is positioned correctly
    const ragBtnBox = await ragBtn.boundingBox();
    expect(ragBtnBox).not.toBeNull();

    // RAG button should be to the right of MuVeRa button
    expect(ragBtnBox.x).toBeGreaterThan(muveraBtnBox.x);

    await page.screenshot({ path: 'test-results/15-button-positions.png', fullPage: true });
  });

  test('No critical JavaScript errors on page load', async ({ page }) => {
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);

    // Filter out non-critical errors
    const criticalErrors = errors.filter(err =>
      !err.includes('[vite]') &&
      !err.includes('DevTools') &&
      !err.includes('WebSocket') &&
      !err.includes('Vue warn')
    );

    console.log('Total console errors:', errors.length);
    console.log('Critical errors:', criticalErrors.length);
    if (criticalErrors.length > 0) {
      console.log('Critical errors:', criticalErrors);
    }

    expect(criticalErrors.length).toBe(0);
  });
});
