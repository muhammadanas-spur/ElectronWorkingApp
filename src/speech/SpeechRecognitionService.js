const EventEmitter = require('events');
const sdk = require('microsoft-cognitiveservices-speech-sdk');

/**
 * SpeechRecognitionService - Azure Speech-to-Text integration
 * Handles dual speech recognition streams with continuous recognition
 * Similar to the Python implementation using Azure Speech SDK
 */
class SpeechRecognitionService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      subscriptionKey: config.subscriptionKey || '',
      region: config.region || 'eastus',
      language: config.language || 'en-US',
      enableInterimResults: config.enableInterimResults !== false,
      debug: config.debug || false,
      ...config
    };
    
    // Speech recognizers for dual streams
    this.recognizers = new Map(); // 'microphone' and 'system' recognizers
    this.pushStreams = new Map(); // Audio push streams
    this.isActive = false;
    
    // Recognition state
    this.recognitionState = {
      microphone: { active: false, lastResult: null },
      system: { active: false, lastResult: null }
    };
    
    this.log('SpeechRecognitionService initialized', { config: this.sanitizeConfig(this.config) });
  }

  /**
   * Initialize the speech recognition service
   */
  async initialize() {
    try {
      if (!this.config.subscriptionKey || !this.config.region) {
        throw new Error('Azure Speech subscription key and region are required');
      }
      
      this.log('SpeechRecognitionService initialized successfully');
      this.emit('initialized');
      return true;
    } catch (error) {
      this.log('Failed to initialize SpeechRecognitionService', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Start speech recognition for a specific audio stream
   */
  async startRecognition(streamId, audioConfig = {}) {
    try {
      if (this.recognizers.has(streamId)) {
        this.log(`Recognition already active for stream: ${streamId}`);
        return false;
      }

      // Create speech config
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        this.config.subscriptionKey,
        this.config.region
      );
      
      speechConfig.speechRecognitionLanguage = this.config.language;
      
      // Enable speaker diarization for multi-speaker detection
      speechConfig.setProperty('DiarizationEnabled', 'true');
      speechConfig.setProperty('MaxSpeakerCount', '2'); // Limit to 2 speakers for better accuracy
      
      // Enable interim results if configured
      if (this.config.enableInterimResults) {
        speechConfig.setProperty(
          sdk.PropertyId.SpeechServiceResponse_RequestDetailedResultTrueFalse,
          'true'
        );
      }

      // Create push audio input stream
      const audioFormat = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
      const pushStream = sdk.AudioInputStream.createPushStream(audioFormat);
      const audioStreamConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      
      // Create speech recognizer
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioStreamConfig);
      
      // Store references
      this.recognizers.set(streamId, recognizer);
      this.pushStreams.set(streamId, pushStream);
      
      // Set up event handlers
      this.setupRecognizerEvents(streamId, recognizer);
      
      // Start continuous recognition
      recognizer.startContinuousRecognitionAsync(
        () => {
          this.recognitionState[streamId] = { active: true, lastResult: null };
          this.log(`Speech recognition started for stream: ${streamId}`);
          this.emit('recognition-started', { streamId });
        },
        (error) => {
          this.log(`Failed to start recognition for stream: ${streamId}`, error);
          this.emit('recognition-error', { streamId, error });
        }
      );
      
      return true;
    } catch (error) {
      this.log(`Error starting recognition for stream: ${streamId}`, error);
      this.emit('error', { streamId, error });
      return false;
    }
  }

  /**
   * Stop speech recognition for a specific stream
   */
  async stopRecognition(streamId) {
    try {
      const recognizer = this.recognizers.get(streamId);
      const pushStream = this.pushStreams.get(streamId);
      
      if (!recognizer) {
        this.log(`No active recognition for stream: ${streamId}`);
        return false;
      }

      // Stop continuous recognition
      recognizer.stopContinuousRecognitionAsync(
        () => {
          this.log(`Speech recognition stopped for stream: ${streamId}`);
          this.emit('recognition-stopped', { streamId });
        },
        (error) => {
          this.log(`Error stopping recognition for stream: ${streamId}`, error);
        }
      );
      
      // Clean up resources
      recognizer.close();
      if (pushStream) {
        pushStream.close();
      }
      
      // Remove from collections
      this.recognizers.delete(streamId);
      this.pushStreams.delete(streamId);
      this.recognitionState[streamId] = { active: false, lastResult: null };
      
      return true;
    } catch (error) {
      this.log(`Error stopping recognition for stream: ${streamId}`, error);
      this.emit('error', { streamId, error });
      return false;
    }
  }

  /**
   * Stop all active recognitions
   */
  async stopAllRecognition() {
    const streamIds = Array.from(this.recognizers.keys());
    const stopPromises = streamIds.map(streamId => this.stopRecognition(streamId));
    
    await Promise.all(stopPromises);
    this.isActive = false;
    this.emit('all-recognition-stopped');
    this.log('All speech recognition stopped');
  }

  /**
   * Process audio data for a specific stream
   */
  processAudioData(streamId, audioBuffer) {
    try {
      const pushStream = this.pushStreams.get(streamId);
      
      if (!pushStream) {
        console.log(`SpeechRecognitionService: No push stream available for: ${streamId}`);
        return false;
      }

      // Convert audio buffer to ArrayBuffer if needed
      let audioData = audioBuffer;
      if (Buffer.isBuffer(audioBuffer)) {
        audioData = audioBuffer.buffer.slice(
          audioBuffer.byteOffset,
          audioBuffer.byteOffset + audioBuffer.byteLength
        );
      } else if (audioBuffer instanceof Uint8Array || audioBuffer instanceof Int16Array) {
        audioData = audioBuffer.buffer.slice(
          audioBuffer.byteOffset,
          audioBuffer.byteOffset + audioBuffer.byteLength
        );
      }

      console.log(`SpeechRecognitionService: Writing ${audioData.byteLength} bytes to Azure push stream for ${streamId}`);

      // Write audio data to push stream
      pushStream.write(audioData);
      
      return true;
    } catch (error) {
      console.error(`SpeechRecognitionService: Error processing audio data for stream: ${streamId}`, error);
      this.emit('audio-processing-error', { streamId, error });
      return false;
    }
  }

  /**
   * Set up event handlers for a speech recognizer
   */
  setupRecognizerEvents(streamId, recognizer) {
    // Recognizing event (interim results)
    recognizer.recognizing = (sender, event) => {
      console.log(`SpeechRecognitionService: Recognizing event for ${streamId}, reason: ${event.result.reason}`);
      if (event.result.reason === sdk.ResultReason.RecognizingSpeech) {
        const text = event.result.text;
        console.log(`SpeechRecognitionService: Interim result [${streamId}]: "${text}"`);
        if (text && text.trim()) {
          this.emit('interim-result', {
            streamId,
            text: text.trim(),
            confidence: event.result.properties?.getProperty('Speech.Service.Response.JsonResult'),
            timestamp: Date.now()
          });
        }
      }
    };

    // Recognized event (final results)
    recognizer.recognized = (sender, event) => {
      console.log(`SpeechRecognitionService: Recognized event for ${streamId}, reason: ${event.result.reason}`);
      if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const text = event.result.text;
        console.log(`SpeechRecognitionService: Final result [${streamId}]: "${text}"`);
        if (text && text.trim()) {
          this.recognitionState[streamId].lastResult = {
            text: text.trim(),
            timestamp: Date.now(),
            confidence: this.extractConfidence(event.result)
          };
          
          this.emit('final-result', {
            streamId,
            text: text.trim(),
            confidence: this.extractConfidence(event.result),
            timestamp: Date.now()
          });
        }
      } else if (event.result.reason === sdk.ResultReason.NoMatch) {
        console.log(`SpeechRecognitionService: No speech recognized for stream: ${streamId}`);
        this.emit('no-match', { streamId });
      }
    };

    // Session events
    recognizer.sessionStarted = (sender, event) => {
      this.log(`Recognition session started for stream: ${streamId}`);
      this.emit('session-started', { streamId, sessionId: event.sessionId });
    };

    recognizer.sessionStopped = (sender, event) => {
      this.log(`Recognition session stopped for stream: ${streamId}`);
      this.emit('session-stopped', { streamId, sessionId: event.sessionId });
    };

    // Error handling
    recognizer.canceled = (sender, event) => {
      const error = event.reason === sdk.CancellationReason.Error 
        ? event.errorDetails 
        : `Recognition canceled: ${event.reason}`;
      
      this.log(`Recognition canceled for stream: ${streamId}`, error);
      this.emit('recognition-canceled', { streamId, error, reason: event.reason });
    };
  }

  /**
   * Extract confidence score from recognition result
   */
  extractConfidence(result) {
    try {
      const jsonResult = result.properties?.getProperty('Speech.Service.Response.JsonResult');
      if (jsonResult) {
        const parsed = JSON.parse(jsonResult);
        return parsed.NBest?.[0]?.Confidence || 0.0;
      }
      return 0.0;
    } catch (error) {
      this.log('Error extracting confidence score', error);
      return 0.0;
    }
  }

  /**
   * Get current recognition status
   */
  getStatus() {
    const activeStreams = Array.from(this.recognizers.keys());
    
    return {
      isActive: this.isActive,
      activeStreams,
      recognitionState: { ...this.recognitionState },
      config: this.sanitizeConfig(this.config)
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.log('Configuration updated', this.sanitizeConfig(this.config));
    this.emit('config-updated', this.config);
  }

  /**
   * Check if a specific stream is active
   */
  isStreamActive(streamId) {
    return this.recognizers.has(streamId) && this.recognitionState[streamId]?.active;
  }

  /**
   * Get the last recognized result for a stream
   */
  getLastResult(streamId) {
    return this.recognitionState[streamId]?.lastResult || null;
  }

  /**
   * Test Azure Speech connection
   */
  async testConnection() {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        this.config.subscriptionKey,
        this.config.region
      );
      
      // Create a simple test recognizer
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      
      return new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            recognizer.close();
            resolve({
              success: true,
              result: result.reason,
              text: result.text || 'Connection test successful'
            });
          },
          (error) => {
            recognizer.close();
            reject({
              success: false,
              error: error.toString()
            });
          }
        );
        
        // Timeout after 5 seconds
        setTimeout(() => {
          recognizer.close();
          reject({
            success: false,
            error: 'Connection test timeout'
          });
        }, 5000);
      });
    } catch (error) {
      return {
        success: false,
        error: error.toString()
      };
    }
  }

  /**
   * Sanitize config for logging (remove sensitive data)
   */
  sanitizeConfig(config) {
    const sanitized = { ...config };
    if (sanitized.subscriptionKey) {
      sanitized.subscriptionKey = `${sanitized.subscriptionKey.substring(0, 8)}***`;
    }
    return sanitized;
  }

  /**
   * Logging utility
   */
  log(message, data = null) {
    // Always log for debugging
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] SpeechRecognitionService: ${message}`, data || '');
  }

  /**
   * Cleanup resources
   */
  async destroy() {
    await this.stopAllRecognition();
    this.removeAllListeners();
    this.log('SpeechRecognitionService destroyed');
  }
}

module.exports = SpeechRecognitionService;