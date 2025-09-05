import { test, expect } from '@playwright/test';

test.describe('Token Positioning Fixes', () => {
  test('should position tokens within sectors without center clustering', async ({ page }) => {
    let consoleMessages: string[] = [];
    
    page.on('console', (msg) => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Wait for animation to start and process some tokens
    await page.waitForTimeout(8000);
    
    // Filter console messages for token positioning
    const positioningMessages = consoleMessages.filter(msg => 
      msg.includes('Finding position for token') ||
      msg.includes('Selected position') ||
      msg.includes('Emergency positioning') ||
      msg.includes('No pre-calculated position')
    );
    
    console.log('Token Positioning Messages:');
    positioningMessages.forEach(msg => console.log('  ', msg));
    
    // Check for improved positioning behavior
    const centerPositionWarnings = consoleMessages.filter(msg => 
      msg.includes('using fallback') && msg.includes('200')
    );
    
    const emergencyPositions = consoleMessages.filter(msg => 
      msg.includes('Emergency positioning') || msg.includes('emergency position')
    );
    
    console.log(`\nPositioning Analysis:`);
    console.log(`  Center position warnings: ${centerPositionWarnings.length}`);
    console.log(`  Emergency positions used: ${emergencyPositions.length}`);
    console.log(`  Total positioning messages: ${positioningMessages.length}`);
    
    // Validate token positions visually using DOM inspection
    const tokenElements = await page.locator('circle.token').all();
    console.log(`\nFound ${tokenElements.length} token elements`);
    
    for (let i = 0; i < tokenElements.length; i++) {
      const token = tokenElements[i];
      const cx = await token.getAttribute('cx');
      const cy = await token.getAttribute('cy');
      
      if (cx && cy) {
        const x = parseFloat(cx);
        const y = parseFloat(cy);
        const centerX = 200;
        const centerY = 200;
        
        const distanceFromCenter = Math.sqrt((x - centerX)**2 + (y - centerY)**2);
        console.log(`  Token ${i}: (${x.toFixed(1)}, ${y.toFixed(1)}) - distance from center: ${distanceFromCenter.toFixed(1)}`);
        
        // Verify tokens are not at the exact center
        expect(distanceFromCenter).toBeGreaterThan(50); // Should be well away from center
        
        // Verify tokens are within reasonable bounds
        expect(x).toBeGreaterThan(60); // Not too far left
        expect(x).toBeLessThan(340);   // Not too far right  
        expect(y).toBeGreaterThan(60); // Not too far up
        expect(y).toBeLessThan(340);   // Not too far down
      }
    }
    
    // Check that we're getting detailed positioning logs
    const positioningLogs = consoleMessages.filter(msg => 
      msg.includes('Sector:') && msg.includes('°')
    );
    
    expect(positioningLogs.length).toBeGreaterThan(0); // Should see sector angle details
    
    console.log('\n✅ Token positioning validation complete');
  });

  test('should demonstrate sector-aware positioning', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Wait for animation to start
    await page.waitForTimeout(5000);
    
    // Check that hyperplane lines are visible (creating sectors)
    const hyperplanes = page.locator('line[style*="stroke: #999"]');
    await expect(hyperplanes).toHaveCount(3); // Should have 3 hyperplane lines
    
    // Check that tokens are positioned (not all at center)
    const tokens = page.locator('circle.token');
    const tokenCount = await tokens.count();
    
    if (tokenCount > 0) {
      // Get positions of all tokens
      const positions = [];
      for (let i = 0; i < tokenCount; i++) {
        const token = tokens.nth(i);
        const cx = await token.getAttribute('cx');
        const cy = await token.getAttribute('cy');
        if (cx && cy) {
          positions.push({ x: parseFloat(cx), y: parseFloat(cy) });
        }
      }
      
      console.log(`Token Positions Analysis:`);
      positions.forEach((pos, i) => {
        console.log(`  Token ${i}: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
      });
      
      // Check for position diversity (not all tokens at the same position)
      if (positions.length > 1) {
        const uniquePositions = new Set(positions.map(p => `${p.x.toFixed(0)},${p.y.toFixed(0)}`));
        console.log(`  Unique positions: ${uniquePositions.size}/${positions.length}`);
        
        // At least 50% of tokens should have unique positions
        expect(uniquePositions.size).toBeGreaterThanOrEqual(Math.ceil(positions.length * 0.5));
      }
      
      // Check that no tokens are exactly at the center (200, 200)
      const centerTokens = positions.filter(pos => 
        Math.abs(pos.x - 200) < 5 && Math.abs(pos.y - 200) < 5
      );
      
      console.log(`  Tokens at center (±5px): ${centerTokens.length}/${positions.length}`);
      expect(centerTokens.length).toBe(0); // No tokens should be at center
    }
  });

  test('should handle text input changes with proper positioning', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Change the input text to something longer
    await page.fill('#query-input', 'How do machine learning algorithms work in practice');
    await page.fill('#document-input', 'Machine learning algorithms learn patterns from data through iterative training processes');
    
    // Process the new text
    await page.click('#process-btn');
    
    // Wait for processing to complete
    await page.waitForFunction(() => {
      const btn = document.querySelector('#process-btn') as HTMLButtonElement;
      return btn && !btn.disabled && btn.textContent?.includes('Process New Texts');
    }, { timeout: 15000 });
    
    // Wait for animation to show tokens
    await page.waitForTimeout(8000);
    
    // Check that tokens are positioned properly
    const tokens = page.locator('circle.token');
    const tokenCount = await tokens.count();
    
    console.log(`\nLonger text processing - Token count: ${tokenCount}`);
    
    if (tokenCount > 0) {
      // Verify no tokens are at center
      for (let i = 0; i < Math.min(tokenCount, 10); i++) { // Check first 10 tokens
        const token = tokens.nth(i);
        const cx = await token.getAttribute('cx');
        const cy = await token.getAttribute('cy');
        
        if (cx && cy) {
          const x = parseFloat(cx);
          const y = parseFloat(cy);
          const distanceFromCenter = Math.sqrt((x - 200)**2 + (y - 200)**2);
          
          console.log(`  Token ${i}: distance from center = ${distanceFromCenter.toFixed(1)}px`);
          expect(distanceFromCenter).toBeGreaterThan(60); // Well away from center
        }
      }
    }
    
    console.log('✅ Longer text positioning validation complete');
  });
});