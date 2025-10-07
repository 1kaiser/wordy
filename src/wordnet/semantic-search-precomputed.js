/**
 * Semantic Search with Precomputed Data
 *
 * Uses pre-generated embeddings and 3D coordinates for instant visualization
 */

import { ScatterGL, Dataset } from 'scatter-gl';
import { PrecomputedLoader } from './precomputed-loader.js';

// State
let loader = null;
let corpusData = null;
let scatterGL = null;

// Elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const loadBtn = document.getElementById('load-btn');
const searchSection = document.getElementById('search-section');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsSection = document.getElementById('results-section');
const resultsList = document.getElementById('results-list');
const totalWordsEl = document.getElementById('total-words');
const sourcesStatsEl = document.getElementById('sources-stats');
const visualizationEl = document.getElementById('visualization');

// Initialize
loader = new PrecomputedLoader();

function setStatus(status, message) {
    statusIndicator.className = `status-indicator ${status}`;
    statusText.textContent = message;
}

function updateProgress(step, total = 4) {
    const progress = (step / total) * 100;
    progressFill.style.width = `${progress}%`;
}

// Load precomputed data
loadBtn.addEventListener('click', async () => {
    try {
        loadBtn.disabled = true;
        setStatus('loading', 'Loading precomputed data...');

        // Load all data with progress updates
        corpusData = await loader.loadAll((progress) => {
            setStatus('loading', progress.message);
            updateProgress(progress.step, 4);
        });

        // Update statistics
        const stats = loader.getStatistics();
        totalWordsEl.textContent = stats.totalWords.toLocaleString();
        sourcesStatsEl.innerHTML = `
            <div>WordNet: ${stats.sources.wordnet.toLocaleString()}</div>
            <div>Science: ${stats.sources.science.toLocaleString()}</div>
            <div>Overlap: ${stats.sources.both.toLocaleString()}</div>
        `;

        // Prepare visualization
        setStatus('success', 'Rendering visualization...');
        await renderVisualization();

        // Enable search
        searchSection.style.display = 'block';
        setStatus('success', `Ready! ${stats.totalWords.toLocaleString()} words loaded.`);
        updateProgress(4, 4);

    } catch (error) {
        console.error('Error loading data:', error);
        setStatus('error', `Error: ${error.message}`);
        loadBtn.disabled = false;
    }
});

// Render Scatter-GL visualization
async function renderVisualization() {
    const containerElement = visualizationEl;

    // Prepare data for Scatter-GL
    const { points, metadata } = loader.prepareScatterGLData();

    // Create dataset
    const dataset = new Dataset(points, metadata.map((meta, i) => ({
        index: i,
        label: meta.label
    })));

    // Point colorer function
    const pointColorer = (i) => {
        const meta = corpusData.metadata[i];
        const color = PrecomputedLoader.getPointColor(meta);

        // Convert hex to RGB array
        const hex = color.replace('#', '');
        return [
            parseInt(hex.substr(0, 2), 16),
            parseInt(hex.substr(2, 2), 16),
            parseInt(hex.substr(4, 2), 16)
        ];
    };

    // Hover callback
    const onHover = (pointIndex) => {
        if (pointIndex != null) {
            const word = corpusData.words[pointIndex];
            const meta = corpusData.metadata[pointIndex];
            console.log(`Hovering: ${word} (${meta.source}, ${meta.pos || meta.category})`);
        }
    };

    // Click callback
    const onClick = (pointIndex) => {
        if (pointIndex != null) {
            const word = corpusData.words[pointIndex];
            searchInput.value = word;
            performSearch(word);
        }
    };

    // Create Scatter-GL instance
    scatterGL = new ScatterGL(containerElement, {
        onClick,
        onHover,
        pointColorer,
        renderMode: 'POINT',
        rotateOnStart: true,
        showLabelsOnHover: true,
        styles: {
            point: { colorUnselected: 'rgba(100, 100, 255, 0.3)' },
            label: { color: '#ffffff' }
        }
    });

    // Render
    scatterGL.render(dataset);
}

// Search functionality
searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
        performSearch(query);
    }
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
            performSearch(query);
        }
    }
});

function performSearch(query) {
    const result = loader.findSimilar(query.toLowerCase(), 20);

    if (!result.found) {
        resultsList.innerHTML = `<div class="result-item error">Word "${query}" not found in corpus</div>`;
        return;
    }

    // Display results
    let html = `<div class="result-item query">
        <strong>${query}</strong>
        <span class="similarity">Query word</span>
    </div>`;

    result.results.forEach((item, i) => {
        const sourceColor = item.metadata.source === 'wordnet' ? '#4488ff' :
                           item.metadata.source === 'science' ? '#ff8844' :
                           '#ff8800';

        html += `<div class="result-item" data-index="${item.index}">
            <span class="rank">${i + 1}.</span>
            <span class="word">${item.word}</span>
            <span class="similarity">${(item.similarity * 100).toFixed(1)}%</span>
            <span class="source" style="color: ${sourceColor}">${item.metadata.source}</span>
        </div>`;
    });

    resultsList.innerHTML = html;

    // Add click handlers to results
    document.querySelectorAll('.result-item[data-index]').forEach(el => {
        el.addEventListener('click', () => {
            const index = parseInt(el.dataset.index);
            highlightPoint(index);
        });
    });

    // Highlight query point
    highlightPoint(result.queryIndex);
}

function highlightPoint(index) {
    if (scatterGL) {
        scatterGL.select([index]);

        // Update status
        const word = corpusData.words[index];
        const meta = corpusData.metadata[index];
        setStatus('success', `Selected: ${word} (${meta.source}, ${meta.pos || meta.category})`);
    }
}

// Auto-start loading if files are available
window.addEventListener('load', () => {
    setStatus('ready', 'Click "Load Data" to start');
});
