import * as d3 from 'd3';

// Types for MuVeRa visualization
interface Vector2D {
  x: number;
  y: number;
  id: number;
  partitionId?: number;
}

interface Hyperplane {
  angle: number;
  offset: number;
  color: string;
}

interface FDEBlock {
  value: number;
  index: number;
}

class MuVeRaVisualization {
  private queryVectors: Vector2D[] = [];
  private documentVectors: Vector2D[] = [];
  private hyperplanes: Hyperplane[] = [];
  private querySvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private docSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private fdeSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  
  constructor() {
    this.querySvg = d3.select('#query-visualization');
    this.docSvg = d3.select('#document-visualization');
    this.fdeSvg = d3.select('#fde-output');
    
    this.initializeControls();
    this.generateInitialData();
    this.setupEventListeners();
  }

  private initializeControls(): void {
    // Query controls
    const queryTokensSlider = d3.select('#query-tokens');
    const queryTokensValue = d3.select('#query-tokens-value');
    queryTokensSlider.on('input', (event) => {
      const value = event.target.value;
      queryTokensValue.text(value);
      this.generateQueryVectors(parseInt(value));
      this.renderQueryVisualization();
    });

    const queryPartitionsSlider = d3.select('#query-partitions');
    const queryPartitionsValue = d3.select('#query-partitions-value');
    queryPartitionsSlider.on('input', (event) => {
      const value = event.target.value;
      queryPartitionsValue.text(value);
      this.generateHyperplanes(parseInt(value));
      this.renderQueryVisualization();
    });

    // Document controls
    const docVectorsSlider = d3.select('#doc-vectors');
    const docVectorsValue = d3.select('#doc-vectors-value');
    docVectorsSlider.on('input', (event) => {
      const value = event.target.value;
      docVectorsValue.text(value);
      this.generateDocumentVectors(parseInt(value));
      this.renderDocumentVisualization();
    });

    const docPartitionsSlider = d3.select('#doc-partitions');
    const docPartitionsValue = d3.select('#doc-partitions-value');
    docPartitionsSlider.on('input', (event) => {
      const value = event.target.value;
      docPartitionsValue.text(value);
      this.generateHyperplanes(parseInt(value));
      this.renderDocumentVisualization();
    });
  }

  private setupEventListeners(): void {
    d3.select('#animate-query').on('click', () => this.animateQueryFDE());
    d3.select('#animate-document').on('click', () => this.animateDocumentFDE());
    d3.select('#compare-similarity').on('click', () => this.compareSimilarity());
    d3.select('#reset-all').on('click', () => this.resetAllVisualizations());
  }

  private generateInitialData(): void {
    this.generateQueryVectors(8);
    this.generateDocumentVectors(8);
    this.generateHyperplanes(8);
    this.renderAllVisualizations();
  }

  private generateQueryVectors(count: number): void {
    this.queryVectors = [];
    for (let i = 0; i < count; i++) {
      this.queryVectors.push({
        x: Math.random() * 280 + 10, // 10px margin
        y: Math.random() * 280 + 10,
        id: i
      });
    }
  }

  private generateDocumentVectors(count: number): void {
    this.documentVectors = [];
    for (let i = 0; i < count; i++) {
      this.documentVectors.push({
        x: Math.random() * 280 + 10,
        y: Math.random() * 280 + 10,
        id: i
      });
    }
  }

  private generateHyperplanes(count: number): void {
    this.hyperplanes = [];
    const colors = d3.schemeCategory10;
    
    for (let i = 0; i < count; i++) {
      this.hyperplanes.push({
        angle: Math.random() * Math.PI,
        offset: Math.random() * 200 + 50,
        color: colors[i % 10]
      });
    }
  }

  private assignVectorsToPartitions(vectors: Vector2D[]): void {
    vectors.forEach(vector => {
      // Simple partitioning logic based on position
      const partitionX = Math.floor(vector.x / (300 / Math.sqrt(this.hyperplanes.length)));
      const partitionY = Math.floor(vector.y / (300 / Math.sqrt(this.hyperplanes.length)));
      vector.partitionId = partitionX + partitionY * Math.sqrt(this.hyperplanes.length);
    });
  }

  private renderQueryVisualization(): void {
    this.querySvg.selectAll('*').remove();
    
    // Render hyperplanes
    this.renderHyperplanes(this.querySvg);
    
    // Render vectors
    this.querySvg.selectAll('.token')
      .data(this.queryVectors)
      .enter()
      .append('circle')
      .attr('class', 'token')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', 4)
      .on('mouseover', (event, d) => {
        d3.select(event.target).transition().duration(200).attr('r', 6);
      })
      .on('mouseout', (event, d) => {
        d3.select(event.target).transition().duration(200).attr('r', 4);
      });
  }

  private renderDocumentVisualization(): void {
    this.docSvg.selectAll('*').remove();
    
    // Render hyperplanes
    this.renderHyperplanes(this.docSvg);
    
    // Render vectors
    this.docSvg.selectAll('.token')
      .data(this.documentVectors)
      .enter()
      .append('circle')
      .attr('class', 'token')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', 4)
      .on('mouseover', (event, d) => {
        d3.select(event.target).transition().duration(200).attr('r', 6);
      })
      .on('mouseout', (event, d) => {
        d3.select(event.target).transition().duration(200).attr('r', 4);
      });
  }

  private renderHyperplanes(svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>): void {
    this.hyperplanes.forEach((hyperplane, i) => {
      const x1 = 0;
      const y1 = hyperplane.offset;
      const x2 = 300;
      const y2 = hyperplane.offset + Math.tan(hyperplane.angle) * 300;

      svg.append('line')
        .attr('class', 'hyperplane')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .style('stroke', hyperplane.color)
        .style('stroke-opacity', 0.3);
    });
  }

