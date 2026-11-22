// Browser ES Module Blob Worker for token-level + sentence-level embeddings (@huggingface/transformers@4.3.2)

export type MuveraModelId =
  | 'Xenova/all-MiniLM-L6-v2'
  | 'onnx-community/embeddinggemma-300m-ONNX'
  | 'deterministic';

const WORKER_SOURCE = `
import { AutoModel, AutoTokenizer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let activeModelId = null;
let activeBackend = null;
let tokenizer = null;
let model = null;

const cleanAlpha = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function l2Normalize(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  const n = Math.sqrt(s);
  const out = new Array(arr.length);
  if (n > 1e-12) {
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] / n;
  } else if (arr.length) {
    out[0] = 1;
    for (let i = 1; i < arr.length; i++) out[i] = 0;
  }
  return out;
}

async function ensureModel(modelId) {
  if (activeModelId === modelId && model && tokenizer) return activeBackend;
  const fileProgress = new Map();
  const progressCb = (p) => {
    if (!p || !p.file) return;
    if (p.status === 'progress') fileProgress.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
    else if (p.status === 'done') {
      const prev = fileProgress.get(p.file);
      if (prev && prev.total) fileProgress.set(p.file, { loaded: prev.total, total: prev.total });
    } else return;
    let loaded = 0, total = 0;
    for (const v of fileProgress.values()) { loaded += v.loaded; total += v.total; }
    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    self.postMessage({ type: 'progress', data: { percent, file: p.file } });
  };

  tokenizer = await AutoTokenizer.from_pretrained(modelId);
  let backend = 'wasm';
  const isGemma = modelId.includes('embeddinggemma');
  if (isGemma) {
    try {
      if ('gpu' in navigator && await navigator.gpu.requestAdapter()) backend = 'webgpu';
    } catch {}
  }

  const opts = { device: backend, progress_callback: progressCb };
  if (isGemma) {
    opts.dtype = 'q4';
    if (backend === 'webgpu') opts.model_file_name = 'model_no_gather';
  } else {
    opts.dtype = 'q8';
  }

  try {
    model = await AutoModel.from_pretrained(modelId, opts);
  } catch (err) {
    if (backend === 'webgpu') {
      backend = 'wasm';
      model = await AutoModel.from_pretrained(modelId, { device: 'wasm', dtype: 'q8', progress_callback: progressCb });
    } else {
      throw err;
    }
  }
  activeModelId = modelId;
  activeBackend = backend;
  return backend;
}

function alignWords(words, decoded) {
  const cleanTokens = decoded.map(cleanAlpha);
  const targets = words.map(cleanAlpha);
  let ti = 0;
  const spans = [];
  for (let wi = 0; wi < targets.length; wi++) {
    const target = targets[wi];
    if (!target) {
      spans.push([]);
      continue;
    }
    while (ti < cleanTokens.length && !cleanTokens[ti]) ti++;
    let built = '';
    const indices = [];
    while (ti < cleanTokens.length && built.length < target.length) {
      if (cleanTokens[ti]) {
        built += cleanTokens[ti];
        indices.push(ti);
      }
      ti++;
    }
    spans.push(indices);
  }
  return spans;
}

async function encodeItem(text, role, modelId) {
  const rawWords = String(text || '').trim().split(/\\s+/).map(w => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9'-]+$/g, '')).filter(Boolean);
  const words = rawWords.length ? rawWords : ['text'];
  const isGemma = modelId.includes('embeddinggemma');
  const prefixed = isGemma
    ? (role === 'query' ? 'task: search result | query: ' + text : 'title: none | text: ' + text)
    : text;

  const inputs = tokenizer(prefixed, { padding: false, truncation: true, max_length: 256 });
  const outputs = await model(inputs);

  const hidden = outputs.last_hidden_state;
  const [, seqLen, dim] = hidden.dims.map(Number);
  const rawHidden = hidden.data;

  // Sentence vector: use model sentence_embedding if available, otherwise mean-pool all tokens
  let sentenceVec;
  if (outputs.sentence_embedding) {
    sentenceVec = l2Normalize(Array.from(outputs.sentence_embedding.data, Number));
  } else {
    const acc = new Float64Array(dim);
    for (let s = 0; s < seqLen; s++) {
      const base = s * dim;
      for (let d = 0; d < dim; d++) acc[d] += Number(rawHidden[base + d]);
    }
    sentenceVec = l2Normalize(Array.from(acc, v => v / Math.max(1, seqLen)));
  }

  // Word token vectors from raw text alignment
  const plainInputs = tokenizer(words.join(' '), { padding: false, truncation: true, max_length: 192 });
  const plainOutputs = prefixed === words.join(' ') ? outputs : await model(plainInputs);
  const pHidden = plainOutputs.last_hidden_state;
  const [, , pDim] = pHidden.dims.map(Number);
  const pData = pHidden.data;
  const ids = Array.from(plainInputs.input_ids.data, Number);
  const decoded = ids.map(id => tokenizer.decode([id], { skip_special_tokens: true }));
  const spans = alignWords(words, decoded);

  const tokenVectors = [];
  for (let wi = 0; wi < words.length; wi++) {
    const idxList = spans[wi];
    if (idxList && idxList.length) {
      const vec = new Float64Array(pDim);
      for (const idx of idxList) {
        const base = idx * pDim;
        for (let d = 0; d < pDim; d++) vec[d] += Number(pData[base + d]);
      }
      tokenVectors.push(l2Normalize(Array.from(vec, v => v / idxList.length)));
    } else {
      tokenVectors.push(sentenceVec);
    }
  }

  return { words, tokenVectors, sentenceVector: sentenceVec, dimension: pDim };
}

self.addEventListener('message', async (e) => {
  const { type, data } = e.data;
  try {
    if (type === 'encode_pair') {
      const backend = await ensureModel(data.modelId);
      const q = await encodeItem(data.queryText, 'query', data.modelId);
      const d = await encodeItem(data.docText, 'document', data.modelId);
      self.postMessage({ type: 'pair_encoded', data: { requestId: data.requestId, backend, modelId: data.modelId, query: q, doc: d } });
    } else if (type === 'encode_collection') {
      const backend = await ensureModel(data.modelId);
      const query = await encodeItem(data.queryText, 'query', data.modelId);
      const docs = [];
      for (let i = 0; i < data.docs.length; i++) {
        docs.push(await encodeItem(data.docs[i], 'document', data.modelId));
        self.postMessage({ type: 'collection_progress', data: { done: i + 1, total: data.docs.length } });
      }
      self.postMessage({ type: 'collection_encoded', data: { requestId: data.requestId, backend, modelId: data.modelId, query, docs } });
    }
  } catch (err) {
    self.postMessage({ type: 'error', data: { requestId: data?.requestId, message: (err && err.message) || String(err) } });
  }
});
`;

export function createMuveraWorker(): Worker {
  const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob), { type: 'module' });
}
