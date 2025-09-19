const EventEmitter = require('events');
const AudioCaptureManager = require('./audio/AudioCaptureManager');
const SpeechRecognitionService = require('./speech/SpeechRecognitionService');
const TranscriptManager = require('./transcript/TranscriptManager');
const TopicAnalyzer = require('./topic/TopicAnalyzer');
const VoiceConfig = require('./config/VoiceConfig');

/**
 * VoiceManager - Central orchestrator for voice features
 * Coordinates audio capture, speech recognition, and transcript management
 */
class VoiceManager extends EventEmitter {
  constructor(electronWindow = null) {
    super();
    
    this.window = electronWindow;
    
    // Initialize components with configurations
    this.audioCapture = new AudioCaptureManager(VoiceConfig.getAudioConfig());
    this.speechService = new SpeechRecognitionService(VoiceConfig.getAzureConfig());
    this.transcriptManager = new TranscriptManager(VoiceConfig.getTranscriptConfig());
    
    // Initialize TopicAnalyzer only if OpenAI API key is available
    this.topicAnalyzer = null;
    try {
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
        this.topicAnalyzer = new TopicAnalyzer({
          apiKey: process.env.OPENAI_API_KEY,
          debug: VoiceConfig.getTranscriptConfig().debug || false
        });
      } else {
        this.log('OpenAI API key not found - topic analysis will be disabled');
      }
    } catch (error) {
      this.log('Failed to initialize TopicAnalyzer - topic analysis will be disabled', error.message);
      this.topicAnalyzer = null;
    }
    
    // State management
    this.isInitialized = false;
    this.isRecording = false;
    this.recordingStartTime = null;
    this.currentSessionId = null;
    
    // Component status
    this.componentStatus = {
      audioCapture: false,
      speechService: false,
      transcriptManager: false,
      topicAnalyzer: false
    };
    
