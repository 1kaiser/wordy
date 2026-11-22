/**
 * Corpus Preloader (Opt-In Only)
 * Avoids automatic 455 MB downloads on page load.
 * Downloads and caches 147K dense corpus in IndexedDB only when explicitly triggered by the user.
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
        if (!this.db) {
            this.db = await this.openDB();
        }
        return await this.isCorpusCached();
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
            if (!this.db) this.db = await this.openDB();
            const metadata = await this.getFromDB('metadata');
            const embeddings = await this.getFromDB('embeddings');
            return !!(metadata && embeddings);
        } catch {
            return false;
        }
    }

    getFromDB(key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.storeName], 'readonly');
            const req = tx.objectStore(this.storeName).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    putToDB(key, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.storeName], 'readwrite');
            const req = tx.objectStore(this.storeName).put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async startDownload(onProgress) {
        if (this.isDownloading) return false;
        if (!this.db) this.db = await this.openDB();
        if (await this.isCorpusCached()) return true;

        this.isDownloading = true;
        this.downloadProgress = 0;
        try {
            const metaRes = await fetch('./corpus-metadata.json');
            if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status} loading corpus-metadata.json`);
            const metadata = await metaRes.json();
            await this.putToDB('metadata', metadata);

            const embRes = await fetch('./corpus-embeddings.bin');
            if (!embRes.ok) throw new Error(`HTTP ${embRes.status} loading corpus-embeddings.bin`);
            const total = parseInt(embRes.headers.get('content-length') || '0', 10);
            const reader = embRes.body.getReader();
            const chunks = [];
            let received = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                this.downloadProgress = total > 0 ? Math.min(100, (received / total) * 100) : 0;
                if (typeof onProgress === 'function') {
                    onProgress({
                        loadedBytes: received,
                        totalBytes: total,
                        percent: Math.round(this.downloadProgress)
                    });
                }
            }

            const merged = new Uint8Array(received);
            let pos = 0;
            for (const c of chunks) {
                merged.set(c, pos);
                pos += c.length;
            }
            await this.putToDB('embeddings', merged.buffer);
            await this.putToDB('downloadTimestamp', Date.now());
            window.dispatchEvent(new CustomEvent('corpus-ready', {
                detail: { words: metadata.words.length, size: received }
            }));
            return true;
        } finally {
            this.isDownloading = false;
        }
    }

    async getCorpus() {
        if (!this.db) this.db = await this.openDB();
        const metadata = await this.getFromDB('metadata');
        const embeddingsBuffer = await this.getFromDB('embeddings');
        if (!metadata || !embeddingsBuffer) return null;
        return {
            words: metadata.words,
            embeddings: new Float32Array(embeddingsBuffer)
        };
    }

    async clearCache() {
        if (!this.db) this.db = await this.openDB();
        await this.putToDB('metadata', null);
        await this.putToDB('embeddings', null);
        await this.putToDB('downloadTimestamp', null);
    }
}

if (typeof window !== 'undefined') {
    window.corpusPreloader = new CorpusPreloader();
}
