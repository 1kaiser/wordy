import * as d3 from 'd3';
import { TextFDEProcessor } from './text-vectorizer.js';

interface AnimationState {
  step: number;
  isRunning: boolean;
  isPaused: false;
}

class QueryOnlyAnimation {
  private semanticSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private fdeSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private queryTextDiv: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>;
  private fdeProcessor: TextFDEProcessor;
  
  private state: AnimationState = {
    step: 0,
    isRunning: true,
    isPaused: false
  };
  
  // Text data
  private queryText = 'What is the height of Mount Everest?';
  
  // Computed FDE data
  private queryData: any;
  
  // Display colors
  private colors = ['#ea4335', '#4285f4', '#fbbc05', '#34a853', '#9c27b0', '#00bcd4', '#ff5722'];
  
  constructor() {
    this.semanticSvg = d3.select('#semantic-svg');
    this.fdeSvg = d3.select('#fde-svg');
    this.queryTextDiv = d3.select('#query-text');
    this.fdeProcessor = new TextFDEProcessor();
    
    // Process query text to get real FDE data
    this.queryData = this.fdeProcessor.processQuery(this.queryText);
    
    console.log('Query FDE Data:', this.queryData);
    
    this.setupInitialView();
    this.setupPauseButton();
    this.startAnimation();
  }
  
  private setupInitialView(): void {
    // Setup semantic space
    this.semanticSvg.selectAll('*').remove();
    
    const centerX = 200;
    const centerY = 200;
    const radius = 140;
    
    // Add circular boundary - flat 2D style
    this.semanticSvg.append('circle')
      .attr('cx', centerX)
      .attr('cy', centerY)
      .attr('r', radius)
      .style('fill', '#f8f9fa')
      .style('stroke', '#999')
      .style('stroke-width', '2px');
    
    // Add coordinate system arrows
    this.semanticSvg.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('markerWidth', 10)
      .attr('markerHeight', 7)
      .attr('refX', 9)
      .attr('refY', 3.5)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 10 3.5, 0 7')
      .style('fill', '#666');

    // Horizontal arrow (x-axis)
    this.semanticSvg.append('line')
      .attr('x1', centerX - radius * 0.8)
      .attr('y1', centerY)
      .attr('x2', centerX + radius * 0.8)
      .attr('y2', centerY)
      .style('stroke', '#666')
      .style('stroke-width', '2px')
      .attr('marker-end', 'url(#arrowhead)');

    // Vertical arrow (y-axis)  
    this.semanticSvg.append('line')
      .attr('x1', centerX)
      .attr('y1', centerY + radius * 0.8)
      .attr('x2', centerX)
      .attr('y2', centerY - radius * 0.8)
      .style('stroke', '#666')
      .style('stroke-width', '2px')
      .attr('marker-end', 'url(#arrowhead)');

    // Add hyperplane cuts (6 partitions)
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      this.semanticSvg.append('line')
        .attr('x1', centerX)
        .attr('y1', centerY)
        .attr('x2', centerX + Math.cos(angle) * radius)
        .attr('y2', centerY + Math.sin(angle) * radius)
        .style('stroke', '#999')
        .style('stroke-width', '2px');
    }
    
