/**
 * UMAP Processor (Node.js)
 *
 * Loads corpus embeddings and runs UMAP dimensionality reduction (768D → 3D)
 * Saves 3D coordinates for visualization
 */

import { UMAP } from 'umap-js';
import fs from 'fs';

class UMAPProcessor {
    constructor() {
        this.corpus = null;
        this.embeddings = null;
        this.points3D = null;
    }

    /**
     * Load metadata and binary embeddings
     */
    async loadCorpus() {
        console.log('📂 Loading corpus...');

        // Load metadata
        const metadataPath = './corpus-metadata.json';
        if (!fs.existsSync(metadataPath)) {
            throw new Error('Metadata file not found. Run generate-corpus.js first.');
        }

        this.corpus = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        console.log(`   Words: ${this.corpus.totalWords.toLocaleString()}`);
        console.log(`   Embedding dimension: ${this.corpus.embeddingDimension}`);

        // Load binary embeddings
        const binPath = './corpus-embeddings.bin';
        if (!fs.existsSync(binPath)) {
            throw new Error('Binary embeddings file not found. Run generate-corpus.js first.');
        }

        const buffer = fs.readFileSync(binPath);
        const floatArray = new Float32Array(buffer.buffer);

        // Reconstruct embeddings array
        this.embeddings = [];
        const dim = this.corpus.embeddingDimension;
        for (let i = 0; i < this.corpus.totalWords; i++) {
            const embedding = Array.from(floatArray.slice(i * dim, (i + 1) * dim));
            this.embeddings.push(embedding);
        }

        console.log(`✅ Loaded ${this.embeddings.length.toLocaleString()} embeddings`);
    }

    /**
     * Run UMAP dimensionality reduction
     */
    async runUMAP() {
        console.log('\n🎯 Running UMAP (768D → 3D)...');
        console.log('   nNeighbors: 15');
        console.log('   minDist: 0.1');
        console.log('   spread: 1.0');
        console.log('   nEpochs: 500');
        console.log(`   Estimated time: ~${Math.ceil(this.embeddings.length / 5000)} minutes\n`);

        const umap = new UMAP({
            nComponents: 3,
            nNeighbors: 15,
            minDist: 0.1,
            spread: 1.0,
            nEpochs: 500
        });

        const startTime = Date.now();
        let lastUpdate = startTime;

        // Run UMAP with progress callback
        const embedding3D = await umap.fitAsync(
            this.embeddings,
            (epochNumber) => {
                const now = Date.now();
                if (now - lastUpdate > 5000) { // Update every 5 seconds
                    const progress = ((epochNumber / 500) * 100).toFixed(1);
                    const elapsed = (now - startTime) / 1000 / 60;
                    const rate = epochNumber / elapsed;
                    const remaining = (500 - epochNumber) / rate;

                    console.log(
                        `  Epoch ${epochNumber}/500 (${progress}%) - ` +
                        `Elapsed: ${elapsed.toFixed(1)}min - ` +
                        `ETA: ${remaining.toFixed(1)}min`
                    );
                    lastUpdate = now;
                }
            }
        );

        // Convert to simple array format
        this.points3D = embedding3D.map(point => [point[0], point[1], point[2]]);

        const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`\n✅ UMAP complete! Total time: ${totalTime} minutes`);
    }

    /**
     * Save 3D coordinates
     */
    async save3DPoints() {
        console.log('\n💾 Saving 3D coordinates...');

        const output = {
            version: '1.0',
            generatedAt: new Date().toISOString(),
            totalPoints: this.points3D.length,
            dimensions: 3,
            umapParams: {
                nComponents: 3,
                nNeighbors: 15,
                minDist: 0.1,
                spread: 1.0,
                nEpochs: 500
            },
            points: this.points3D
        };

        // Save as JSON
        fs.writeFileSync(
            './corpus-3d-points.json',
            JSON.stringify(output)
        );

        const sizeMB = (fs.statSync('./corpus-3d-points.json').size / 1024 / 1024).toFixed(2);
        console.log(`✅ Saved: corpus-3d-points.json (${sizeMB} MB)`);

        // Also save as binary for faster loading
        const buffer = new Float32Array(this.points3D.flat());
        fs.writeFileSync('./corpus-3d-points.bin', Buffer.from(buffer.buffer));

        const binSizeMB = (fs.statSync('./corpus-3d-points.bin').size / 1024 / 1024).toFixed(2);
        console.log(`✅ Saved: corpus-3d-points.bin (${binSizeMB} MB)`);
    }

    /**
     * Generate statistics
     */
    getStatistics() {
        console.log('\n📊 Statistics:');
        console.log(`   Total points: ${this.points3D.length.toLocaleString()}`);

        // Calculate bounding box
        const xVals = this.points3D.map(p => p[0]);
        const yVals = this.points3D.map(p => p[1]);
        const zVals = this.points3D.map(p => p[2]);

        const bounds = {
            x: { min: Math.min(...xVals), max: Math.max(...xVals) },
            y: { min: Math.min(...yVals), max: Math.max(...yVals) },
            z: { min: Math.min(...zVals), max: Math.max(...zVals) }
        };

        console.log(`   X range: [${bounds.x.min.toFixed(2)}, ${bounds.x.max.toFixed(2)}]`);
        console.log(`   Y range: [${bounds.y.min.toFixed(2)}, ${bounds.y.max.toFixed(2)}]`);
        console.log(`   Z range: [${bounds.z.min.toFixed(2)}, ${bounds.z.max.toFixed(2)}]`);

        return bounds;
    }

    /**
     * Main execution
     */
    async run() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  UMAP Dimensionality Reduction (768D → 3D)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        try {
            // Step 1: Load corpus
            await this.loadCorpus();

            // Step 2: Run UMAP
            await this.runUMAP();

            // Step 3: Save results
            await this.save3DPoints();

            // Step 4: Statistics
            this.getStatistics();

            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('  ✅ UMAP PROCESSING COMPLETE!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            console.log('Generated files:');
            console.log('  📄 corpus-3d-points.json - 3D coordinates (JSON)');
            console.log('  📄 corpus-3d-points.bin  - 3D coordinates (binary)\n');

            console.log('Next step:');
            console.log('  Open semantic-search.html to visualize!\n');

        } catch (error) {
            console.error('\n❌ Error:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    }
}

// Run the processor
const processor = new UMAPProcessor();
processor.run();
