/**
 * Wordy Minimal Explorer (WordNet 3.1 + D3 v7 Lexical Graph + Opt-In Neural Reranker / Dense Worker)
 */
const { createApp } = Vue;

const rerankerWorkerCode = `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let extractor = null;

function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom > 0 ? dot / denom : 0;
}

self.addEventListener('message', async (e) => {
    const { type, data } = e.data;
    if (type === 'init') {
        try {
            const fileProgress = new Map();
            extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
                device: 'wasm',
                dtype: 'q8',
                progress_callback: (p) => {
                    if (!p || !p.file) return;
                    if (p.status === 'progress') fileProgress.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
                    else if (p.status === 'done') {
                        const prev = fileProgress.get(p.file);
                        if (prev && prev.total) fileProgress.set(p.file, { loaded: prev.total, total: prev.total });
                    } else return;
                    let loaded = 0, total = 0;
                    for (const v of fileProgress.values()) { loaded += v.loaded; total += v.total; }
                    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
                    self.postMessage({ type: 'progress', data: { percent } });
                }
            });
            self.postMessage({ type: 'ready' });
        } catch (err) {
            self.postMessage({ type: 'error', data: (err && err.message) || String(err) });
        }
    } else if (type === 'score') {
        if (!extractor) return;
        const { requestId, anchorText, candidates } = data;
        if (!candidates.length) {
            self.postMessage({ type: 'scored', data: { requestId, scores: {} } });
            return;
        }
        try {
            const inputs = [anchorText, ...candidates.map(c => c.text)];
            const out = await extractor(inputs, { pooling: 'mean', normalize: true });
            const [n, dim] = out.dims.map(Number);
            const raw = out.data;
            const qVec = raw.slice(0, dim);
            const scores = {};
            for (let i = 1; i < n; i++) {
                scores[candidates[i - 1].word] = cosine(qVec, raw.subarray(i * dim, (i + 1) * dim));
            }
            self.postMessage({ type: 'scored', data: { requestId, scores } });
        } catch (err) {
            self.postMessage({ type: 'error', data: (err && err.message) || String(err) });
        }
    }
});
`;

const denseSearchWorkerCode = `
let corpusWords = null;
let corpusEmbeddings = null;
const DIM = 768;

self.addEventListener('message', (e) => {
    const { type, data } = e.data;
    if (type === 'set_corpus') {
        corpusWords = data.words;
        corpusEmbeddings = data.embeddings;
        self.postMessage({ type: 'corpus_ready', data: { count: corpusWords.length } });
    } else if (type === 'search') {
        if (!corpusWords || !corpusEmbeddings) return;
        const idx = corpusWords.indexOf(data.word);
        if (idx === -1) {
            self.postMessage({ type: 'dense_results', data: { word: data.word, results: [] } });
            return;
        }
        const qBase = idx * DIM;
        let qNorm = 0;
        for (let d = 0; d < DIM; d++) {
            const v = corpusEmbeddings[qBase + d];
            qNorm += v * v;
        }
        qNorm = Math.sqrt(qNorm) || 1;

        const topK = [];
        const total = corpusWords.length;
        for (let i = 0; i < total; i++) {
            if (i === idx) continue;
            const cBase = i * DIM;
            let dot = 0, cNorm = 0;
            for (let d = 0; d < DIM; d++) {
                const cv = corpusEmbeddings[cBase + d];
                dot += corpusEmbeddings[qBase + d] * cv;
                cNorm += cv * cv;
            }
            const sim = dot / (qNorm * (Math.sqrt(cNorm) || 1));
            if (topK.length < 8 || sim > topK[topK.length - 1].similarity) {
                topK.push({ word: corpusWords[i], similarity: sim });
                topK.sort((a, b) => b.similarity - a.similarity);
                if (topK.length > 8) topK.pop();
            }
        }
        self.postMessage({ type: 'dense_results', data: { word: data.word, results: topK } });
    }
});
`;

