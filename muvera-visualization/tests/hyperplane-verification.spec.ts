import { test, expect } from '@playwright/test';

test.describe('Hyperplane Configuration Verification', () => {
  test('should have different hyperplane angles for query vs document circles', async ({ page }) => {
    let consoleMessages: string[] = [];
    
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Wait for the animation to initialize
    await page.waitForTimeout(3000);
    
    // Extract hyperplane angle information from console
    const hyperplaneMessages = consoleMessages.filter(msg => 
      msg.includes('hyperplanes (radians)')
    );
    
    console.log('Hyperplane Messages:');
    hyperplaneMessages.forEach(msg => console.log('  ', msg));
    
    // Should have both query and document hyperplane messages
    const queryHyperplanes = hyperplaneMessages.find(msg => msg.includes('Query hyperplanes'));
    const documentHyperplanes = hyperplaneMessages.find(msg => msg.includes('Document hyperplanes'));
    
    expect(queryHyperplanes).toBeTruthy();
    expect(documentHyperplanes).toBeTruthy();
    
    if (queryHyperplanes && documentHyperplanes) {
      // Extract angle values using regex
      const queryAngles = queryHyperplanes.match(/[\d\.]+/g)?.map(Number) || [];
      const docAngles = documentHyperplanes.match(/[\d\.]+/g)?.map(Number) || [];
      
      console.log('Query angles:', queryAngles);
      console.log('Document angles:', docAngles);
      
      // Verify we have 3 angles each
      expect(queryAngles.length).toBe(3);
      expect(docAngles.length).toBe(3);
      
      // Verify they are different (at least one angle should be different)
      let isDifferent = false;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(queryAngles[i] - docAngles[i]) > 0.01) { // Allow small floating point differences
          isDifferent = true;
          break;
        }
      }
      
      if (!isDifferent) {
        console.log('⚠️ WARNING: Query and document hyperplanes are identical!');
        console.log(`Query:    [${queryAngles.map(a => a.toFixed(3)).join(', ')}]`);
        console.log(`Document: [${docAngles.map(a => a.toFixed(3)).join(', ')}]`);
      } else {
        console.log('✅ Query and document hyperplanes are different');
        console.log(`Query:    [${queryAngles.map(a => a.toFixed(3)).join(', ')}]`);
        console.log(`Document: [${docAngles.map(a => a.toFixed(3)).join(', ')}]`);
      }
      
      expect(isDifferent).toBe(true);
    }
  });

  test('should visually show different sector lines in both circles', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check query circle hyperplane lines
    const queryLines = page.locator('#semantic-svg line[style*="stroke: #999"]');
    const queryLineCount = await queryLines.count();
    
    // Check document circle hyperplane lines  
    const docLines = page.locator('#semantic-svg-doc line[style*="stroke: #999"]');
    const docLineCount = await docLines.count();
    
    console.log(`Query circle hyperplane lines: ${queryLineCount}`);
    console.log(`Document circle hyperplane lines: ${docLineCount}`);
    
    // Both should have 3 hyperplane lines
    expect(queryLineCount).toBe(3);
    expect(docLineCount).toBe(3);
    
    // Get the coordinates of the lines to verify they're different
    if (queryLineCount === 3 && docLineCount === 3) {
      const queryCoords = [];
      const docCoords = [];
      
      for (let i = 0; i < 3; i++) {
        const queryLine = queryLines.nth(i);
        const docLine = docLines.nth(i);
        
        const qx1 = await queryLine.getAttribute('x1');
        const qy1 = await queryLine.getAttribute('y1');
        const qx2 = await queryLine.getAttribute('x2');
        const qy2 = await queryLine.getAttribute('y2');
        
        const dx1 = await docLine.getAttribute('x1');
        const dy1 = await docLine.getAttribute('y1');
        const dx2 = await docLine.getAttribute('x2');
        const dy2 = await docLine.getAttribute('y2');
        
        if (qx1 && qy1 && qx2 && qy2) {
          queryCoords.push({ x1: parseFloat(qx1), y1: parseFloat(qy1), x2: parseFloat(qx2), y2: parseFloat(qy2) });
        }
        
        if (dx1 && dy1 && dx2 && dy2) {
          docCoords.push({ x1: parseFloat(dx1), y1: parseFloat(dy1), x2: parseFloat(dx2), y2: parseFloat(dy2) });
        }
      }
      
      console.log('Query hyperplane coordinates:');
      queryCoords.forEach((coord, i) => {
        console.log(`  Line ${i}: (${coord.x1.toFixed(1)}, ${coord.y1.toFixed(1)}) to (${coord.x2.toFixed(1)}, ${coord.y2.toFixed(1)})`);
      });
      
      console.log('Document hyperplane coordinates:');
      docCoords.forEach((coord, i) => {
        console.log(`  Line ${i}: (${coord.x1.toFixed(1)}, ${coord.y1.toFixed(1)}) to (${coord.x2.toFixed(1)}, ${coord.y2.toFixed(1)})`);
      });
      
      // Check if the line coordinates are different (indicating different angles)
      let visuallyDifferent = false;
      for (let i = 0; i < Math.min(queryCoords.length, docCoords.length); i++) {
        const qCoord = queryCoords[i];
        const dCoord = docCoords[i];
        
        // Compare endpoints to see if lines have different orientations
        const diffX1 = Math.abs(qCoord.x1 - dCoord.x1);
        const diffY1 = Math.abs(qCoord.y1 - dCoord.y1);
        const diffX2 = Math.abs(qCoord.x2 - dCoord.x2);
        const diffY2 = Math.abs(qCoord.y2 - dCoord.y2);
        
        if (diffX1 > 1 || diffY1 > 1 || diffX2 > 1 || diffY2 > 1) {
          visuallyDifferent = true;
          break;
        }
      }
      
      if (!visuallyDifferent) {
        console.log('⚠️ WARNING: Query and document hyperplane lines appear to have identical coordinates!');
      } else {
        console.log('✅ Query and document hyperplane lines are visually different');
      }
      
      expect(visuallyDifferent).toBe(true);
    }
  });

  test('should verify sector numbering is different between circles', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Get sector numbers from query circle
    const querySectorTexts = page.locator('#semantic-svg text.partition-number');
    const querySectorCount = await querySectorTexts.count();
    
    // Get sector numbers from document circle
    const docSectorTexts = page.locator('#semantic-svg-doc text.partition-number');
    const docSectorCount = await docSectorTexts.count();
    
    console.log(`Query circle sectors: ${querySectorCount}`);
    console.log(`Document circle sectors: ${docSectorCount}`);
    
    // Both should have 6 sectors
    expect(querySectorCount).toBe(6);
    expect(docSectorCount).toBe(6);
    
    // Get the positions of sector numbers to verify different positioning
    if (querySectorCount === 6 && docSectorCount === 6) {
      const queryPositions = [];
      const docPositions = [];
      
      for (let i = 0; i < 6; i++) {
        const qSector = querySectorTexts.nth(i);
        const dSector = docSectorTexts.nth(i);
        
        const qx = await qSector.getAttribute('x');
        const qy = await qSector.getAttribute('y');
        const dx = await dSector.getAttribute('x'); 
        const dy = await dSector.getAttribute('y');
        
        if (qx && qy) queryPositions.push({ x: parseFloat(qx), y: parseFloat(qy) });
        if (dx && dy) docPositions.push({ x: parseFloat(dx), y: parseFloat(dy) });
      }
      
      console.log('Query sector positions:', queryPositions.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`));
      console.log('Document sector positions:', docPositions.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`));
      
      // Check if sector positions are different
      let positionsDifferent = false;
      for (let i = 0; i < Math.min(queryPositions.length, docPositions.length); i++) {
        const qPos = queryPositions[i];
        const dPos = docPositions[i];
        
        if (Math.abs(qPos.x - dPos.x) > 2 || Math.abs(qPos.y - dPos.y) > 2) {
          positionsDifferent = true;
          break;
        }
      }
      
      if (!positionsDifferent) {
        console.log('⚠️ WARNING: Query and document sector positions are identical!');
      } else {
        console.log('✅ Query and document sector positions are different');
      }
      
      expect(positionsDifferent).toBe(true);
    }
  });
});