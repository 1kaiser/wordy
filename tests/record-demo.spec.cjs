const { test } = require('@playwright/test');

test('Record demo screenshots for GIF', async ({ browser }) => {
  test.setTimeout(300000); // 5 minutes for complete demo

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  console.log('🎬 Recording Wordy demo...\n');

  // Step 1: Load main page
  console.log('📸 Step 1: Loading main page...');
  await page.goto('http://localhost:3004/wordy/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'demo-screenshots/01-initial-load.png', fullPage: false });

  // Step 2: Type text input
  console.log('📸 Step 2: Typing in text box...');
  const textInput = page.locator('#text-input');
  await textInput.fill('quantum computing breakthrough');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'demo-screenshots/02-text-input.png', fullPage: false });

  // Step 3: Show word visualization
  console.log('📸 Step 3: Word visualization...');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'demo-screenshots/03-word-boxes.png', fullPage: false });

  // Step 4: Open MuVeRa panel
  console.log('📸 Step 4: Opening MuVeRa panel...');
  await page.click('.muvera-toggle-btn');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'demo-screenshots/04-muvera-panel-open.png', fullPage: false });

  // Step 5: MuVeRa panel loaded
  console.log('📸 Step 5: MuVeRa panel loaded...');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'demo-screenshots/05-muvera-panel-loaded.png', fullPage: false });

  // Step 6: Close MuVeRa (ESC key)
  console.log('📸 Step 6: Closing MuVeRa with ESC...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'demo-screenshots/06-muvera-closed.png', fullPage: false });

  // Step 7: Open RAG panel
  console.log('📸 Step 7: Opening RAG panel...');
  await page.click('.rag-toggle-btn');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'demo-screenshots/07-rag-panel-open.png', fullPage: false });

  // Step 8: RAG panel loading
  console.log('📸 Step 8: RAG panel loading models...');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'demo-screenshots/08-rag-panel-loading.png', fullPage: false });

  // Step 9: Close RAG (ESC key)
  console.log('📸 Step 9: Closing RAG with ESC...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'demo-screenshots/09-rag-closed.png', fullPage: false });

  // Step 10: Final state
  console.log('📸 Step 10: Back to main interface...');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'demo-screenshots/10-final-state.png', fullPage: false });

  console.log('\n✅ Demo screenshots recorded!');
  console.log('📂 Saved to demo-screenshots/ directory\n');

  await context.close();
});
