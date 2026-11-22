import * as d3 from 'd3';
import {
  EncodingType,
  type FDEResult,
  type FixedDimensionalEncodingConfig,
  computeFDE,
  computeChamferSimilarity,
  computeFDEEstimate,
  cosineSim,
  l2Normalize,
  projectJointPCA2D
} from './muvera/fde-algorithm.ts';
import { createMuveraWorker, type MuveraModelId } from './muvera/embedding-worker.ts';

interface EncodedText {
  words: string[];
  tokenVectors: number[][];
  sentenceVector: number[];
  dimension: number;
}

const DEFAULT_DOCS = [
  'Mount Everest rises 8,848 meters above sea level in the Himalayas, making it the tallest mountain on Earth.',
  'The Pacific Ocean is the largest and deepest oceanic division on Earth, covering one-third of the surface.',
  'Photosynthesis converts solar photons into chemical energy inside plant chloroplasts using chlorophyll.',
  'The speed of light in vacuum is 299,792,458 meters per second, a fundamental physical constant.',
  'Deoxyribonucleic acid (DNA) encodes hereditary instructions across all known cellular organisms.',
  'The Great Wall of China spans over 21,000 kilometers across northern mountains and plateaus.',
  'The human brain contains roughly 86 billion neurons connected via trillions of synapses.',
  'Liquid water covers approximately 71 percent of Earth\'s planetary surface.',
  'Tropical rainforests in the Amazon basin generate immense biodiversity and cycle global moisture.',
  'Quantum mechanics describes quantized energy levels, superposition, and entanglement at atomic scales.'
];

const PRESET_PAIRS = [
  {
    query: 'What is the height of Mount Everest?',
    doc: 'Mount Everest rises 8,848 meters above sea level in the Himalayas.'
  },
  {
    query: 'How do plants capture sunlight for energy?',
    doc: 'Photosynthesis converts solar photons into chemical energy inside plant chloroplasts.'
  },
  {
    query: 'Why does ice float on liquid oceans?',
    doc: 'Solid ice has lower density than cold liquid water due to hydrogen bonding.'
  },
  {
    query: 'When did quantum physics discover atomic scales?',
    doc: 'Quantum mechanics explains energy quantization and wave-particle duality at atomic scales.'
  }
];

