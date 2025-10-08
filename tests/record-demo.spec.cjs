const { test } = require('@playwright/test');

test.describe('Wordy Demo Recording', () => {
    test('Record complete workflow', async ({ browser }) => {
        test.setTimeout(180000); // 3 minutes

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            recordVideo: {
                dir: 'demo-videos/',
                size: { width: 1920, height: 1080 }
            }
        });

        const page = await context.newPage();

        console.log('\n🎬 Recording Wordy demo...\n');

        // Load page
        await page.goto('https://1kaiser.github.io/wordy/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(3000);

        // Scene 1: Type in main interface
        console.log('📍 Scene 1: Minimal Search\n');
        await page.click('#text-input');
        await page.type('#text-input', 'artificial', { delay: 120 });
        await page.waitForTimeout(3000);

        await page.fill('#text-input', '');
        await page.type('#text-input', 'ephemeral', { delay: 150 });
        await page.waitForTimeout(4000);

        // Scene 2: MuVeRa panel
        console.log('📍 Scene 2: MuVeRa Panel\n');
        await page.click('.muvera-toggle-btn');
        await page.waitForTimeout(8000);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(2000);

        // Scene 3: RAG panel
        console.log('📍 Scene 3: RAG Panel\n');
        await page.click('.rag-toggle-btn');
        await page.waitForTimeout(35000); // Show polling
        await page.keyboard.press('Escape');
        await page.waitForTimeout(2000);

        // Scene 4: Back to main
        console.log('📍 Scene 4: Final Search\n');
        await page.fill('#text-input', '');
        await page.type('#text-input', 'serendipity', { delay: 130 });
        await page.waitForTimeout(3000);

        console.log('✅ Demo complete!\n');
        await context.close();
    });
});
