interface LexiconEntry {
  d: string[];
  s: string[];
  h: string[];
  y: string[];
  a: string[];
  e?: string;
}

interface RetrievedHit {
  word: string;
  entry: LexiconEntry;
  score: number;
  lexicalScore: number;
}

const STOP_WORDS = new Set([
  'what', 'is', 'the', 'meaning', 'of', 'define', 'explain', 'concept', 'does',
  'mean', 'tell', 'me', 'about', 'word', 'a', 'an', 'in', 'to', 'and', 'or', 'for', 'how', 'why'
]);

const rerankWorkerCode = `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let extractor = null;

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}

self.addEventListener('message', async (e) => {
  const { type, data } = e.data;
  if (type === 'rerank') {
    try {
      if (!extractor) {
        self.postMessage({ type: 'status', data: 'Loading all-MiniLM-L6-v2 (~23 MB WASM)...' });
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          device: 'wasm',
          dtype: 'q8',
          progress_callback: (p) => {
            if (p && p.status === 'progress' && p.total) {
              const pct = Math.min(100, Math.round((p.loaded / p.total) * 100));
              self.postMessage({ type: 'status', data: 'Downloading MiniLM (' + pct + '%)...' });
            }
          }
        });
      }
      const texts = [data.query, ...data.docs.map(d => d.text)];
      const out = await extractor(texts, { pooling: 'mean', normalize: true });
      const [n, dim] = out.dims.map(Number);
      const raw = out.data;
      const qVec = raw.subarray(0, dim);
      const scores = {};
      for (let i = 1; i < n; i++) {
        scores[data.docs[i - 1].word] = cosine(qVec, raw.subarray(i * dim, (i + 1) * dim));
      }
      self.postMessage({ type: 'reranked', data: { reqId: data.reqId, scores } });
    } catch (err) {
      self.postMessage({ type: 'error', data: (err && err.message) || String(err) });
    }
  }
});
`;

const genWorkerCode = `
import { pipeline, TextStreamer, InterruptableStoppingCriteria, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let activeModelId = null;
let generator = null;
let activeStop = null;

async function hasWebGPU() {
  if (!('gpu' in navigator)) return { ok: false, f16: false };
  try {
    const ad = await navigator.gpu.requestAdapter();
    if (!ad) return { ok: false, f16: false };
    return { ok: true, f16: !!(ad.features && ad.features.has('shader-f16')) };
  } catch {
    return { ok: false, f16: false };
  }
}

self.addEventListener('message', async (e) => {
  const { type, data } = e.data;
  if (type === 'stop') {
    if (activeStop) activeStop.interrupt();
    return;
  }
  if (type !== 'generate') return;

  try {
    const modelId = data.modelId;
    if (activeModelId !== modelId || !generator) {
      const gpu = await hasWebGPU();
      const device = gpu.ok ? 'webgpu' : 'wasm';
      const dtype = device === 'webgpu' ? (gpu.f16 ? 'q4f16' : 'q4') : 'q4';
      self.postMessage({ type: 'gen_status', data: 'Loading ' + modelId.split('/')[1] + ' (' + device.toUpperCase() + ' ' + dtype + ')...' });

      const fileProg = new Map();
      const progressCb = (p) => {
        if (!p || !p.file) return;
        if (p.status === 'progress') fileProg.set(p.file, { l: p.loaded || 0, t: p.total || 0 });
        else if (p.status === 'done') { const prev = fileProg.get(p.file); if (prev && prev.t) fileProg.set(p.file, { l: prev.t, t: prev.t }); }
        else return;
        let l = 0, t = 0;
        for (const v of fileProg.values()) { l += v.l; t += v.t; }
        const pct = t > 0 ? Math.min(100, Math.round((l / t) * 100)) : 0;
        self.postMessage({ type: 'gen_status', data: 'Downloading ' + modelId.split('/')[1] + ' (' + pct + '%)...' });
      };

      try {
        generator = await pipeline('text-generation', modelId, { device, dtype, progress_callback: progressCb });
        activeModelId = modelId;
        self.postMessage({ type: 'gen_ready', data: modelId + ' (' + device.toUpperCase() + ' ' + dtype + ')' });
      } catch (err) {
        const msg = (err && err.message) || String(err);
        if (device === 'wasm' && msg.includes('GatherBlockQuantized')) {
          throw new Error(modelId + ' requires WebGPU on this device. Select "SmolLM2 360M Instruct" for CPU WASM fallback.');
        }
        throw err;
      }
    }

    activeStop = new InterruptableStoppingCriteria();
    const tokens = [];
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (tok) => {
        tokens.push(tok);
        self.postMessage({ type: 'token', data: tok });
      }
    });

    const isGemma = data.modelId.toLowerCase().includes('gemma');
    const messages = isGemma
      ? [{ role: 'user', content: data.userPrompt }]
      : [
          { role: 'system', content: 'You are a helpful dictionary assistant. Write 1 to 2 complete sentences explaining the asked word using the provided WordNet definitions and synonyms.' },
          { role: 'user', content: data.userPrompt }
        ];

    const out = await generator(messages, {
      max_new_tokens: 140,
      do_sample: true,
      temperature: 0.35,
      top_p: 0.9,
      repetition_penalty: 1.12,
      stopping_criteria: [activeStop],
      streamer
    });
    const interrupted = !!activeStop.interrupted;
    activeStop = null;
    const fallback = out?.[0]?.generated_text?.at?.(-1)?.content || '';
    const finalText = (tokens.length ? tokens.join('') : fallback).trim();
    self.postMessage({ type: 'complete', data: { text: finalText, interrupted } });
  } catch (err) {
    activeStop = null;
    self.postMessage({ type: 'error', data: (err && err.message) || String(err) });
  }
});
`;

