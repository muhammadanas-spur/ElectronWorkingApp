require('dotenv').config();

/**
 * VoiceConfig - Centralized configuration for voice features
 * Loads settings from environment variables and provides defaults
 */
class VoiceConfig {
  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    // Azure Speech Service Configuration
    this.azure = {
      subscriptionKey: process.env.AZURE_SPEECH_KEY || '',
      region: process.env.AZURE_SPEECH_REGION || 'eastus',
      language: process.env.AZURE_SPEECH_LANGUAGE || 'en-US',
      endpoint: process.env.AZURE_SPEECH_ENDPOINT || null
    };

    // Audio Capture Configuration
    this.audio = {
      captureMode: process.env.AUDIO_CAPTURE_MODE || 'dual',
      sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE) || 16000,
      channels: parseInt(process.env.AUDIO_CHANNELS) || 1,
      inputDevice: process.env.AUDIO_INPUT_DEVICE || 'default',
      enableSystemAudio: process.env.ENABLE_SYSTEM_AUDIO !== 'false',
      bufferSize: parseInt(process.env.AUDIO_BUFFER_SIZE) || 1024,
      format: 'PCM16' // Azure Speech requires 16-bit PCM
    };

    // Transcript Configuration
    this.transcript = {
      enableInterimResults: process.env.ENABLE_INTERIM_RESULTS !== 'false',
      autoSave: process.env.AUTO_SAVE_TRANSCRIPTS !== 'false',
      maxBufferSize: parseInt(process.env.MAX_BUFFER_SIZE) || 1000,
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 30000,
      speakerTagging: true // Always enable speaker tagging for dual mode
    };

    // Debug and Logging
    this.debug = {
      audio: process.env.DEBUG_AUDIO === 'true',
      speech: process.env.DEBUG_SPEECH === 'true',
      logLevel: process.env.LOG_LEVEL || 'info'
    };

    // Validate configuration
    this.validate();
  }

  /**
   * Validate configuration and provide warnings for missing required settings
   */
  validate() {
    const warnings = [];
    const errors = [];

    // Check Azure credentials
    if (!this.azure.subscriptionKey) {
      errors.push('AZURE_SPEECH_KEY is required but not set');
    }

    if (!this.azure.region) {
      warnings.push('AZURE_SPEECH_REGION not set, using default: eastus');
    }

    // Check audio settings
    if (this.audio.sampleRate !== 16000) {
      warnings.push(`Audio sample rate is ${this.audio.sampleRate}Hz, Azure Speech works best with 16000Hz`);
    }

    if (this.audio.channels !== 1) {
      warnings.push(`Audio channels set to ${this.audio.channels}, Azure Speech expects mono (1 channel)`);
    }

    // Log warnings and errors
    if (warnings.length > 0) {
      console.warn('VoiceConfig warnings:', warnings);
    }

    if (errors.length > 0) {
      console.error('VoiceConfig errors:', errors);
      throw new Error(`Configuration errors: ${errors.join(', ')}`);
    }
  }

  /**
   * Get configuration for AudioCaptureManager
   */
  getAudioConfig() {
    return {
      ...this.audio,
      debug: this.debug.audio
    };
  }

  /**
   * Get configuration for Azure Speech Service
   */
  getAzureConfig() {
    return {
      ...this.azure,
      debug: this.debug.speech
    };
  }

  /**
   * Get configuration for TranscriptManager
   */
  getTranscriptConfig() {
    return {
      ...this.transcript,
      debug: this.debug.logLevel === 'debug'
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(section, updates) {
    if (this[section]) {
      this[section] = { ...this[section], ...updates };
      console.log(`VoiceConfig updated [${section}]:`, updates);
    } else {
      throw new Error(`Unknown configuration section: ${section}`);
    }
  }

  /**
   * Get all configuration
   */
  getAll() {
    return {
      azure: this.azure,
      audio: this.audio,
      transcript: this.transcript,
      debug: this.debug
    };
  }

  /**
   * Check if Azure credentials are configured
   */
  hasAzureCredentials() {
    return !!(this.azure.subscriptionKey && this.azure.region);
  }

  /**
   * Check if dual capture mode is enabled
   */
  isDualCaptureEnabled() {
    return this.audio.captureMode === 'dual' && this.audio.enableSystemAudio;
  }

  /**
   * Get supported capture modes
   */
  getSupportedCaptureModes() {
    return ['dual', 'microphone-only'];
  }

  /**
   * Get supported languages for Azure Speech
   */
  getSupportedLanguages() {
    return [
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'de-DE', name: 'German (Germany)' },
      { code: 'it-IT', name: 'Italian (Italy)' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'zh-CN', name: 'Chinese (Mandarin)' },
      { code: 'ja-JP', name: 'Japanese' },
      { code: 'ko-KR', name: 'Korean' }
    ];
  }

  /**
   * Export configuration for saving
   */
  export() {
    return {
      azure: {
        region: this.azure.region,
        language: this.azure.language
        // Don't export the subscription key for security
      },
      audio: this.audio,
      transcript: this.transcript,
      debug: this.debug
    };
  }

  /**
   * Import configuration from saved settings
   */
  import(config) {
    if (config.azure) {
      this.azure = { ...this.azure, ...config.azure };
    }
    if (config.audio) {
      this.audio = { ...this.audio, ...config.audio };
    }
    if (config.transcript) {
      this.transcript = { ...this.transcript, ...config.transcript };
    }
    if (config.debug) {
      this.debug = { ...this.debug, ...config.debug };
    }
    
    console.log('VoiceConfig imported:', this.export());
  }
}

// Export singleton instance
const voiceConfig = new VoiceConfig();
module.exports = voiceConfig;