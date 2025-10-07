/**
 * WordNet Word Extractor
 *
 * Extracts all unique words from WordNet 3.1 dictionary indexes
 * Returns words with part-of-speech metadata
 */

export class WordNetExtractor {
    constructor(dictPath = 'dict') {
        this.dictPath = dictPath;
        this.posTypes = ['noun', 'verb', 'adj', 'adv'];
        this.posLabels = {
            'noun': { label: 'noun', labelIndex: 0 },
            'verb': { label: 'verb', labelIndex: 1 },
            'adj': { label: 'adjective', labelIndex: 2 },
            'adv': { label: 'adverb', labelIndex: 3 }
        };
    }

    /**
     * Extract all words from all WordNet indexes
     * @returns {Promise<{words: string[], metadata: Object[]}>}
     */
    async extractAllWords() {
        const words = [];
        const metadata = [];

        for (const pos of this.posTypes) {
            console.log(`Extracting ${pos}s...`);
            const posWords = await this.extractWordsFromIndex(pos);

            posWords.forEach(word => {
                words.push(word);
                metadata.push({
                    pos: this.posLabels[pos].label,
                    labelIndex: this.posLabels[pos].labelIndex
                });
            });

            console.log(`  Found ${posWords.length} ${pos}s`);
        }

        console.log(`Total: ${words.length} words extracted`);
        return { words, metadata };
    }

    /**
     * Extract words from a specific POS index file
     * @param {string} pos - Part of speech (noun, verb, adj, adv)
     * @returns {Promise<string[]>}
     */
    async extractWordsFromIndex(pos) {
        try {
            const response = await fetch(`${this.dictPath}/index.${pos}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch index.${pos}: ${response.status}`);
            }

            const text = await response.text();
            return this.parseIndexFile(text);
        } catch (error) {
            console.error(`Error loading index.${pos}:`, error);
            return [];
        }
    }

    /**
     * Parse WordNet index file format
     * Format: word pos sense_count pointer_types synset_offsets...
     * Example: computer n 2 7 @ ~ #p %p + ; - 2 1 03086983 09906486
     *
     * @param {string} text - Index file contents
     * @returns {string[]} - Array of unique words
     */
    parseIndexFile(text) {
        const words = new Set();
        const lines = text.split('\n');

        for (const line of lines) {
            // Skip empty lines and copyright header (lines starting with spaces)
            if (!line || line.startsWith(' ') || line.startsWith('\t')) {
                continue;
            }

            // Extract word (first field before space)
            const parts = line.trim().split(/\s+/);
            if (parts.length > 0) {
                const word = parts[0];

                // Clean up word (remove underscores for multi-word entries)
                const cleanWord = word.replace(/_/g, ' ');

                if (cleanWord && cleanWord.length > 0) {
                    words.add(cleanWord);
                }
            }
        }

        return Array.from(words).sort();
    }

    /**
     * Get statistics about extracted words
     * @returns {Promise<Object>}
     */
    async getStatistics() {
        const stats = {
            total: 0,
            byPOS: {}
        };

        for (const pos of this.posTypes) {
            const words = await this.extractWordsFromIndex(pos);
            const posLabel = this.posLabels[pos].label;
            stats.byPOS[posLabel] = words.length;
            stats.total += words.length;
        }

        return stats;
    }

    /**
     * Extract words and save to JSON
     * @returns {Promise<Object>}
     */
    async extractAndSerialize() {
        const { words, metadata } = await this.extractAllWords();

        return {
            version: 'WordNet 3.1',
            extractedAt: new Date().toISOString(),
            totalWords: words.length,
            words,
            metadata,
            statistics: {
                nouns: metadata.filter(m => m.labelIndex === 0).length,
                verbs: metadata.filter(m => m.labelIndex === 1).length,
                adjectives: metadata.filter(m => m.labelIndex === 2).length,
                adverbs: metadata.filter(m => m.labelIndex === 3).length
            }
        };
    }
}

export default WordNetExtractor;