  private renderFDEOutput(fdeValues: number[]): void {
    this.fdeSvg.selectAll('*').remove();
    
    const width = 800;
    const height = 150;
    const blockWidth = width / fdeValues.length;
    
    const maxValue = Math.max(...fdeValues.map(Math.abs));
    const yScale = d3.scaleLinear()
      .domain([-maxValue, maxValue])
      .range([height - 10, 10]);
    
    this.fdeSvg.selectAll('.fde-block')
      .data(fdeValues)
      .enter()
      .append('rect')
      .attr('class', 'fde-block')
      .attr('x', (d, i) => i * blockWidth)
      .attr('y', d => d >= 0 ? yScale(d) : yScale(0))
      .attr('width', blockWidth - 1)
      .attr('height', d => Math.abs(yScale(d) - yScale(0)))
      .attr('fill', d => d >= 0 ? '#34a853' : '#ea4335')
      .style('opacity', 0)
      .transition()
      .duration(1000)
      .style('opacity', 0.8);
  }

  private animateQueryFDE(): void {
    this.assignVectorsToPartitions(this.queryVectors);
    
    // Phase 1: Show vectors
    this.querySvg.selectAll('.token')
      .transition()
      .duration(1000)
      .attr('fill', '#1a73e8');
    
    // Phase 2: Show partitions
    setTimeout(() => {
      this.querySvg.selectAll('.hyperplane')
        .transition()
        .duration(1500)
        .style('opacity', 0.7);
    }, 1000);
    
    // Phase 3: Sum vectors in partitions
    setTimeout(() => {
      this.animateVectorSummation();
    }, 2500);
  }

  private animateDocumentFDE(): void {
    this.assignVectorsToPartitions(this.documentVectors);
    
    // Similar to query but with averaging
    this.docSvg.selectAll('.token')
      .transition()
      .duration(1000)
      .attr('fill', '#1a73e8');
    
    setTimeout(() => {
      this.docSvg.selectAll('.hyperplane')
        .transition()
        .duration(1500)
        .style('opacity', 0.7);
    }, 1000);
    
    setTimeout(() => {
      this.animateVectorAveraging();
    }, 2500);
  }

  private animateVectorSummation(): void {
    // Group vectors by partition and sum them
    const partitionSums = this.computePartitionSums(this.queryVectors);
    this.renderFDEOutput(partitionSums);
  }

  private animateVectorAveraging(): void {
    // Group vectors by partition and average them
    const partitionAvgs = this.computePartitionAverages(this.documentVectors);
    this.renderFDEOutput(partitionAvgs);
  }

  private computePartitionSums(vectors: Vector2D[]): number[] {
    const partitionMap = new Map<number, Vector2D[]>();
    
    vectors.forEach(vector => {
      const partition = vector.partitionId || 0;
      if (!partitionMap.has(partition)) {
        partitionMap.set(partition, []);
      }
      partitionMap.get(partition)!.push(vector);
    });
    
    const sums: number[] = [];
    for (let i = 0; i < this.hyperplanes.length; i++) {
      const vectorsInPartition = partitionMap.get(i) || [];
      const sum = vectorsInPartition.reduce((acc, v) => acc + v.x + v.y, 0);
      sums.push(sum / 100); // Normalize for display
    }
    
    return sums;
  }

  private computePartitionAverages(vectors: Vector2D[]): number[] {
    const partitionMap = new Map<number, Vector2D[]>();
    
    vectors.forEach(vector => {
      const partition = vector.partitionId || 0;
      if (!partitionMap.has(partition)) {
        partitionMap.set(partition, []);
      }
      partitionMap.get(partition)!.push(vector);
    });
    
    const averages: number[] = [];
    for (let i = 0; i < this.hyperplanes.length; i++) {
      const vectorsInPartition = partitionMap.get(i) || [];
      if (vectorsInPartition.length > 0) {
        const avg = vectorsInPartition.reduce((acc, v) => acc + v.x + v.y, 0) / vectorsInPartition.length;
        averages.push(avg / 100); // Normalize for display
      } else {
        averages.push(0);
      }
    }
    
    return averages;
  }

  private compareSimilarity(): void {
    const querySums = this.computePartitionSums(this.queryVectors);
    const docAvgs = this.computePartitionAverages(this.documentVectors);
    
    // Compute inner product similarity
    let similarity = 0;
    for (let i = 0; i < Math.min(querySums.length, docAvgs.length); i++) {
      similarity += querySums[i] * docAvgs[i];
    }
    
    // Update similarity stat
    d3.select('#recall-improvement')
      .transition()
      .duration(1000)
      .tween('text', function() {
        const i = d3.interpolateNumber(10, Math.abs(similarity * 100));
        return function(t) {
          d3.select(this).text(Math.round(i(t)) + '%');
        };
      });
  }

  private resetAllVisualizations(): void {
    this.querySvg.selectAll('*').remove();
    this.docSvg.selectAll('*').remove();
    this.fdeSvg.selectAll('*').remove();
    
    this.generateInitialData();
    
    // Reset stats
    d3.select('#recall-improvement').text('10%');
  }

  private renderAllVisualizations(): void {
    this.renderQueryVisualization();
    this.renderDocumentVisualization();
  }
}

// Initialize the visualization when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new MuVeRaVisualization();
});

// Auto-animate demo every 10 seconds
setInterval(() => {
  const viz = new MuVeRaVisualization();
  setTimeout(() => viz['animateQueryFDE'](), 2000);
  setTimeout(() => viz['animateDocumentFDE'](), 5000);
}, 15000);
