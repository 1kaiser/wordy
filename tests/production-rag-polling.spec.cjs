const { test, expect } = require('@playwright/test');

test.describe('Production RAG Polling Verification', () => {
    test('RAG panel should poll and wait for corpus download', async ({ browser }) => {
        test.setTimeout(180000); // 3 minutes for corpus download + model loading

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            ignoreHTTPSErrors: true,
            // Disable cache to ensure latest deployment
            javaScriptEnabled: true,
            bypassCSP: false
        });

        const page = await context.newPage();

        // Bypass cache for all requests
        await page.route('**/*', async (route) => {
            await route.continue({
                headers: {
                    ...route.request().headers(),
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
        });

        // Capture console logs
        const logs = [];
        page.on('console', msg => {
            const text = msg.text();
            logs.push({ type: msg.type(), text });
            console.log(`[${msg.type()}] ${text}`);
        });

        console.log('\n🌐 Loading production site...\n');
        await page.goto('https://1kaiser.github.io/wordy/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('✅ Page loaded\n');

        // Wait a moment for initial setup
        await page.waitForTimeout(2000);

        console.log('🤖 Opening RAG panel...\n');
        await page.click('.rag-toggle-btn');

        console.log('⏳ Waiting for RAG panel to appear...\n');
        await page.waitForSelector('#rag-iframe', { state: 'visible', timeout: 10000 });

        // Wait for iframe to load
        console.log('⏳ Waiting for iframe content...\n');
        await page.waitForTimeout(5000);

        // Get iframe
        const iframeElement = await page.$('#rag-iframe');
        const frame = await iframeElement.contentFrame();

        if (!frame) {
            throw new Error('RAG iframe not found');
        }

        console.log('📊 Monitoring RAG initialization logs...\n');

        // Wait up to 90 seconds for corpus to be ready
        let corpusReady = false;
        let pollingDetected = false;
        let timeoutError = false;

        const maxWait = 90000; // 90 seconds
        const checkInterval = 2000; // Check every 2 seconds
        let elapsed = 0;

        while (elapsed < maxWait) {
            await page.waitForTimeout(checkInterval);
            elapsed += checkInterval;

            // Check logs for polling messages
            const pollingLogs = logs.filter(l =>
                l.text.includes('Waiting for corpus download') ||
                l.text.includes('Still waiting') ||
                l.text.includes('Corpus ready after') ||
                l.text.includes('Using cached corpus')
            );

            if (pollingLogs.length > 0) {
                pollingDetected = true;
                console.log(`   ✅ Polling detected (${pollingLogs.length} messages)`);
            }

            // Check if corpus is ready
            const readyLogs = logs.filter(l =>
                l.text.includes('Corpus ready after') ||
                l.text.includes('Using cached corpus')
            );

            if (readyLogs.length > 0) {
                corpusReady = true;
                console.log('   ✅ Corpus ready!\n');
                break;
            }

            // Check for timeout error
            const errorLogs = logs.filter(l =>
                l.text.includes('Corpus download timeout')
            );

            if (errorLogs.length > 0) {
                timeoutError = true;
                console.log('   ❌ Timeout error detected\n');
                break;
            }

            console.log(`   ⏳ Waiting... (${elapsed / 1000}s elapsed)`);
        }

        console.log('\n📊 Results:\n');
        console.log(`   Polling detected: ${pollingDetected ? '✅ YES' : '❌ NO'}`);
        console.log(`   Corpus ready: ${corpusReady ? '✅ YES' : '❌ NO'}`);
        console.log(`   Timeout error: ${timeoutError ? '❌ YES' : '✅ NO'}`);

        // Print relevant logs
        console.log('\n📝 RAG Initialization Logs:\n');
        const ragLogs = logs.filter(l =>
            l.text.includes('RAG') ||
            l.text.includes('corpus') ||
            l.text.includes('Waiting for') ||
            l.text.includes('Corpus ready')
        );

        ragLogs.forEach(l => {
            console.log(`   [${l.type}] ${l.text}`);
        });

        // Assertions
        expect(pollingDetected, 'Polling system should be active').toBeTruthy();
        expect(corpusReady || timeoutError, 'Should either succeed or timeout gracefully').toBeTruthy();

        if (corpusReady) {
            console.log('\n✅ TEST PASSED - RAG polling works correctly!\n');
        } else if (timeoutError) {
            console.log('\n⚠️ TEST PASSED - Timeout handled gracefully\n');
        } else {
            console.log('\n❌ TEST FAILED - No polling or completion detected\n');
            throw new Error('RAG initialization did not complete or timeout');
        }

        await context.close();
    });
});
