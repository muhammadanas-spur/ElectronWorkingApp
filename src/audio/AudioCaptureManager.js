const EventEmitter = require('events');

/**
 * AudioCaptureManager - Handles audio stream capture using Electron's native APIs
 * Uses getUserMedia and desktopCapturer instead of native Node.js audio libraries
 * 
 * Captures audio streams:
 * 1. Microphone input via getUserMedia
 * 2. System audio via desktopCapturer (when available)
 */
class AudioCaptureManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      sampleRate: config.sampleRate || 16000,
      channels: config.channels || 1,
      inputDevice: config.inputDevice || 'default',
      enableSystemAudio: config.enableSystemAudio !== false,
      captureMode: config.captureMode || 'microphone-only', // Simplified to microphone-only by default
      debug: config.debug || false,
      ...config
    };
    
    // Audio streams and processors
    this.microphoneStream = null;
    this.audioContext = null;
    this.mediaRecorder = null;
    this.audioWorkletNode = null;
    
    // Recording state
    this.isRecording = false;
    this.microphoneActive = false;
    this.systemAudioActive = false;
    
    // Audio devices (will be populated from renderer process)
    this.inputDevices = [];
    this.outputDevices = [];
    
    // Audio data buffer for Azure Speech
    this.audioDataBuffer = [];
    
    this.log('AudioCaptureManager initialized', { config: this.config });
  }

  /**
   * Initialize audio capture manager
   * Note: Device enumeration happens in renderer process via navigator.mediaDevices
   */
  async initialize() {
    try {
      this.log('AudioCaptureManager initialized successfully');
      
      this.emit('initialized', {
        supportedMimeTypes: this.getSupportedMimeTypes()
      });
      
      return true;
    } catch (error) {
      this.log('Failed to initialize AudioCaptureManager', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Get supported audio MIME types for recording
   */
  getSupportedMimeTypes() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/wav',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    
    return types.filter(type => {
      try {
        return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    });
  }

  /**
   * Start audio capture using Electron's native APIs
   * This will be coordinated with the renderer process
   */
  async startRecording() {
    if (this.isRecording) {
      this.log('Recording already in progress');
      return false;
    }

    try {
      this.isRecording = true;
      this.emit('recording-started');
      
      // The actual audio capture happens in the renderer process using getUserMedia
      // This manager just coordinates and processes the audio data
      this.log('Recording started - waiting for renderer process audio stream');
      
      return true;
    } catch (error) {
      this.log('Failed to start recording', error);
      this.isRecording = false;
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Stop audio capture
   */
  async stopRecording() {
    if (!this.isRecording) {
      this.log('No recording in progress');
      return false;
    }

    try {
      this.isRecording = false;
      this.microphoneActive = false;
      
      // Clear audio buffer
      this.audioDataBuffer = [];
      
      this.emit('recording-stopped');
      this.log('Recording stopped successfully');
      
      return true;
    } catch (error) {
      this.log('Failed to stop recording', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Process audio data received from renderer process
   * This method receives audio data captured via getUserMedia in the renderer
   */
  processAudioData(audioData, source = 'microphone') {
    try {
      const speakerTag = source === 'microphone' ? 'Me' : 'Other';
      console.log(`🎵 AudioCaptureManager: Received ${audioData?.length || 0} audio samples from ${source} -> Speaker: "${speakerTag}"`);
      
      // Convert the audio data to format suitable for Azure Speech SDK
      const processedBuffer = this.processAudioBuffer(audioData);
      
      // Add to audio buffer
      this.audioDataBuffer.push(processedBuffer);
      
      const eventName = source === 'microphone' ? 'microphone-audio' : 'system-audio';
      console.log(`🎵 AudioCaptureManager: Emitting ${eventName} event with ${processedBuffer.length} bytes for speaker "${speakerTag}"`);
      
      // Emit audio data for speech recognition with correct event name
      this.emit(eventName, {
        source: source,
        speaker: speakerTag,
        audioData: processedBuffer,
        timestamp: Date.now()
      });
      
      // Manage buffer size to prevent memory issues
      if (this.audioDataBuffer.length > 1000) {
        this.audioDataBuffer.shift();
      }
      
      this.log(`Processed ${source} audio data`, { bufferSize: this.audioDataBuffer.length });
      
    } catch (error) {
      console.error('AudioCaptureManager: Error processing audio data', error);
      this.emit('error', error);
    }
  }

  /**
   * Set microphone active state (called when renderer starts/stops capture)
   */
  setMicrophoneActive(active) {
    this.microphoneActive = active;
    if (active) {
      this.emit('microphone-started');
    } else {
      this.emit('microphone-stopped');
    }
    this.log(`Microphone ${active ? 'activated' : 'deactivated'}`);
  }

  /**
   * Set system audio capture active state
   */
  setSystemAudioActive(active) {
    this.systemAudioActive = active;
    if (active) {
      this.emit('system-audio-started');
    } else {
      this.emit('system-audio-stopped');
    }
    this.log(`System audio ${active ? 'activated' : 'deactivated'}`);
  }

  /**
   * Get audio devices (to be called from renderer process)
   */
  async getAudioDevices() {
    // This will be implemented in the renderer process using navigator.mediaDevices.enumerateDevices()
    return {
      inputDevices: this.inputDevices,
      outputDevices: this.outputDevices
    };
  }

  /**
   * Update audio devices list (called from renderer process)
   */
  updateAudioDevices(devices) {
    this.inputDevices = devices.inputDevices || [];
    this.outputDevices = devices.outputDevices || [];
    
    this.log('Audio devices updated', {
      inputCount: this.inputDevices.length,
      outputCount: this.outputDevices.length
    });
    
    this.emit('devices-updated', devices);
  }

  /**
   * Process audio buffer to match Azure Speech requirements
   * Azure Speech SDK expects: 16kHz, 16-bit, mono PCM
   */
  processAudioBuffer(audioData) {
    try {
      console.log(`AudioCaptureManager: Processing audio buffer - type: ${audioData?.constructor?.name}, length: ${audioData?.length}`);
      
      // If audioData is an array (from renderer), convert to Int16Array then Buffer
      if (Array.isArray(audioData)) {
        const int16Array = new Int16Array(audioData);
        const buffer = Buffer.from(int16Array.buffer);
        console.log(`AudioCaptureManager: Converted array to Buffer - ${buffer.length} bytes`);
        return buffer;
      }
      
      // If audioData is already a Buffer/Uint8Array for Azure Speech, pass through
      if (audioData instanceof Buffer || audioData instanceof Uint8Array) {
        console.log(`AudioCaptureManager: Audio data already in buffer format - ${audioData.length} bytes`);
        return audioData;
      }
      
      // If it's raw PCM data from AudioBuffer, convert it
      if (audioData instanceof Float32Array) {
        // Convert Float32 to Int16 for Azure Speech SDK
        const int16Array = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          // Clamp to [-1, 1] and convert to 16-bit integer
          const sample = Math.max(-1, Math.min(1, audioData[i]));
          int16Array[i] = sample * 0x7FFF;
        }
        const buffer = Buffer.from(int16Array.buffer);
        console.log(`AudioCaptureManager: Converted Float32Array to Buffer - ${buffer.length} bytes`);
        return buffer;
      }
      
      // For other formats, try to convert to Buffer
      const buffer = Buffer.from(audioData);
      console.log(`AudioCaptureManager: Converted unknown format to Buffer - ${buffer.length} bytes`);
      return buffer;
      
    } catch (error) {
      console.error('AudioCaptureManager: Error processing audio buffer', error);
      return Buffer.alloc(0);
    }
  }

  /**
   * Get current recording status
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      microphoneActive: this.microphoneActive,
      captureMode: this.config.captureMode,
      bufferSize: this.audioDataBuffer.length,
      sampleRate: this.config.sampleRate,
      channels: this.config.channels
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.log('Configuration updated', this.config);
    this.emit('config-updated', this.config);
  }

  /**
   * Logging utility
   */
  log(message, data = null) {
    // Always log for debugging
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] AudioCaptureManager: ${message}`, data || '');
  }

  /**
   * Cleanup resources
   */
  async destroy() {
    await this.stopRecording();
    this.audioDataBuffer = [];
    this.removeAllListeners();
    this.log('AudioCaptureManager destroyed');
  }
}

module.exports = AudioCaptureManager;