// Renderer process JavaScript for the overlay interface
class OverlayRenderer {
  constructor() {
    this.isInteractive = true;
    this.isVisible = true;
    this.tooltipVisible = false;
    this.isScreenSharingActive = false;

    // Voice-related state
    this.voiceAvailable = false;
    this.voiceInitialized = false;
    this.isRecording = false;
    this.transcripts = [];
    this.currentTranscript = null;

    // Audio capture state
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.audioWorkletNode = null;
    this.audioDevices = { inputDevices: [], outputDevices: [] };

    this.initializeElements();
    this.setupEventListeners();
    this.setupVoiceEventListeners();
    this.updateUI();
    this.initializeVoiceFeatures();
    this.enumerateAudioDevices();
  }

  initializeElements() {
    this.elements = {
      visibilityToggle: document.getElementById('visibilityToggle'),
      interactionToggle: document.getElementById('interactionToggle'),
      screenSharingToggle: document.getElementById('screenSharingToggle'),
      micButton: document.getElementById('micButton'),
      infoButton: document.getElementById('infoButton'),
      statusDot: document.getElementById('statusDot'),
      shortcutsTooltip: document.getElementById('shortcutsTooltip'),
      overlayContainer: document.getElementById('overlayContainer')
    };
  }

  setupEventListeners() {
    // Visibility toggle
    this.elements.visibilityToggle.addEventListener('click', () => {
      this.toggleVisibility();
    });

    // Interaction toggle
    this.elements.interactionToggle.addEventListener('click', () => {
      this.toggleInteraction();
    });

    // Screen sharing toggle (for testing)
    this.elements.screenSharingToggle.addEventListener('click', () => {
      this.toggleScreenSharingMode();
    });

    // Microphone button (placeholder - no functionality yet)
    this.elements.micButton.addEventListener('click', () => {
      this.handleMicrophoneClick();
    });

    // Info button with tooltip
    this.elements.infoButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleTooltip();
    });

    // Hide tooltip when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.elements.infoButton.contains(e.target) && 
          !this.elements.shortcutsTooltip.contains(e.target)) {
        this.hideTooltip();
      }
    });

    // Listen for interaction mode changes from main process
    if (window.electronAPI) {
      window.electronAPI.onInteractionModeChanged((isInteractive) => {
        this.isInteractive = isInteractive;
        this.updateUI();
      });
      
      // Listen for screen sharing detection
      window.electronAPI.onScreenSharingStarted(() => {
        this.isScreenSharingActive = true;
        this.showFeedback('screen-sharing', '🕵️ Screen sharing detected - overlay hidden for stealth');
        this.updateUI();
      });
      
      window.electronAPI.onScreenSharingStopped(() => {
        this.isScreenSharingActive = false;
        this.showFeedback('screen-sharing', '✅ Screen sharing ended - overlay restored');
        this.updateUI();
      });
    }

    // Window resize observer for responsive behavior
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      resizeObserver.observe(this.elements.overlayContainer);
      
      // Also observe tooltip changes
      if (this.elements.shortcutsTooltip) {
        resizeObserver.observe(this.elements.shortcutsTooltip);
      }
    }

    // Double-click to show window stats (for debugging)
    this.elements.overlayContainer.addEventListener('dblclick', () => {
      this.showWindowStats();
    });
  }

  async toggleVisibility() {
    try {
      if (window.electronAPI) {
        const newVisibility = await window.electronAPI.toggleVisibility();
        this.isVisible = newVisibility;
        this.updateUI();
        
        // Visual feedback
        this.showFeedback('visibility', newVisibility ? 'Visible' : 'Hidden');
      }
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  }

  async toggleInteraction() {
    try {
      if (window.electronAPI) {
        const newInteraction = await window.electronAPI.toggleInteraction();
        this.isInteractive = newInteraction;
        this.updateUI();
        
        // Visual feedback
        this.showFeedback('interaction', newInteraction ? 'Interactive' : 'Click-through');
      }
    } catch (error) {
      console.error('Failed to toggle interaction:', error);
    }
  }

  async toggleScreenSharingMode() {
    try {
      if (window.electronAPI) {
        if (this.isScreenSharingActive) {
          await window.electronAPI.disableScreenSharingMode();
          this.showFeedback('screen-sharing', '🔄 Screen sharing mode disabled');
        } else {
          await window.electronAPI.enableScreenSharingMode();
          this.showFeedback('screen-sharing', '🕵️ Screen sharing mode enabled - testing stealth');
        }
      }
    } catch (error) {
      console.error('Failed to toggle screen sharing mode:', error);
    }
  }

  async toggleTooltip() {
    this.tooltipVisible = !this.tooltipVisible;
    
    if (this.tooltipVisible) {
      this.elements.shortcutsTooltip.classList.add('show');
      // Auto-resize window to fit expanded content
      await this.autoResizeWindow();
    } else {
      this.elements.shortcutsTooltip.classList.remove('show');
      // Resize back to original size
      await this.autoResizeWindow();
    }
  }

  async hideTooltip() {
    this.tooltipVisible = false;
    this.elements.shortcutsTooltip.classList.remove('show');
    // Auto-resize after hiding tooltip
    setTimeout(() => {
      this.autoResizeWindow();
    }, 250); // Wait for CSS transition
  }

  updateUI() {
    // Update interaction toggle button
    if (this.isInteractive) {
      this.elements.interactionToggle.classList.add('active');
      this.elements.interactionToggle.querySelector('i').className = 'fas fa-hand-pointer';
      this.elements.interactionToggle.title = 'Interactive Mode - Click to enable click-through';
    } else {
      this.elements.interactionToggle.classList.remove('active');
      this.elements.interactionToggle.querySelector('i').className = 'fas fa-mouse-pointer';
      this.elements.interactionToggle.title = 'Click-through Mode - Click to enable interaction';
    }

    // Update microphone button
    this.updateMicrophoneButton();

    // Update status dot - screen sharing takes priority, then recording
    if (this.isScreenSharingActive) {
      this.elements.statusDot.className = 'status-dot screen-sharing';
      this.elements.statusDot.title = 'Screen Sharing Detected - Stealth Mode Active';
    } else if (this.isRecording) {
      this.elements.statusDot.className = 'status-dot recording';
      this.elements.statusDot.title = 'Voice Recording Active - Dual Audio Capture';
    } else if (this.isInteractive) {
      this.elements.statusDot.className = 'status-dot interactive';
      this.elements.statusDot.title = 'Interactive Mode - Click and drag enabled';
    } else {
      this.elements.statusDot.className = 'status-dot non-interactive';
      this.elements.statusDot.title = 'Click-through Mode - Clicks pass through';
    }

    // Update visibility button
    if (this.isVisible) {
      this.elements.visibilityToggle.querySelector('i').className = 'fas fa-eye';
      this.elements.visibilityToggle.title = 'Window Visible - Click to hide';
    } else {
      this.elements.visibilityToggle.querySelector('i').className = 'fas fa-eye-slash';
      this.elements.visibilityToggle.title = 'Window Hidden - Click to show';
    }
  }

  /**
   * Update microphone button appearance based on voice state
   */
  updateMicrophoneButton() {
    const micButton = this.elements.micButton;
    const micIcon = micButton.querySelector('i');
    
    // Remove all voice-related classes
    micButton.classList.remove('recording', 'available', 'unavailable');
    
    if (!this.voiceAvailable) {
      // Voice features unavailable
      micButton.classList.add('unavailable');
      micIcon.className = 'fas fa-microphone-slash';
      micButton.title = 'Voice features unavailable - check Azure credentials';
      micButton.style.opacity = '0.4';
      micButton.style.cursor = 'not-allowed';
    } else if (!this.voiceInitialized) {
      // Voice features initializing
      micIcon.className = 'fas fa-microphone';
      micButton.title = 'Voice features initializing...';
      micButton.style.opacity = '0.6';
      micButton.style.cursor = 'wait';
    } else if (this.isRecording) {
      // Currently recording
      micButton.classList.add('recording');
      micIcon.className = 'fas fa-stop';
      micButton.title = 'Recording active - Click to stop (dual audio capture)';
      micButton.style.opacity = '1';
      micButton.style.cursor = 'pointer';
    } else {
      // Ready to record
      micButton.classList.add('available');
      micIcon.className = 'fas fa-microphone';
      micButton.title = 'Voice recording ready - Click to start dual audio capture';
      micButton.style.opacity = '1';
      micButton.style.cursor = 'pointer';
    }
  }

  showFeedback(type, message, duration = 1500) {
    // Create temporary feedback element
    const feedback = document.createElement('div');
    feedback.className = `feedback-toast feedback-${type}`;
    feedback.textContent = message;
    
    // Base styles
    let backgroundColor = 'rgba(0, 0, 0, 0.8)';
    let textColor = 'white';
    
    // Type-specific styling
    switch (type) {
      case 'microphone':
      case 'voice':
        backgroundColor = 'rgba(59, 130, 246, 0.9)';
        break;
      case 'transcript':
        backgroundColor = 'rgba(16, 185, 129, 0.9)';
        break;
      case 'error':
        backgroundColor = 'rgba(239, 68, 68, 0.9)';
        break;
      case 'warning':
        backgroundColor = 'rgba(245, 158, 11, 0.9)';
        break;
    }
    
    feedback.style.cssText = `
      position: fixed;
      top: 70px;
      left: 50%;
      transform: translateX(-50%);
      background: ${backgroundColor};
      color: ${textColor};
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      pointer-events: none;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.2s ease;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    document.body.appendChild(feedback);

    // Animate in
    requestAnimationFrame(() => {
      feedback.style.opacity = '1';
    });

    // Remove after delay
    setTimeout(() => {
      feedback.style.opacity = '0';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 200);
    }, duration);
  }

  handleResize() {
    // Handle responsive behavior when window is resized
    const containerWidth = this.elements.overlayContainer.offsetWidth;
    
    // Hide text labels if window becomes too narrow
    const controlItems = document.querySelectorAll('.control-item');
    controlItems.forEach(item => {
      const textElements = item.querySelectorAll('span');
      textElements.forEach(span => {
        span.style.display = containerWidth < 200 ? 'none' : 'inline';
      });
    });
  }

  async autoResizeWindow() {
    try {
      if (window.electronAPI) {
        // Calculate the required dimensions based on visible content
        const container = this.elements.overlayContainer;
        const tooltip = this.elements.shortcutsTooltip;
        
        // Base dimensions
        let width = container.scrollWidth || container.offsetWidth;
        let height = container.scrollHeight || container.offsetHeight;
        
        // If tooltip is visible, account for its space
        if (this.tooltipVisible && tooltip) {
          width = Math.max(width, tooltip.offsetWidth + 40); // Add padding
          height = Math.max(height, tooltip.offsetHeight + container.offsetHeight + 20);
        }
        
        // Ensure minimum dimensions
        width = Math.max(300, width);
        height = Math.max(50, height);
        
        await window.electronAPI.autoResizeWindow(width, height);
      }
    } catch (error) {
      console.error('Failed to auto-resize window:', error);
    }
  }
  
  async showWindowStats() {
    try {
      if (window.electronAPI) {
        const stats = await window.electronAPI.getWindowStats();
        console.log('Window Stats:', stats);
        
        // Show stats in a temporary overlay
        const statsDisplay = `
          Position: ${stats.position ? stats.position.join(', ') : 'N/A'}
          Size: ${stats.size ? stats.size.join(' x ') : 'N/A'}
          Always On Top: ${stats.isAlwaysOnTop}
          Focused: ${stats.isFocused}
          Display: ${stats.display || 'N/A'}
        `;
        
        this.showFeedback('stats', statsDisplay);
      }
    } catch (error) {
      console.error('Failed to get window stats:', error);
    }
  }

  // Public method to manually update status
  async refreshStatus() {
    try {
      if (window.electronAPI) {
        const [isVisible, isInteractive, isScreenSharingActive, voiceStatus] = await Promise.all([
          window.electronAPI.isVisible(),
          window.electronAPI.isInteractive(),
          window.electronAPI.isScreenSharingActive(),
          window.electronAPI.getVoiceStatus()
        ]);
        
        this.isVisible = isVisible;
        this.isInteractive = isInteractive;
        this.isScreenSharingActive = isScreenSharingActive;
        
        // Update voice status
        this.updateVoiceStatus(voiceStatus);
        
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  }

  /**
   * Initialize voice features
   */
  async initializeVoiceFeatures() {
    try {
      if (window.electronAPI) {
        const voiceStatus = await window.electronAPI.getVoiceStatus();
        this.updateVoiceStatus(voiceStatus);
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to initialize voice features:', error);
    }
  }

  /**
   * Setup voice-related event listeners
   */
  setupVoiceEventListeners() {
    if (!window.electronAPI) return;

    // Voice manager initialization
    window.electronAPI.onVoiceManagerInitialized(() => {
      this.voiceInitialized = true;
      this.voiceAvailable = true;
      this.updateUI();
      this.showFeedback('voice', '🎙️ Voice features ready - Azure Speech connected');
      console.log('Voice Manager initialized');
    });

    // Voice manager errors
    window.electronAPI.onVoiceManagerError((error) => {
      console.error('Voice Manager Error:', error);
      this.showFeedback('voice', `❌ Voice Error: ${error.message}`);
      
      if (error.type === 'initialization') {
        this.voiceInitialized = false;
        this.updateUI();
      }
    });

    // Voice manager unavailable
    window.electronAPI.onVoiceManagerUnavailable((data) => {
      this.voiceAvailable = false;
      this.voiceInitialized = false;
      this.updateUI();
      console.warn('Voice Manager unavailable:', data.reason);
      
      // Show helpful feedback about Azure credentials
      if (data.reason.includes('credentials')) {
        this.showFeedback('voice', '⚠️ Set Azure credentials in .env file to enable voice features');
      }
    });

    // Recording state changes
    window.electronAPI.onVoiceRecordingStarted((data) => {
      this.isRecording = true;
      this.updateUI();
      console.log('Voice recording started:', data);
    });

    window.electronAPI.onVoiceRecordingStopped((data) => {
      this.isRecording = false;
      this.updateUI();
      console.log('Voice recording stopped:', data);
      
      // Clean up audio capture when recording stops
      if (this.mediaStream || this.audioContext) {
        this.stopAudioCapture();
      }
      
      if (data.summary && data.summary.transcriptCount > 0) {
        this.showFeedback('voice', `📝 Session ended: ${data.summary.transcriptCount} transcripts`);
      } else {
        this.showFeedback('voice', '📝 Recording session ended');
      }
    });

    // Transcript events
    window.electronAPI.onInterimTranscript((transcript) => {
      this.handleInterimTranscript(transcript);
    });

    window.electronAPI.onFinalTranscript((transcript) => {
      this.handleFinalTranscript(transcript);
    });
  }

  /**
   * Update voice status from main process
   */
  updateVoiceStatus(status) {
    this.voiceAvailable = status.available || false;
    this.voiceInitialized = status.initialized || false;
    this.isRecording = status.isRecording || false;
    
    // Update transcripts if available
    if (status.isRecording && status.transcriptStatus) {
      // Voice status updated
    }
  }

  /**
   * Handle interim transcript results
   */
  handleInterimTranscript(transcript) {
    this.currentTranscript = transcript;
    
    // Show interim feedback
    if (transcript.text && transcript.text.length > 10) {
      this.showTranscriptPreview(transcript);
    }
  }

  /**
   * Handle final transcript results
   */
  handleFinalTranscript(transcript) {
    this.transcripts.push(transcript);
    this.currentTranscript = null;
    
    // Show final transcript feedback
    this.showTranscriptPreview(transcript, true);
    
    // Keep only recent transcripts in memory
    if (this.transcripts.length > 50) {
      this.transcripts = this.transcripts.slice(-50);
    }
  }

  /**
   * Show transcript preview in UI
   */
  showTranscriptPreview(transcript, isFinal = false) {
    const prefix = isFinal ? '💬' : '⏳';
    const text = transcript.taggedText || `[${transcript.speaker}] ${transcript.text}`;
    const maxLength = 60;
    const displayText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    
    this.showFeedback('transcript', `${prefix} ${displayText}`, isFinal ? 3000 : 1500);
  }

  /**
   * Get voice recording status for UI updates
   */
  async getVoiceRecordingStatus() {
    try {
      if (window.electronAPI) {
        const status = await window.electronAPI.getVoiceStatus();
        return status;
      }
    } catch (error) {
      console.error('Failed to get voice recording status:', error);
    }
    return { available: false, isRecording: false };
  }

  /**
   * Enumerate available audio devices
   */
  async enumerateAudioDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('MediaDevices API not available');
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      this.audioDevices.inputDevices = devices.filter(device => device.kind === 'audioinput');
      this.audioDevices.outputDevices = devices.filter(device => device.kind === 'audiooutput');
      
      console.log('Audio devices enumerated:', {
        input: this.audioDevices.inputDevices.length,
        output: this.audioDevices.outputDevices.length
      });

      // Send device list to main process
      if (window.electronAPI) {
        await window.electronAPI.updateAudioDevices(this.audioDevices);
      }
    } catch (error) {
      console.error('Failed to enumerate audio devices:', error);
    }
  }

  /**
   * Start audio capture using getUserMedia
   */
  async startAudioCapture() {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('Microphone access granted');

      // Create audio context for processing
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create script processor for real-time audio data
      const bufferSize = 4096;
      this.audioWorkletNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      this.audioWorkletNode.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        this.processAudioData(inputBuffer);
      };

      // Connect audio processing chain
      source.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);

      // Notify main process that microphone is active
      if (window.electronAPI) {
        await window.electronAPI.setMicrophoneActive(true);
      }

      return true;
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      this.showFeedback('microphone', `❌ Microphone access denied: ${error.message}`, 3000);
      return false;
    }
  }

  /**
   * Stop audio capture
   */
  async stopAudioCapture() {
    try {
      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      // Clean up audio processing
      if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect();
        this.audioWorkletNode = null;
      }

      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      // Notify main process that microphone is inactive
      if (window.electronAPI) {
        await window.electronAPI.setMicrophoneActive(false);
      }

      console.log('Audio capture stopped');
      return true;
    } catch (error) {
      console.error('Failed to stop audio capture:', error);
      return false;
    }
  }

  /**
   * Process audio data and send to main process
   */
  async processAudioData(audioBuffer) {
    try {
      if (!this.isRecording || !window.electronAPI) {
        console.log('Not recording or no electronAPI, skipping audio data');
        return;
      }

      // Calculate audio level to check if there's actually sound
      let sum = 0;
      let max = 0;
      for (let i = 0; i < audioBuffer.length; i++) {
        const abs = Math.abs(audioBuffer[i]);
        sum += abs;
        max = Math.max(max, abs);
      }
      const average = sum / audioBuffer.length;
      const db = 20 * Math.log10(max);

      // Convert Float32Array to Int16Array for Azure Speech SDK
      const int16Buffer = new Int16Array(audioBuffer.length);
      for (let i = 0; i < audioBuffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer[i]));
        int16Buffer[i] = sample * 0x7FFF;
      }

      // Log audio levels periodically
      if (Math.random() < 0.1) { // Log 10% of samples to avoid spam
        console.log(`Audio levels - Max: ${max.toFixed(4)}, Avg: ${average.toFixed(4)}, dB: ${db.toFixed(1)}`);
      }

      // Only send to Azure if there's meaningful audio (above noise floor)
      if (max > 0.001) { // Threshold for meaningful audio
        const result = await window.electronAPI.processAudioData(Array.from(int16Buffer));
        if (!result.success) {
          console.error('Failed to send audio data to main process:', result.error);
        }
      } else if (Math.random() < 0.01) { // Occasionally log silence
        console.log('Audio below threshold (silence), not sending to Azure');
      }
    } catch (error) {
      console.error('Failed to process audio data:', error);
    }
  }

  async handleMicrophoneClick() {
    if (!this.voiceAvailable || !this.voiceInitialized) {
      this.showFeedback('microphone', '🎙️ Voice features not available - check Azure credentials');
      return;
    }

    try {
      if (this.isRecording) {
        // Stop recording
        await this.stopAudioCapture();
        const result = await window.electronAPI.stopVoiceRecording();
        if (result.success) {
          this.showFeedback('microphone', '⏹️ Recording stopped');
        } else {
          this.showFeedback('microphone', `❌ Failed to stop: ${result.error}`);
        }
      } else {
        // Start recording
        const audioStarted = await this.startAudioCapture();
        if (audioStarted) {
          const result = await window.electronAPI.startVoiceRecording();
          if (result.success) {
            this.showFeedback('microphone', '🎙️ Recording started - sending audio to Azure Speech');
          } else {
            await this.stopAudioCapture();
            this.showFeedback('microphone', `❌ Failed to start Azure Speech: ${result.error}`);
          }
        }
      }
    } catch (error) {
      console.error('Microphone click error:', error);
      this.showFeedback('microphone', '❌ Voice recording error');
      await this.stopAudioCapture();
    }
  }
}

// Initialize the overlay renderer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const overlay = new OverlayRenderer();
  
  // Make it globally accessible for debugging
  window.overlayRenderer = overlay;
  
  // Initial auto-resize after a short delay to ensure DOM is fully rendered
  setTimeout(() => {
    overlay.autoResizeWindow();
  }, 100);
  
  // Periodic status refresh to stay in sync
  setInterval(() => {
    overlay.refreshStatus();
  }, 5000);
  
  console.log('Overlay Assistant renderer initialized');
});