/**
 * Corpus Background Preloader
 * Automatically downloads 455MB corpus from GitHub release in background
 * Stores in IndexedDB for instant RAG panel access
 */

class CorpusPreloader {
    constructor() {
        this.instanceId = Math.random().toString(36).substr(2, 5);
        this.dbName = 'WordyCorpusDB';
        this.dbVersion = 1;
        this.storeName = 'corpus';
        this.db = null;
        this.isDownloading = false;
        this.downloadProgress = 0;
    }

    async init() {
        console.log(`📦 Corpus Preloader [${this.instanceId}]: Initializing...`);

        // Open IndexedDB
        this.db = await this.openDB();

        // Check if corpus already cached
        const cached = await this.isCorpusCached();
        console.log(`🔍 cached variable value: ${cached} (type: ${typeof cached})`);

        if (cached) {
            console.log(`✅ Corpus already cached in IndexedDB [${this.instanceId}]`);
            return;
        } else {
            console.log(`❌ Corpus NOT cached, will download [${this.instanceId}]`);
        }

        // Start background download
        console.log(`📥 Starting background corpus download (455MB)... [${this.instanceId}]`);
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
            console.log(`🔍 isCorpusCached check: metadata=${!!metadata}, embeddings=${!!embeddings}`);
            // Check for truthy values, not just !== null (undefined also needs to return false)
            return !!metadata && !!embeddings;
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
            // Try relative URL first (local dev), fallback to GitHub Pages (production)
            console.log('📥 Downloading corpus metadata (22MB)...');
            const metadataUrls = [
                './corpus-metadata.json',  // Relative path for local/production
                'https://1kaiser.github.io/wordy/corpus-metadata.json'  // Fallback
            ];

            let metadataRes = null;
            for (const url of metadataUrls) {
                try {
                    console.log(`📡 Trying: ${url}`);
                    metadataRes = await fetch(url);
                    if (metadataRes.ok) break;
                } catch (e) {
                    console.warn(`⚠️ Failed to fetch from ${url}:`, e.message);
                }
            }

            if (!metadataRes || !metadataRes.ok) {
                throw new Error(`Failed to download metadata from all sources`);
            }

            const metadata = await metadataRes.json();
            await this.putToDB('metadata', metadata);
            console.log(`✅ Metadata cached: ${metadata.words.length.toLocaleString()} words`);

            // Download embeddings (433MB) with progress tracking
            console.log('📥 Downloading corpus embeddings (433MB)... This may take a few minutes');
            const embeddingsUrls = [
                './corpus-embeddings.bin',  // Relative path for local/production
                'https://1kaiser.github.io/wordy/corpus-embeddings.bin'  // Fallback
            ];

            let embeddingsRes = null;
            for (const url of embeddingsUrls) {
                try {
                    console.log(`📡 Trying: ${url}`);
                    embeddingsRes = await fetch(url);
                    if (embeddingsRes.ok) break;
                } catch (e) {
                    console.warn(`⚠️ Failed to fetch from ${url}:`, e.message);
                }
            }

            if (!embeddingsRes || !embeddingsRes.ok) {
                throw new Error(`Failed to download embeddings from all sources`);
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
        console.log('🔍 getCorpus() called');
        const metadata = await this.getFromDB('metadata');
        console.log(`📦 metadata from DB:`, metadata ? `YES (${metadata.words?.length || 0} words)` : 'NO');

        const embeddingsBuffer = await this.getFromDB('embeddings');
        console.log(`📦 embeddings from DB:`, embeddingsBuffer ? `YES (${embeddingsBuffer.byteLength || 0} bytes)` : 'NO');

        if (!metadata || !embeddingsBuffer) {
            console.log('❌ Corpus incomplete in IndexedDB');
            return null;
        }

        console.log('✅ Corpus complete - returning data');
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
