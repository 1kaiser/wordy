const { test } = require('@playwright/test');

const BASE_URL = 'http://localhost:3004/wordy/';

test.describe('Wordy Demo Recording', () => {

  test('Complete feature demonstration', async ({ page }) => {
    // Set viewport for consistent demo
    await page.setViewportSize({ width: 1280, height: 800 });

    // Step 1: Load the main page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Let user see initial state

    // Step 2: Show the minimal search interface
    await page.waitForTimeout(1500);

    // Step 3: Type some text to demonstrate word search
    const textInput = page.locator('#text-input');
    await textInput.click();
    await page.waitForTimeout(500);

    // Type slowly for demo effect
    await textInput.type('The quick brown fox jumps over the lazy dog', { delay: 80 });
    await page.waitForTimeout(2000); // Show word boxes

    // Step 4: Click on a word to show alternatives
    const firstWord = page.locator('.word-box').first();
    await firstWord.click();
    await page.waitForTimeout(2000); // Show alternatives

    // Step 5: Open MuVeRa panel
    const muveraBtn = page.locator('.muvera-toggle-btn');
    await muveraBtn.click();
    await page.waitForTimeout(3000); // Let MuVeRa panel slide in and show content

    // Step 6: Scroll down in MuVeRa panel to show features
    const muveraIframe = page.frameLocator('#muvera-iframe');
    await page.waitForTimeout(2000);

    // Step 7: Close MuVeRa panel
    await muveraBtn.click();
    await page.waitForTimeout(1500); // Let panel slide out

    // Step 8: Open RAG panel
    const ragBtn = page.locator('.rag-toggle-btn');
    await ragBtn.click();
    await page.waitForTimeout(4000); // Wait for RAG panel to load and show corpus loading

    // Step 9: Show RAG interface
    await page.waitForTimeout(2000);

    // Step 10: Type a query in RAG panel (if visible)
    const ragIframe = page.frameLocator('#rag-iframe');
    const ragQuery = ragIframe.locator('#query-input');

    // Check if query input is available
    const isVisible = await ragQuery.isVisible().catch(() => false);
    if (isVisible) {
      await ragQuery.click();
      await ragQuery.type('What is semantic search?', { delay: 100 });
      await page.waitForTimeout(2000);
    }

    // Step 11: Close RAG panel
    await ragBtn.click();
    await page.waitForTimeout(1500);

    // Step 12: Final view of main interface
    await page.waitForTimeout(2000);

    // Step 13: Use ESC key to demonstrate
    await ragBtn.click();
    await page.waitForTimeout(2000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    // Final pause to show completed demo
    await page.waitForTimeout(1000);
  });

  test('Quick feature tour', async ({ page }) => {
    // Shorter version for GIF
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Load page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 2. Type text
    const textInput = page.locator('#text-input');
    await textInput.click();
    await textInput.type('Hello World', { delay: 100 });
    await page.waitForTimeout(1500);

    // 3. Show MuVeRa
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(2500);
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(1000);

    // 4. Show RAG
    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(2500);

    // 5. ESC to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  });
});
