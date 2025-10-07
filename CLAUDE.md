# Wordy - Development Documentation

## Project Overview
**Wordy** is a production-ready browser-based semantic AI platform with three integrated features:
1. **Minimal Search** - WordNet Interactive Word Replacement (main interface)
2. **MuVeRa Search** - Multi-Vector Retrieval with EmbeddingGemma (sliding panel)
3. **RAG Pipeline** - Complete Retrieval-Augmented Generation (sliding panel)

## Repository Status (Oct 7, 2025)
✅ **PRODUCTION READY** - Fully functional, tested, and verified

### Recent Achievements (Oct 7, 2025)
- ✅ **Project renamed** from muvera-browser to wordy
- ✅ **GitHub repository renamed** to 1kaiser/wordy
- ✅ **Minimal search as main interface** with sliding panel architecture
- ✅ **Lazy-loading strategy** for 455MB corpus files
- ✅ **All Playwright tests passing** (11/11)
- ✅ **Dual sliding panels** for MuVeRa and RAG features

### Technical Architecture

#### Main Interface
**Minimal Search** (`index.html`)
- Clean centered text input with blinking cursor
- Vue.js-powered word visualization with SVG boxes
- Voice input support (microphone button)
- Real-time word alternatives with similarity scores
- Two toggle buttons in top-right corner

#### Sliding Panels (Lazy-Loaded)
1. **🔄 MuVeRa Search** (purple/blue button, right side)
   - Multi-Vector Retrieval with EmbeddingGemma
   - Google Research's FDE algorithm
   - 768D semantic embeddings
   - Side-by-side query vs document visualization

2. **🤖 RAG Pipeline** (orange button, far right)
   - Complete Retrieval-Augmented Generation
   - 147,480 word corpus with embeddings
   - Gemma-3-270M model integration
   - **Lazy-loaded**: Corpus downloads ONLY when user clicks RAG button

### Core Components
```
wordy/
├── index.html                    # Minimal search interface
├── minimal-search.js             # 29KB - Main functionality
├── muvera.html                   # MuVeRa panel (lazy-loaded)
├── rag-demo.html                 # RAG panel (lazy-loaded)
├── corpus-metadata.json          # 22MB (lazy-loaded)
├── corpus-embeddings.bin         # 433MB (lazy-loaded)
├── dict/                         # 53MB WordNet data
├── 32145473.txt                  # 3.4MB Oxford Science Dictionary
└── src/
    ├── rag/modules/              # RAG module files
    ├── muvera/                   # MuVeRa TypeScript
    └── wordnet/                  # WordNet processing
```

### Lazy-Loading Implementation

**Strategy**: Corpus files (455MB total) load ONLY when user clicks RAG button

**Implementation**:
```html
<!-- iframe with data-src (not src) - loads ONLY on click -->
<iframe id="rag-iframe" data-src="rag-demo.html"></iframe>
```

```javascript
// JavaScript loads iframe on button click
function toggleRAGDemo() {
    const iframe = document.getElementById('rag-iframe');
    if (!iframe.src && iframe.dataset.src) {
        iframe.src = iframe.dataset.src;  // Triggers load
    }
}
```

**User Experience**:
1. Visit site → **29KB** loads (minimal-search.js only)
2. Type/interact → Instant, no corpus needed
3. Click RAG button → **455MB corpus downloads in background**
4. Future visits → Browser cache serves corpus instantly

### Performance Benchmarks

#### Initial Page Load
- **HTML + CSS**: <10KB
- **JavaScript**: 29KB (minimal-search.js)
- **Total**: <100KB first load
- **Time**: <1 second

#### Panel Interaction
- **MuVeRa Panel**: Lazy-loaded on first click (~2-5s)
- **RAG Panel**: Lazy-loaded with 455MB corpus (~30-60s first time)
- **Subsequent**: Instant from browser cache

#### Embedding Generation
- **EmbeddingGemma Loading**: 43s (308M parameter model)
- **Per Document**: ~994ms for 768D embeddings
- **Per Query**: ~800-1200ms with search_query prefix
- **Memory Usage**: ~400-800MB during inference

#### Search Performance
- **Similarity Calculation**: <50ms for cosine similarity
- **Result Ranking**: Instant with top-K selection
- **UI Updates**: Real-time with Vue.js reactivity

### Development Workflow

