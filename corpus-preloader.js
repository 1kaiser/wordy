/**
 * Corpus Background Preloader
 * Automatically downloads 455MB corpus from GitHub release in background
 * Stores in IndexedDB for instant RAG panel access
 */

class CorpusPreloader {
    constructor() {
        this.dbName = 'WordyCorpusDB';
        this.dbVersion = 1;
        this.storeName = 'corpus';
        this.db = null;
        this.isDownloading = false;
        this.downloadProgress = 0;
    }

    async init() {
        console.log('📦 Corpus Preloader: Initializing...');

        // Open IndexedDB
        this.db = await this.openDB();

        // Check if corpus already cached
        const cached = await this.isCorpusCached();

        if (cached) {
            console.log('✅ Corpus already cached in IndexedDB');
            return;
        }

        // Start background download
        console.log('📥 Starting background corpus download (455MB)...');
        this.startBackgroundDownload();
    }

    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async isCorpusCached() {
        try {
            const metadata = await this.getFromDB('metadata');
            const embeddings = await this.getFromDB('embeddings');
            return metadata !== null && embeddings !== null;
        } catch (error) {
            console.warn('⚠️ Error checking cache:', error);
            return false;
        }
    }

    getFromDB(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    putToDB(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(value, key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async startBackgroundDownload() {
        if (this.isDownloading) {
            console.log('⏳ Download already in progress');
            return;
        }

        this.isDownloading = true;

        try {
            // Download metadata (22MB) from GitHub Pages
            console.log('📥 Downloading corpus metadata (22MB)...');
            const metadataUrl = 'https://1kaiser.github.io/wordy/corpus-metadata.json';
            const metadataRes = await fetch(metadataUrl);

            if (!metadataRes.ok) {
                throw new Error(`Failed to download metadata: ${metadataRes.statusText}`);
            }

            const metadata = await metadataRes.json();
            await this.putToDB('metadata', metadata);
            console.log(`✅ Metadata cached: ${metadata.words.length.toLocaleString()} words`);

            // Download embeddings (433MB) with progress tracking from GitHub Pages
            console.log('📥 Downloading corpus embeddings (433MB)... This may take a few minutes');
            const embeddingsUrl = 'https://1kaiser.github.io/wordy/corpus-embeddings.bin';

            const embeddingsRes = await fetch(embeddingsUrl);

            if (!embeddingsRes.ok) {
                throw new Error(`Failed to download embeddings: ${embeddingsRes.statusText}`);
            }

            // Get content length for progress
            const contentLength = embeddingsRes.headers.get('content-length');
            const total = parseInt(contentLength, 10);

            // Read stream with progress
            const reader = embeddingsRes.body.getReader();
            const chunks = [];
            let received = 0;

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                chunks.push(value);
                received += value.length;

                // Update progress
                this.downloadProgress = (received / total) * 100;

                // Log progress every 10%
                if (Math.floor(this.downloadProgress) % 10 === 0) {
                    const mb = (received / 1024 / 1024).toFixed(1);
                    const totalMb = (total / 1024 / 1024).toFixed(1);
                    console.log(`📊 Download progress: ${mb}MB / ${totalMb}MB (${Math.floor(this.downloadProgress)}%)`);
                }
            }

            // Combine chunks into ArrayBuffer
            const embeddingsBuffer = new Uint8Array(received);
            let position = 0;
            for (const chunk of chunks) {
                embeddingsBuffer.set(chunk, position);
                position += chunk.length;
            }

            // Store in IndexedDB
            await this.putToDB('embeddings', embeddingsBuffer.buffer);
            console.log('✅ Corpus embeddings cached successfully!');

            // Mark download timestamp
            await this.putToDB('downloadTimestamp', Date.now());

            console.log('🎉 Background corpus download complete! RAG panel ready for instant use.');

            // Dispatch event for UI to listen to
            window.dispatchEvent(new CustomEvent('corpus-ready', {
                detail: {
                    words: metadata.words.length,
                    size: received
                }
            }));

        } catch (error) {
            console.error('❌ Background corpus download failed:', error);
            console.log('ℹ️ Corpus will download when you open RAG panel');
        } finally {
            this.isDownloading = false;
        }
    }

    async getCorpus() {
        const metadata = await this.getFromDB('metadata');
        const embeddingsBuffer = await this.getFromDB('embeddings');

        if (!metadata || !embeddingsBuffer) {
            return null;
        }

        return {
            words: metadata.words,
            embeddings: new Float32Array(embeddingsBuffer)
        };
    }

    async clearCache() {
        await this.putToDB('metadata', null);
        await this.putToDB('embeddings', null);
        await this.putToDB('downloadTimestamp', null);
        console.log('🗑️ Corpus cache cleared');
    }
}

// Auto-initialize on page load (after a small delay to not block initial render)
if (typeof window !== 'undefined') {
    window.corpusPreloader = new CorpusPreloader();

    // Start preloading after 2 seconds (let page fully load first)
    window.addEventListener('load', () => {
        setTimeout(() => {
            window.corpusPreloader.init();
        }, 2000);
    });
}
