/**
 * Voice Input Module
 * Handles speech-to-text with Whisper-tiny (primary) and Web Speech API (fallback)
 *
 * Usage:
 *   import { VoiceModule } from './modules/voice-module.js';
 *   const voice = new VoiceModule();
 *   await voice.init();
 *   voice.startListening(text => console.log('Transcribed:', text));
 */

export class VoiceModule {
    constructor(config = {}) {
        this.modelId = config.modelId || 'Xenova/whisper-tiny.en';
        this.useWhisper = config.useWhisper !== false;  // Default: try Whisper first
        this.pipeline = null;
        this.whisperReady = false;
        this.speechRecognition = null;
        this.isListening = false;
        this.onTranscript = null;
        this.onError = null;
        this.audioContext = null;
        this.mediaStream = null;
    }

    /**
     * Initialize voice module (try Whisper, fallback to Web Speech API)
     */
    async init() {
        console.log('🎤 Initializing voice module...');

        // Try to initialize Whisper-tiny
        if (this.useWhisper) {
            try {
                console.log('🔄 Loading Whisper-tiny model...');

                const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');

                // Configure environment
                env.allowLocalModels = false;
                env.allowRemoteModels = true;
                env.useBrowserCache = false;  // Disable cache (IndexedDB may not be available in iframes)

                // Create automatic speech recognition pipeline
                this.pipeline = await pipeline('automatic-speech-recognition', this.modelId);

                this.whisperReady = true;
                console.log('✅ Whisper-tiny model loaded');

                return { mode: 'whisper', ready: true };

            } catch (error) {
                console.warn('⚠️ Whisper-tiny failed to load:', error.message);
                console.log('📢 Falling back to Web Speech API...');
            }
        }

        // Fallback to Web Speech API
        return this.initWebSpeechAPI();
    }

    /**
     * Initialize Web Speech API (browser built-in)
     */
    initWebSpeechAPI() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('❌ Speech recognition not supported in this browser');
            return { mode: 'none', ready: false, error: 'Speech recognition not supported' };
        }

        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.lang = 'en-US';

        console.log('✅ Web Speech API initialized');
        return { mode: 'webspeech', ready: true };
    }

    /**
     * Start listening (with Whisper or Web Speech API)
     */
    async startListening(onTranscript, onError = null) {
        if (this.isListening) {
            console.warn('⚠️ Already listening');
            return;
        }

        this.onTranscript = onTranscript;
        this.onError = onError;

        if (this.whisperReady) {
            return this.startWhisperListening();
        } else if (this.speechRecognition) {
            return this.startWebSpeechListening();
        } else {
            const error = 'No speech recognition available';
            console.error('❌', error);
            if (onError) onError(error);
            return false;
        }
    }

    /**
     * Start listening with Whisper-tiny (audio stream)
     */
    async startWhisperListening() {
        try {
            console.log('🎤 Starting Whisper listening...');

            // Get microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Create processor for audio chunks
            const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            let audioBuffer = [];
            let lastProcessTime = Date.now();
            const PROCESS_INTERVAL = 3000; // Process every 3 seconds

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                audioBuffer.push(...inputData);

                // Process audio chunks periodically
                const now = Date.now();
                if (now - lastProcessTime > PROCESS_INTERVAL && audioBuffer.length > 0) {
                    this.processAudioWithWhisper(audioBuffer.slice());
                    audioBuffer = [];
                    lastProcessTime = now;
                }
            };

            source.connect(processor);
            processor.connect(this.audioContext.destination);

            this.isListening = true;
            console.log('✅ Whisper listening started');
            return true;

        } catch (error) {
            console.error('❌ Whisper listening failed:', error);
            if (this.onError) this.onError(error.message);

            // Fallback to Web Speech API
            console.log('📢 Falling back to Web Speech API...');
            this.initWebSpeechAPI();
            return this.startWebSpeechListening();
        }
    }

    /**
     * Process audio with Whisper model
     */
    async processAudioWithWhisper(audioData) {
        try {
            // Convert Float32Array to format expected by Whisper
            const audio = new Float32Array(audioData);

            // Transcribe
            const result = await this.pipeline(audio);

            if (result && result.text) {
                const text = result.text.trim();
                if (text.length > 0 && this.onTranscript) {
                    console.log('📝 Whisper transcribed:', text);
                    this.onTranscript(text);
                }
            }

        } catch (error) {
            console.error('❌ Whisper transcription error:', error);
            if (this.onError) this.onError(error.message);
        }
    }

    /**
     * Start listening with Web Speech API (browser built-in)
     */
    startWebSpeechListening() {
        if (!this.speechRecognition) {
            console.error('❌ Web Speech API not initialized');
            return false;
        }

        console.log('🎤 Starting Web Speech API listening...');

        this.speechRecognition.onresult = (event) => {
            const results = event.results;
            const lastResult = results[results.length - 1];

            if (lastResult.isFinal) {
                const transcript = lastResult[0].transcript.trim();
                if (transcript.length > 0 && this.onTranscript) {
                    console.log('📝 Web Speech transcribed:', transcript);
                    this.onTranscript(transcript);
                }
            }
        };

        this.speechRecognition.onerror = (event) => {
            console.error('❌ Web Speech error:', event.error);
            if (this.onError) this.onError(event.error);
        };

        this.speechRecognition.onend = () => {
            if (this.isListening) {
                // Restart if still supposed to be listening
                this.speechRecognition.start();
            }
        };

        this.speechRecognition.start();
        this.isListening = true;
        console.log('✅ Web Speech API listening started');
        return true;
    }

    /**
     * Stop listening
     */
    stopListening() {
        console.log('🛑 Stopping voice input...');
        this.isListening = false;

        // Stop Whisper
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Stop Web Speech API
        if (this.speechRecognition) {
            this.speechRecognition.stop();
        }

        console.log('✅ Voice input stopped');
    }

    /**
     * Check if listening
     */
    isActive() {
        return this.isListening;
    }

    /**
     * Get current mode
     */
    getMode() {
        if (this.whisperReady) return 'whisper';
        if (this.speechRecognition) return 'webspeech';
        return 'none';
    }

    /**
     * Get module info
     */
    getInfo() {
        return {
            mode: this.getMode(),
            whisperReady: this.whisperReady,
            webSpeechAvailable: !!this.speechRecognition,
            isListening: this.isListening,
            modelId: this.modelId
        };
    }
}
