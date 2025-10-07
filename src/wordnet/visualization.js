import { WordNetExtractor } from './wordnet-extractor/index.js';
import { EmbeddingModel } from './embedding-model/index.js';
import ScatterGL from 'scatter-gl';

// State
let words = [];
let metadata = [];
let embeddings768D = [];
let points3D = [];
let scatterGL = null;

// Elements
const wordCountEl = document.getElementById('word-count');
const startPipelineBtn = document.getElementById('start-pipeline');
const runUmapBtn = document.getElementById('run-umap');
const visualizeBtn = document.getElementById('visualize');
const toggle3dEl = document.getElementById('toggle-3d');
const searchWordEl = document.getElementById('search-word');
const filterPosEl = document.getElementById('filter-pos');
const progressFill = document.getElementById('progress-fill');
const statusText = document.getElementById('status-text');
const wordsExtractedEl = document.getElementById('words-extracted');
const embeddingsGeneratedEl = document.getElementById('embeddings-generated');
const umapProgressEl = document.getElementById('umap-progress');
const vizStatusEl = document.getElementById('viz-status');
const hoverInfo = document.getElementById('hover-info');
const hoverWord = document.getElementById('hover-word');
const hoverPos = document.getElementById('hover-pos');

// Initialize
wordCountEl.textContent = 'Initializing...';

// Check if WordNet is available
async function checkWordNet() {
    try {
        const response = await fetch('dict/index.noun');
        if (response.ok) {
            wordCountEl.textContent = '155,583 words ready to visualize';
            startPipelineBtn.disabled = false;
            return true;
        }
    } catch (error) {
        wordCountEl.textContent = '❌ WordNet not found';
        statusText.textContent = 'Error: WordNet dictionary files not found at dict/';
    }
    return false;
}

// Step 1: Extract words and generate embeddings
startPipelineBtn.addEventListener('click', async () => {
    try {
        startPipelineBtn.disabled = true;
        startPipelineBtn.classList.add('loading');

        // Extract words
        statusText.textContent = 'Extracting words from WordNet...';
        progressFill.style.width = '10%';

        const extractor = new WordNetExtractor('dict');
        const extracted = await extractor.extractAndSerialize();

        words = extracted.words;
        metadata = extracted.metadata;
        wordsExtractedEl.textContent = words.length.toLocaleString();

        statusText.textContent = `Extracted ${words.length.toLocaleString()} words. Loading embedding model...`;
        progressFill.style.width = '20%';

        // Load embedding model
        const embedder = new EmbeddingModel();
        await embedder.load();

        statusText.textContent = 'Generating 768D embeddings (this will take ~40 minutes)...';

        // Generate embeddings in batches
        const batchSize = 50;
        embeddings768D = [];

        for (let i = 0; i < words.length; i += batchSize) {
            const batch = words.slice(i, i + batchSize);
            const batchEmbeddings = await embedder.embed(batch);

            embeddings768D.push(...batchEmbeddings);

            const progress = 20 + (i / words.length) * 60;
            progressFill.style.width = `${progress}%`;
            embeddingsGeneratedEl.textContent = embeddings768D.length.toLocaleString();
            statusText.textContent = `Generating embeddings: ${((i / words.length) * 100).toFixed(1)}% (${i.toLocaleString()}/${words.length.toLocaleString()})`;
        }

        progressFill.style.width = '80%';
        statusText.textContent = `✅ Generated ${embeddings768D.length.toLocaleString()} embeddings`;
        runUmapBtn.disabled = false;
        startPipelineBtn.classList.remove('loading');

    } catch (error) {
        statusText.textContent = `❌ Error: ${error.message}`;
        console.error(error);
        startPipelineBtn.classList.remove('loading');
    }
});

// Step 2: UMAP reduction
runUmapBtn.addEventListener('click', async () => {
    try {
        runUmapBtn.disabled = true;
        runUmapBtn.classList.add('loading');

        statusText.textContent = 'Loading UMAP library...';

        // Load UMAP
        const { UMAP } = await import('https://cdn.jsdelivr.net/npm/umap-js@1.3.3/+esm');

        statusText.textContent = 'Running UMAP reduction (768D → 3D). This may take 10-30 minutes...';
        progressFill.style.width = '85%';

        const umap = new UMAP({
            nComponents: 3,
            nNeighbors: 15,
            minDist: 0.1,
            spread: 1.0
        });

        // Convert to format UMAP expects
        const data = embeddings768D.map(emb => Array.from(emb));

        // Fit and transform
        const embedding3D = await umap.fitAsync(data, (epochNumber) => {
            const progress = (epochNumber / 500) * 100;
            umapProgressEl.textContent = `${progress.toFixed(0)}%`;
            statusText.textContent = `UMAP epoch ${epochNumber}/500`;
        });

        // Convert to scatter-gl format
        points3D = embedding3D.map(point => [point[0], point[1], point[2]]);

        progressFill.style.width = '95%';
        statusText.textContent = `✅ UMAP reduction complete: ${points3D.length.toLocaleString()} 3D points`;
        umapProgressEl.textContent = '100%';
        visualizeBtn.disabled = false;
        runUmapBtn.classList.remove('loading');

    } catch (error) {
        statusText.textContent = `❌ Error: ${error.message}`;
        console.error(error);
        runUmapBtn.classList.remove('loading');
    }
});

