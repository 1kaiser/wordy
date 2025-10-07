# Wordy - Browser-Based Semantic AI Platform

## 🌐 [Live Demo](https://1kaiser.github.io/wordy/)

**Wordy** is a complete browser-based semantic AI platform that combines three powerful features:

1. **🔄 MuVeRa** - Multi-Vector Retrieval with Google Research's FDE algorithm
2. **🌐 WordNet** - Interactive word replacement with semantic search
3. **🤖 RAG Pipeline** - Complete Retrieval-Augmented Generation with Gemma-3-270M

All running 100% locally in your browser with zero API costs.

## 🎬 Demo

![Wordy Demo](wordy-demo.gif)

*Quick demo showing: Main interface → Text input → MuVeRa panel → RAG panel → ESC to close*

---

## 🎯 Features

### 1. MuVeRa - Multi-Vector Retrieval 🔄

Production-ready implementation of Google Research's **MuVeRa: Making Multi-Vector Retrieval as Fast as Single-Vector Search**.

**Key Features:**
- ✅ Fixed Dimensional Encoding (FDE) algorithm
- ✅ EmbeddingGemma 768D semantic embeddings
- ✅ Side-by-side query/document visualization with D3.js
- ✅ 90% latency reduction vs traditional multi-vector retrieval
- ✅ Real-time mathematical transparency (collapsible calculations)
- ✅ Document upload & semantic similarity search

**Performance:**
- Model Loading: 43s (EmbeddingGemma 300M ONNX)
- Embedding Generation: ~994ms per text (768D vectors)
- Memory Usage: <200MB RAM
- Device Support: WebGPU/WASM auto-detection

### 2. WordNet 3D Visualization 🌐

Interactive 3D scatter plot of **~158,000 words** from WordNet 3.1 + Oxford Science Dictionary.

**Key Features:**
- ✅ 3D semantic space visualization with Scatter-GL
- ✅ UMAP dimensionality reduction (768D → 3D)
- ✅ Interactive semantic search & clustering
- ✅ 147,480 words with precomputed embeddings (433MB)
- ✅ Color-coded by part of speech
- ✅ Click-to-explore word neighborhoods

**Data Sources:**
- WordNet 3.1: 155,583 general English words
- Oxford Science Dictionary: ~2,500 scientific terms

### 3. RAG Pipeline 🤖

Complete Retrieval-Augmented Generation system with browser-native LLM.

**Key Features:**
- ✅ **Retrieval**: 147K word corpus with cosine similarity (~17ms)
- ✅ **Generation**: Gemma-3-270M-it model (browser-cached, ~70MB)
- ✅ **Modules**: Embedding, retrieval, generation, grammar, voice
- ✅ **Browser Caching**: IndexedDB persistence (offline-ready)
- ✅ **Task-Specific**: Optimized prompts for Q&A generation

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/1kaiser/wordy.git
cd wordy

# Install dependencies
npm install

# Start the development server
npm run dev

# Open http://localhost:3004 in your browser
```

**Requirements**: Modern browser with WebGPU/WASM support (Chrome/Edge recommended)

---

## 📁 Project Structure

```
wordy/
├── src/
│   ├── main.ts                         # MuVeRa application entry
│   ├── muvera/                         # MuVeRa modules
│   │   ├── fde-algorithm.ts
│   │   ├── production-embedding-gemma.ts
│   │   ├── embedding-gemma-vectorizer.ts
│   │   └── text-vectorizer.ts
│   ├── wordnet/                        # WordNet 3D modules
│   │   ├── semantic-search*.js
│   │   ├── visualization.js
│   │   └── wordnet-extractor/
│   ├── rag/                            # RAG pipeline modules
│   │   ├── embedding-model/
│   │   └── modules/
│   └── shared/                         # Shared utilities
├── public/
│   └── wordnet/                        # WordNet data
│       └── dict/                       # Dictionary files
├── index.html                          # MuVeRa interface
├── wordnet-3d.html                     # WordNet 3D interface
├── rag-panel.html                      # RAG pipeline interface
├── package.json                        # Merged dependencies
└── README.md                           # This file
```

---

## 🎨 Three Interfaces

### MuVeRa Interface (`index.html`)
- Side-by-side query vs document FDE animation
- Document upload for semantic analysis
- Live performance metrics & calculations

### WordNet 3D (`wordnet-3d.html`)
- Full 3D scatter plot with 158K words
- Interactive rotation, zoom, pan
- Semantic search with similarity highlighting

### RAG Pipeline (`rag-panel.html`)
- Query input with context retrieval
- Top-K word selection from corpus
- AI-generated responses with Gemma-3-270M

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "@huggingface/transformers": "^3.7.5",    // RAG + EmbeddingGemma
    "@xenova/transformers": "^2.17.2",        // WordNet embeddings
    "d3": "^7.9.0",                           // MuVeRa visualizations
    "scatter-gl": "^0.0.13",                  // WordNet 3D
    "three": "^0.106.2",                      // WordNet 3D
    "umap-js": "^1.3.3"                       // WordNet UMAP
  }
}
```

