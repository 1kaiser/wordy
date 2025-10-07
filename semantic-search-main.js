import { CombinedCorpusBuilder } from './combined-corpus-builder.js';
import ScatterGL from 'scatter-gl';

// State
let corpusBuilder = null;
let corpusData = null;
let points3D = [];
let scatterGL = null;
let voyIndex = null;

// Elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const startBtn = document.getElementById('start-btn');
const runUmapBtn = document.getElementById('run-umap-btn');
const visualizeBtn = document.getElementById('visualize-btn');
const searchSection = document.getElementById('search-section');
const searchInput = document.getElementById('search-input');
const resultsSection = document.getElementById('results-section');
const totalWordsEl = document.getElementById('total-words');
const embeddingsCountEl = document.getElementById('embeddings-count');
const umapStatusEl = document.getElementById('umap-status');
const searchStatusEl = document.getElementById('search-status');
const toggle3dEl = document.getElementById('toggle-3d');
const autoRotateEl = document.getElementById('auto-rotate');

// Initialize
corpusBuilder = new CombinedCorpusBuilder();

// Set up progress callback
corpusBuilder.onProgress((phase, current, total, message) => {
    const progress = (current / total) * 100;
    progressFill.style.width = `${progress}%`;
    statusText.textContent = message;

    if (phase === 'embeddings') {
        embeddingsCountEl.textContent = current.toLocaleString();
    }
});

function setStatus(status, message) {
    statusIndicator.className = `status-indicator ${status}`;
    statusText.textContent = message;
}

// Step 1: Build corpus and generate embeddings
startBtn.addEventListener('click', async () => {
    try {
        startBtn.disabled = true;
        setStatus('loading', 'Building corpus...');

        corpusData = await corpusBuilder.buildCorpus(true);

        totalWordsEl.textContent = corpusData.words.length.toLocaleString();
        embeddingsCountEl.textContent = corpusData.embeddings.length.toLocaleString();

        setStatus('ready', 'Corpus built successfully!');
        progressFill.style.width = '100%';

        runUmapBtn.disabled = false;

    } catch (error) {
        setStatus('error', `Error: ${error.message}`);
        console.error(error);
        startBtn.disabled = false;
    }
});

// Step 2: Run UMAP analysis
runUmapBtn.addEventListener('click', async () => {
    try {
        runUmapBtn.disabled = true;
        setStatus('loading', 'Loading UMAP library...');

        // Load UMAP
        const { UMAP } = await import('https://cdn.jsdelivr.net/npm/umap-js@1.3.3/+esm');

        setStatus('loading', 'Running UMAP analysis...');
        umapStatusEl.textContent = 'Running...';

        const umap = new UMAP({
            nComponents: 3,
            nNeighbors: 15,
            minDist: 0.1,
            spread: 1.0
        });

        // Convert embeddings to array format
        const data = corpusData.embeddings.map(emb => Array.from(emb));

        // Run UMAP
        const embedding3D = await umap.fitAsync(data, (epochNumber) => {
            const progress = (epochNumber / 500) * 100;
            progressFill.style.width = `${progress}%`;
            statusText.textContent = `UMAP epoch ${epochNumber}/500`;
            umapStatusEl.textContent = `${progress.toFixed(0)}%`;
        });

        // Convert to scatter-gl format
        points3D = embedding3D.map(point => [point[0], point[1], point[2]]);

        umapStatusEl.textContent = 'Complete';
        setStatus('ready', 'UMAP analysis complete!');

        visualizeBtn.disabled = false;

    } catch (error) {
        setStatus('error', `Error: ${error.message}`);
        console.error(error);
        runUmapBtn.disabled = false;
    }
});

