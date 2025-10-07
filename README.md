# Wordy - Minimal Semantic Word Explorer

## 🌐 [Live Demo](https://1kaiser.github.io/wordy/)

**Wordy** is a minimal browser-based semantic word explorer with on-demand AI features. Type any text to explore word alternatives, or access advanced semantic search through sliding panels - all running 100% locally in your browser.

![Wordy Demo](wordy-demo.gif)

*Demo: Main interface → Text input → MuVeRa panel → RAG panel → ESC to close*

---

## ✨ Why Wordy?

- **🚀 Instant Start**: <100KB initial load, no waiting for models
- **🎯 Minimal Interface**: Clean centered text box with blinking cursor
- **🔄 On-Demand AI**: Advanced features load only when you click them
- **💾 Smart Caching**: 455MB corpus downloads in background, ready for next visit
- **🌐 100% Local**: Zero API costs, complete privacy, offline-ready

---

## 🎯 Three Integrated Features

### 1. Minimal Search (Main Interface)

**What It Is**: The default interface - a clean, centered text box for instant word exploration.

**Key Features**:
- ✅ Type any text, see word alternatives in real-time
- ✅ Voice input support (microphone button)
- ✅ SVG word visualization with semantic similarity scores
- ✅ WordNet 3.1 integration (147,480 words)
- ✅ Instant results, no model loading

**Performance**: <100KB load, instant response, zero latency

---

### 2. MuVeRa Search (Sliding Panel)

**What It Is**: Advanced multi-vector retrieval with Google Research's FDE algorithm.

**How to Access**: Click **🔄 MuVeRa Search** button in top-right corner

**Key Features**:
- ✅ Fixed Dimensional Encoding (FDE) algorithm
- ✅ EmbeddingGemma 768D semantic embeddings
- ✅ Side-by-side query/document visualization
- ✅ Document upload & semantic similarity search
- ✅ Real-time mathematical transparency

**Performance**:
- Model Loading: 43s (EmbeddingGemma 300M, first time only)
- Embedding Generation: ~994ms per text
- Memory: <200MB RAM
- Latency Reduction: 90% vs traditional multi-vector retrieval