class RagPipelineApp {
  private lexicon: Record<string, LexiconEntry> = {};
  private rerankWorker: Worker | null = null;
  private genWorker: Worker | null = null;
  private rerankReq = 0;

  constructor() {
    this.init();
    window.addEventListener('beforeunload', () => {
      this.rerankWorker?.terminate();
      this.genWorker?.terminate();
    });
  }

  private log(msg: string) {
    const panel = document.getElementById('log-panel');
    if (!panel) return;
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.textContent = `[${time}] ${msg}`;
    panel.appendChild(div);
    panel.scrollTop = panel.scrollHeight;
  }

  private setStatus(id: string, text: string, cls: 'ready' | 'loading' | 'error') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `status-val ${cls}`;
  }

  private async init() {
    this.log('Loading standalone Princeton WordNet 3.1 lexicon...');
    try {
      const res = await fetch('./wordnet-lexicon.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      this.lexicon = payload.entries || {};
      const count = Object.keys(this.lexicon).length;
      this.setStatus('corpus-status', `Ready (${count.toLocaleString()} WordNet lemmas)`, 'ready');
      this.log(`WordNet 3.1 ready: ${count.toLocaleString()} entries loaded directly (no iframe wait).`);

      (document.getElementById('query-input') as HTMLInputElement).disabled = false;
      (document.getElementById('retrieve-btn') as HTMLButtonElement).disabled = false;
      (document.getElementById('generate-btn') as HTMLButtonElement).disabled = false;
    } catch (err: any) {
      this.setStatus('corpus-status', `Error: ${err.message}`, 'error');
      this.log(`Failed to load lexicon: ${err.message}`);
    }

    // Default to SmolLM2 if WebGPU is absent
    try {
      const hasGpu = 'gpu' in navigator && !!(await (navigator as any).gpu.requestAdapter());
      if (!hasGpu) {
        (document.getElementById('gen-model-select') as HTMLSelectElement).value = 'onnx-community/SmolLM2-360M-Instruct-ONNX';
        this.setStatus('generation-status', 'Standby (no WebGPU; SmolLM2 CPU WASM preselected)', 'loading');
      }
    } catch {}

    this.bindEvents();
  }

  private bindEvents() {
    document.getElementById('retrieve-btn')?.addEventListener('click', () => this.runPipeline(false));
    document.getElementById('generate-btn')?.addEventListener('click', () => this.runPipeline(true));
    document.getElementById('stop-btn')?.addEventListener('click', () => {
      this.genWorker?.postMessage({ type: 'stop' });
      this.log('Stop requested...');
    });
    document.getElementById('query-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.runPipeline(false);
    });
    document.querySelectorAll('.example-query').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-query') || '';
        (document.getElementById('query-input') as HTMLInputElement).value = q;
        this.runPipeline(false);
      });
    });
  }

  private retrieveLexicalCandidates(query: string, topN = 20): RetrievedHit[] {
    const rawTerms = query.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
    const terms = rawTerms.filter(t => !STOP_WORDS.has(t));
    const searchTerms = terms.length ? terms : rawTerms;

    const scores: RetrievedHit[] = [];
    for (const [word, entry] of Object.entries(this.lexicon)) {
      let s = 0;
      for (const t of searchTerms) {
        if (word === t) s += 100;
        else if (word.startsWith(t) && t.length >= 3) s += 25;
        else if ((entry.s || []).includes(t)) s += 35;
        else if ((entry.h || []).includes(t)) s += 15;
        for (const def of entry.d || []) {
          if (def.toLowerCase().includes(t)) s += 12;
        }
      }
      if (s > 0) scores.push({ word, entry, score: s, lexicalScore: s });
    }
    scores.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
    return scores.slice(0, topN);
  }

  private rerankWithMiniLM(query: string, hits: RetrievedHit[]): Promise<RetrievedHit[]> {
    if (!hits.length) return Promise.resolve(hits);
    if (!this.rerankWorker) {
      const blob = new Blob([rerankWorkerCode], { type: 'application/javascript' });
      this.rerankWorker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    }
    const reqId = ++this.rerankReq;
    const docs = hits.map(h => ({
      word: h.word,
      text: `${h.word}: ${(h.entry.d || []).join('; ')}. Synonyms: ${(h.entry.s || []).join(', ')}`
    }));

    return new Promise((resolve) => {
      const onMsg = (e: MessageEvent) => {
        const { type, data } = e.data;
        if (type === 'status') {
          this.setStatus('embedding-status', data, 'loading');
        } else if (type === 'reranked' && data.reqId === reqId) {
          this.rerankWorker?.removeEventListener('message', onMsg);
          this.setStatus('embedding-status', 'Ready (all-MiniLM-L6-v2 WASM)', 'ready');
          const updated = hits.map(h => {
            const neural = typeof data.scores[h.word] === 'number' ? data.scores[h.word] : 0;
            const exactBonus = h.lexicalScore >= 100 ? 0.35 : 0;
            return { ...h, score: Math.min(1, neural + exactBonus) };
          });
          updated.sort((a, b) => b.score - a.score);
          resolve(updated);
        } else if (type === 'error') {
          this.rerankWorker?.removeEventListener('message', onMsg);
          this.setStatus('embedding-status', 'Lexical fallback (reranker offline)', 'loading');
          resolve(hits);
        }
      };
      this.rerankWorker!.addEventListener('message', onMsg);
      this.rerankWorker!.postMessage({ type: 'rerank', data: { reqId, query, docs } });
    });
  }

  private renderRetrieved(hits: RetrievedHit[]) {
    const container = document.getElementById('retrieved-words')!;
    container.innerHTML = '';
    for (const h of hits) {
      const card = document.createElement('div');
      card.className = 'ctx-card';
      const pct = h.score <= 1 ? `${(h.score * 100).toFixed(1)}%` : `score ${Math.round(h.score)}`;
      card.innerHTML = `
        <div class="ctx-head">
          <span>${h.word}</span>
          <span class="sim-badge">${pct}</span>
        </div>
        <div style="color:#334155; margin-bottom:4px;">${(h.entry.d || []).join(' | ')}</div>
        ${h.entry.s?.length ? `<div style="color:#64748b; font-size:11px;"><strong>Synonyms:</strong> ${h.entry.s.slice(0, 5).join(', ')}</div>` : ''}
      `;
      container.appendChild(card);
    }
  }

  private async runPipeline(withGeneration: boolean) {
    const query = (document.getElementById('query-input') as HTMLInputElement).value.trim();
    if (!query || !Object.keys(this.lexicon).length) return;

    const resultsPanel = document.getElementById('results-panel')!;
    const metricsPanel = document.getElementById('metrics-panel')!;
    const generatedText = document.getElementById('generated-text')!;
    resultsPanel.style.display = 'block';

    const t0 = performance.now();
    const lexicalHits = this.retrieveLexicalCandidates(query, 18);
    this.renderRetrieved(lexicalHits.slice(0, 5));
    this.log(`Lexical recall found ${lexicalHits.length} WordNet candidates for "${query}".`);

    const reranked = await this.rerankWithMiniLM(query, lexicalHits);
    const topHits = reranked.slice(0, 5);
    const retrievalMs = performance.now() - t0;
    this.renderRetrieved(topHits);

    document.getElementById('retrieval-time')!.textContent = retrievalMs.toFixed(0);
    document.getElementById('context-words')!.textContent = String(topHits.length);
    document.getElementById('total-time')!.textContent = retrievalMs.toFixed(0);
    metricsPanel.style.display = 'grid';

    if (!withGeneration) {
      generatedText.textContent = 'WordNet context retrieved above. Click "Retrieve + Generate Answer" to run local browser LLM synthesis.';
      document.getElementById('generation-time')!.textContent = '-';
      return;
    }

    const modelId = (document.getElementById('gen-model-select') as HTMLSelectElement).value;
    const isGemma = modelId.toLowerCase().includes('gemma');
    const ctxEntries = topHits.slice(0, isGemma ? 3 : 4);
    const contextBlock = ctxEntries.map((h) => {
      const defs = (h.entry.d || []).slice(0, 2).join('; ');
      const syns = h.entry.s?.length ? ` Synonyms: ${h.entry.s.slice(0, 4).join(', ')}.` : '';
      return `- ${h.word}: ${defs}.${syns}`;
    }).join('\n').slice(0, isGemma ? 500 : 900);
    const userPrompt = `Dictionary entries from WordNet 3.1:\n${contextBlock}\n\nQuestion: ${query}\nWrite 1-2 clear sentences answering the question using the definitions and synonyms above:`;
    if (!this.genWorker) {
      const blob = new Blob([genWorkerCode], { type: 'application/javascript' });
      this.genWorker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    }

    const genBtn = document.getElementById('generate-btn') as HTMLButtonElement;
    const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
    genBtn.disabled = true;
    stopBtn.style.display = 'inline-block';
    generatedText.textContent = 'Generating answer...';
    const tGen0 = performance.now();

    this.genWorker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'gen_status') {
        this.setStatus('generation-status', data, 'loading');
      } else if (type === 'gen_ready') {
        this.setStatus('generation-status', `Ready (${data})`, 'ready');
        this.log(`Generation model ready: ${data}`);
        generatedText.textContent = '';
      } else if (type === 'token') {
        if (generatedText.textContent === 'Generating answer...') generatedText.textContent = '';
        generatedText.textContent += data;
      } else if (type === 'complete') {
        const genMs = performance.now() - tGen0;
        if ((!generatedText.textContent?.trim() || generatedText.textContent === 'Generating answer...') && data.text) {
          generatedText.textContent = data.text;
        }
        document.getElementById('generation-time')!.textContent = genMs.toFixed(0);
        document.getElementById('total-time')!.textContent = (retrievalMs + genMs).toFixed(0);
        genBtn.disabled = false;
        stopBtn.style.display = 'none';
        this.log(`Generation ${data.interrupted ? 'stopped' : 'completed'} in ${genMs.toFixed(0)}ms.`);
      } else if (type === 'error') {
        this.setStatus('generation-status', `Error: ${data}`, 'error');
        generatedText.textContent = `Generation error: ${data}`;
        genBtn.disabled = false;
        stopBtn.style.display = 'none';
        this.log(`Generation error: ${data}`);
      }
    };

    this.genWorker.postMessage({ type: 'generate', data: { modelId, userPrompt } });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new RagPipelineApp();
});