#### Local Development
```bash
# Main development server (port 3004)
npm run dev

# Server runs on http://localhost:3004/wordy/
# Auto-selects ports if 3004 is busy (3005, 3006, etc.)
```

#### Testing
```bash
# Run Playwright tests
npx playwright test tests/wordy-integration.spec.cjs --project=chromium --workers=4

# Results: 11/11 tests passing in ~22 seconds
```

#### Build for Production
```bash
# Build static files
npm run build

# Deploy to GitHub Pages
npm run deploy
```

### Test Coverage

All tests passing (11/11):
1. ✅ Minimal search interface loads correctly
2. ✅ MuVeRa panel slides in and out correctly
3. ✅ RAG panel slides in and out correctly
4. ✅ Only one panel can be open at a time
5. ✅ ESC key closes MuVeRa panel
6. ✅ ESC key closes RAG panel
7. ✅ MuVeRa iframe loads on first click
8. ✅ RAG iframe loads on first click
9. ✅ Text input accepts typing
10. ✅ Buttons have correct styling
11. ✅ No critical JavaScript errors on page load

### Key Features

#### Panel Behavior
- Only one panel open at a time (auto-closes other)
- Smooth 0.5s slide-in animation from right
- ESC key closes any open panel
- Button text changes: "🔄 MuVeRa Search" → "← Back to Search"

#### Performance Optimizations
- Lazy-loaded iframes (data-src attribute)
- Browser caching for large files (455MB corpus)
- WebGPU acceleration for embeddings
- WASM fallback for compatibility
- Vue.js reactivity for instant UI updates

### Repository Configuration

#### Git Remote
- **URL**: https://github.com/1kaiser/wordy.git
- **Live Demo**: https://1kaiser.github.io/wordy/

#### Vite Configuration
```typescript
export default defineConfig({
  base: '/wordy/',  // Updated from /muvera-browser/
  server: {
    host: '0.0.0.0',
    port: 3004,
    strictPort: false,
  },
  // ... rest of config
})
```

#### Playwright Configuration
```javascript
module.exports = defineConfig({
  use: {
    baseURL: 'http://localhost:3004/wordy/',  // Updated
  },
  webServer: {
    url: 'http://localhost:3004/wordy/',  // Updated
  },
})
```

### Browser Compatibility

#### Recommended
- **Chrome/Edge**: Full WebGPU support for EmbeddingGemma
- **Chrome Canary**: Best performance with experimental features

#### Supported
- **Firefox**: WASM fallback (slower embeddings)
- **Safari**: Limited WebGPU, uses WASM

### Known Issues & Solutions

#### Issue: Page timeouts in Playwright
**Solution**: Changed from `waitForLoadState('networkidle')` to `waitForLoadState('domcontentloaded')`

#### Issue: Iframe src attribute null
**Solution**: Updated tests to expect `null` instead of empty string for lazy-loaded iframes

#### Issue: Port conflicts
**Solution**: Vite auto-selects next available port

### Deployment Strategy

#### GitHub Pages
- **URL**: https://1kaiser.github.io/wordy/
- **Corpus Files**: Included in repository (within 1GB limit)
- **Lazy-Loading**: Corpus downloads on first RAG button click
- **Caching**: Browser caches for instant repeat visits

#### File Sizes
- **Total Repository**: ~550MB (with corpus)
- **Initial Load**: <100KB
- **Full Experience**: ~555MB (after RAG activation)

### Future Enhancements
- Unified settings panel for all three features
- Shared embedding manager singleton
- Export functionality for embeddings
- Performance benchmarking dashboard
- Additional embedding model options
- API endpoint for programmatic access

### Development Notes
- Always run `npm install` after cloning
- Use Chrome/Edge for best WebGPU performance
- Monitor console for embedding timing metrics
- Tests use Chrome (not Chromium) for WebGPU support
- File upload supports .txt and .md formats
- ESC key uses capture phase to avoid Vue conflicts

### Integration Summary

**Previous State** (Sep 6, 2025):
- Separate muvera-browser and wordnet-3d-visualization repos
- Landing page with feature cards
- No lazy-loading strategy

**Current State** (Oct 7, 2025):
- ✅ Unified "wordy" repository
- ✅ Minimal search as main interface
- ✅ Dual sliding panels for MuVeRa and RAG
- ✅ Lazy-loading for 455MB corpus
- ✅ All tests passing (11/11)
- ✅ Production-ready deployment

---
*This documentation is maintained alongside the codebase for development reference*