createApp({
    data() {
        return {
            inputText: '',
            words: [],
            selectedIdx: null,
            lexicon: null,
            lexiconStatus: 'Loading WordNet 3.1...',
            sampleSentences: [
                'The ephemeral ocean sunrise',
                'Serendipity reveals quintessential patterns',
                'Fast neural graph intelligence'
            ],
            rerankerWorker: null,
            rerankerBusy: false,
            rerankerReady: false,
            rerankerProgressText: 'Loading...',
            rerankScores: {},
            rerankSeq: 0,
            denseWorker: null,
            denseBusy: false,
            denseReady: false,
            denseProgressText: 'Downloading...',
            denseNeighbors: [],
            copySuccess: false,
            speechSupported: false,
            isRecording: false,
            recognition: null
        };
    },

    computed: {
        activeWord() {
            if (this.selectedIdx === null || !this.words[this.selectedIdx]) return null;
            return this.words[this.selectedIdx];
        },

        rankedAlternatives() {
            const active = this.activeWord;
            if (!active || !active.entry) {
                return { synonyms: [], broader: [], narrower: [], antonyms: [] };
            }
            const scoreFor = (w) => (typeof this.rerankScores[w] === 'number' ? this.rerankScores[w] : null);
            const mapList = (arr) => {
                const items = (arr || []).map(w => ({ word: w, score: scoreFor(w) }));
                if (this.rerankerReady) {
                    items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
                }
                return items;
            };
            return {
                synonyms: mapList(active.entry.s),
                broader: mapList(active.entry.h),
                narrower: mapList(active.entry.y),
                antonyms: mapList(active.entry.a)
            };
        }
    },

    mounted() {
        this.loadLexicon();
        this.initSpeechRecognition();
        window.addEventListener('beforeunload', () => {
            if (this.rerankerWorker) this.rerankerWorker.terminate();
            if (this.denseWorker) this.denseWorker.terminate();
        });
    },

    methods: {
        async loadLexicon() {
            try {
                const res = await fetch('./wordnet-lexicon.json');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                this.lexicon = data.entries || {};
                this.lexiconStatus = `WordNet 3.1 Ready (${Object.keys(this.lexicon).length.toLocaleString()} lemmas)`;
            } catch (err) {
                console.error('Failed to load WordNet lexicon:', err);
                this.lexicon = {};
                this.lexiconStatus = 'WordNet Lexicon Offline';
            }
        },

        lookupWord(rawWord) {
            const clean = String(rawWord || '').toLowerCase().replace(/^[^a-z]+|[^a-z'-]+$/g, '');
            if (!clean) return null;
            const entry = (this.lexicon && this.lexicon[clean]) || null;
            return { word: clean, entry };
        },

        appendWordsFromText(text) {
            const tokens = String(text || '').split(/[\s,.;:!?()\[\]"]+/).filter(Boolean);
            let added = false;
            for (const tok of tokens) {
                const item = this.lookupWord(tok);
                if (!item) continue;
                if (!this.words.some(w => w.word === item.word)) {
                    this.words.push(item);
                    added = true;
                }
            }
            if (added && this.selectedIdx === null) {
                const firstKnown = this.words.findIndex(w => w.entry);
                if (firstKnown !== -1) this.selectWord(firstKnown);
            }
        },

        handleKeydown(e) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === ' ' || e.key === 'Enter' || /^[.,!?;:]$/.test(e.key)) {
                if (this.inputText.trim()) {
                    e.preventDefault();
                    this.commitInputText();
                }
            } else if (e.key === 'Backspace' && !this.inputText && this.words.length) {
                e.preventDefault();
                this.words.pop();
                if (this.selectedIdx !== null && this.selectedIdx >= this.words.length) {
                    this.selectedIdx = this.words.length ? this.words.length - 1 : null;
                }
                this.$nextTick(() => this.renderLexicalGraph());
            } else if (e.key === 'Escape') {
                this.clearAll();
            }
        },

        handlePaste(e) {
            const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
            if (!pasted.trim()) return;
            e.preventDefault();
            const combined = (this.inputText + ' ' + pasted).trim();
            this.inputText = '';
            this.appendWordsFromText(combined);
        },

        commitInputText() {
            if (!this.inputText.trim()) return;
            this.appendWordsFromText(this.inputText);
            this.inputText = '';
        },

        loadSample(sentence) {
            this.words = [];
            this.selectedIdx = null;
            this.inputText = '';
            this.appendWordsFromText(sentence);
        },

        selectWord(idx) {
            this.selectedIdx = idx;
            this.rerankScores = {};
            this.denseNeighbors = [];
            this.$nextTick(() => this.renderLexicalGraph());
            if (this.rerankerReady) this.runNeuralRerank();
            if (this.denseReady && this.words[idx]) {
                this.denseWorker.postMessage({ type: 'search', data: { word: this.words[idx].word } });
            }
        },

        replaceSelectedWord(newWord) {
            if (this.selectedIdx === null || !this.words[this.selectedIdx]) return;
            const updated = this.lookupWord(newWord);
            if (!updated) return;
            this.words.splice(this.selectedIdx, 1, updated);
            this.selectWord(this.selectedIdx);
        },

        renderLexicalGraph() {
            const svg = d3.select('#lexical-graph-svg');
            if (svg.empty()) return;
            svg.selectAll('*').remove();

            const active = this.activeWord;
            if (!active || !active.entry) return;

            const width = svg.node().clientWidth || 460;
            const height = 290;
            const cx = width / 2;
            const cy = height / 2;

            const neighbors = [];
            const addGroup = (arr, rel, color) => {
                (arr || []).slice(0, 4).forEach(w => {
                    if (!neighbors.some(n => n.word === w)) neighbors.push({ word: w, rel, color });
                });
            };
            addGroup(active.entry.s, 'Synonym', '#2563eb');
            addGroup(active.entry.h, 'Broader', '#059669');
            addGroup(active.entry.y, 'Narrower', '#7c3aed');
            addGroup(active.entry.a, 'Antonym', '#dc2626');

            const nodes = neighbors.slice(0, 12).map((n, idx, all) => {
                const angle = (idx / Math.max(1, all.length)) * Math.PI * 2 - Math.PI / 2;
                const rx = Math.min(cx - 56, 155);
                const ry = Math.min(cy - 34, 102);
                return { ...n, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
            });

            svg.selectAll('line.lex-edge')
                .data(nodes)
                .enter()
                .append('line')
                .attr('class', 'lex-edge')
                .attr('x1', cx)
                .attr('y1', cy)
                .attr('x2', d => d.x)
                .attr('y2', d => d.y)
                .attr('stroke', d => d.color)
                .attr('stroke-opacity', 0.45)
                .attr('stroke-width', 1.6);

            const centerG = svg.append('g').attr('transform', `translate(${cx}, ${cy})`);
            const centerW = Math.max(70, active.word.length * 9 + 22);
            centerG.append('rect')
                .attr('x', -centerW / 2)
                .attr('y', -16)
                .attr('width', centerW)
                .attr('height', 32)
                .attr('rx', 16)
                .attr('fill', '#e9411b');
            centerG.append('text')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('fill', '#ffffff')
                .style('font-size', '13px')
                .style('font-weight', '700')
                .text(active.word);

            const nGroups = svg.selectAll('g.lex-node')
                .data(nodes)
                .enter()
                .append('g')
                .attr('class', 'lex-node')
                .attr('transform', d => `translate(${d.x}, ${d.y})`)
                .style('cursor', 'pointer')
                .on('click', (_, d) => this.replaceSelectedWord(d.word));

            nGroups.append('rect')
                .attr('x', d => -Math.max(54, d.word.length * 7.5 + 18) / 2)
                .attr('y', -13)
                .attr('width', d => Math.max(54, d.word.length * 7.5 + 18))
                .attr('height', 26)
                .attr('rx', 13)
                .attr('fill', '#ffffff')
                .attr('stroke', d => d.color)
                .attr('stroke-width', 1.5);

            nGroups.append('text')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('fill', '#0f172a')
                .style('font-size', '11.5px')
                .style('font-weight', '600')
                .text(d => d.word);
        },

        enableNeuralReranker() {
            if (this.rerankerReady || this.rerankerBusy) return;
            this.rerankerBusy = true;
            this.rerankerProgressText = 'Initializing MiniLM...';
            const blob = new Blob([rerankerWorkerCode], { type: 'application/javascript' });
            this.rerankerWorker = new Worker(URL.createObjectURL(blob), { type: 'module' });
            this.rerankerWorker.onmessage = (e) => {
                const { type, data } = e.data;
                if (type === 'progress') {
                    this.rerankerProgressText = `MiniLM (${data.percent}%)`;
                } else if (type === 'ready') {
                    this.rerankerBusy = false;
                    this.rerankerReady = true;
                    this.runNeuralRerank();
                } else if (type === 'scored') {
                    if (data.requestId === this.rerankSeq) {
                        this.rerankScores = data.scores || {};
                    }
                } else if (type === 'error') {
                    this.rerankerBusy = false;
                    this.rerankerProgressText = 'Reranker unavailable';
                }
            };
            this.rerankerWorker.postMessage({ type: 'init' });
        },

        runNeuralRerank() {
            if (!this.rerankerReady || !this.rerankerWorker || !this.activeWord?.entry) return;
            const entry = this.activeWord.entry;
            const sentence = this.words.map(w => w.word).join(' ');
            const anchorText = `${this.activeWord.word} in "${sentence}": ${(entry.d || []).join('; ')}`;
            const allCands = Array.from(new Set([...(entry.s || []), ...(entry.h || []), ...(entry.y || []), ...(entry.a || [])]));
            const candidates = allCands.map(w => {
                const ce = this.lexicon?.[w];
                return { word: w, text: ce?.d?.length ? `${w}: ${ce.d[0]}` : w };
            });
            this.rerankSeq++;
            this.rerankerWorker.postMessage({
                type: 'score',
                data: { requestId: this.rerankSeq, anchorText, candidates }
            });
        },

        async loadOptionalDenseCorpus() {
            if (this.denseReady || this.denseBusy || !window.corpusPreloader) return;
            this.denseBusy = true;
            this.denseProgressText = 'Starting download...';
            try {
                await window.corpusPreloader.startDownload((p) => {
                    this.denseProgressText = `Downloading corpus (${p.percent}%)`;
                });
                const corpus = await window.corpusPreloader.getCorpus();
                if (!corpus) throw new Error('Corpus unavailable');
                const blob = new Blob([denseSearchWorkerCode], { type: 'application/javascript' });
                this.denseWorker = new Worker(URL.createObjectURL(blob));
                this.denseWorker.onmessage = (e) => {
                    const { type, data } = e.data;
                    if (type === 'corpus_ready') {
                        this.denseBusy = false;
                        this.denseReady = true;
                        if (this.activeWord) {
                            this.denseWorker.postMessage({ type: 'search', data: { word: this.activeWord.word } });
                        }
                    } else if (type === 'dense_results') {
                        if (this.activeWord && data.word === this.activeWord.word) {
                            this.denseNeighbors = data.results || [];
                        }
                    }
                };
                this.denseWorker.postMessage({
                    type: 'set_corpus',
                    data: { words: corpus.words, embeddings: corpus.embeddings }
                });
            } catch (err) {
                this.denseBusy = false;
                this.denseProgressText = 'Corpus unavailable (using WordNet 3.1)';
                console.warn('Optional 147K corpus error:', err);
            }
        },

        copyText() {
            const text = this.words.map(w => w.word).join(' ');
            if (!text) return;
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    this.copySuccess = true;
                    setTimeout(() => { this.copySuccess = false; }, 1800);
                }).catch(() => {});
            }
        },

        clearAll() {
            this.inputText = '';
            this.words = [];
            this.selectedIdx = null;
            this.rerankScores = {};
            this.denseNeighbors = [];
            document.getElementById('text-input')?.focus();
        },

        initSpeechRecognition() {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) {
                this.speechSupported = false;
                return;
            }
            this.speechSupported = true;
            this.recognition = new SR();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            this.recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        this.appendWordsFromText(event.results[i][0].transcript);
                    }
                }
            };
            this.recognition.onend = () => { this.isRecording = false; };
            this.recognition.onerror = () => { this.isRecording = false; };
        },

        toggleRecording() {
            if (!this.speechSupported || !this.recognition) return;
            if (this.isRecording) {
                this.recognition.stop();
                this.isRecording = false;
            } else {
                this.recognition.start();
                this.isRecording = true;
            }
        }
    }
}).mount('#app');
