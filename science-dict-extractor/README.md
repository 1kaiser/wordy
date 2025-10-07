# Oxford Dictionary of Science - Term Extractor

Extract scientific terms from the Oxford Dictionary of Science (6th Edition) with automatic category classification.

## Overview

This module parses the Oxford Dictionary of Science text file and extracts scientific terms, automatically categorizing them into:

- **Physics** - Mechanics, quantum physics, optics, thermodynamics
- **Chemistry** - Compounds, reactions, elements, molecules
- **Biology** - Cells, organisms, genetics, ecology
- **Astronomy** - Cosmology, stars, planets, galaxies
- **Mathematics** - Equations, theorems, functions
- **Geology** - Earth science, rocks, minerals
- **General** - Interdisciplinary or uncategorized terms

## Features

- ✅ Automatic term extraction from OCR text
- ✅ Category classification using keyword matching
- ✅ Metadata for each term (category, label index)
- ✅ Pure JavaScript, no dependencies
- ✅ Browser-based processing

## Installation

```javascript
import { ScienceDictExtractor } from './science-dict-extractor/index.js';
```

## Usage

### Basic Extraction

```javascript
const extractor = new ScienceDictExtractor('32145473.txt');
const { terms, metadata } = await extractor.extractAllTerms();

console.log(`Extracted ${terms.length} scientific terms`);
// Example output: Extracted 2500 scientific terms
```

### Get Statistics

```javascript
const stats = await extractor.getStatistics();
console.log(stats);
/*
{
  total: 2500,
  byCategory: {
    physics: 450,
    chemistry: 520,
    biology: 680,
    astronomy: 120,
    mathematics: 180,
    geology: 90,
    general: 460
  }
}
*/
```

### Full Extraction with Metadata

```javascript
const data = await extractor.extractAndSerialize();
console.log(data);
/*
{
  source: 'Oxford Dictionary of Science (6th Edition)',
  extractedAt: '2025-01-15T10:30:00.000Z',
  totalTerms: 2500,
  terms: ['aa', 'aberration', 'absolute', 'acceleration', ...],
  metadata: [
    { category: 'geology', labelIndex: 5, hasDefinition: true },
    { category: 'physics', labelIndex: 0, hasDefinition: true },
    ...
  ],
  statistics: { ... }
}
*/
```

## Data Format

### Term Structure

```javascript
{
  terms: ['acceleration', 'molecule', 'photosynthesis', ...],
  metadata: [
    {
      category: 'physics',      // Category name
      labelIndex: 0,            // Numeric index for visualization
      hasDefinition: true       // Has a definition in dictionary
    },
    ...
  ]
}
```

### Category Label Indices

```
0 = Physics
1 = Chemistry
2 = Biology
3 = Astronomy
4 = Mathematics
5 = Geology
6 = General
```

## Categorization Algorithm

Terms are categorized based on keyword matching in their definitions:

1. **Physics**: quantum, particle, radiation, electromagnetic, thermodynamic, kinetic
2. **Chemistry**: compound, molecule, atom, acid, reaction, element
3. **Biology**: cell, organism, species, gene, protein, enzyme
4. **Astronomy**: galaxy, star, planet, solar, celestial, universe
5. **Mathematics**: equation, theorem, algebra, geometry, calculus
6. **Geology**: rock, mineral, crust, sediment
7. **General**: Terms that don't match other categories

The category with the highest keyword match score wins.

## Use Cases

### 1. Scientific Term Visualization

```javascript
import { ScienceDictExtractor } from './science-dict-extractor/index.js';
import { EmbeddingModel } from './embedding-model/index.js';

const extractor = new ScienceDictExtractor();
const { terms } = await extractor.extractAndSerialize();

const embedder = new EmbeddingModel();
await embedder.load();

const embeddings = await embedder.embed(terms);
// Visualize in 3D with UMAP + Scatter-GL
```

### 2. Science Education Tool

Build interactive glossaries, flashcards, or study aids.

### 3. Search Index

Create searchable database of scientific terms.

### 4. Content Analysis

Analyze scientific documents to identify domain-specific terminology.

## Source Data

**File**: `32145473.txt`
**Source**: Oxford Dictionary of Science, 6th Edition (2010)
**Publisher**: Oxford University Press
**Format**: Plain text (extracted from EPUB via OCR)

**Note**: The text file contains OCR errors and formatting inconsistencies that the parser attempts to handle gracefully.

## Limitations

- **OCR Errors**: Source text has some recognition errors
- **Incomplete Definitions**: Some entries may be fragmented
- **Simple Categorization**: Uses keyword matching (not semantic analysis)
- **No Multi-word Terms**: Currently extracts single-word headwords only

## API Reference

### `ScienceDictExtractor`

#### Constructor

```javascript
new ScienceDictExtractor(filePath = '32145473.txt')
```

#### Methods

##### `extractAllTerms()`

Extract all terms from the dictionary.

**Returns:** `Promise<{terms: string[], metadata: Object[]}>`

##### `getStatistics()`

Get statistics by category.

**Returns:** `Promise<Object>`

##### `extractAndSerialize()`

Extract with full metadata for serialization.

**Returns:** `Promise<Object>`

## Examples

See [demo.html](demo.html) for a complete interactive example.

## License

MIT License

**Oxford Dictionary of Science**: © Oxford University Press. Text used for educational/research purposes.
