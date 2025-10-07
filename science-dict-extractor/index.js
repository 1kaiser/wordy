/**
 * Oxford Dictionary of Science Term Extractor
 *
 * Extracts scientific terms from the Oxford Dictionary of Science
 * with category classification
 */

export class ScienceDictExtractor {
    constructor(filePath = '32145473.txt') {
        this.filePath = filePath;

        // Scientific categories based on typical markers in definitions
        this.categories = {
            physics: ['physics', 'quantum', 'particle', 'radiation', 'electromagnetic', 'thermodynamic', 'kinetic', 'optics', 'mechanics'],
            chemistry: ['chemistry', 'chemical', 'compound', 'molecule', 'atom', 'acid', 'reaction', 'element', 'ion', 'catalyst'],
            biology: ['biology', 'cell', 'organism', 'species', 'gene', 'protein', 'enzyme', 'animal', 'plant', 'tissue'],
            astronomy: ['astronomy', 'cosmology', 'galaxy', 'star', 'planet', 'solar', 'celestial', 'universe', 'cosmic'],
            mathematics: ['mathematics', 'equation', 'theorem', 'algebra', 'geometry', 'calculus', 'matrix', 'function'],
            geology: ['geology', 'earth', 'rock', 'mineral', 'geological', 'crust', 'sediment'],
            general: []
        };
    }

    /**
     * Load and parse the science dictionary file
     * @returns {Promise<{terms: string[], metadata: Object[]}>}
     */
    async extractAllTerms() {
        try {
            const response = await fetch(this.filePath);
            if (!response.ok) {
                throw new Error(`Failed to load ${this.filePath}: ${response.status}`);
            }

            const text = await response.text();
            const entries = this.parseEntries(text);

            console.log(`Extracted ${entries.length} scientific terms`);
            return entries;
        } catch (error) {
            console.error(`Error loading science dictionary:`, error);
            return { terms: [], metadata: [] };
        }
    }

    /**
     * Parse entries from the dictionary text
     * @param {string} text - Full dictionary text
     * @returns {Object} - {terms: string[], metadata: Object[]}
     */
    parseEntries(text) {
        const terms = [];
        const metadata = [];
        const lines = text.split('\n');

        let currentTerm = null;
        let currentDefinition = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip empty lines and page numbers
            if (!line || line.match(/^\d+→/)) {
                continue;
            }

            // Remove line number prefix if present
            const cleanLine = line.replace(/^\d+→/, '').trim();

            // Check if this looks like a new entry (starts with lowercase letter or abbreviation)
            const entryMatch = cleanLine.match(/^([a-zA-Z][a-zA-Z0-9\s\-']{0,40}?)(\s+[A-Z]|$)/);

            if (entryMatch && this.isLikelyTerm(cleanLine)) {
                // Save previous entry if exists
                if (currentTerm && currentDefinition) {
                    const category = this.categorize(currentDefinition);
                    terms.push(currentTerm);
                    metadata.push({
                        category: category.name,
                        labelIndex: category.index,
                        hasDefinition: true
                    });
                }

                // Start new entry
                const words = cleanLine.split(' ');
                currentTerm = words[0].toLowerCase().replace(/[^a-z0-9\-]/g, '');
                currentDefinition = cleanLine;
            } else {
                // Continue current definition
                currentDefinition += ' ' + cleanLine;
            }
        }

        // Save last entry
        if (currentTerm && currentDefinition) {
            const category = this.categorize(currentDefinition);
            terms.push(currentTerm);
            metadata.push({
                category: category.name,
                labelIndex: category.index,
                hasDefinition: true
            });
        }

        return { terms, metadata };
    }

    /**
     * Determine if a line is likely to be a term entry
     * @param {string} line
     * @returns {boolean}
     */
    isLikelyTerm(line) {
        // Filters for likely term lines
        if (line.length > 100) return false; // Too long for a headword
        if (line.match(/^(The|This|It|In|For|See also|Compare)/)) return false; // Likely continuation
        if (line.match(/^\d+$/)) return false; // Just a number
        if (line.match(/^[A-Z][A-Z\s]+$/)) return false; // All caps (likely heading)

        return true;
    }

    /**
     * Categorize a term based on its definition
     * @param {string} definition
     * @returns {Object} - {name: string, index: number}
     */
    categorize(definition) {
        const lowerDef = definition.toLowerCase();

        const scores = {};
        for (const [category, keywords] of Object.entries(this.categories)) {
            if (category === 'general') continue;

            scores[category] = keywords.reduce((score, keyword) => {
                const matches = (lowerDef.match(new RegExp(keyword, 'g')) || []).length;
                return score + matches;
            }, 0);
        }

        // Find highest scoring category
        let maxScore = 0;
        let bestCategory = 'general';
        for (const [category, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                bestCategory = category;
            }
        }

        const categoryIndices = {
            physics: 0,
            chemistry: 1,
            biology: 2,
            astronomy: 3,
            mathematics: 4,
            geology: 5,
            general: 6
        };

        return {
            name: bestCategory,
            index: categoryIndices[bestCategory]
        };
    }

    /**
     * Get statistics about extracted terms
     * @returns {Promise<Object>}
     */
    async getStatistics() {
        const { terms, metadata } = await this.extractAllTerms();

        const stats = {
            total: terms.length,
            byCategory: {}
        };

        for (const meta of metadata) {
            if (!stats.byCategory[meta.category]) {
                stats.byCategory[meta.category] = 0;
            }
            stats.byCategory[meta.category]++;
        }

        return stats;
    }

    /**
     * Extract terms and serialize
     * @returns {Promise<Object>}
     */
    async extractAndSerialize() {
        const { terms, metadata } = await this.extractAllTerms();

        const stats = {};
        for (const meta of metadata) {
            if (!stats[meta.category]) {
                stats[meta.category] = 0;
            }
            stats[meta.category]++;
        }

        return {
            source: 'Oxford Dictionary of Science (6th Edition)',
            extractedAt: new Date().toISOString(),
            totalTerms: terms.length,
            terms,
            metadata,
            statistics: stats
        };
    }
}

export default ScienceDictExtractor;
