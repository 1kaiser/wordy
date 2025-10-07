/**
 * Simple Semantic Search - ThinkingMachines Style
 * Rectangular word boxes without 3D visualization
 */

// State
let corpusData = {
    words: [],
    embeddings: null,
    metadata: []
};

let isLoaded = false;

// Elements
const statusEl = document.getElementById('status');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsContainer = document.getElementById('results-container');
const resultsGrid = document.getElementById('results-grid');
const loadingEl = document.getElementById('loading');
const statsEl = document.getElementById('stats');

// Statistics elements
const statWordsEl = document.getElementById('stat-words');
const statDimEl = document.getElementById('stat-dim');
const statWordnetEl = document.getElementById('stat-wordnet');
const statScienceEl = document.getElementById('stat-science');

// Cosine similarity function
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Load corpus data
async function loadCorpus() {
    try {
        setStatus('Loading corpus metadata...', 'info');

        // Load metadata
        const metadataResponse = await fetch('./corpus-metadata.json');
        const metadata = await metadataResponse.json();
        corpusData.words = metadata.words;
        corpusData.metadata = metadata.metadata;

        setStatus('Loading embeddings...', 'info');

        // Load embeddings (binary format)
        const embeddingsResponse = await fetch('./corpus-embeddings.bin');
        const embeddingsBuffer = await embeddingsResponse.arrayBuffer();
        const embeddingsArray = new Float32Array(embeddingsBuffer);

        // Reshape into 2D array (words x dimensions)
        const numWords = corpusData.words.length;
        const dimensions = embeddingsArray.length / numWords;

        corpusData.embeddings = [];
        for (let i = 0; i < numWords; i++) {
            const start = i * dimensions;
            const end = start + dimensions;
            corpusData.embeddings.push(embeddingsArray.slice(start, end));
        }

        // Update statistics
        const wordnetCount = corpusData.metadata.filter(m => m.source === 'wordnet').length;
        const scienceCount = corpusData.metadata.filter(m => m.source === 'science').length;
        const bothCount = corpusData.metadata.filter(m => m.source === 'both').length;

        statWordsEl.textContent = numWords.toLocaleString();
        statDimEl.textContent = dimensions;
        statWordnetEl.textContent = wordnetCount.toLocaleString();
        statScienceEl.textContent = scienceCount.toLocaleString();

        statsEl.style.display = 'grid';

        setStatus('Ready! Click a word or type to search.', 'success');

        // Enable search
        searchInput.disabled = false;
        searchBtn.disabled = false;
        loadingEl.style.display = 'none';

        isLoaded = true;

        console.log('Corpus loaded:', {
            words: numWords,
            dimensions,
            wordnet: wordnetCount,
            science: scienceCount,
            both: bothCount
        });

    } catch (error) {
        console.error('Error loading corpus:', error);
        setStatus('Error loading corpus: ' + error.message, 'error');
    }
}

// Set status message
function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';
}

// Find similar words
function findSimilar(query, topK = 30) {
    const queryLower = query.toLowerCase();
    const queryIndex = corpusData.words.indexOf(queryLower);

    if (queryIndex === -1) {
        return {
            found: false,
            query: query
        };
    }

    const queryEmbedding = corpusData.embeddings[queryIndex];

    // Calculate similarities
    const similarities = corpusData.words.map((word, i) => ({
        word,
        index: i,
        similarity: cosineSimilarity(queryEmbedding, corpusData.embeddings[i]),
        metadata: corpusData.metadata[i]
    }));

    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Return top K (excluding the query word itself)
    return {
        found: true,
        query: queryLower,
        queryIndex,
        queryMetadata: corpusData.metadata[queryIndex],
        results: similarities.slice(1, topK + 1)
    };
}

// Display search results
function displayResults(result) {
    if (!result.found) {
        resultsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #718096;">
                Word "<strong>${result.query}</strong>" not found in corpus
            </div>
        `;
        resultsContainer.style.display = 'block';
        return;
    }

    // Display query word info
    document.getElementById('query-word').textContent = result.query;
    document.getElementById('query-meta').textContent =
        `${result.queryMetadata.source} • ${result.queryMetadata.pos || result.queryMetadata.category}`;

    // Display similar words in grid
    resultsGrid.innerHTML = result.results.map((item, i) => {
        const sourceColor = item.metadata.source === 'wordnet' ? '#667eea' :
                          item.metadata.source === 'science' ? '#ff8844' :
                          '#ff8800';

        return `
            <div class="word-box" data-word="${item.word}">
                <div class="word-text">${item.word}</div>
                <div class="word-similarity">${(item.similarity * 100).toFixed(1)}% similar</div>
                <div class="word-meta">${item.metadata.source}</div>
            </div>
        `;
    }).join('');

    // Add click handlers to word boxes
    document.querySelectorAll('.word-box').forEach(box => {
        box.addEventListener('click', () => {
            const word = box.dataset.word;
            searchWord(word);
        });
    });

    resultsContainer.style.display = 'block';

    console.log('Search results for:', result.query);
    console.log('Top 10:', result.results.slice(0, 10).map(r => `${r.word} (${(r.similarity * 100).toFixed(1)}%)`));
}

// Search for a word
window.searchWord = function(word) {
    if (!isLoaded) {
        setStatus('Please wait for corpus to load...', 'info');
        return;
    }

    searchInput.value = word;
    setStatus(`Searching for "${word}"...`, 'info');

    const result = findSimilar(word);
    displayResults(result);

    if (result.found) {
        setStatus(`Found ${result.results.length} similar words`, 'success');
    } else {
        setStatus(`Word "${word}" not found`, 'error');
    }
};

// Event listeners
searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
        searchWord(query);
    }
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
            searchWord(query);
        }
    }
});

// Auto-load on page load
window.addEventListener('load', () => {
    loadCorpus();
});