    // Add partition numbers
    for (let i = 1; i <= 6; i++) {
      const angle = ((i - 1) * Math.PI) / 3 + Math.PI / 6;
      const labelRadius = radius + 25;
      const x = centerX + Math.cos(angle) * labelRadius;
      const y = centerY + Math.sin(angle) * labelRadius;
      
      this.semanticSvg.append('text')
        .attr('x', x)
        .attr('y', y)
        .text(i.toString())
        .style('font-size', '24px')
        .style('font-weight', 'bold')
        .style('fill', '#999')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'central');
    }
    
    // Setup FDE panel initial view
    this.setupFDEPanel();
  }
  
  private setupFDEPanel(): void {
    this.fdeSvg.selectAll('*').remove();
    
    // Add partition rows
    for (let i = 1; i <= 6; i++) {
      const y = 20 + (i - 1) * 25;
      
      // Partition background
      this.fdeSvg.append('rect')
        .attr('id', `fde-bg-${i}`)
        .attr('x', 30)
        .attr('y', y - 12)
        .attr('width', 350)
        .attr('height', 20)
        .style('fill', '#f8f9fa')
        .style('stroke', '#e9ecef')
        .style('stroke-width', '1px');
      
      // Partition number
      this.fdeSvg.append('text')
        .attr('x', 20)
        .attr('y', y)
        .text(i.toString())
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .style('fill', '#666')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'central');
      
      // Initial zeros
      this.fdeSvg.append('text')
        .attr('id', `fde-text-${i}`)
        .attr('x', 40)
        .attr('y', y)
        .text('000000000')
        .style('font-size', '12px')
        .style('fill', '#ccc')
        .style('dominant-baseline', 'central');
    }
  }
  
  private setupPauseButton(): void {
    d3.select('#pause-btn').on('click', () => {
      this.state.isPaused = !this.state.isPaused;
      d3.select('#pause-btn').text(this.state.isPaused ? '▶' : '⏸');
    });
  }
  
  private startAnimation(): void {
    this.animateLoop();
  }
  
  private animateLoop(): void {
    if (this.state.isPaused) {
      setTimeout(() => this.animateLoop(), 100);
      return;
    }
    
    this.animateQueryStep();
  }
  
  private animateQueryStep(): void {
    const words = this.queryData.words;
    const partitions = this.queryData.partitions;
    
    if (this.state.step >= words.length) {
      // Animation complete, restart after 3 seconds
      setTimeout(() => {
        this.resetAnimation();
      }, 3000);
      return;
    }
    
    const currentWord = words[this.state.step];
    const currentPartition = partitions[this.state.step];
    const currentColor = this.colors[this.state.step % this.colors.length];
    const currentToken = currentWord.charAt(0).toLowerCase();
    
    console.log(`Query Step ${this.state.step}: ${currentWord} (${currentToken}) → Partition ${currentPartition}`);
    
    // Update query text
    this.updateQueryText();
    
    // Highlight partition
    this.highlightPartition(currentPartition, currentColor);
    
    // Add token to partition
    this.addToken(currentToken, currentPartition, currentColor);
    
    // Update FDE panel
    this.updateFDEPanelQuery();
    
    this.state.step++;
    
    // Continue animation after delay
    setTimeout(() => this.animateLoop(), 2000);
  }
  
  private updateQueryText(): void {
    const currentWords = this.queryData.words.slice(0, this.state.step + 1);
    
    // Create colored text
    let coloredHTML = '';
    currentWords.forEach((word, i) => {
      const color = this.colors[i % this.colors.length];
      coloredHTML += `<span style="color: ${color}; font-weight: bold;">${word}</span>`;
      if (i < currentWords.length - 1) coloredHTML += ' ';
    });
    
    this.queryTextDiv.html(coloredHTML);
  }
  
  private highlightPartition(partitionId: number, color: string): void {
    const centerX = 200;
    const centerY = 200;
    const radius = 140;
    
    // Calculate partition sector
    const startAngle = ((partitionId - 1) * Math.PI) / 3 - Math.PI / 6;
    const endAngle = startAngle + Math.PI / 3;
    
    // Create partition path
    const path = d3.path();
    path.moveTo(centerX, centerY);
    path.arc(centerX, centerY, radius, startAngle, endAngle);
    path.closePath();
    
    this.semanticSvg.append('path')
      .attr('class', `partition-highlight partition-${partitionId}`)
      .attr('d', path.toString())
      .style('fill', color)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .style('opacity', 0.8);
  }
  
  private addToken(token: string, partitionId: number, color: string): void {
    const centerX = 200;
    const centerY = 200;
    const maxRadius = 120;
    
    // Calculate position within the sector
    const existingTokens = this.semanticSvg.selectAll(`.token-p${partitionId}`).size();
    
    // Distribute tokens within the sector area
    const sectorStartAngle = ((partitionId - 1) * Math.PI) / 3 - Math.PI / 6;
    const sectorEndAngle = sectorStartAngle + Math.PI / 3;
    const sectorMidAngle = (sectorStartAngle + sectorEndAngle) / 2;
    
    // Position tokens at different radial distances within the sector
    const tokenRadius = 70 + (existingTokens * 20);
    const actualRadius = Math.min(tokenRadius, maxRadius - 16);
    
    // Add some angular spread within the sector for multiple tokens
    const angularOffset = existingTokens * 0.1 - 0.05;
    const tokenAngle = sectorMidAngle + angularOffset;
    
    const x = centerX + Math.cos(tokenAngle) * actualRadius;
    const y = centerY + Math.sin(tokenAngle) * actualRadius;
    
    // Add token circle
    this.semanticSvg.append('circle')
      .attr('class', `token token-p${partitionId}`)
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', 16)
      .style('fill', color)
      .style('stroke', 'white')
      .style('stroke-width', '2px')
      .style('opacity', 0)
      .transition()
      .duration(500)
      .style('opacity', 1);
    
    // Add token letter
    this.semanticSvg.append('text')
      .attr('class', `token-label token-p${partitionId}`)
      .attr('x', x)
      .attr('y', y + 5)
      .text(token)
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .style('fill', 'white')
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'central')
      .style('opacity', 0)
      .transition()
      .duration(500)
      .style('opacity', 1);
  }
  
  private updateFDEPanelQuery(): void {
    // Group tokens by partition using real FDE data
    const partitionGroups: {[key: number]: string[]} = {};
    
    for (let i = 0; i <= this.state.step; i++) {
      const partition = this.queryData.partitions[i];
      const token = this.queryData.words[i].charAt(0).toLowerCase();
      
      if (!partitionGroups[partition]) {
        partitionGroups[partition] = [];
      }
      partitionGroups[partition].push(token);
    }
    
    // Update each partition row
    for (let partitionId = 1; partitionId <= 6; partitionId++) {
      const tokens = partitionGroups[partitionId] || [];
      const text = tokens.length === 0 ? '000000000' : tokens.join(' + ');
      const textColor = tokens.length === 0 ? '#ccc' : '#333';
      
      d3.select(`#fde-text-${partitionId}`)
        .transition()
        .duration(300)
        .style('opacity', 0)
        .transition()
        .duration(300)
        .text(text)
        .style('fill', textColor)
        .style('opacity', 1);
      
      if (tokens.length > 0) {
        d3.select(`#fde-bg-${partitionId}`)
          .transition()
          .duration(300)
          .style('fill', '#e3f2fd')
          .style('stroke', '#1976d2')
          .style('stroke-width', '1px');
      }
    }
  }
  
  private resetAnimation(): void {
    console.log('🔄 Restarting Query animation...');
    
    // Clear everything
    this.setupInitialView();
    this.queryTextDiv.html('');
    
    this.state.step = 0;
    
    // Restart animation
    setTimeout(() => this.animateLoop(), 2000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new QueryOnlyAnimation();
});