# WordNet Word Extractor

Extract all unique words from WordNet 3.1 dictionary indexes with part-of-speech metadata.

## Overview

WordNet 3.1 contains **155,583 unique words** across 4 parts of speech:
- **Nouns**: ~117,982
- **Verbs**: ~11,569
- **Adjectives**: ~21,528
- **Adverbs**: ~4,504

This module provides a browser-based parser to extract these words for downstream NLP tasks like embedding generation and semantic analysis.

## Features

- ✅ **Pure JavaScript** - No dependencies
- ✅ **Browser-based** - Fetch WordNet files via HTTP
- ✅ **POS Metadata** - Each word tagged with part-of-speech
- ✅ **Fast Parsing** - Processes all 155k words in seconds
- ✅ **Clean Output** - Handles multi-word entries and formatting

## Installation

```javascript
import { WordNetExtractor } from './wordnet-extractor/index.js';
```

## Usage

### Basic Extraction

```javascript
const extractor = new WordNetExtractor('dict'); // path to WordNet dict/
const { words, metadata } = await extractor.extractAllWords();

console.log(`Extracted ${words.length} words`);
// Output: Extracted 155583 words
```

### Extract Specific Part of Speech

```javascript
const nouns = await extractor.extractWordsFromIndex('noun');
console.log(`Found ${nouns.length} nouns`);
// Output: Found 117982 nouns
```

### Get Statistics

```javascript
const stats = await extractor.getStatistics();
console.log(stats);
/*
{
  total: 155583,
  byPOS: {
    noun: 117982,
    verb: 11569,
    adjective: 21528,
    adverb: 4504
  }
}
*/
```

### Extract with Full Metadata

```javascript
const data = await extractor.extractAndSerialize();
console.log(data);
/*
{
  version: 'WordNet 3.1',
  extractedAt: '2025-01-15T10:30:00.000Z',
  totalWords: 155583,
  words: ['computer', 'run', 'happy', 'quickly', ...],
  metadata: [
    { pos: 'noun', labelIndex: 0 },
    { pos: 'verb', labelIndex: 1 },
    ...
  ],
  statistics: {
    nouns: 117982,
    verbs: 11569,
    adjectives: 21528,
    adverbs: 4504
  }
}
*/
```

## Data Format

### Index File Format

WordNet index files follow this format:
```
word pos sense_count pointer_types synset_count synset_offsets...
```

**Example:**
```
computer n 2 7 @ ~ #p %p + ; - 2 1 03086983 09906486
```
- `computer` - word
- `n` - part of speech (noun)
- `2` - number of senses
- Synset offsets: `03086983`, `09906486`

### Output Format

```javascript
{
  words: ['computer', 'algorithm', ...],        // Array of words
  metadata: [
    { pos: 'noun', labelIndex: 0 },            // Metadata per word
    { pos: 'noun', labelIndex: 0 },
    ...
  ]
}
```

**Label Indices:**
- `0` = Noun
- `1` = Verb
- `2` = Adjective
- `3` = Adverb

## Use Cases

### 1. Generate Embeddings

```javascript
import { WordNetExtractor } from './wordnet-extractor/index.js';
import { EmbeddingModel } from './embedding-model/index.js';

const extractor = new WordNetExtractor();
const { words } = await extractor.extractAllWords();

const embedder = new EmbeddingModel();
await embedder.load();

const embeddings = await embedder.embed(words);
// 155,583 × 768D embeddings
```

### 2. Build Search Index

```javascript
import { VoySearch } from './voy-search/index.js';

const { words, metadata } = await extractor.extractAllWords();
const embeddings = await generateEmbeddings(words);

const voy = new VoySearch();
await voy.build(words, embeddings);

// Now search semantically
const results = await voy.search(queryEmbedding, 10);
```

### 3. 3D Visualization

```javascript
import { UMAP } from 'umap-js';
import ScatterGL from 'scatter-gl';

const { words, metadata } = await extractor.extractAllWords();
const embeddings768D = await generateEmbeddings(words);

// Reduce to 3D
const umap = new UMAP({ nComponents: 3 });
const points3D = await umap.fitAsync(embeddings768D);

// Visualize
const dataset = new ScatterGL.Dataset(points3D, metadata);
scatterGL.render(dataset);
```

## Performance

- **Extraction Time**: ~1-2 seconds (155k words)
- **Memory Usage**: ~20MB (index files)
- **Output Size**:
  - Words array: ~2MB
  - Metadata: ~1MB

## WordNet Files Required

This module expects WordNet 3.1 dictionary files in the following structure:

```
dict/
├── index.noun    (4.6MB)
├── index.verb    (513KB)
├── index.adj     (807KB)
└── index.adv     (159KB)
```

Download from: https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz

## License

WordNet 3.1 is licensed under the Princeton WordNet License (free for research and commercial use).

This module is MIT licensed.

## API Reference

### `WordNetExtractor`

#### Constructor

```javascript
new WordNetExtractor(dictPath = 'dict')
```

- `dictPath` - Path to WordNet dictionary directory

#### Methods

##### `extractAllWords()`

Extract all words from all POS indexes.

**Returns:** `Promise<{words: string[], metadata: Object[]}>`

##### `extractWordsFromIndex(pos)`

Extract words from specific POS.

**Parameters:**
- `pos` - `'noun'`, `'verb'`, `'adj'`, or `'adv'`

**Returns:** `Promise<string[]>`

##### `getStatistics()`

Get word count statistics by POS.

**Returns:** `Promise<Object>`

##### `extractAndSerialize()`

Extract words with full metadata for serialization.

**Returns:** `Promise<Object>`

## Examples

See [demo.html](demo.html) for a complete interactive example.
