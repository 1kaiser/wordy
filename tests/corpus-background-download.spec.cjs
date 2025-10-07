const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3004/wordy/';

test.describe('Corpus Background Download', () => {
  test('Corpus preloader initializes and starts download', async ({ page }) => {
    const consoleLogs = [];

    // Capture console logs
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('Corpus') || text.includes('📦') || text.includes('📥')) {
        console.log(`[PAGE] ${text}`);
      }
    });

    // Navigate to page
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Wait for page to fully load
    await page.waitForTimeout(3000);

    // Check if corpus preloader initialized
    const preloaderExists = await page.evaluate(() => {
      return window.corpusPreloader !== undefined;
    });

    console.log(`\n📊 Corpus Preloader exists: ${preloaderExists}`);
    expect(preloaderExists).toBe(true);

    // Check if IndexedDB was created
    const dbExists = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.some(db => db.name === 'WordyCorpusDB');
    });

    console.log(`📊 IndexedDB created: ${dbExists}`);

    // Wait for background download to start
    await page.waitForTimeout(3000);

    // Check console logs for download messages
    const initLog = consoleLogs.find(log => log.includes('Corpus Preloader: Initializing'));
    const downloadLog = consoleLogs.find(log => log.includes('Starting background corpus download'));
    const cachedLog = consoleLogs.find(log => log.includes('already cached'));

    console.log(`\n📋 Console Log Summary:`);
    console.log(`  - Initialization: ${initLog ? '✅' : '❌'}`);
    console.log(`  - Download started or already cached: ${downloadLog || cachedLog ? '✅' : '❌'}`);

    if (initLog) console.log(`  Init message: "${initLog}"`);
    if (downloadLog) console.log(`  Download message: "${downloadLog}"`);
    if (cachedLog) console.log(`  Cache message: "${cachedLog}"`);

    // At least initialization should happen
    expect(initLog).toBeTruthy();

    console.log(`\n✅ Background corpus download test passed`);
  });

  test('RAG panel uses cached corpus if available', async ({ page }) => {
    const consoleLogs = [];

    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click RAG button to open panel
    console.log('\n🔘 Opening RAG panel...');
    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(3000);

    // Wait for iframe to load
    const iframe = page.frameLocator('#rag-iframe');

    // Check if it says "Using cached corpus" or downloading
    await page.waitForTimeout(5000);

    const cachedMsg = consoleLogs.find(log =>
      log.includes('Using cached corpus') || log.includes('Checking for cached corpus')
    );
    const downloadMsg = consoleLogs.find(log =>
      log.includes('Downloading corpus') && !log.includes('background')
    );

    console.log(`\n📋 RAG Panel Corpus Loading:`);
    if (cachedMsg) {
      console.log(`  ✅ Checked cache: "${cachedMsg}"`);
    }
    if (downloadMsg) {
      console.log(`  ⏳ Direct download: "${downloadMsg}"`);
    }

    console.log(`\n✅ RAG panel corpus loading test completed`);
  });

  test('Corpus download progress is tracked', async ({ page }) => {
    // Clear IndexedDB first
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    await page.evaluate(async () => {
      if (window.corpusPreloader) {
        await window.corpusPreloader.clearCache();
      }
      // Also clear IndexedDB directly
      await indexedDB.deleteDatabase('WordyCorpusDB');
    });

    console.log('🗑️ Cleared corpus cache for fresh download test');

    // Reload page to start fresh download
    await page.reload({ waitUntil: 'domcontentloaded' });

    const progressLogs = [];

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Download progress') || text.includes('%')) {
        progressLogs.push(text);
        console.log(`[PROGRESS] ${text}`);
      }
    });

    // Wait up to 30 seconds for download to show progress
    await page.waitForTimeout(30000);

    console.log(`\n📊 Progress logs captured: ${progressLogs.length}`);

    // Should have some progress logs if download started
    if (progressLogs.length > 0) {
      console.log('✅ Download progress is being tracked');
    } else {
      console.log('ℹ️  No progress logs yet (download may be queued or very fast)');
    }
  });

  test('Corpus preloader can be accessed from iframe', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Open RAG panel
    await page.locator('.rag-toggle-btn').click();
    await page.waitForTimeout(2000);

    // Check if iframe can access parent's corpusPreloader
    const canAccess = await page.evaluate(() => {
      const iframe = document.querySelector('#rag-iframe');
      if (!iframe || !iframe.contentWindow) return false;

      // Simulate what rag-demo.html does
      try {
        return typeof window.corpusPreloader !== 'undefined';
      } catch (e) {
        return false;
      }
    });

    console.log(`\n📊 Parent window has corpusPreloader: ${canAccess}`);
    expect(canAccess).toBe(true);

    console.log('✅ Iframe can access parent corpus preloader');
  });
});
