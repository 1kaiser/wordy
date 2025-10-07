# 🧠 Embedding Model Module

Generate semantic text embeddings directly in the browser using Transformers.js.

**Model:** onnx-community/embeddinggemma-300m-ONNX (Google's EmbeddingGemma)
**Dimensions:** 768
**Size:** ~75MB quantized to q4 (downloaded once, cached)
**Type:** WASM-powered

---

## 🚀 Quick Start

```html
<!DOCTYPE html>
<html>
<body>
    <h1>Semantic Similarity Demo</h1>
    <input id="query" placeholder="Enter text...">
    <button onclick="search()">Find Similar</button>
    <div id="results"></div>

    <script type="module">
        import { EmbeddingModel } from './embedding-model/index.js';

        const embedder = new EmbeddingModel();
        const docs = [
            'Machine learning is powerful',
            'AI revolutionizes industries',
            'Deep learning requires GPUs',
            'The weather is nice today'
        ];

        // Initialize
        (async () => {
            await embedder.load(); // First load: ~10-30s
            console.log('Model ready!');
        })();

        // Search function
        window.search = async () => {
            const query = document.getElementById('query').value;
            const results = await embedder.findSimilar(query, docs, 3);

            document.getElementById('results').innerHTML = results
                .map(r => `<p>${r.text} (${(r.score * 100).toFixed(1)}%)</p>`)
                .join('');
        };
    </script>
</body>
</html>
```

---

## 📖 API Reference

### `new EmbeddingModel()`
Create a new embedding model instance.

### `await embedder.load()`
Load the embedding model (Xenova/all-MiniLM-L6-v2).

**Returns:** Promise&lt;void&gt;

**Example:**
```javascript
const embedder = new EmbeddingModel();
await embedder.load(); // Downloads ~50MB on first use (cached afterwards)
```

**Progress Tracking:**
```javascript
embedder.onProgress = (progress, status) => {
    console.log(`${status}: ${progress}%`);
};
await embedder.load();
```

---

### `await embedder.embed(texts, options)`
Generate embeddings for text(s).

**Parameters:**
- `texts` (string | string[]): Single text or array of texts
- `options` (Object, optional):
  - `prefix` (string): Text prefix for embeddings (default: 'title: none | text:')

**Returns:** Promise&lt;Float32Array[]&gt; - Array of 768-dimensional embedding vectors

**Example:**
```javascript
// Single text
const embedding = await embedder.embed('Hello world');
console.log(embedding[0]); // Float32Array(768)

// Multiple texts
const embeddings = await embedder.embed([
    'Machine learning is great',
    'AI transforms industries'
]);
console.log(embeddings.length); // 2
console.log(embeddings[0].length); // 768
```

---

### `embedder.similarity(embedding1, embedding2)`
Calculate cosine similarity between two embeddings.

**Parameters:**
- `embedding1` (Float32Array): First embedding vector
- `embedding2` (Float32Array): Second embedding vector

**Returns:** number - Similarity score (0-1, higher = more similar)

**Example:**
```javascript
const emb1 = await embedder.embed('machine learning');
const emb2 = await embedder.embed('artificial intelligence');
const emb3 = await embedder.embed('weather forecast');

const similarity1 = embedder.similarity(emb1[0], emb2[0]);
const similarity2 = embedder.similarity(emb1[0], emb3[0]);

console.log(`ML vs AI: ${(similarity1 * 100).toFixed(1)}%`); // ~85%
console.log(`ML vs Weather: ${(similarity2 * 100).toFixed(1)}%`); // ~15%
```

---

### `await embedder.findSimilar(query, texts, k)`
Find most similar texts to a query.

**Parameters:**
- `query` (string): Query text
- `texts` (string[]): Texts to search
- `k` (number): Number of results (default: 5)

**Returns:** Promise&lt;Array&lt;{text: string, score: number, index: number}&gt;&gt;

**Example:**
```javascript
const texts = [
    'Machine learning is powerful',
    'Deep learning uses neural networks',
    'The weather is sunny today',
    'AI can solve complex problems'
];

const results = await embedder.findSimilar('artificial intelligence', texts, 2);

// Returns:
// [
//   { text: 'AI can solve complex problems', score: 0.89, index: 3 },
//   { text: 'Machine learning is powerful', score: 0.82, index: 0 }
// ]
```

---

### `embedder.getInfo()`
Get model information.

**Returns:** {name: string, dimensions: number, loaded: boolean}

**Example:**
```javascript
const info = embedder.getInfo();
console.log(info);
// {
//   name: 'Xenova/all-MiniLM-L6-v2',
//   dimensions: 768,
//   loaded: true
// }
```

---

### `embedder.destroy()`
Terminate worker and cleanup resources.

**Example:**
```javascript
embedder.destroy();
```

---

## 💡 Use Cases

- **Semantic search** - Find relevant documents by meaning, not keywords
- **Recommendation systems** - Suggest similar content
- **Clustering** - Group similar texts together
- **Duplicate detection** - Find near-duplicate content
- **Question answering** - Match questions to answers
- **Text classification** - Classify by semantic similarity

---

## 🎯 Example: Semantic Document Search

```javascript
import { EmbeddingModel } from './embedding-model/index.js';

const embedder = new EmbeddingModel();
await embedder.load();

const documents = [
    'Python is a programming language',
    'Machine learning models need data',
    'JavaScript runs in browsers',
    'Neural networks mimic the brain',
    'HTML structures web pages'
];

// Search for programming-related docs
const results = await embedder.findSimilar(
    'coding and software development',
    documents,
    3
);

results.forEach(r => {
    console.log(`${(r.score * 100).toFixed(1)}% - ${r.text}`);
});

// Output:
// 78.4% - Python is a programming language
// 72.1% - JavaScript runs in browsers
// 65.3% - HTML structures web pages
```

---

## 🎯 Example: Content Recommendation

```javascript
const userLikes = 'I enjoy learning about artificial intelligence';
const articles = [
    'Introduction to Machine Learning',
    'Cooking recipes for beginners',
    'Deep Learning with Neural Networks',
    'Travel guide to Europe',
    'Natural Language Processing basics'
];

const recommendations = await embedder.findSimilar(userLikes, articles, 3);

console.log('Recommended articles:');
recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec.text} (${(rec.score * 100).toFixed(0)}% match)`);
});

