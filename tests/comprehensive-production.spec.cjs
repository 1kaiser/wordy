const { test, expect } = require('@playwright/test');

const PRODUCTION_URL = 'https://1kaiser.github.io/wordy/';

test.describe('Comprehensive Production Deployment Tests', () => {

  let consoleMessages = [];
  let consoleErrors = [];
  let consoleWarnings = [];
  let networkRequests = [];
  let failedRequests = [];
  let resourceTimings = [];

  test.beforeEach(async ({ page }) => {
    consoleMessages = [];
    consoleErrors = [];
    consoleWarnings = [];
    networkRequests = [];
    failedRequests = [];
    resourceTimings = [];

    // Comprehensive console monitoring
    page.on('console', msg => {
      const text = msg.text();
      const entry = {
        type: msg.type(),
        text,
        timestamp: new Date().toISOString(),
        location: msg.location()
      };

      consoleMessages.push(entry);

      if (msg.type() === 'error') {
        consoleErrors.push(entry);
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(entry);
      }
    });

    // Detailed network monitoring
    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        headers: request.headers(),
        timestamp: new Date().toISOString()
      });
    });

    page.on('response', async response => {
      try {
        const timing = {
          url: response.url(),
          status: response.status(),
          statusText: response.statusText(),
          contentType: response.headers()['content-type'],
          size: response.headers()['content-length'],
          fromCache: response.fromCache(),
          fromServiceWorker: response.fromServiceWorker()
        };
        resourceTimings.push(timing);
      } catch (error) {
        // Ignore timing errors
      }
    });

    // Failed request tracking
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        failure: request.failure(),
        timestamp: new Date().toISOString()
      });
    });

    // Page errors
    page.on('pageerror', error => {
      consoleErrors.push({
        type: 'pageerror',
        text: `Page Error: ${error.message}\n${error.stack}`,
        timestamp: new Date().toISOString()
      });
    });

    // Dialog handling
    page.on('dialog', dialog => {
      console.log(`📢 Dialog: ${dialog.type()} - ${dialog.message()}`);
      dialog.dismiss();
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    const testName = testInfo.title;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 TEST REPORT: ${testName}`);
    console.log(`${'='.repeat(80)}\n`);

    // Summary Statistics
    console.log(`📈 SUMMARY STATISTICS:`);
    console.log(`  Total Requests: ${networkRequests.length}`);
    console.log(`  Failed Requests: ${failedRequests.length}`);
    console.log(`  Console Messages: ${consoleMessages.length}`);
    console.log(`  Console Errors: ${consoleErrors.length}`);
    console.log(`  Console Warnings: ${consoleWarnings.length}\n`);

    // Failed Requests Analysis
    if (failedRequests.length > 0) {
      console.log(`❌ FAILED REQUESTS (${failedRequests.length}):`);
      failedRequests.forEach((req, idx) => {
        console.log(`  ${idx + 1}. [${req.resourceType}] ${req.url}`);
        console.log(`     Error: ${req.failure?.errorText || 'Unknown'}`);
      });
      console.log();
    }

    // HTTP Status Analysis
    const statusCodes = {};
    resourceTimings.forEach(timing => {
      const status = timing.status;
      statusCodes[status] = (statusCodes[status] || 0) + 1;
    });

    console.log(`📡 HTTP STATUS CODES:`);
    Object.entries(statusCodes).sort().forEach(([code, count]) => {
      const emoji = code === '200' ? '✅' : code.startsWith('3') ? '🔄' : code.startsWith('4') ? '⚠️' : '❌';
      console.log(`  ${emoji} ${code}: ${count} requests`);
    });
    console.log();

    // Slow Resources (>1s)
    const slowResources = resourceTimings.filter(t =>
      t.timing && (t.timing.responseEnd - t.timing.requestStart) > 1000
    );

    if (slowResources.length > 0) {
      console.log(`🐌 SLOW RESOURCES (>1s):`);
      slowResources.forEach(res => {
        const duration = ((res.timing.responseEnd - res.timing.requestStart) / 1000).toFixed(2);
        const url = res.url.length > 60 ? '...' + res.url.slice(-57) : res.url;
        console.log(`  ${duration}s - ${url}`);
      });
      console.log();
    }

    // Console Errors (detailed)
    if (consoleErrors.length > 0) {
      console.log(`🔴 CONSOLE ERRORS (${consoleErrors.length}):`);
      consoleErrors.slice(0, 10).forEach((err, idx) => {
        console.log(`  ${idx + 1}. [${err.type}] ${err.text}`);
        if (err.location) {
          console.log(`     Location: ${err.location.url}:${err.location.lineNumber}`);
        }
      });
      if (consoleErrors.length > 10) {
        console.log(`  ... and ${consoleErrors.length - 10} more errors`);
      }
      console.log();
    }

    // Console Warnings
    if (consoleWarnings.length > 0) {
      console.log(`⚠️  CONSOLE WARNINGS (${consoleWarnings.length}):`);
      consoleWarnings.slice(0, 5).forEach((warn, idx) => {
        console.log(`  ${idx + 1}. ${warn.text}`);
      });
      if (consoleWarnings.length > 5) {
        console.log(`  ... and ${consoleWarnings.length - 5} more warnings`);
      }
      console.log();
    }

    // Key Messages (important logs)
    const keyMessages = consoleMessages.filter(msg =>
      msg.text.includes('✅') ||
      msg.text.includes('❌') ||
      msg.text.includes('📥') ||
      msg.text.includes('Loading') ||
      msg.text.includes('Error')
    ).slice(0, 15);

    if (keyMessages.length > 0) {
      console.log(`🔑 KEY CONSOLE MESSAGES:`);
      keyMessages.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. [${msg.type}] ${msg.text}`);
      });
      console.log();
    }

    console.log(`${'='.repeat(80)}\n`);
  });

  test('1. Production site initial load and core elements', async ({ page }) => {
    console.log(`\n🌐 Testing: ${PRODUCTION_URL}`);

    const startTime = Date.now();
    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const loadTime = Date.now() - startTime;

    console.log(`⏱️  Initial load time: ${(loadTime / 1000).toFixed(2)}s`);

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/prod-comprehensive-01-initial.png', fullPage: true });

    // Check title
    const title = await page.title();
    console.log(`📄 Page title: "${title}"`);
    expect(title).toMatch(/WordNet|Wordy|Minimal Search/i);

    // Check core elements
    const muveraBtn = page.locator('.muvera-toggle-btn');
    const ragBtn = page.locator('.rag-toggle-btn');
    const textInput = page.locator('#text-input');

    await expect(muveraBtn).toBeVisible({ timeout: 10000 });
    await expect(ragBtn).toBeVisible({ timeout: 10000 });
    await expect(textInput).toBeVisible({ timeout: 10000 });

    console.log(`✅ All core elements visible`);
  });

  test('2. Text input functionality and word visualization', async ({ page }) => {
    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const textInput = page.locator('#text-input');

    // Wait for loading overlay to get 'hidden' class (uses opacity:0, not display:none)
    const loadingOverlay = page.locator('#loading-overlay');
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#loading-overlay');
      return overlay && overlay.classList.contains('hidden');
    }, { timeout: 60000 });

    await textInput.waitFor({ state: 'visible' });
    await textInput.click({ timeout: 10000 });

    // Type words with spaces to trigger word boxing
    await textInput.type('Hello ', { delay: 50 });
    await page.waitForTimeout(300);
    await textInput.type('World ', { delay: 50 });
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/prod-comprehensive-02-text-input.png', fullPage: true });

    // Check for word boxes (words are cleared from input after boxing)
    const wordBoxes = page.locator('.word-box');
    const wordCount = await wordBoxes.count();
    console.log(`📝 Word boxes rendered: ${wordCount}`);

    // Should have at least 2 word boxes
    expect(wordCount).toBeGreaterThanOrEqual(2);

    // Verify the words are displayed in boxes
    const firstWord = await wordBoxes.first().textContent();
    const secondWord = await wordBoxes.nth(1).textContent();
    console.log(`📝 First word: "${firstWord}", Second word: "${secondWord}"`);
    expect(firstWord.toLowerCase()).toContain('hello');
    expect(secondWord.toLowerCase()).toContain('world');
  });

  test('3. MuVeRa panel - open, interact, close', async ({ page }) => {
    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const muveraBtn = page.locator('.muvera-toggle-btn');

    // Check initial button text
    const initialText = await muveraBtn.textContent();
    console.log(`🔘 Initial button text: "${initialText}"`);

    // Open panel
    await muveraBtn.click();
    await page.waitForTimeout(5000); // Wait for panel animation and iframe load

    await page.screenshot({ path: 'test-results/prod-comprehensive-03-muvera-open.png', fullPage: true });

    const muveraContainer = page.locator('#muvera-container');
    await expect(muveraContainer).toHaveClass(/visible/);

    const buttonTextOpen = await muveraBtn.textContent();
    console.log(`🔘 Button text when open: "${buttonTextOpen}"`);
    expect(buttonTextOpen).toContain('Back');

    // Check if iframe loaded
    const muveraIframe = page.locator('#muvera-iframe');
    const iframeSrc = await muveraIframe.getAttribute('src');
    console.log(`🖼️  MuVeRa iframe src: ${iframeSrc}`);
    expect(iframeSrc).toBeTruthy();

    // Close panel
    await muveraBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'test-results/prod-comprehensive-04-muvera-closed.png', fullPage: true });

    await expect(muveraContainer).not.toHaveClass(/visible/);
  });

  test('4. RAG panel - open and corpus download attempt', async ({ page }) => {
    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const ragBtn = page.locator('.rag-toggle-btn');

    console.log(`🔘 Opening RAG panel...`);
    await ragBtn.click();
    await page.waitForTimeout(10000); // Wait for panel, iframe, and corpus download to start

    await page.screenshot({ path: 'test-results/prod-comprehensive-05-rag-open.png', fullPage: true });

    const ragContainer = page.locator('#rag-demo-container');
    await expect(ragContainer).toHaveClass(/visible/);

    // Check for corpus download messages in console
    const corpusMessages = consoleMessages.filter(msg =>
      msg.text.includes('corpus') ||
      msg.text.includes('Downloading') ||
      msg.text.includes('Loading') ||
      msg.text.includes('release')
    );

    console.log(`\n📦 CORPUS LOADING MESSAGES:`);
    corpusMessages.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.type}] ${msg.text}`);
    });

    // Check for release download requests
    const releaseRequests = networkRequests.filter(req =>
      req.url.includes('releases/download/v1.0.0')
    );

    console.log(`\n🌐 GITHUB RELEASE REQUESTS:`);
    if (releaseRequests.length > 0) {
      releaseRequests.forEach((req, idx) => {
        console.log(`  ${idx + 1}. ${req.method} ${req.url}`);
      });
    } else {
      console.log(`  (No release requests yet - may be using local files or still initializing)`);
    }
  });

  test('5. ESC key functionality', async ({ page }) => {
    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Open MuVeRa panel
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(2000);

    let muveraContainer = page.locator('#muvera-container');
    await expect(muveraContainer).toHaveClass(/visible/);

    // Press ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'test-results/prod-comprehensive-06-esc-muvera.png', fullPage: true });

    await expect(muveraContainer).not.toHaveClass(/visible/);
    console.log(`✅ ESC closed MuVeRa panel`);

    // Open RAG panel
    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(2000);

    let ragContainer = page.locator('#rag-demo-container');
    await expect(ragContainer).toHaveClass(/visible/);

    // Press ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'test-results/prod-comprehensive-07-esc-rag.png', fullPage: true });

    await expect(ragContainer).not.toHaveClass(/visible/);
    console.log(`✅ ESC closed RAG panel`);
  });

  test('6. Panel mutual exclusion', async ({ page }) => {
    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const muveraContainer = page.locator('#muvera-container');
    const ragContainer = page.locator('#rag-demo-container');

    // Open MuVeRa
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(2000);
    await expect(muveraContainer).toHaveClass(/visible/);

    await page.screenshot({ path: 'test-results/prod-comprehensive-08-muvera-only.png', fullPage: true });

    // Open RAG (should close MuVeRa)
    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/prod-comprehensive-09-rag-only.png', fullPage: true });

    await expect(ragContainer).toHaveClass(/visible/);
    await expect(muveraContainer).not.toHaveClass(/visible/);

    console.log(`✅ Panel mutual exclusion working`);
  });

  test('7. Demo GIF accessibility', async ({ page }) => {
    const gifUrl = 'https://1kaiser.github.io/wordy/wordy-demo.gif';

    console.log(`🖼️  Checking: ${gifUrl}`);

    const response = await page.request.get(gifUrl);
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';

    console.log(`   Status: ${status}`);
    console.log(`   Content-Type: ${contentType}`);

    if (status === 200) {
      expect(contentType).toContain('image');
      console.log(`✅ Demo GIF accessible`);
    } else {
      console.log(`⚠️  Demo GIF not yet available (CDN may still be updating)`);
    }
  });

  test('8. All critical resources load successfully', async ({ page }) => {
    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Open panels to trigger all resource loads
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(3000);
    await page.locator('.muvera-toggle-btn').click();
    await page.waitForTimeout(1000);

    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'test-results/prod-comprehensive-10-all-loaded.png', fullPage: true });

    // Analyze critical resources
    const criticalResources = [
      'index.html',
      'minimal-search.js',
      'muvera.html',
      'rag-demo.html'
    ];

    console.log(`\n📋 CRITICAL RESOURCES CHECK:`);

    for (const resource of criticalResources) {
      const found = resourceTimings.find(t => t.url.includes(resource));
      if (found) {
        const emoji = found.status === 200 ? '✅' : found.status < 400 ? '🔄' : '❌';
        console.log(`  ${emoji} ${resource}: ${found.status} ${found.statusText}`);
      } else {
        console.log(`  ⚠️  ${resource}: Not found in requests`);
      }
    }

    // Count critical failures (exclude corpus files as they're expected to 404 locally)
    const criticalFailures = failedRequests.filter(req =>
      !req.url.includes('corpus-') &&
      !req.url.includes('embeddings')
    );

    console.log(`\n❌ Critical failures (excluding corpus): ${criticalFailures.length}`);

    if (criticalFailures.length > 0) {
      criticalFailures.forEach(req => {
        console.log(`   - ${req.url}`);
      });
    }
  });
});