// Step 3: Create visualization and search index
visualizeBtn.addEventListener('click', async () => {
    try {
        visualizeBtn.disabled = true;
        setStatus('loading', 'Building visualization...');

        // Create scatter-gl dataset
        const scatterMetadata = corpusData.words.map((word, i) => ({
            label: word,
            source: corpusData.metadata[i].source,
            pos: corpusData.metadata[i].pos,
            category: corpusData.metadata[i].category
        }));

        // Color by source
        const colorsBySource = {
            'wordnet': 'hsla(0, 100%, 50%, 0.75)',    // red
            'science': 'hsla(120, 100%, 50%, 0.75)',  // green
            'both': 'hsla(240, 100%, 50%, 0.75)'      // blue
        };

        // Create scatter plot
        const containerElement = document.getElementById('scatter-container');
        const dataset = new ScatterGL.Dataset(points3D, scatterMetadata);

        scatterGL = new ScatterGL(containerElement, {
            onClick: (point) => {
                if (point !== null) {
                    const word = corpusData.words[point];
                    searchInput.value = word;
                    performSemanticSearch(word);
                }
            },
            onHover: (point) => {
                if (point !== null) {
                    const word = corpusData.words[point];
                    // Could show tooltip
                }
            },
            pointColorer: (i, selectedIndices, hoverIndex) => {
                const source = corpusData.metadata[i].source;

                if (hoverIndex === i) {
                    return 'white';
                }

                if (selectedIndices.size === 0) {
                    return colorsBySource[source] || colorsBySource.wordnet;
                } else {
                    const isSelected = selectedIndices.has(i);
                    return isSelected
                        ? (colorsBySource[source] || colorsBySource.wordnet)
                        : 'hsla(0, 0%, 50%, 0.1)';
                }
            },
            renderMode: ScatterGL.RenderMode.POINT,
            showLabelsOnHover: true,
            orbitControls: {
                zoomSpeed: 1.2,
                autoRotateSpeed: 0.5
            },
            rotateOnStart: true
        });

        scatterGL.render(dataset);

        setStatus('loading', 'Building search index...');

        // Build Voy search index
        await buildVoySearchIndex();

        // Enable controls
        toggle3dEl.disabled = false;
        autoRotateEl.disabled = false;
        searchSection.style.display = 'block';

        setStatus('ready', 'Ready for semantic search!');
        searchStatusEl.textContent = 'Ready';

        // Add control listeners
        toggle3dEl.addEventListener('change', (e) => {
            scatterGL.setDimensions(e.target.checked ? 3 : 2);
        });

        autoRotateEl.addEventListener('change', (e) => {
            // Toggle auto-rotate
            scatterGL.setOrbitControls({
                autoRotate: e.target.checked,
                autoRotateSpeed: 0.5
            });
        });

        // Search functionality
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSemanticSearch(e.target.value);
            }, 300);
        });

    } catch (error) {
        setStatus('error', `Error: ${error.message}`);
        console.error(error);
        visualizeBtn.disabled = false;
    }
});

/**
 * Build Voy search index for fast similarity search
 */
async function buildVoySearchIndex() {
    try {
        // Note: Voy search requires the voy-search library
        // For now, we'll implement a simple cosine similarity search
        console.log('Building search index...');

        // Create a simple index mapping words to embeddings
        voyIndex = {
            words: corpusData.words,
            embeddings: corpusData.embeddings,
            metadata: corpusData.metadata
        };

        console.log('Search index built');
    } catch (error) {
        console.error('Error building search index:', error);
        throw error;
    }
}

/**
 * Perform semantic search using cosine similarity
 */
function performSemanticSearch(query) {
    if (!query || !voyIndex || query.length < 2) {
        resultsSection.innerHTML = '<div class="stats-section">Enter a search query...</div>';
        return;
    }

    const queryLower = query.toLowerCase();

    // Find exact match
    const exactIdx = voyIndex.words.indexOf(queryLower);

    if (exactIdx === -1) {
        resultsSection.innerHTML = '<div class="stats-section">Word not found in corpus</div>';
        return;
    }

    const queryEmbedding = voyIndex.embeddings[exactIdx];

    // Calculate cosine similarity with all other words
    const similarities = voyIndex.embeddings.map((embedding, idx) => {
        if (idx === exactIdx) return { idx, similarity: 1.0 };

        const similarity = cosineSimilarity(queryEmbedding, embedding);
        return { idx, similarity };
    });

    // Sort by similarity
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Take top 20
    const topResults = similarities.slice(0, 20);

    // Highlight in visualization
    const indices = topResults.map(r => r.idx);
    scatterGL.select(indices);

    // Display results
    displaySearchResults(topResults);
}

/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Display search results
 */
function displaySearchResults(results) {
    resultsSection.innerHTML = '';

    results.forEach(result => {
        const word = voyIndex.words[result.idx];
        const meta = voyIndex.metadata[result.idx];
        const similarity = (result.similarity * 100).toFixed(1);

        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = `
            <div class="result-word">
                ${word}
                <span class="result-similarity">${similarity}%</span>
            </div>
            <div class="result-meta">
                Source: ${meta.source}
                ${meta.pos ? `| POS: ${meta.pos}` : ''}
                ${meta.category ? `| Category: ${meta.category}` : ''}
            </div>
        `;

        item.addEventListener('click', () => {
            searchInput.value = word;
            performSemanticSearch(word);
        });

        resultsSection.appendChild(item);
    });
}

// Initialize
setStatus('ready', 'Ready to build corpus');