    this.setupEventHandlers();
    this.log('VoiceManager created');
  }

  /**
   * Initialize all voice components
   */
  async initialize() {
    try {
      this.log('Initializing VoiceManager...');
      
      // Check Azure credentials
      if (!VoiceConfig.hasAzureCredentials()) {
        throw new Error('Azure Speech credentials not configured. Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env file');
      }
      
      // Initialize components in sequence
      this.componentStatus.audioCapture = await this.audioCapture.initialize();
      this.componentStatus.speechService = await this.speechService.initialize();
      this.componentStatus.transcriptManager = await this.transcriptManager.initialize();
      
      // Initialize topic analyzer (optional - don't fail if OpenAI key is missing)
      if (this.topicAnalyzer) {
        try {
          this.componentStatus.topicAnalyzer = await this.topicAnalyzer.initialize();
        } catch (error) {
          this.log('Topic analyzer initialization failed (continuing without topic analysis)', error.message);
          this.componentStatus.topicAnalyzer = false;
          this.topicAnalyzer = null;
        }
      } else {
        this.componentStatus.topicAnalyzer = false;
      }
      
      // Check if core components initialized successfully (topic analyzer is optional)
      const coreComponents = {
        audioCapture: this.componentStatus.audioCapture,
        speechService: this.componentStatus.speechService,
        transcriptManager: this.componentStatus.transcriptManager
      };
      const allInitialized = Object.values(coreComponents).every(status => status);
      
      if (!allInitialized) {
        throw new Error('Failed to initialize one or more core voice components');
      }
      
      // Start topic analysis if available
      if (this.componentStatus.topicAnalyzer && this.topicAnalyzer) {
        this.topicAnalyzer.startAnalysis();
        this.log('Topic analysis started');
      }
      
      this.isInitialized = true;
      this.log('VoiceManager initialized successfully', this.componentStatus);
      this.emit('initialized', this.componentStatus);
      
      return true;
    } catch (error) {
      this.log('Failed to initialize VoiceManager', error);
      this.emit('initialization-error', error);
      throw error;
    }
  }

  /**
   * Start voice recording with dual audio capture
   */
  async startRecording(options = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error('VoiceManager not initialized');
      }
      
      if (this.isRecording) {
        this.log('Recording already in progress');
        return false;
      }
      
      this.log('Starting voice recording...');
      this.recordingStartTime = Date.now();
      
      // Start transcript session
      this.currentSessionId = this.transcriptManager.startSession({
        captureMode: VoiceConfig.audio.captureMode,
        language: VoiceConfig.azure.language,
        startTime: this.recordingStartTime,
        ...options
      });
      
      // Start speech recognition for both streams
      if (VoiceConfig.isDualCaptureEnabled()) {
        await this.speechService.startRecognition('microphone');
        await this.speechService.startRecognition('system');
      } else {
        await this.speechService.startRecognition('microphone');
      }
      
      // Start audio capture
      const captureStarted = await this.audioCapture.startRecording();
      
      if (!captureStarted) {
        throw new Error('Failed to start audio capture');
      }
      
      this.isRecording = true;
      
      // Notify renderer process
      this.notifyRenderer('voice-recording-started', {
        sessionId: this.currentSessionId,
        captureMode: VoiceConfig.audio.captureMode,
        dualCapture: VoiceConfig.isDualCaptureEnabled()
      });
      
      this.log('Voice recording started successfully', {
        sessionId: this.currentSessionId,
        captureMode: VoiceConfig.audio.captureMode
      });
      
      this.emit('recording-started', {
        sessionId: this.currentSessionId,
        startTime: this.recordingStartTime
      });
      
      return true;
    } catch (error) {
      this.log('Failed to start recording', error);
      this.emit('recording-error', error);
      
      // Cleanup on failure
      await this.stopRecording();
      return false;
    }
  }

  /**
   * Stop voice recording
   */
  async stopRecording() {
    try {
      if (!this.isRecording) {
        this.log('No recording in progress');
        return false;
      }
      
      this.log('Stopping voice recording...');
      
      // Stop audio capture
      await this.audioCapture.stopRecording();
      
      // Stop speech recognition
      await this.speechService.stopAllRecognition();
      
      // Wait for any remaining Azure Speech results to arrive
      this.log('Waiting for remaining Azure Speech results...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      // End transcript session
      const sessionSummary = await this.transcriptManager.endSession();
      
      this.isRecording = false;
      const recordingDuration = Date.now() - (this.recordingStartTime || Date.now());
      
      // Notify renderer process
      this.notifyRenderer('voice-recording-stopped', {
        sessionId: this.currentSessionId,
        duration: recordingDuration,
        summary: sessionSummary
      });
      
      this.log('Voice recording stopped successfully', {
        sessionId: this.currentSessionId,
        duration: recordingDuration,
        transcriptCount: sessionSummary?.transcriptCount || 0
      });
      
      this.emit('recording-stopped', {
        sessionId: this.currentSessionId,
        duration: recordingDuration,
        summary: sessionSummary
      });
      
      // Reset state
      this.currentSessionId = null;
      this.recordingStartTime = null;
      
      return true;
    } catch (error) {
      this.log('Error stopping recording', error);
      this.emit('recording-error', error);
      return false;
    }
  }

  /**
   * Toggle recording state
   */
  async toggleRecording() {
    if (this.isRecording) {
      return await this.stopRecording();
    } else {
      return await this.startRecording();
    }
  }

  /**
   * Setup event handlers for component coordination
   */
  setupEventHandlers() {
    // Audio capture events
    this.audioCapture.on('microphone-audio', (audioData) => {
      this.handleMicrophoneAudio(audioData);
    });
    
    this.audioCapture.on('system-audio', (audioData) => {
      this.handleSystemAudio(audioData);
    });
    
    this.audioCapture.on('error', (error) => {
      this.log('Audio capture error', error);
      this.emit('audio-error', error);
    });
    
    // Speech recognition events
    this.speechService.on('interim-result', (result) => {
      this.handleInterimResult(result);
    });
    
    this.speechService.on('final-result', (result) => {
      this.handleFinalResult(result);
    });
    
    this.speechService.on('recognition-error', (error) => {
      this.log('Speech recognition error', error);
      this.emit('speech-error', error);
    });
    
    // Transcript manager events
    this.transcriptManager.on('interim-transcript', (transcript) => {
      this.notifyRenderer('interim-transcript', transcript);
    });
    
    this.transcriptManager.on('final-transcript', (transcript) => {
      this.notifyRenderer('final-transcript', transcript);
    });
    
    this.transcriptManager.on('session-ended', (summary) => {
      this.emit('session-ended', summary);
    });
    
    this.transcriptManager.on('transcript-updated', (transcripts) => {
      // Trigger topic analysis when transcripts are updated
      if (this.componentStatus.topicAnalyzer && this.topicAnalyzer) {
        this.analyzeTopicFromTranscripts(transcripts);
      }
    });
    
    // Topic analyzer events (only if TopicAnalyzer is available)
    this.setupTopicAnalyzerEvents();
  }

  /**
   * Handle microphone audio data from AudioCaptureManager
   */
  handleMicrophoneAudio(audioData) {
    console.log(`VoiceManager: Received microphone audio data - ${audioData.audioData?.length || 0} bytes`);
    console.log(`VoiceManager: Speech service stream active for microphone: ${this.speechService.isStreamActive('microphone')}`);
    
    if (this.speechService.isStreamActive('microphone')) {
      const success = this.speechService.processAudioData('microphone', audioData.audioData);
      console.log(`VoiceManager: Sent audio data to speech service, success: ${success}`);
    } else {
      console.log('VoiceManager: Speech service not active for microphone stream');
    }
  }

  /**
   * Handle system audio data from desktop capturer
   */
  handleSystemAudio(audioData) {
    console.log(`🔊 VoiceManager: Received SYSTEM audio data - ${audioData.audioData?.length || 0} bytes`);
    console.log(`🔊 VoiceManager: Speech service stream active for system: ${this.speechService.isStreamActive('system')}`);
    
    if (this.speechService.isStreamActive('system')) {
      const success = this.speechService.processAudioData('system', audioData.audioData);
      console.log(`🔊 VoiceManager: Sent system audio data to speech service, success: ${success}`);
    } else {
      console.log('🔊 VoiceManager: Speech service not active for system stream');
    }
  }

  /**
   * Process audio data from renderer process (via IPC)
   * This handles audio captured using getUserMedia in the renderer
   */
  processRendererAudioData(audioData) {
    try {
      console.log('🎤 VoiceManager: Processing MICROPHONE audio data - should be tagged as "Me"');
      // Pass audio data to the audio capture manager for processing
      this.audioCapture.processAudioData(audioData, 'microphone');
    } catch (error) {
      this.log('Error processing renderer audio data', error);
      this.emit('audio-error', error);
    }
  }

  /**
   * Process system audio data from desktop capturer
   */
  processSystemAudioData(audioData) {
    try {
      console.log('🔊 VoiceManager: Processing SYSTEM audio data - should be tagged as "Other"');
      // Pass system audio data to the audio capture manager for processing
      this.audioCapture.processAudioData(audioData, 'system');
    } catch (error) {
      this.log('Error processing system audio data', error);
      this.emit('system-audio-error', error);
    }
  }

  /**
   * Handle interim speech recognition results
   */
  handleInterimResult(result) {
    console.log(`VoiceManager: Handling interim result - "${result.text}" from ${result.streamId}`);
    
    this.transcriptManager.addInterimTranscript(
      result.streamId,
      result.text,
      result.timestamp
    );
  }

  /**
   * Handle final speech recognition results
   */
  handleFinalResult(result) {
    console.log(`VoiceManager: Handling final result - "${result.text}" from ${result.streamId}`);
    
    this.transcriptManager.addFinalTranscript(
      result.streamId,
      result.text,
      result.confidence,
      result.timestamp
    );
    
    console.log(`VoiceManager: Added final transcript to manager`);
  }

  /**
   * Setup topic analyzer event handlers
   */
  setupTopicAnalyzerEvents() {
    if (this.topicAnalyzer) {
      this.topicAnalyzer.on('topic-updated', (topic) => {
        this.log('Conversation topic updated', topic.topic.substring(0, 50) + '...');
        this.notifyRenderer('topic-updated', topic);
      });
      
      this.topicAnalyzer.on('analysis-requested', () => {
        // Provide current transcripts when analysis is requested
        const recentTranscripts = this.transcriptManager.getRecentTranscripts(20);
        if (recentTranscripts.length > 0) {
          this.analyzeTopicFromTranscripts(recentTranscripts);
        }
      });
      
      this.topicAnalyzer.on('file-updated', (data) => {
        this.log('Topic file updated', data.file);
        this.notifyRenderer('topic-file-updated', data);
      });
      
      this.topicAnalyzer.on('error', (error) => {
        this.log('Topic analysis error', error);
        this.emit('topic-error', error);
      });
    }
  }

  /**
   * Analyze conversation topic from current transcripts
   */
  async analyzeTopicFromTranscripts(transcripts) {
    if (!this.componentStatus.topicAnalyzer || !this.topicAnalyzer || !transcripts || transcripts.length === 0) {
      return;
    }
    
    try {
      await this.topicAnalyzer.analyzeTranscripts(transcripts);
    } catch (error) {
      this.log('Error analyzing topic from transcripts', error);
    }
  }

  /**
   * Get current recording status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isRecording: this.isRecording,
      currentSessionId: this.currentSessionId,
      recordingStartTime: this.recordingStartTime,
      recordingDuration: this.recordingStartTime ? Date.now() - this.recordingStartTime : 0,
      componentStatus: this.componentStatus,
      audioStatus: this.audioCapture.getStatus(),
      speechStatus: this.speechService.getStatus(),
      transcriptStatus: this.transcriptManager.getStatus(),
      config: {
        hasAzureCredentials: VoiceConfig.hasAzureCredentials(),
        captureMode: VoiceConfig.audio.captureMode,
        dualCaptureEnabled: VoiceConfig.isDualCaptureEnabled(),
        language: VoiceConfig.azure.language
      }
    };
  }

  /**
   * Get available audio devices
   */
  getAudioDevices() {
    return this.audioCapture.getAudioDevices();
  }

  /**
   * Get recent transcripts
   */
  getRecentTranscripts(count = 10) {
    return this.transcriptManager.getRecentTranscripts(count);
  }

  /**
   * Search transcripts
   */
  searchTranscripts(query, options = {}) {
    return this.transcriptManager.searchTranscripts(query, options);
  }

  /**
   * QUICK FIX: Update transcript configuration for duplicate filtering
   */
  updateTranscriptConfig(config) {
    this.transcriptManager.updateConfig(config);
  }

  /**
   * Export current session
   */
  exportSession(format = 'json') {
    return this.transcriptManager.exportTranscripts(format, { sessionOnly: true });
  }

  /**
   * Update voice configuration
   */
  updateConfig(section, updates) {
    try {
      VoiceConfig.updateConfig(section, updates);
      
      // Update component configurations
      if (section === 'audio') {
        this.audioCapture.updateConfig(VoiceConfig.getAudioConfig());
      } else if (section === 'azure') {
        this.speechService.updateConfig(VoiceConfig.getAzureConfig());
      } else if (section === 'transcript') {
        this.transcriptManager.updateConfig(VoiceConfig.getTranscriptConfig());
      }
      
      this.log('Configuration updated', { section, updates });
      this.emit('config-updated', { section, updates });
      
      return true;
    } catch (error) {
      this.log('Failed to update configuration', error);
      this.emit('config-error', error);
      return false;
    }
  }

  /**
   * Test Azure Speech connection
   */
  async testAzureConnection() {
    try {
      return await this.speechService.testConnection();
    } catch (error) {
      this.log('Azure connection test failed', error);
      return { success: false, error: error.toString() };
    }
  }

  /**
   * Notify renderer process of events
   */
  notifyRenderer(event, data = null) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(event, data);
    }
  }

  /**
   * Get configuration for UI
   */
  getConfigForUI() {
    return {
      hasAzureCredentials: VoiceConfig.hasAzureCredentials(),
      supportedLanguages: VoiceConfig.getSupportedLanguages(),
      supportedCaptureModes: VoiceConfig.getSupportedCaptureModes(),
      currentConfig: VoiceConfig.export(),
      audioDevices: this.getAudioDevices()
    };
  }

  /**
   * Logging utility
   */
  log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] VoiceManager: ${message}`, data || '');
  }

  /**
   * Cleanup resources
   */
  async destroy() {
    this.log('Destroying VoiceManager...');
    
    // Stop recording if active
    if (this.isRecording) {
      await this.stopRecording();
    }
    
    // Destroy components
    await this.audioCapture.destroy();
    await this.speechService.destroy();
    await this.transcriptManager.destroy();
    if (this.topicAnalyzer) {
      await this.topicAnalyzer.destroy();
    }
    
    // Remove event listeners
    this.removeAllListeners();
    
    this.isInitialized = false;
    this.log('VoiceManager destroyed');
  }
}

module.exports = VoiceManager;