const { test } = require('@playwright/test');

test('Clear IndexedDB', async ({ page }) => {
  await page.goto('http://localhost:3004/wordy/');

  // Clear all IndexedDB databases
  await page.evaluate(() => {
    return new Promise(async (resolve) => {
      const databases = await indexedDB.databases();
      console.log(`Found ${databases.length} IndexedDB databases:`, databases);

      for (const db of databases) {
        console.log(`Deleting database: ${db.name}`);
        indexedDB.deleteDatabase(db.name);
      }

      // Also clear localStorage and sessionStorage
      localStorage.clear();
      sessionStorage.clear();

      console.log('✅ All IndexedDB databases cleared');
      resolve();
    });
  });

  console.log('✅ IndexedDB and storage cleared successfully');
});