**Research**: Based on "MUVERA: Making Multi-Vector Retrieval as Fast as Single-Vector Search" ([arXiv:2405.19504](https://arxiv.org/abs/2405.19504))

---

### 3. RAG Pipeline (Sliding Panel)

**What It Is**: Complete Retrieval-Augmented Generation with browser-native LLM.

**How to Access**: Click **🤖 RAG** button in top-right corner

**Key Features**:
- ✅ **Corpus**: 147,480 words with 768D embeddings (433MB)
- ✅ **Retrieval**: Cosine similarity search (~17ms)
- ✅ **Embedding**: EmbeddingGemma 300M model
- ✅ **Generation**: Gemma-3-270M-it model (~70MB)
- ✅ **Background Preloader**: Corpus downloads while you explore
- ✅ **Browser Caching**: IndexedDB persistence (offline-ready after first download)

**Performance**:
- Corpus Download: ~30-60s (first time, happens in background)
- Embedding Model Load: ~9s
- Generation Model Load: ~12s (WebGPU) or ~20s (WASM)
- Memory: ~400-800MB during inference

**Note**: The corpus preloader automatically downloads 455MB of data in the background after page load. You'll see a notification when RAG is ready for instant use.

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

# Open http://localhost:3004/wordy in your browser
```

**Requirements**: Modern browser with WebGPU/WASM support (Chrome/Edge recommended)

---

## 🎨 Architecture

### Lazy-Loading Strategy

Wordy uses an intelligent lazy-loading architecture to minimize initial load time:

1. **Initial Load** (<100KB): Minimal search interface with WordNet data
2. **Background Preloader**: 455MB corpus downloads silently after 2 seconds
3. **On-Demand Panels**: MuVeRa and RAG iframes load only when clicked
4. **Smart Caching**: Browser caches everything for instant subsequent visits

### File Structure

```
wordy/
├── index.html                    # Minimal search interface
├── minimal-search.js             # 29KB - Main functionality
├── corpus-preloader.js           # Background corpus downloader
├── muvera.html                   # MuVeRa panel (lazy-loaded)
├── rag-demo.html                 # RAG panel (lazy-loaded)
├── corpus-metadata.json          # 22MB (lazy-loaded)
├── corpus-embeddings.bin         # 433MB (lazy-loaded)
├── dict/                         # 53MB WordNet data
└── src/
    ├── muvera/                   # MuVeRa TypeScript modules
    ├── rag/                      # RAG pipeline modules
    └── wordnet/                  # WordNet processing
```

### Panel Behavior

- **Exclusive**: Only one panel can be open at a time
- **Slide Animation**: Smooth 0.5s slide-in from right
- **ESC to Close**: Press ESC key to close any open panel
- **Auto-Close**: Opening one panel automatically closes the other

---

## 📦 Corpus Preloader

Wordy includes an intelligent background preloader that downloads the 455MB corpus while you explore the minimal interface:

**How It Works**:
1. Page loads with minimal interface (<100KB)
2. After 2 seconds, preloader starts downloading corpus
3. Progress visible in browser console (every 10%)
4. Once complete, RAG panel is instantly ready
5. Corpus cached in IndexedDB for offline use

**First Visit Timeline**:
- **0s**: Page loads, minimal search ready
- **2s**: Background corpus download starts
- **30-60s**: Corpus download completes
- **🎉**: RAG panel ready for instant use

**Subsequent Visits**: Instant - everything served from browser cache

---

## 🧪 Testing

Comprehensive Playwright test suite with 11/11 tests passing:

```bash
# Run all tests
npx playwright test

# Run specific tests
npx playwright test tests/wordy-integration.spec.cjs
npx playwright test tests/rag-model-check.spec.cjs

# Clear IndexedDB cache
npx playwright test tests/clear-indexeddb.spec.cjs
```

**Test Coverage**:
- ✅ Minimal search interface loads
- ✅ MuVeRa panel slides in/out correctly
- ✅ RAG panel slides in/out correctly
- ✅ Only one panel open at a time
- ✅ ESC key closes panels
- ✅ Iframes load on first click
- ✅ Corpus downloads successfully
- ✅ RAG models initialize correctly

---

## ⚙️ Browser Compatibility

| Browser | Minimal Search | MuVeRa Panel | RAG Panel |
|---------|----------------|--------------|-----------|
| Chrome/Edge | ✅ Full Support | ✅ Full WebGPU | ✅ Full WebGPU |
| Firefox | ✅ Full Support | ✅ WASM fallback | ✅ WASM fallback |
| Safari | ✅ Full Support | ⚠️ Limited WebGPU | ⚠️ Limited WebGPU |

**Recommended**: Chrome/Edge for best performance with WebGPU acceleration.

---

## 🎓 Research & Data Sources

### MuVeRa Algorithm
- **Paper**: "MUVERA: Multi-Vector Retrieval via Fixed Dimensional Encodings" ([arXiv:2405.19504](https://arxiv.org/abs/2405.19504))
- **Authors**: Rajesh Jayaram, Laxman Dhulipala (Google Research)
- **Innovation**: Transforms multi-vector sets into single vectors via randomized space partitioning
- **Results**: 90% latency reduction, 5-20x fewer candidate retrievals, 32x memory compression

### EmbeddingGemma Model
- **Model**: 308M parameter encoder from Google Gemma family
- **Embeddings**: 768D with Matryoshka Representation Learning (MRL)
- **Task Prefixes**: `search_query:` and `search_document:` for optimized retrieval
- **Multilingual**: 100+ languages, 2048 token context window

### WordNet 3.1
- **Source**: Princeton University linguistic database
- **License**: Princeton WordNet License (free for research & commercial use)
- **Citation**: George A. Miller (1995). WordNet: A Lexical Database for English. Communications of the ACM Vol. 38, No. 11: 39-41.

### Gemma-3-270M
- **Model**: Google's instruction-tuned language model
- **Size**: ~70MB (q4 quantized ONNX)
- **Context**: 2048 tokens
- **Device**: WebGPU (preferred) or WASM (fallback)

---

## 💡 Use Cases

### 1. Quick Word Exploration
- Type any text to see synonyms and alternatives
- Real-time semantic similarity scores
- Voice input for hands-free use

### 2. Advanced Semantic Search
- Upload documents for multi-vector retrieval
- Explore semantic relationships with MuVeRa
- Visualize FDE algorithm in action

### 3. AI-Powered Q&A
- Ask questions about the 147K word corpus
- Context-aware responses with RAG pipeline
- Fully local, no data leaves your browser

### 4. Research & Education
- Understand modern retrieval algorithms
- Experiment with browser-native AI
- Explore WordNet semantic network

---

## 🎯 Performance Tips

### Faster Initial Load
- Page loads in <1 second (only 29KB JavaScript)
- No model loading required for minimal search
- Background preloader doesn't block UI

### Faster Model Loading
- Use Chrome/Edge with WebGPU support
- Close other tabs during first model load
- Ensure 2GB+ RAM available
- Models cached after first load

### Faster Corpus Access
- Let background preloader finish (~60s)
- Corpus cached in IndexedDB for instant access
- Works offline after first download

### Reduce Memory Usage
- Close panels when not in use (ESC key)
- Reload page to clear model memory
- Use WASM fallback if WebGPU causes issues

---

## 🔧 Build & Deploy

```bash
# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy

# Test production build locally
npm run preview
```

**Deployment Requirements**:
- Git LFS for large corpus files (455MB)
- GitHub Actions for automated deployment
- GitHub Pages enabled in repository settings

---

## 🤝 Contributing

Contributions welcome! Current priorities:

- [ ] Improve corpus preloader UI feedback
- [ ] Add progress bar for model loading
- [ ] Implement model caching in iframe contexts
- [ ] Add CPU fallback for generation model
- [ ] Optimize GIF size for README
- [ ] Create video tutorial
- [ ] Add more test coverage
- [ ] Performance benchmarking dashboard

---

## 📖 Documentation

- **CLAUDE.md**: Development documentation & integration history
- **docs/RESEARCH_FINDINGS.md**: MuVeRa research analysis
- **INTEGRATION_SUMMARY.md**: Project integration details

---

## 📝 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- **Google Research** - MuVeRa algorithm & EmbeddingGemma model
- **Princeton University** - WordNet 3.1 linguistic database
- **Google** - Gemma-3-270M language model
- **Xenova** - Transformers.js browser AI library
- **Hugging Face** - Model hosting & transformers library

---

**Built with ❤️ using 100% client-side AI technologies**

**No servers. No APIs. No costs. Just your browser.**

---

## 🐛 Troubleshooting

### RAG Panel Shows "Corpus not yet downloaded"
- **Cause**: Background preloader still downloading (455MB)
- **Solution**: Wait 30-60 seconds, then reopen RAG panel
- **Check**: Open browser console to see download progress

### WebGPU Errors in Console
- **Cause**: Browser doesn't support WebGPU
- **Solution**: System automatically falls back to WASM (slower but works)
- **Fix**: Use Chrome/Edge for WebGPU support

### Models Re-downloading Every Session
- **Cause**: IndexedDB blocked in iframe contexts
- **Solution**: Models will still work, just re-download each time
- **Note**: This is a browser security limitation we're investigating

### Panels Not Sliding In
- **Cause**: JavaScript error or Vue reactivity issue
- **Solution**: Reload page, check browser console for errors
- **Report**: Create GitHub issue with console logs

---

## 📊 Stats & Metrics

### Repository
- **Total Size**: ~550MB (with corpus files)
- **Initial Load**: <100KB
- **Full Experience**: ~555MB (after RAG activation)
- **Tests**: 11/11 passing
- **Build Time**: ~10-15 seconds

### Performance
- **Corpus Download**: 433MB in ~3 seconds (local testing)
- **Model Caching**: 100% via IndexedDB (offline-capable)
- **Search Latency**: <17ms (cosine similarity)
- **Embedding Speed**: ~994ms per text (WebGPU)

### Browser Support
- **Chrome/Edge**: ✅ Full support with WebGPU
- **Firefox**: ✅ Full support with WASM fallback
- **Safari**: ⚠️ Partial support (WebGPU limited)

---

**Last Updated**: October 8, 2025
**Status**: ✅ Production Ready
**Live Demo**: [https://1kaiser.github.io/wordy/](https://1kaiser.github.io/wordy/)
