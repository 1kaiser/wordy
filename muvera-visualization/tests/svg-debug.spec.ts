import { test, expect } from '@playwright/test';

test.describe('SVG Content Debug', () => {
  test('should debug SVG content and hyperplane visibility', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Get all content from both SVGs
    const queryContent = await page.locator('#semantic-svg').innerHTML();
    const docContent = await page.locator('#semantic-svg-doc').innerHTML();
    
    console.log('Query SVG content:');
    console.log(queryContent);
    
    console.log('\nDocument SVG content:');  
    console.log(docContent);
    
    // Count all line elements
    const queryAllLines = page.locator('#semantic-svg line');
    const docAllLines = page.locator('#semantic-svg-doc line');
    
    const queryLineCount = await queryAllLines.count();
    const docLineCount = await docAllLines.count();
    
    console.log(`\nQuery SVG total lines: ${queryLineCount}`);
    console.log(`Document SVG total lines: ${docLineCount}`);
    
    // Check for lines with different stroke colors
    const queryGrayLines = page.locator('#semantic-svg line').filter({ hasText: '' }); 
    for (let i = 0; i < queryLineCount; i++) {
      const line = queryAllLines.nth(i);
      const style = await line.getAttribute('style');
      const stroke = await line.getAttribute('stroke');
      const strokeColor = stroke || (style?.includes('stroke:') ? style.match(/stroke:\s*([^;]+)/)?.[1] : '');
      
      console.log(`Query line ${i}: style="${style}", stroke="${stroke}", color="${strokeColor}"`);
    }
    
    for (let i = 0; i < docLineCount; i++) {
      const line = docAllLines.nth(i);
      const style = await line.getAttribute('style');
      const stroke = await line.getAttribute('stroke');
      const strokeColor = stroke || (style?.includes('stroke:') ? style.match(/stroke:\s*([^;]+)/)?.[1] : '');
      
      console.log(`Document line ${i}: style="${style}", stroke="${stroke}", color="${strokeColor}"`);
    }
    
    // Check for text elements (sector numbers)
    const queryTexts = page.locator('#semantic-svg text');
    const docTexts = page.locator('#semantic-svg-doc text');
    
    const queryTextCount = await queryTexts.count();
    const docTextCount = await docTexts.count();
    
    console.log(`\nQuery SVG text elements: ${queryTextCount}`);
    console.log(`Document SVG text elements: ${docTextCount}`);
    
    // Get text content and classes
    for (let i = 0; i < queryTextCount; i++) {
      const text = queryTexts.nth(i);
      const content = await text.textContent();
      const className = await text.getAttribute('class');
      
      console.log(`Query text ${i}: content="${content}", class="${className}"`);
    }
    
    for (let i = 0; i < docTextCount; i++) {
      const text = docTexts.nth(i);
      const content = await text.textContent();
      const className = await text.getAttribute('class');
      
      console.log(`Document text ${i}: content="${content}", class="${className}"`);
    }
    
    // This is a debug test, so we don't need assertions - just information gathering
  });
});