// Step 3: Visualize with Scatter-GL
visualizeBtn.addEventListener('click', async () => {
    try {
        visualizeBtn.disabled = true;
        visualizeBtn.classList.add('loading');

        statusText.textContent = 'Loading Scatter-GL library...';
        progressFill.style.width = '98%';

        // Create scatter-gl dataset
        const scatterMetadata = words.map((word, i) => ({
            label: word,
            pos: metadata[i].pos,
            labelIndex: metadata[i].labelIndex
        }));

        // Color palette by POS
        const colorsByPOS = {
            0: 'hsla(0, 100%, 50%, 0.75)',     // noun - red
            1: 'hsla(120, 100%, 50%, 0.75)',   // verb - green
            2: 'hsla(240, 100%, 50%, 0.75)',   // adjective - blue
            3: 'hsla(60, 100%, 50%, 0.75)'     // adverb - yellow
        };

        // Initialize scatter-gl
        const containerElement = document.getElementById('scatter-container');
        const dataset = new ScatterGL.Dataset(points3D, scatterMetadata);

        scatterGL = new ScatterGL(containerElement, {
            onClick: (point) => {
                if (point !== null) {
                    const word = words[point];
                    const pos = metadata[point].pos;
                    hoverWord.textContent = word;
                    hoverPos.textContent = pos;
                    hoverInfo.classList.add('active');
                    console.log(`Clicked: ${word} (${pos})`);
                }
            },
            onHover: (point) => {
                if (point !== null) {
                    const word = words[point];
                    const pos = metadata[point].pos;
                    hoverWord.textContent = word;
                    hoverPos.textContent = pos;
                    hoverInfo.classList.add('active');
                } else {
                    hoverInfo.classList.remove('active');
                }
            },
            pointColorer: (i, selectedIndices, hoverIndex) => {
                const labelIndex = metadata[i].labelIndex;

                if (hoverIndex === i) {
                    return 'white';
                }

                if (selectedIndices.size === 0) {
                    return colorsByPOS[labelIndex];
                } else {
                    const isSelected = selectedIndices.has(i);
                    return isSelected
                        ? colorsByPOS[labelIndex]
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

        progressFill.style.width = '100%';
        statusText.textContent = '✅ Visualization complete! Use mouse to rotate, zoom, and explore.';
        vizStatusEl.textContent = 'Active';

        // Enable controls
        toggle3dEl.disabled = false;
        searchWordEl.disabled = false;
        filterPosEl.disabled = false;

        // Add control event listeners
        toggle3dEl.addEventListener('change', (e) => {
            scatterGL.setDimensions(e.target.checked ? 3 : 2);
        });

        searchWordEl.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) {
                scatterGL.select([]);
                return;
            }

            const matches = words
                .map((word, i) => ({ word, index: i }))
                .filter(({ word }) => word.toLowerCase().includes(query));

            if (matches.length > 0) {
                const indices = matches.map(m => m.index).slice(0, 100);
                scatterGL.select(indices);
                statusText.textContent = `Found ${matches.length} matches (showing first 100)`;
            } else {
                scatterGL.select([]);
                statusText.textContent = 'No matches found';
            }
        });

        filterPosEl.addEventListener('change', (e) => {
            const posFilter = e.target.value;
            if (!posFilter) {
                scatterGL.select([]);
                statusText.textContent = 'Showing all words';
                return;
            }

            const indices = metadata
                .map((m, i) => m.pos === posFilter ? i : null)
                .filter(i => i !== null);

            scatterGL.select(indices);
            statusText.textContent = `Showing ${indices.length.toLocaleString()} ${posFilter}s`;
        });

        visualizeBtn.classList.remove('loading');

    } catch (error) {
        statusText.textContent = `❌ Error: ${error.message}`;
        console.error(error);
        visualizeBtn.classList.remove('loading');
    }
});

// Initialize
checkWordNet();
