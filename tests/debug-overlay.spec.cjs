const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://1kaiser.github.io/wordy/';

test('Debug loading overlay visibility', async ({ page }) => {
  console.log('\n🔍 Testing loading overlay behavior...\n');

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // Wait for scripts to load
  await page.waitForTimeout(1000);

  const overlay = page.locator('#loading-overlay');

  // Check initial state
  const initiallyVisible = await overlay.isVisible();
  console.log(`📊 Loading overlay initially visible: ${initiallyVisible}`);

  // Check if it has the 'hidden' class
  const hasHiddenClass = await overlay.evaluate(el => el.classList.contains('hidden'));
  console.log(`📊 Has 'hidden' class: ${hasHiddenClass}`);

  // Check the class attribute
  const classAttr = await overlay.getAttribute('class');
  console.log(`📊 Class attribute: "${classAttr}"`);

  // Wait a bit for Vue to react
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    const visible = await overlay.isVisible();
    const classes = await overlay.getAttribute('class');
    console.log(`📊 After ${i + 1}s: visible=${visible}, classes="${classes}"`);

    if (!visible || classes.includes('hidden')) {
      console.log(`✅ Overlay hidden after ${i + 1} seconds!`);
      break;
    }
  }

  // Check Vue data
  const corpusReady = await page.evaluate(() => {
    const appElement = document.querySelector('#app');
    if (appElement && appElement.__vue__) {
      return appElement.__vue__.$data.corpusReady;
    }
    return 'Vue app not found';
  });
  console.log(`📊 Vue corpusReady value: ${corpusReady}`);

  // Take screenshot
  await page.screenshot({ path: 'test-results/debug-overlay-final-state.png', fullPage: true });
  console.log('📸 Screenshot saved to test-results/debug-overlay-final-state.png');
});