---

## 🧪 Build & Deploy

```bash
# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

---

## 🎓 Research Background

### MuVeRa (Multi-Vector Retrieval)
- **Paper**: "MUVERA: Multi-Vector Retrieval via Fixed Dimensional Encodings" ([arXiv:2405.19504](https://arxiv.org/abs/2405.19504))
- **Authors**: Rajesh Jayaram, Laxman Dhulipala (Google Research)
- **Innovation**: Transforms multi-vector sets into single vectors via randomized space partitioning
- **Results**: 90% latency reduction, 5-20x fewer candidate retrievals, 32x memory compression

### EmbeddingGemma
- **Model**: 308M parameter encoder from Google Gemma family
- **Embeddings**: 768D with Matryoshka Representation Learning (MRL)
- **Task Prefixes**: `search_query:` and `search_document:` for optimized retrieval
- **Multilingual**: 100+ languages, 2048 token context window

### WordNet 3.1
- **Source**: Princeton University linguistic database
- **License**: Princeton WordNet License (free for research & commercial use)
- **Citation**: George A. Miller (1995). WordNet: A Lexical Database for English. Communications of the ACM Vol. 38, No. 11: 39-41.

---

## 💡 Use Cases

### 1. Research & Education
- Explore semantic relationships in language
- Visualize word embeddings in 3D space
- Understand multi-vector retrieval algorithms

### 2. Semantic Search
- Find semantically similar words across 158K vocabulary
- Multi-faceted document retrieval with FDE
- Context-aware question answering with RAG

### 3. AI Development
- Prototype RAG systems with local LLMs
- Benchmark vector search algorithms
- Test embedding models in browser

---

## ⚙️ Browser Compatibility

| Browser | MuVeRa | WordNet 3D | RAG Pipeline |
|---------|--------|------------|--------------|
| Chrome/Edge | ✅ Full WebGPU | ✅ Full WebGL | ✅ Full Support |
| Firefox | ✅ WASM fallback | ✅ Full WebGL | ✅ Full Support |
| Safari | ⚠️ Limited WebGPU | ✅ Full WebGL | ✅ Full Support |

**Recommended**: Chrome/Edge for best performance with WebGPU acceleration.

---

## 📖 Documentation

- **CLAUDE.md**: Development documentation & integration details
- **docs/RESEARCH_FINDINGS.md**: MuVeRa research analysis
- **RAG-IMPLEMENTATION-STATUS.md**: RAG pipeline technical details (in wordnet data)

---

## 🤝 Contributing

Contributions welcome! Ideas:
- [ ] Unified landing page with three-panel toggle interface
- [ ] Slide-in UI for seamless feature switching
- [ ] Port WordNet JS to TypeScript
- [ ] Shared embedding manager singleton
- [ ] Cross-feature semantic search
- [ ] Export functionality for embeddings
- [ ] Additional embedding model support
- [ ] Performance benchmarking dashboard

---

## 📝 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- **Google Research** - MuVeRa algorithm & EmbeddingGemma model
- **Princeton University** - WordNet 3.1 linguistic database
- **PAIR (Google)** - Scatter-GL visualization library
- **Leland McInnes** - UMAP dimensionality reduction algorithm
- **Xenova** - Transformers.js browser AI library
- **Hugging Face** - Model hosting & transformers library

---

## 🎯 Performance Tips

### Faster Processing
- Use Chrome/Edge with WebGPU support
- Close other tabs during model loading
- Ensure 2GB+ RAM available
- Enable hardware acceleration in browser settings

### Reduce Wait Time
- Models are cached in IndexedDB after first load
- Pre-load models by visiting each interface
- Use WASM fallback if WebGPU unavailable

### Visualization Performance
- Reduce WordNet point count for slower devices
- Use 2D mode instead of 3D if laggy
- Disable auto-rotate in WordNet interface

---

**Built with ❤️ using 100% client-side AI technologies**

**No servers. No APIs. No costs. Just your browser.**
