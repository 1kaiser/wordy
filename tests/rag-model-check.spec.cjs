const { test } = require('@playwright/test');

test('Check RAG model loading', async ({ browser }) => {
  test.setTimeout(180000); // 3 minutes for model loading
  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  const logs = [];
  const errors = [];

  // Capture all console messages
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    const timestamp = new Date().toLocaleTimeString();

    logs.push({ type, text, timestamp });

    if (type === 'error') errors.push(text);

    console.log(`[${timestamp}] [${type}] ${text}`);
  });

  // Capture network failures
  page.on('requestfailed', request => {
    console.log(`❌ Failed request: ${request.url()}`);
  });

  const url = 'http://localhost:3004/wordy/';
  console.log(`\n🌐 Loading: ${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for corpus preloader
  console.log('\n⏳ Waiting 15 seconds for background corpus preloader...\n');
  await page.waitForTimeout(15000);

  // Open RAG panel
  console.log('\n🔘 Opening RAG panel...\n');
  await page.click('.rag-toggle-btn');

  // Wait longer for model loading (embedding + generation models take time)
  console.log('\n⏳ Waiting 90 seconds for RAG initialization and model loading...\n');
  await page.waitForTimeout(90000);

  console.log('\n\n================================================================================');
  console.log('📊 RAG MODEL LOADING ANALYSIS');
  console.log('================================================================================\n');

  // Filter for model-related messages
  const modelLogs = logs.filter(l =>
    l.text.toLowerCase().includes('model') ||
    l.text.toLowerCase().includes('loading') ||
    l.text.toLowerCase().includes('corpus') ||
    l.text.toLowerCase().includes('embeddings') ||
    l.text.toLowerCase().includes('retrieval') ||
    l.text.toLowerCase().includes('generation')
  );

  console.log(`Total console messages: ${logs.length}`);
  console.log(`Model-related messages: ${modelLogs.length}`);
  console.log(`Errors: ${errors.length}\n`);

  if (modelLogs.length > 0) {
    console.log('🔍 MODEL-RELATED LOGS:\n');
    modelLogs.forEach((log, i) => {
      console.log(`${i + 1}. [${log.timestamp}] [${log.type}] ${log.text}`);
    });
  }

  if (errors.length > 0) {
    console.log('\n🔴 ERRORS:\n');
    errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err}\n`);
    });
  }

  await context.close();
});
