# Wordy — WordNet 3.1 Lexical Graph, MUVERA FDE & Hybrid RAG

## 🌐 [Live Demo](https://1kaiser.github.io/wordy/)

Interactive client-side lexical explorer, multi-vector retrieval visualizer (**MUVERA**), and standalone **WordNet 3.1 Hybrid RAG** pipeline running in the browser with **Transformers.js v4.3.2**, **WebGPU / WASM**, **Vue 3**, and **D3.js v7**.

![Wordy Demo](wordy-demo.gif)

## 🎯 Three Integrated Experiences

1. **Minimal WordNet 3.1 Explorer ([`index.html`](index.html))**:
   - Instant startup (~6 MB compact Princeton WordNet 3.1 lexicon covering 24,000 ranked lemmas — zero mandatory 455 MB download on load).
   - Interactive word boxing (`Ctrl+V` paste, Enter, Space), sense definitions, categorized **Synonyms**, **Broader (Hypernyms)**, **Narrower (Hyponyms)**, and **Antonyms**, plus a **D3.js v7 Lexical Neighborhood Graph** with 1-click word replacement.
   - Optional Web Worker **all-MiniLM-L6-v2** (~23 MB WASM) semantic reranker and optional zero-copy **147K Dense Corpus** worker search (IndexedDB cached on opt-in).
2. **MUVERA FDE Visualizer ([`muvera.html`](muvera.html))**:
   - Exact shared-hyperplane Gray-code SimHash implementation following *Jayaram et al. (2024)* (`arXiv:2405.19504`): identical seeded Gaussian projections $\mathbf{G}^{(r)}$ across Query (**SUM**) and Document (**AVERAGE** + nearest Gray-code empty-bucket fill).
   - Live **all-MiniLM-L6-v2** / **EmbeddingGemma-300M** contextual token point clouds in Web Worker, 2D joint PCA + shared halfspace plots, partition bar charts, FDE block heatmaps, and Exact Chamfer vs. MUVERA FDE vs. Single-Vector Cosine collection benchmark.
3. **Standalone Hybrid RAG Pipeline ([`rag-demo.html`](rag-demo.html))**:
   - Works standalone or inside the slide-over panel without blocking on parent iframes.
   - Stage 1 lexical WordNet 3.1 recall → Stage 2 **all-MiniLM-L6-v2** Web Worker semantic reranking → streaming browser LLM synthesis (**Gemma 3 270M IT**, **Liquid LFM 2.5 350M**, or CPU WASM-capable **SmolLM2 360M Instruct**) with `InterruptableStoppingCriteria` Stop control and `env.useBrowserCache = true`.

## 🚀 Quick Start & Build

```bash
npm install
npm run build      # Generates WordNet lexicon + TypeScript check + Vite bundle in dist/
npm run preview    # Local preview
```

## 📚 References & Citations

1. **WordNet 3.1:** Miller, G. A. (1995). *WordNet: A Lexical Database for English*, *CACM* 38(11):39–41; Fellbaum, C. (1998). *WordNet: An Electronic Lexical Database*, MIT Press ([wordnet.princeton.edu](https://wordnet.princeton.edu/)).
2. **MUVERA Multi-Vector Retrieval:** Jayaram, R., Dhulipala, L., Hadian, M., Lee, J., & Mirrokni, V. (2024). *MUVERA: Making Multi-Vector Retrieval as Fast as Single-Vector Search* ([arXiv:2405.19504](https://arxiv.org/abs/2405.19504)).
3. **Models & Inference:** [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), Google **Gemma 3 270M** ([arXiv:2503.19786](https://arxiv.org/abs/2503.19786)), Liquid [LFM 2.5](https://huggingface.co/onnx-community/LFM2.5-350M-ONNX), [SmolLM2-360M](https://huggingface.co/onnx-community/SmolLM2-360M-Instruct-ONNX), [EmbeddingGemma-300M](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX), [Transformers.js 4.3.2](https://huggingface.co/docs/transformers.js), [Vue 3](https://vuejs.org/), and [D3.js v7](https://d3js.org/).
4. **Portfolio Home:** [1kaiser.github.io](https://1kaiser.github.io/) &middot; Source: [1kaiser/wordy](https://github.com/1kaiser/wordy)