function deterministicEncode(text: string, dim = 64): EncodedText {
  const words = text.trim().split(/\s+/).map(w => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9'-]+$/g, '')).filter(Boolean);
  const tokens = words.length ? words : ['text'];
  const tokenVectors = tokens.map(w => {
    const low = w.toLowerCase();
    let seed = 0;
    for (let c = 0; c < low.length; c++) seed += low.charCodeAt(c) * (c + 1);
    const vec = new Array(dim);
    for (let d = 0; d < dim; d++) {
      vec[d] = Math.sin(seed * (d + 1) * 0.017) * 0.6 + Math.cos(seed * (d + 2) * 0.031) * 0.4;
    }
    return l2Normalize(vec);
  });
  const mean = new Array(dim).fill(0);
  for (const v of tokenVectors) {
    for (let d = 0; d < dim; d++) mean[d] += v[d] / tokenVectors.length;
  }
  return { words: tokens, tokenVectors, sentenceVector: l2Normalize(mean), dimension: dim };
}

class MuVeRaVisualizer {
  private worker: Worker | null = null;
  private pairReqId = 0;
  private benchReqId = 0;
  private lastPair: { query: EncodedText; doc: EncodedText; backend: string; modelId: string } | null = null;
  private pulseEnabled = true;

  constructor() {
    this.initUI();
    this.loadDefaultDocs();
    this.requestPairEncoding();
    window.addEventListener('beforeunload', () => {
      if (this.worker) { this.worker.terminate(); this.worker = null; }
    });
  }

  private getConfig(dimension: number): FixedDimensionalEncodingConfig {
    const kSim = parseInt((document.getElementById('ksim-select') as HTMLSelectElement).value, 10) || 3;
    const R = parseInt((document.getElementById('reps-select') as HTMLSelectElement).value, 10) || 8;
    const seed = parseInt((document.getElementById('fde-seed-select') as HTMLSelectElement).value, 10) || 42;
    const fillEmptyPartitions = (document.getElementById('fill-empty-checkbox') as HTMLInputElement).checked;
    return {
      dimension,
      numSimhashProjections: kSim,
      numRepetitions: R,
      seed,
      fillEmptyPartitions
    };
  }

  private setStatus(msg: string, kind: '' | 'ready' | 'error' = '') {
    const el = document.getElementById('embedding-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-banner' + (kind ? ` ${kind}` : '');
  }

  private initUI() {
    document.getElementById('compute-pair-btn')?.addEventListener('click', () => this.requestPairEncoding());
    document.getElementById('muvera-model-select')?.addEventListener('change', () => this.requestPairEncoding());

    for (const id of ['ksim-select', 'reps-select', 'fde-seed-select', 'fill-empty-checkbox']) {
      document.getElementById(id)?.addEventListener('change', () => this.renderFromCachedPair());
    }

    document.getElementById('reset-btn')?.addEventListener('click', () => {
      (document.getElementById('query-input') as HTMLInputElement).value = PRESET_PAIRS[0].query;
      (document.getElementById('document-input') as HTMLInputElement).value = PRESET_PAIRS[0].doc;
      this.requestPairEncoding();
    });

    let presetIdx = 0;
    document.getElementById('random-btn')?.addEventListener('click', () => {
      presetIdx = (presetIdx + 1) % PRESET_PAIRS.length;
      (document.getElementById('query-input') as HTMLInputElement).value = PRESET_PAIRS[presetIdx].query;
      (document.getElementById('document-input') as HTMLInputElement).value = PRESET_PAIRS[presetIdx].doc;
      this.requestPairEncoding();
    });

    document.getElementById('pause-btn')?.addEventListener('click', (e) => {
      this.pulseEnabled = !this.pulseEnabled;
      (e.target as HTMLButtonElement).textContent = this.pulseEnabled ? 'Pause Pulse' : 'Resume Pulse';
      this.renderFromCachedPair();
    });

    document.getElementById('load-default-docs-btn')?.addEventListener('click', () => this.loadDefaultDocs());
    document.getElementById('search-documents-btn')?.addEventListener('click', () => this.runCollectionBenchmark());
  }

  private loadDefaultDocs() {
    const ta = document.getElementById('document-collection') as HTMLTextAreaElement;
    if (ta) ta.value = DEFAULT_DOCS.join('\n');
  }

  private ensureWorker() {
    if (this.worker) return;
    this.worker = createMuveraWorker();
    this.worker.onmessage = (e) => {
      const { type, data } = e.data;
      const track = document.getElementById('loading-progress-container');
      const bar = document.getElementById('loading-progress-bar');

      if (type === 'progress') {
        if (track && bar) {
          track.style.display = 'block';
          bar.style.width = `${data.percent}%`;
        }
        this.setStatus(`Downloading embedding weights (${data.percent}%)...`);
      } else if (type === 'pair_encoded') {
        if (data.requestId !== this.pairReqId) return;
        if (track) track.style.display = 'none';
        this.setStatus(`Active Backend: ${data.modelId} (${data.backend.toUpperCase()})`, 'ready');
        this.lastPair = data;
        this.renderFromCachedPair();
      } else if (type === 'collection_progress') {
        this.setStatus(`Encoding collection ${data.done}/${data.total}...`);
      } else if (type === 'collection_encoded') {
        if (data.requestId !== this.benchReqId) return;
        this.setStatus(`Collection benchmark complete (${data.modelId}, ${data.backend.toUpperCase()})`, 'ready');
        this.renderBenchmarkTable(data.query, data.docs);
      } else if (type === 'error') {
        if (track) track.style.display = 'none';
        this.setStatus(`Worker fallback (${data.message}) — showing deterministic cloud`, 'error');
      }
    };
  }

  private requestPairEncoding() {
    const queryText = (document.getElementById('query-input') as HTMLInputElement).value.trim() || PRESET_PAIRS[0].query;
    const docText = (document.getElementById('document-input') as HTMLInputElement).value.trim() || PRESET_PAIRS[0].doc;
    const modelId = (document.getElementById('muvera-model-select') as HTMLSelectElement).value as MuveraModelId;

    // Immediate deterministic preview so nothing shows "Loading..." at t=0
    this.lastPair = {
      query: deterministicEncode(queryText, 64),
      doc: deterministicEncode(docText, 64),
      backend: 'js',
      modelId: 'deterministic'
    };
    this.renderFromCachedPair();

    if (modelId === 'deterministic') {
      this.setStatus('Deterministic Token Cloud (64D Instant)', 'ready');
      return;
    }

    this.ensureWorker();
    this.pairReqId++;
    this.setStatus(`Loading ${modelId} and encoding Q & P in Web Worker...`);
    this.worker!.postMessage({
      type: 'encode_pair',
      data: { requestId: this.pairReqId, modelId, queryText, docText }
    });
  }

  private renderFromCachedPair() {
    if (!this.lastPair) return;
    const { query, doc, backend, modelId } = this.lastPair;
    const cfg = this.getConfig(query.dimension);
    const t0 = performance.now();
    const qFde = computeFDE(query.tokenVectors, query.words, cfg, EncodingType.DEFAULT_SUM);
    const dFde = computeFDE(doc.tokenVectors, doc.words, cfg, EncodingType.AVERAGE);
    const chamfer = computeChamferSimilarity(query.tokenVectors, doc.tokenVectors, cfg.dimension);
    const fdeEst = computeFDEEstimate(qFde.fdeVector, dFde.fdeVector, cfg.numRepetitions, query.words.length);
    const singleCos = cosineSim(query.sentenceVector, doc.sentenceVector);
    const fdeElapsedMs = performance.now() - t0;

    // Metrics Cards
    const relErr = chamfer.chamferSum > 1e-6
      ? (Math.abs(fdeEst.fdeSumApprox - chamfer.chamferSum) / Math.abs(chamfer.chamferSum)) * 100
      : 0;
    document.getElementById('chamfer-score')!.textContent = `${chamfer.chamferSum.toFixed(3)} sum (mean ${chamfer.chamferMean.toFixed(3)})`;
    document.getElementById('similarity-score')!.textContent = `${fdeEst.fdeSumApprox.toFixed(3)} sum (cos ${fdeEst.fdeCosine.toFixed(3)})`;
    document.getElementById('single-vec-score')!.textContent = singleCos.toFixed(4);
    document.getElementById('hyperplane-diff')!.textContent = `Identical seed=${cfg.seed}, k=${cfg.numSimhashProjections} (${qFde.numPartitions} buckets x ${cfg.numRepetitions} reps)`;
    document.getElementById('embedding-similarity')!.textContent = `${modelId} (${backend}, ${cfg.dimension}D)`;
    document.getElementById('performance-comparison')!.textContent = `|FDE - Chamfer| = ${Math.abs(fdeEst.fdeSumApprox - chamfer.chamferSum).toFixed(3)} (${relErr.toFixed(1)}%)`;

    document.getElementById('query-text')!.textContent = `Q (${query.words.length} tokens): ${query.words.join(' ')}`;
    document.getElementById('query-text-doc')!.textContent = `P (${doc.words.length} tokens): ${doc.words.join(' ')}`;

    // 2D Joint PCA + Shared SimHash Boundaries
    const pca = projectJointPCA2D(query.tokenVectors, doc.tokenVectors, cfg.dimension);
    this.drawPointCloud('#semantic-svg', pca.queryCoords, query.words, qFde.tokenPartitionRep0, cfg, '#2563eb', 'Q');
    this.drawPointCloud('#semantic-svg-doc', pca.docCoords, doc.words, dFde.tokenPartitionRep0, cfg, '#16a34a', 'P');

    this.drawPartitionBars('#fde-svg', qFde.rep0Partitions, '#2563eb', 'SUM');
    this.drawPartitionBars('#fde-svg-doc', dFde.rep0Partitions, '#16a34a', 'AVG');

    this.drawFdeHeatmap('#bottom-svg', qFde, '#2563eb');
    this.drawFdeHeatmap('#bottom-svg-doc', dFde, '#16a34a');

    // Exact Math Walkthrough Text
    const filledCount = dFde.rep0Partitions.filter(p => p.filledByNearest).length;
    document.getElementById('query-input-calcs')!.textContent =
      `Tokens (|Q| = ${query.words.length}): [${query.words.join(', ')}]\n` +
      `Vector dims: ${cfg.dimension}D L2-normalized\n` +
      `Rep 1 Bucket IDs: [${qFde.tokenPartitionRep0.join(', ')}]`;
    document.getElementById('query-fde-calcs')!.textContent =
      `Shared SimHash: R=${cfg.numRepetitions} reps, k=${cfg.numSimhashProjections} hyperplanes -> P=${qFde.numPartitions} buckets/rep\n` +
      `Non-empty Rep-1 buckets: ${qFde.rep0Partitions.filter(p => p.count > 0).length}/${qFde.numPartitions}`;
    document.getElementById('query-aggregation-calcs')!.textContent =
      `Aggregation: SUM per partition (empty = 0)\n` +
      `Total FDE length: ${qFde.fdeVector.length} dims\n` +
      `First 6 dims: [${qFde.fdeVector.slice(0, 6).map(v => v.toFixed(3)).join(', ')}]`;

    document.getElementById('doc-input-calcs')!.textContent =
      `Tokens (|P| = ${doc.words.length}): [${doc.words.join(', ')}]\n` +
      `Vector dims: ${cfg.dimension}D L2-normalized\n` +
      `Rep 1 Bucket IDs: [${dFde.tokenPartitionRep0.join(', ')}]`;
    document.getElementById('doc-fde-calcs')!.textContent =
      `Identical G^(r) projections ensure aligned buckets with Query Q.\n` +
      `Populated Rep-1 buckets: ${dFde.rep0Partitions.filter(p => p.count > 0).length}/${dFde.numPartitions} | Nearest-filled: ${filledCount}`;
    document.getElementById('doc-aggregation-calcs')!.textContent =
      `Aggregation: AVERAGE (${cfg.fillEmptyPartitions ? 'with Gray-code nearest fill' : 'empty = 0'})\n` +
      `Total FDE length: ${dFde.fdeVector.length} dims\n` +
      `First 6 dims: [${dFde.fdeVector.slice(0, 6).map(v => v.toFixed(3)).join(', ')}]`;

    const rawMultiDims = (query.words.length + doc.words.length) * cfg.dimension;
    document.getElementById('performance-metrics')!.textContent =
      `FDE construction + scoring time: ${fdeElapsedMs.toFixed(2)} ms\n` +
      `Exact Chamfer Sum: ${chamfer.chamferSum.toFixed(4)} | MUVERA (1/R)<F_q, F_d>: ${fdeEst.fdeSumApprox.toFixed(4)} | Relative Diff: ${relErr.toFixed(1)}%\n` +
      `Raw multi-vector scalars: ${rawMultiDims} floats | Single FDE vector length: ${qFde.fdeVector.length} floats (R=${cfg.numRepetitions}, P=${qFde.numPartitions})`;
  }

  private drawPointCloud(
    selector: string,
    coords: [number, number][],
    words: string[],
    buckets: number[],
    cfg: FixedDimensionalEncodingConfig,
    accent: string,
    tag: string
  ) {
    const svg = d3.select(selector);
    svg.selectAll('*').remove();
    const w = 420, h = 300, cx = w / 2, cy = h / 2, rad = 115;

    //Axes
    svg.append('line').attr('x1', 20).attr('y1', cy).attr('x2', w - 20).attr('y2', cy).attr('stroke', '#e2e8f0').attr('stroke-width', 1);
    svg.append('line').attr('x1', cx).attr('y1', 20).attr('x2', cx).attr('y2', h - 20).attr('stroke', '#e2e8f0').attr('stroke-width', 1);

    // Draw shared SimHash hyperplane visual dividers derived deterministically from cfg.seed
    const angles: number[] = [];
    for (let k = 0; k < cfg.numSimhashProjections; k++) {
      angles.push(((cfg.seed * 0.37 + k * 1.05) % Math.PI));
    }
    angles.forEach((ang, k) => {
      svg.append('line')
        .attr('x1', cx - Math.cos(ang) * 135)
        .attr('y1', cy - Math.sin(ang) * 135)
        .attr('x2', cx + Math.cos(ang) * 135)
        .attr('y2', cy + Math.sin(ang) * 135)
        .attr('stroke', '#94a3b8')
        .attr('stroke-dasharray', '4,3')
        .attr('stroke-width', 1.2)
        .append('title').text(`Shared SimHash Hyperplane H${k + 1}`);
    });

    svg.append('text')
      .attr('x', 12).attr('y', 18)
      .style('font-size', '11px').style('fill', '#64748b').style('font-weight', '600')
      .text(`${tag} Shared PCA + Halfspaces (seed=${cfg.seed})`);

    const palette = d3.schemeTableau10;
    coords.forEach(([px, py], i) => {
      const x = cx + px * rad;
      const y = cy - py * rad;
      const bucket = buckets[i] ?? 0;
      const col = palette[bucket % palette.length] || accent;

      const c = svg.append('circle')
        .attr('cx', x).attr('cy', y)
        .attr('r', 7)
        .attr('fill', col)
        .attr('stroke', '#0f172a')
        .attr('stroke-width', 1.2);
      if (this.pulseEnabled) {
        c.attr('opacity', 0.85);
      }
      svg.append('text')
        .attr('x', x + 9).attr('y', y + 4)
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('fill', '#0f172a')
        .text(`${words[i]} [${bucket}]`);
    });
  }

  private drawPartitionBars(selector: string, parts: FDEResult['rep0Partitions'], accent: string, modeLabel: string) {
    const svg = d3.select(selector);
    svg.selectAll('*').remove();
    const w = 420, h = 170, padL = 36, padB = 34, padT = 22, padR = 14;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const maxNorm = Math.max(0.01, ...parts.map(p => p.norm));
    const barW = innerW / parts.length;

    parts.forEach((p, idx) => {
      const barH = (p.norm / maxNorm) * innerH;
      const x = padL + idx * barW + 3;
      const y = padT + (innerH - barH);
      const fill = p.count > 0 ? accent : (p.filledByNearest ? '#f59e0b' : '#e2e8f0');

      svg.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', Math.max(8, barW - 6))
        .attr('height', Math.max(2, barH))
        .attr('rx', 3)
        .attr('fill', fill)
        .append('title')
        .text(`Bucket ${p.partitionId}: count=${p.count}${p.filledByNearest ? ' (nearest-filled)' : ''}, norm=${p.norm.toFixed(3)}, tokens=[${p.tokens.join(', ')}]`);

      svg.append('text')
        .attr('x', x + Math.max(8, barW - 6) / 2)
        .attr('y', h - 16)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('fill', '#334155')
        .text(`B${p.partitionId}`);

      svg.append('text')
        .attr('x', x + Math.max(8, barW - 6) / 2)
        .attr('y', h - 4)
        .attr('text-anchor', 'middle')
        .style('font-size', '9px')
        .style('fill', p.filledByNearest ? '#b45309' : '#64748b')
        .text(p.count > 0 ? `n=${p.count}` : (p.filledByNearest ? 'fill' : '0'));
    });

    svg.append('text')
      .attr('x', 8).attr('y', 14)
      .style('font-size', '10.5px').style('font-weight', '600').style('fill', '#475569')
      .text(`Rep 1 Block Norms (${modeLabel}; amber = filled empty bucket)`);
  }

  private drawFdeHeatmap(selector: string, fde: FDEResult, accent: string) {
    const svg = d3.select(selector);
    svg.selectAll('*').remove();
    const w = 420, h = 90;
    const vec = fde.repetitions[0] || [];
    const bins = Math.min(96, vec.length);
    if (!bins) return;
    const cellW = (w - 20) / bins;
    let maxAbs = 1e-3;
    for (let i = 0; i < bins; i++) maxAbs = Math.max(maxAbs, Math.abs(vec[i]));

    for (let i = 0; i < bins; i++) {
      const val = vec[i];
      const mag = Math.min(1, Math.abs(val) / maxAbs);
      svg.append('rect')
        .attr('x', 10 + i * cellW)
        .attr('y', 24)
        .attr('width', Math.max(1.5, cellW - 0.3))
        .attr('height', 42)
        .attr('fill', val >= 0 ? accent : '#dc2626')
        .attr('fill-opacity', 0.12 + 0.88 * mag);
    }
    svg.append('text')
      .attr('x', 10).attr('y', 16)
      .style('font-size', '10.5px').style('fill', '#475569').style('font-weight', '600')
      .text(`Rep 1 Packed Coordinates (${vec.length} floats; blue/green >= 0, red < 0)`);
  }

  private runCollectionBenchmark() {
    const queryText = (document.getElementById('search-query') as HTMLInputElement).value.trim() || PRESET_PAIRS[0].query;
    const docsRaw = (document.getElementById('document-collection') as HTMLTextAreaElement).value;
    const docs = docsRaw.split('\n').map(l => l.trim()).filter(Boolean);
    if (!docs.length) return;

    const modelId = (document.getElementById('muvera-model-select') as HTMLSelectElement).value as MuveraModelId;
    if (modelId === 'deterministic') {
      const qEnc = deterministicEncode(queryText, 64);
      const dEncs = docs.map(d => deterministicEncode(d, 64));
      this.renderBenchmarkTable(qEnc, dEncs);
      return;
    }

    this.ensureWorker();
    this.benchReqId++;
    this.setStatus(`Encoding ${docs.length} documents with ${modelId}...`);
    this.worker!.postMessage({
      type: 'encode_collection',
      data: { requestId: this.benchReqId, modelId, queryText, docs }
    });
  }

  private renderBenchmarkTable(query: EncodedText, docs: EncodedText[]) {
    const container = document.getElementById('search-results');
    if (!container) return;
    const topK = parseInt((document.getElementById('top-k-results') as HTMLSelectElement).value, 10) || 5;
    const cfg = this.getConfig(query.dimension);
    const qFde = computeFDE(query.tokenVectors, query.words, cfg, EncodingType.DEFAULT_SUM);

    const rows = docs.map((d, idx) => {
      const dFde = computeFDE(d.tokenVectors, d.words, cfg, EncodingType.AVERAGE);
      const chamfer = computeChamferSimilarity(query.tokenVectors, d.tokenVectors, cfg.dimension);
      const fdeEst = computeFDEEstimate(qFde.fdeVector, dFde.fdeVector, cfg.numRepetitions, query.words.length);
      const single = cosineSim(query.sentenceVector, d.sentenceVector);
      return {
        idx,
        text: d.words.join(' '),
        chamferSum: chamfer.chamferSum,
        fdeSum: fdeEst.fdeSumApprox,
        singleCos: single,
        docObj: d
      };
    });

    rows.sort((a, b) => b.fdeSum - a.fdeSum);
    const topRows = rows.slice(0, topK);

    let html = `<table class="bench-table"><thead><tr>
      <th>Rank (MUVERA FDE)</th>
      <th>Document</th>
      <th>Exact Chamfer</th>
      <th>MUVERA (1/R)&langle;F<sub>q</sub>,F<sub>d</sub>&rangle;</th>
      <th>Single-Vector Cos</th>
    </tr></thead><tbody>`;
    topRows.forEach((r, rank) => {
      html += `<tr class="${rank === 0 ? 'top-hit' : ''}">
        <td><strong>#${rank + 1}</strong></td>
        <td>${r.text.replace(/</g, '&lt;')}</td>
        <td>${r.chamferSum.toFixed(3)}</td>
        <td><strong>${r.fdeSum.toFixed(3)}</strong></td>
        <td>${r.singleCos.toFixed(3)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    if (topRows.length) {
      this.lastPair = {
        query,
        doc: topRows[0].docObj,
        backend: this.lastPair?.backend || 'wasm',
        modelId: this.lastPair?.modelId || 'all-MiniLM-L6-v2'
      };
      (document.getElementById('query-input') as HTMLInputElement).value = query.words.join(' ');
      (document.getElementById('document-input') as HTMLInputElement).value = topRows[0].docObj.words.join(' ');
      this.renderFromCachedPair();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MuVeRaVisualizer();
});
