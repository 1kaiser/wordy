/**
 * Minimal WordNet Search - V2
 * Word boxing on space/punctuation, hover alternatives like ThinkingMachines
 */

const { createApp } = Vue;

createApp({
    data() {
        return {
            inputText: '',
            words: [],
            currentWord: '',  // Word being typed
            selectedWord: null,
            alternatives: [],
            corpusData: {
                words: [],
                embeddings: null
            },
            corpusReady: false,
            searchCache: new Map(),
            processingWords: new Set(),  // Track words being searched
            hoveredWord: null,
            copySuccess: false,
            renderDebounceTimer: null,  // Debounce re-renders during batch search
            searchDelay: 500,  // Delay in ms before starting VoY search (configurable)
            // Speech recognition
            recognition: null,
            speechSupported: false,
            isRecording: false,
            recordingStatus: 'Listening...'
        };
    },

    mounted() {
        this.loadCorpus();
        this.initD3();
        this.initSpeechRecognition();

        // Global ESC key handler
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearAll();
            }
        });

        // Click anywhere to hide alternatives
        window.addEventListener('click', (e) => {
            if (this.hoveredWord && !e.target.closest('.word-box') && !e.target.closest('.alt-box')) {
                this.hideAlternatives();
            }
        });
    },

    methods: {
        async loadCorpus() {
            try {
                const metadataRes = await fetch('corpus-metadata.json');
                const metadata = await metadataRes.json();

                const embeddingsRes = await fetch('corpus-embeddings.bin');
                const buffer = await embeddingsRes.arrayBuffer();
                const embeddings = new Float32Array(buffer);

                this.corpusData = {
                    words: metadata.words,
                    embeddings: embeddings
                };

                this.corpusReady = true;

                // Focus input when ready
                setTimeout(() => {
                    document.getElementById('text-input').focus();
                }, 300);

                console.log(`✅ Loaded ${metadata.words.length} words - Ready!`);
            } catch (error) {
                console.error('❌ Error loading corpus:', error);
                // Still enable interaction even if corpus fails to load
                this.corpusReady = true;

                // Focus input when ready
                setTimeout(() => {
                    document.getElementById('text-input').focus();
                }, 300);
            }
        },

        initD3() {
            this.svg = d3.select('#main-svg');
            this.wordGroup = this.svg.append('g').attr('id', 'word-group');
            this.altGroup = this.svg.append('g').attr('id', 'alternatives-group');
        },

        handleKeydown(e) {
            if (!this.corpusReady) {
                e.preventDefault();
                return;
            }

            // Box word on Space, Enter, or punctuation
            if (e.key === ' ' || e.key === 'Enter' || /[.,!?;:]/.test(e.key)) {
                e.preventDefault();  // Prevent default to avoid space character in input

                const word = this.currentWord.trim().toLowerCase().replace(/[^a-z]/g, '');

                if (word.length > 0 && !this.words.includes(word)) {
                    this.words.push(word);

                    // Render box IMMEDIATELY
                    this.renderWordBoxes();

                    // Start search in background with visual indicator (non-blocking)
                    if (this.corpusData.words.includes(word) && !this.searchCache.has(word)) {
                        setTimeout(() => this.searchWordWithIndicator(word), 0);
                    }
                }

                this.currentWord = '';
                this.inputText = '';  // Clear input text
            } else if (e.key === 'Backspace') {
                e.preventDefault();  // Prevent default backspace behavior

                // Handle backspace
                if (this.currentWord.length === 0 && this.words.length > 0) {
                    this.words.pop();
                    this.renderWordBoxes();
                } else {
                    this.currentWord = this.currentWord.slice(0, -1);
                    this.inputText = this.currentWord;  // Update input to show current word
                }
            } else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
                e.preventDefault();  // Prevent default to avoid duplicate character

                // Add letter to current word
                this.currentWord += e.key.toLowerCase();
                this.inputText = this.currentWord;  // Update input to show what's being typed
            }
        },

        handlePaste(e) {
            if (!this.corpusReady) {
                e.preventDefault();
                return;
            }

            e.preventDefault();

            // Get pasted text
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');

            // Parse into words (split by spaces and punctuation)
            const pastedWords = pastedText
                .toLowerCase()
                .split(/[\s.,!?;:]+/)
                .map(w => w.replace(/[^a-z]/g, ''))
                .filter(w => w.length > 0);

            // Add unique words (accumulative - supports multiple pastes)
            const newWords = [];
            pastedWords.forEach(word => {
                if (!this.words.includes(word)) {
                    this.words.push(word);
                    newWords.push(word);
                }
            });

            // Update input text
            this.inputText = this.words.join(' ');
            this.currentWord = '';

            // Render word boxes IMMEDIATELY (no debounce for paste)
            this.renderWordBoxes();

            // Launch parallel searches for all valid words that need searching
            // Do this AFTER rendering so boxes appear instantly
            const validWords = this.words.filter(w =>
                this.corpusData.words.includes(w) && !this.searchCache.has(w)
            );

            console.log(`📋 Pasted ${pastedWords.length} words (${newWords.length} new), ${validWords.length} need searching`);

            // Search with visual feedback - happens in background
            setTimeout(() => {
                validWords.forEach(word => this.searchWordWithIndicator(word));
            }, 0);
        },

        // Debounced render for batch updates
        renderWordBoxesDebounced() {
            if (this.renderDebounceTimer) {
                clearTimeout(this.renderDebounceTimer);
            }
            this.renderDebounceTimer = setTimeout(() => {
                this.renderWordBoxes();
                this.renderDebounceTimer = null;
            }, 50);  // 50ms debounce
        },

        renderWordBoxes() {
            if (this.words.length === 0) {
                this.wordGroup.selectAll('.word-box').remove();
                this.altGroup.selectAll('.alt-box').remove();
                return;
            }

            const svgWidth = window.innerWidth;
            const svgHeight = window.innerHeight;
            const boxHeight = 30;
            const boxGap = 8;
            const rowGap = 10;
            const padding = 16;
            const fontSize = 16;
            const maxWidth = svgWidth * 0.9; // Use 90% of viewport width

            // Calculate word data
            const wordData = this.words.map(word => {
                const isInCorpus = this.corpusData.words.includes(word);
                const textWidth = this.measureText(word, fontSize);
                const boxWidth = textWidth + (padding * 2);

                return {
                    word,
                    width: boxWidth,
                    height: boxHeight,
                    isInCorpus
                };
            });

            // Layout words into rows
            const rows = [];
            let currentRow = [];
            let currentRowWidth = 0;

            wordData.forEach(wordBox => {
                const boxTotalWidth = wordBox.width + boxGap;

                // Check if adding this box would exceed max width
                if (currentRowWidth + boxTotalWidth > maxWidth && currentRow.length > 0) {
                    // Start new row
                    rows.push(currentRow);
                    currentRow = [wordBox];
                    currentRowWidth = boxTotalWidth;
                } else {
                    // Add to current row
                    currentRow.push(wordBox);
                    currentRowWidth += boxTotalWidth;
                }
            });

            // Add last row
            if (currentRow.length > 0) {
                rows.push(currentRow);
            }

            // Calculate total height needed
            const totalHeight = rows.length * boxHeight + (rows.length - 1) * rowGap;

            // Position boxes centered, starting from top of centered block
            const startY = (svgHeight - totalHeight) / 2;
            let currentY = startY;

            rows.forEach(row => {
                // Calculate row width
                const rowWidth = row.reduce((sum, box) => sum + box.width + boxGap, 0) - boxGap;

                // Center this row horizontally
                let currentX = (svgWidth - rowWidth) / 2;

                row.forEach(d => {
                    d.x = currentX;
                    d.y = currentY;
                    currentX += d.width + boxGap;
                });

                currentY += boxHeight + rowGap;
            });

            // D3 data binding
            const boxes = this.wordGroup
                .selectAll('.word-box')
                .data(wordData, d => d.word);

            boxes.exit()
                .transition()
                .duration(150)  // Reduced from 300ms for snappier UX
                .style('opacity', 0)
                .remove();

            const enter = boxes.enter()
                .append('g')
                .attr('class', d => {
                    let classes = 'word-box';
                    if (!d.isInCorpus) classes += ' disabled';
                    if (d.word === this.selectedWord) classes += ' selected';
                    // Add darker border for words with cached alternatives
                    if (d.isInCorpus && this.searchCache.has(d.word)) classes += ' has-alternatives';
                    // Add processing class for words being searched
                    if (this.processingWords.has(d.word)) classes += ' processing';
                    return classes;
                })
                .attr('data-word', d => d.word)
                .style('opacity', 0);

            enter.append('rect')
                .attr('width', d => d.width)
                .attr('height', d => d.height)
                .attr('rx', 2)
                .attr('fill', '#fff')
                .attr('stroke', d => d.word === this.selectedWord ? '#e9411b' : '#000')
                .attr('stroke-opacity', d => {
                    if (d.word === this.selectedWord) return 0.8;
                    if (this.searchCache.has(d.word)) return 0.4;  // Darker for searched words
                    return 0.16;  // Light for unsearched words
                })
                .attr('shape-rendering', 'crispEdges');

            enter.append('text')
                .attr('x', d => d.width / 2)
                .attr('y', d => d.height / 2)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('fill', '#000')
                .attr('font-size', fontSize)
                .attr('font-family', 'GT America, -apple-system, sans-serif')
                .text(d => d.word);

            // Add click handler to show alternatives
            enter.on('click', (event, d) => {
                if (d.isInCorpus) {
                    event.stopPropagation();
                    // Toggle alternatives for this word
                    if (this.hoveredWord === d.word) {
                        this.hideAlternatives();
                    } else {
                        this.showAlternatives(d.word, d.x, d.y);
                    }
                }
            });

            const merged = enter.merge(boxes);

            // Update class for has-alternatives and processing
            merged.attr('class', d => {
                let classes = 'word-box';
                if (!d.isInCorpus) classes += ' disabled';
                if (d.word === this.selectedWord) classes += ' selected';
                if (d.isInCorpus && this.searchCache.has(d.word)) classes += ' has-alternatives';
                if (this.processingWords.has(d.word)) classes += ' processing';
                return classes;
            });

            merged
                .transition()
                .duration(150)  // Reduced from 300ms for instant feel
                .attr('transform', d => `translate(${d.x}, ${d.y})`)
                .style('opacity', 1);

            merged.select('rect')
                .transition()
                .duration(100)  // Reduced from 200ms for instant feedback
                .attr('stroke', d => d.word === this.selectedWord ? '#e9411b' : '#000')
                .attr('stroke-opacity', d => {
                    if (d.word === this.selectedWord) return 0.8;
                    if (this.searchCache.has(d.word)) return 0.4;  // Darker for searched words
                    return 0.16;  // Light for unsearched words
                });
        },

        async showAlternatives(word, wordX, wordY) {
            this.hoveredWord = word;
            this.selectedWord = word;

            // Get or fetch alternatives
            let alts = [];
            if (this.searchCache.has(word)) {
                alts = this.searchCache.get(word);
            } else {
                alts = await this.searchWord(word);
            }

            // Show top 5
            const top5 = alts.slice(0, 5);

            // Position above the word
            const boxHeight = 30;
            const boxGap = 6;
            const padding = 16;
            const fontSize = 14;
            const similarityFontSize = 10;

            let currentY = wordY - 10; // Start above the word

            // D3 binding for alternatives
            const altBoxes = this.altGroup
                .selectAll('.alt-box')
                .data(top5, d => d.word);

            altBoxes.exit().remove();

            const altEnter = altBoxes.enter()
                .append('g')
                .attr('class', 'alt-box')
                .attr('data-word', d => d.word)
                .style('opacity', 0);

            // Create each alternative box
            altEnter.each(function(d) {
                const g = d3.select(this);

                // Measure text
                const tempText = d3.select('#main-svg')
                    .append('text')
                    .attr('font-size', fontSize)
                    .attr('font-family', 'GT America, -apple-system, sans-serif')
                    .text(d.word);

                const bbox = tempText.node().getBBox();
                tempText.remove();

                const boxWidth = bbox.width + (padding * 2) + 30; // Extra space for similarity

                d.boxWidth = boxWidth;
                d.boxHeight = boxHeight;

                // Background rect
                g.append('rect')
                    .attr('width', boxWidth)
                    .attr('height', boxHeight)
                    .attr('rx', 2)
                    .attr('fill', '#fff')
                    .attr('stroke', '#000')
                    .attr('stroke-opacity', 0.16)
                    .attr('shape-rendering', 'crispEdges');

                // Word text
                g.append('text')
                    .attr('x', padding)
                    .attr('y', boxHeight / 2)
                    .attr('dominant-baseline', 'central')
                    .attr('fill', '#000')
                    .attr('font-size', fontSize)
                    .attr('font-family', 'GT America, -apple-system, sans-serif')
                    .text(d.word);

                // Similarity badge at right boundary (middle of right edge)
                const badgeText = `${d.similarity.toFixed(0)}%`;
                const badgeWidth = 32;
                const badgeHeight = 14;

                // Position at right boundary, vertically centered
                const badgeX = boxWidth + badgeWidth / 2;
                const badgeY = boxHeight / 2;

                // Background rectangle for badge
                g.append('rect')
                    .attr('class', 'alt-similarity-rect')
                    .attr('x', boxWidth - 1)
                    .attr('y', (boxHeight - badgeHeight) / 2)
                    .attr('width', badgeWidth)
                    .attr('height', badgeHeight)
                    .attr('rx', 2);

                // Badge text
                g.append('text')
                    .attr('class', 'alt-similarity-badge')
                    .attr('x', badgeX)
                    .attr('y', badgeY)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'central')
                    .attr('font-size', similarityFontSize)
                    .attr('font-family', 'GT America, -apple-system, sans-serif')
                    .text(badgeText);
            });

            // Position boxes above the word
            altEnter.each(function(d, i) {
                currentY -= (boxHeight + boxGap);
                d.y = currentY;
            });

            const altMerged = altEnter.merge(altBoxes);

            altMerged
                .transition()
                .duration(200)
                .attr('transform', d => `translate(${wordX}, ${d.y})`)
                .style('opacity', 1);

            // Click handler for alternatives
            altMerged.on('click', (event, d) => {
                this.replaceWord(word, d.word);
                event.stopPropagation();
            });
        },

        hideAlternatives() {
            this.hoveredWord = null;
            this.selectedWord = null;
            this.altGroup.selectAll('.alt-box')
                .transition()
                .duration(200)
                .style('opacity', 0)
                .remove();

            // Re-render to remove selection highlighting
            this.renderWordBoxes();
        },

        async searchWord(word) {
            if (this.searchCache.has(word)) {
                return this.searchCache.get(word);
            }

            const wordIndex = this.corpusData.words.indexOf(word);
            if (wordIndex === -1) return [];

            const embeddingDim = 768;
            const queryEmbedding = this.corpusData.embeddings.slice(
                wordIndex * embeddingDim,
                (wordIndex + 1) * embeddingDim
            );

            const similarities = [];
            const numWords = this.corpusData.words.length;

            for (let i = 0; i < numWords; i++) {
                if (i === wordIndex) continue;

                const candidateEmbedding = this.corpusData.embeddings.slice(
                    i * embeddingDim,
                    (i + 1) * embeddingDim
                );

                const similarity = this.cosineSimilarity(queryEmbedding, candidateEmbedding);
                similarities.push({
                    word: this.corpusData.words[i],
                    similarity: similarity * 100
                });
            }

            similarities.sort((a, b) => b.similarity - a.similarity);
            const results = similarities.slice(0, 30);

            this.searchCache.set(word, results);

            // Update UI with debounce to avoid multiple re-renders during batch search
            this.renderWordBoxesDebounced();

            return results;
        },

        async searchWordWithIndicator(word) {
            // Mark as processing - immediate render to show orange pulse
            this.processingWords.add(word);
            this.renderWordBoxesDebounced();

            // Add configurable delay before starting search (allows user to see processing indicator)
            await new Promise(resolve => setTimeout(resolve, this.searchDelay));

            // Perform search in background (truly async)
            const results = await this.searchWord(word);

            // Mark as complete
            this.processingWords.delete(word);
            this.renderWordBoxesDebounced();

            return results;
        },

        cosineSimilarity(a, b) {
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;

            for (let i = 0; i < a.length; i++) {
                dotProduct += a[i] * b[i];
                normA += a[i] * a[i];
                normB += b[i] * b[i];
            }

            return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        },

        replaceWord(oldWord, newWord) {
            const index = this.words.indexOf(oldWord);
            if (index !== -1) {
                this.words[index] = newWord;
                this.inputText = this.words.join(' ');
                this.renderWordBoxes();
                this.hideAlternatives();
            }
        },

        measureText(text, fontSize) {
            const temp = this.svg.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', 'GT America, -apple-system, sans-serif')
                .text(text);

            const bbox = temp.node().getBBox();
            temp.remove();

            return bbox.width;
        },

        copyText() {
            const textToCopy = this.words.join(' ');

            // Check if Clipboard API is available
            if (navigator.clipboard && navigator.clipboard.writeText) {
                // Modern Clipboard API
                navigator.clipboard.writeText(textToCopy).then(() => {
                    this.copySuccess = true;
                    setTimeout(() => {
                        this.copySuccess = false;
                    }, 2000);
                    console.log('✓ Copied:', textToCopy);
                }).catch(err => {
                    console.error('Copy failed:', err);
                    this.fallbackCopy(textToCopy);
                });
            } else {
                // Fallback for older browsers or non-secure contexts
                this.fallbackCopy(textToCopy);
            }
        },

        fallbackCopy(text) {
            // Create temporary textarea
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();

            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    this.copySuccess = true;
                    setTimeout(() => {
                        this.copySuccess = false;
                    }, 2000);
                    console.log('✓ Copied (fallback):', text);
                } else {
                    console.error('Fallback copy failed');
                }
            } catch (err) {
                console.error('Fallback copy error:', err);
            } finally {
                document.body.removeChild(textarea);
            }
        },

        clearAll() {
            this.inputText = '';
            this.words = [];
            this.currentWord = '';
            this.selectedWord = null;
            this.alternatives = [];
            this.hoveredWord = null;
            this.copySuccess = false;
            this.renderWordBoxes();
            this.hideAlternatives();

            document.getElementById('text-input').focus();
        },

        // Speech Recognition Methods
        initSpeechRecognition() {
            // Check for browser support
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

            if (!SpeechRecognition) {
                console.warn('Speech Recognition not supported in this browser');
                this.speechSupported = false;
                return;
            }

            this.speechSupported = true;
            this.recognition = new SpeechRecognition();

            // Configure recognition
            this.recognition.continuous = true;  // Keep listening
            this.recognition.interimResults = true;  // Get partial results
            this.recognition.lang = 'en-US';  // Language
            this.recognition.maxAlternatives = 1;

            // Handle results
            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;

                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }

                // Update status
                if (interimTranscript) {
                    this.recordingStatus = `Heard: "${interimTranscript}"`;
                }

                // Process final transcripts into words
                if (finalTranscript) {
                    console.log('Final transcript:', finalTranscript);
                    this.processSpokenText(finalTranscript);
                }
            };

            // Handle errors
            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);

                if (event.error === 'no-speech') {
                    this.recordingStatus = 'No speech detected...';
                } else if (event.error === 'network') {
                    this.recordingStatus = 'Network error';
                    this.stopRecording();
                } else {
                    this.recordingStatus = `Error: ${event.error}`;
                }
            };

            // Handle end
            this.recognition.onend = () => {
                if (this.isRecording) {
                    // Restart if still recording (for continuous mode)
                    this.recognition.start();
                }
            };

            // Handle start
            this.recognition.onstart = () => {
                this.recordingStatus = 'Listening...';
                console.log('Speech recognition started');
            };

            console.log('✓ Speech Recognition initialized');
        },

        processSpokenText(text) {
            // Convert spoken text to words
            const spokenWords = text
                .toLowerCase()
                .split(/[\s.,!?;:]+/)
                .map(w => w.replace(/[^a-z]/g, ''))
                .filter(w => w.length > 0);

            console.log('Processing spoken words:', spokenWords);

            // Add unique words
            const newWords = [];
            spokenWords.forEach(word => {
                if (!this.words.includes(word)) {
                    this.words.push(word);
                    newWords.push(word);
                }
            });

            if (newWords.length > 0) {
                // Render boxes immediately
                this.renderWordBoxes();

                // Start searches for valid words
                const validWords = newWords.filter(w =>
                    this.corpusData.words.includes(w) && !this.searchCache.has(w)
                );

                console.log(`Added ${newWords.length} words from speech, ${validWords.length} need searching`);

                // Search with visual feedback
                setTimeout(() => {
                    validWords.forEach(word => this.searchWordWithIndicator(word));
                }, 0);
            }
        },

        toggleRecording() {
            if (!this.speechSupported) {
                alert('Speech Recognition is not supported in this browser.\n\nPlease use Chrome, Edge, or Safari.');
                return;
            }

            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        },

        startRecording() {
            try {
                this.recognition.start();
                this.isRecording = true;
                console.log('🎤 Recording started');
            } catch (error) {
                console.error('Failed to start recording:', error);
                this.recordingStatus = 'Failed to start';
            }
        },

        stopRecording() {
            try {
                this.recognition.stop();
                this.isRecording = false;
                this.recordingStatus = 'Stopped';
                console.log('⏹ Recording stopped');
            } catch (error) {
                console.error('Failed to stop recording:', error);
            }
        }
    },

    watch: {
        'corpusData.words'() {
            if (this.words.length > 0) {
                this.renderWordBoxes();
            }
        }
    }
}).mount('#app');