// Output:
// 1. Deep Learning with Neural Networks (87% match)
// 2. Introduction to Machine Learning (84% match)
// 3. Natural Language Processing basics (81% match)
```

---

## 🎯 Example: Duplicate Detection

```javascript
const texts = [
    'The quick brown fox jumps',
    'A fast brown fox leaps over',
    'Chocolate cake recipe',
    'The speedy brown fox jumps'
];

// Check for duplicates
const embeddings = await embedder.embed(texts);

for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
        const similarity = embedder.similarity(embeddings[i], embeddings[j]);

        if (similarity > 0.85) {
            console.log(`Potential duplicate found (${(similarity * 100).toFixed(1)}%):`);
            console.log(`  - "${texts[i]}"`);
            console.log(`  - "${texts[j]}"`);
        }
    }
}

// Output:
// Potential duplicate found (92.3%):
//   - "The quick brown fox jumps"
//   - "The speedy brown fox jumps"
```

---

## ⚡ Performance

| Batch Size | Processing Time |
|------------|----------------|
| 1 text | ~100-200ms |
| 10 texts | ~500-800ms |
| 100 texts | ~5-8 seconds |
| 1000 texts | ~50-80 seconds |

**Notes:**
- First load downloads ~75MB model (q4 quantized, 20-45 seconds)
- Model cached in browser afterwards
- Runs in Web Worker (non-blocking)
- WASM-powered for native-like speed
- Larger model = better quality but slower than MiniLM

---

## 🔧 Advanced Usage

### Batch Processing with Progress

```javascript
const largeDataset = [...]; // 1000+ texts

const embedder = new EmbeddingModel();

// Track progress
let processed = 0;
embedder.onProgress = (progress, status) => {
    console.log(`Loading model: ${progress}%`);
};

await embedder.load();

// Process in batches
const batchSize = 50;
const allEmbeddings = [];

for (let i = 0; i < largeDataset.length; i += batchSize) {
    const batch = largeDataset.slice(i, i + batchSize);
    const embeddings = await embedder.embed(batch);
    allEmbeddings.push(...embeddings);

    processed += batch.length;
    console.log(`Processed ${processed}/${largeDataset.length}`);
}
```

### Custom Similarity Threshold

```javascript
const threshold = 0.75; // 75% similarity minimum

const query = 'machine learning algorithms';
const documents = [...];

const results = await embedder.findSimilar(query, documents, documents.length);
const filtered = results.filter(r => r.score >= threshold);

console.log(`Found ${filtered.length} documents above ${threshold * 100}% similarity`);
```

### Integration with Vector Database

```javascript
import { EmbeddingModel } from './embedding-model/index.js';
import { VoySearch } from './voy-search/index.js';

const embedder = new EmbeddingModel();
const voy = new VoySearch();

await embedder.load();

// Build vector index
const texts = [...]; // Your documents
const embeddings = await embedder.embed(texts);
await voy.build(texts, embeddings);

// Fast semantic search
const query = 'artificial intelligence';
const queryEmb = await embedder.embed(query);
const results = await voy.search(queryEmb[0], 10);

console.log('Top 10 results:', results);
```

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "@huggingface/transformers": "^3.0.2"
  }
}
```

---

## 🌐 Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 15+
- ✅ Edge 90+

Requires WebAssembly support.

---

## 🔒 Privacy

All embedding generation happens **100% in the browser**. No data is sent to any server.

---

## 📊 Model Details

**Model:** onnx-community/embeddinggemma-300m-ONNX (Google's EmbeddingGemma)
**Architecture:** Gemma-based encoder (Google's Gemma family)
**Parameters:** ~300M
**Dimensions:** 768
**Max Sequence Length:** 2048 tokens
**Training Data:** Large-scale Google corpus

**Benchmark Performance:**
- High-quality semantic embeddings
- Optimized for similarity search and retrieval
- Better than MiniLM-L6 on most tasks
- Quantized to q4 for browser efficiency

---

## 📄 License

MIT
