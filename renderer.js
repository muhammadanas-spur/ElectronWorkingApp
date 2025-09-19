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

    // System audio capture state
    this.systemAudioStream = null;
    this.systemAudioContext = null;
    this.systemAudioWorkletNode = null;
    this.systemAudioActive = false;
    this.desktopSources = [];

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
      overlayContainer: document.getElementById('overlayContainer'),
      insightsPanel: document.getElementById('insightsPanel'),
      insightsToggle: document.getElementById('insightsToggle'),
      insightsContent: document.getElementById('insightsContent'),
      insightsTopic: document.getElementById('insightsTopic'),
      insightsKeypoints: document.getElementById('insightsKeypoints'),
      insightsActions: document.getElementById('insightsActions')
    };

    // Insights panel state
    this.insightsVisible = false;
    this.insightsCollapsed = false;
    this.currentInsights = null;
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

    // Insights panel toggle
    this.elements.insightsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleInsightsPanel();
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
        const insightsPanel = this.elements.insightsPanel;
        
        // Base dimensions from main container
        let width = container.scrollWidth || container.offsetWidth;
        let height = container.scrollHeight || container.offsetHeight;
        
        // Add insights panel dimensions if visible
        if (this.insightsVisible && insightsPanel && insightsPanel.classList.contains('show')) {
          const insightsWidth = insightsPanel.scrollWidth || insightsPanel.offsetWidth;
          const insightsHeight = insightsPanel.scrollHeight || insightsPanel.offsetHeight;
          
          width = Math.max(width, insightsWidth + 20); // Add some padding
          height += insightsHeight + 12; // Add gap between main bar and insights
          
          console.log('Auto-resize with insights:', { 
            insightsWidth, 
            insightsHeight, 
            totalWidth: width, 
            totalHeight: height 
          });
        }
        
        // If tooltip is visible, account for its space
        if (this.tooltipVisible && tooltip) {
          width = Math.max(width, tooltip.offsetWidth + 40);
          height = Math.max(height, tooltip.offsetHeight + container.offsetHeight + 20);
        }
        
        // Ensure minimum dimensions
        width = Math.max(320, width);
        height = Math.max(50, height);
        
        console.log('Final auto-resize dimensions:', { width, height });
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

    // Topic analysis events
    window.electronAPI.onTopicUpdated((topic) => {
      this.handleTopicUpdated(topic);
    });

    window.electronAPI.onTopicFileUpdated((data) => {
      console.log('Topic file updated:', data.file);
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
   * Toggle insights panel visibility
   */
  toggleInsightsPanel() {
    this.insightsCollapsed = !this.insightsCollapsed;
    
    if (this.insightsCollapsed) {
      this.elements.insightsContent.classList.add('collapsed');
      this.elements.insightsToggle.classList.add('collapsed');
    } else {
      this.elements.insightsContent.classList.remove('collapsed');
      this.elements.insightsToggle.classList.remove('collapsed');
    }
    
    // Auto-resize window after toggle
    setTimeout(() => {
      this.autoResizeWindow();
    }, 300);
  }

  /**
   * Show insights panel
   */
  showInsightsPanel() {
    if (!this.insightsVisible) {
      this.insightsVisible = true;
      this.elements.insightsPanel.classList.add('show');
      
      // Force a layout recalculation and resize
      setTimeout(() => {
        // Force browser to recalculate layout
        this.elements.insightsPanel.offsetHeight;
        this.autoResizeWindow();
      }, 100);
      
      // Double-check resize after animation completes
      setTimeout(() => {
        this.autoResizeWindow();
      }, 400);
    }
  }

  /**
   * Hide insights panel
   */
  hideInsightsPanel() {
    if (this.insightsVisible) {
      this.insightsVisible = false;
      this.elements.insightsPanel.classList.remove('show');
      setTimeout(() => {
        this.autoResizeWindow();
      }, 300);
    }
  }

  /**
   * Handle topic updates from main process
   */
  handleTopicUpdated(topic) {
    console.log('Topic updated:', topic);
    this.currentInsights = topic;
    this.updateInsightsPanel(topic);
    this.showInsightsPanel();
  }

  /**
   * Update insights panel with new data
   */
  updateInsightsPanel(insights) {
    if (!insights) return;

    // Update topic
    this.elements.insightsTopic.textContent = insights.topic || 'Conversation in progress';

    // Update key points
    this.elements.insightsKeypoints.innerHTML = '';
    if (insights.keyPoints && insights.keyPoints.length > 0) {
      insights.keyPoints.forEach(point => {
        const pointElement = document.createElement('div');
        pointElement.className = 'keypoint-item';
        pointElement.innerHTML = `
          <div class="keypoint-bullet"></div>
          <span>${point}</span>
        `;
        this.elements.insightsKeypoints.appendChild(pointElement);
      });
    }

    // Update actions
    this.elements.insightsActions.innerHTML = '';
    if (insights.actions && insights.actions.length > 0) {
      insights.actions.forEach((action, index) => {
        const actionElement = document.createElement('div');
        actionElement.className = 'action-item';
        actionElement.innerHTML = `
          <i class="action-icon fas fa-${this.getActionIcon(index)}"></i>
          <span>${action}</span>
        `;
        this.elements.insightsActions.appendChild(actionElement);
      });
    }

    // Show loading state briefly for visual feedback
    this.showInsightsLoading();
    setTimeout(() => {
      this.hideInsightsLoading();
    }, 500);
  }

  /**
   * Get appropriate icon for action based on index
   */
  getActionIcon(index) {
    const icons = ['clipboard-check', 'comment-dots', 'arrow-right', 'lightbulb'];
    return icons[index % icons.length];
  }

  /**
   * Show loading state in insights panel
   */
  showInsightsLoading() {
    const loadingElement = document.createElement('div');
    loadingElement.className = 'insights-loading';
    loadingElement.id = 'insightsLoading';
    loadingElement.innerHTML = `
      <div class="loading-spinner"></div>
      <span>Analyzing conversation...</span>
    `;
    
    if (this.elements.insightsContent) {
      this.elements.insightsContent.appendChild(loadingElement);
    }
  }

  /**
   * Hide loading state in insights panel
   */
  hideInsightsLoading() {
    const loadingElement = document.getElementById('insightsLoading');
    if (loadingElement) {
      loadingElement.remove();
    }
  }

  /**
   * Show empty state when no insights available
   */
  showInsightsEmpty() {
    this.elements.insightsContent.innerHTML = `
      <div class="insights-empty">
        <i class="fas fa-comments"></i>
        <div>Start a conversation to see live insights</div>
      </div>
    `;
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

  /**
   * Process system audio data from desktop capture
   */
  async processSystemAudioData(audioBuffer) {
    try {
      if (!this.systemAudioActive || !window.electronAPI) {
        return;
      }

      // Calculate audio level
      let sum = 0;
      let max = 0;
      for (let i = 0; i < audioBuffer.length; i++) {
        const abs = Math.abs(audioBuffer[i]);
        sum += abs;
        max = Math.max(max, abs);
      }
      const average = sum / audioBuffer.length;

      // Convert Float32Array to Int16Array for Azure Speech SDK
      const int16Buffer = new Int16Array(audioBuffer.length);
      for (let i = 0; i < audioBuffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer[i]));
        int16Buffer[i] = sample * 0x7FFF;
      }

      // Log audio levels periodically
      if (Math.random() < 0.1) {
        console.log(`System audio levels - Max: ${max.toFixed(4)}, Avg: ${average.toFixed(4)}`);
      }

      // Send to Azure if there's meaningful audio
      if (max > 0.001) {
        const result = await window.electronAPI.processSystemAudioData(Array.from(int16Buffer));
        if (!result.success) {
          console.error('Failed to send system audio data to main process:', result.error);
        }
      }
    } catch (error) {
      console.error('Failed to process system audio data:', error);
    }
  }

  /**
   * Get available desktop sources for system audio capture
   */
  async getDesktopSources() {
    try {
      console.log('🔍 Getting desktop sources...');
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const result = await window.electronAPI.getDesktopSources();
      console.log('🔍 Desktop sources result:', result);
      
      if (result.success) {
        this.desktopSources = result.sources;
        console.log(`🔍 Found ${result.sources.length} desktop sources:`, result.sources.map(s => s.name));
        return result.sources;
      } else {
        console.error('❌ Failed to get desktop sources:', result.error);
        throw new Error(result.error || 'Failed to get desktop sources');
      }
    } catch (error) {
      console.error('❌ Failed to get desktop sources:', error);
      return [];
    }
  }

  /**
   * Start system audio capture from a specific source
   */
  async startSystemAudioCapture(sourceId) {
    try {
      console.log('🔊 Starting system audio capture for source:', sourceId);
      if (!sourceId) {
        throw new Error('Source ID is required for system audio capture');
      }

      console.log('🔊 Requesting system audio access...');
      // Use getDisplayMedia to capture system audio from the selected source
      // In Electron, try getDisplayMedia first, then fallback to getUserMedia
      try {
        console.log('🔊 Trying getDisplayMedia approach...');
        this.systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: false
        });
      } catch (displayError) {
        console.log('🔊 getDisplayMedia failed, trying getUserMedia with chromeMediaSource...', displayError.message);
        this.systemAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          },
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1,
              maxHeight: 1
            }
          }
        });
      }

      console.log('✅ System audio access granted for source:', sourceId);
      console.log('🔊 System audio stream tracks:', this.systemAudioStream.getTracks().map(t => `${t.kind}: ${t.label}`));

      // Create audio context for system audio processing
      this.systemAudioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      const source = this.systemAudioContext.createMediaStreamSource(this.systemAudioStream);

      // Create script processor for real-time system audio data
      const bufferSize = 4096;
      this.systemAudioWorkletNode = this.systemAudioContext.createScriptProcessor(bufferSize, 1, 1);
      
      this.systemAudioWorkletNode.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        this.processSystemAudioData(inputBuffer);
      };

      // Connect system audio processing chain
      source.connect(this.systemAudioWorkletNode);
      this.systemAudioWorkletNode.connect(this.systemAudioContext.destination);

      // Notify main process that system audio is active
      if (window.electronAPI) {
        await window.electronAPI.setSystemAudioActive(true);
      }

      this.systemAudioActive = true;
      console.log('System audio capture started');
      return true;
    } catch (error) {
      console.error('❌ Failed to start system audio capture:', error);
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      this.showFeedback('microphone', `❌ System audio access denied: ${error.message}`, 3000);
      return false;
    }
  }

  /**
   * Stop system audio capture
   */
  async stopSystemAudioCapture() {
    try {
      // Stop system audio stream
      if (this.systemAudioStream) {
        this.systemAudioStream.getTracks().forEach(track => track.stop());
        this.systemAudioStream = null;
      }

      // Clean up system audio processing
      if (this.systemAudioWorkletNode) {
        this.systemAudioWorkletNode.disconnect();
        this.systemAudioWorkletNode = null;
      }

      if (this.systemAudioContext) {
        await this.systemAudioContext.close();
        this.systemAudioContext = null;
      }

      // Notify main process that system audio is inactive
      if (window.electronAPI) {
        await window.electronAPI.setSystemAudioActive(false);
      }

      this.systemAudioActive = false;
      console.log('System audio capture stopped');
      return true;
    } catch (error) {
      console.error('Failed to stop system audio capture:', error);
      return false;
    }
  }



  async handleMicrophoneClick() {
    if (!this.voiceAvailable || !this.voiceInitialized) {
      this.showFeedback('microphone', '🎙️ Voice features not available - check Azure credentials');
      return;
    }

    try {
      if (this.isRecording) {
        // Stop both microphone and system audio recording
        await this.stopAudioCapture();
        await this.stopSystemAudioCapture();
        const result = await window.electronAPI.stopVoiceRecording();
        if (result.success) {
          this.showFeedback('microphone', '⏹️ Recording stopped (mic + system audio)');
        } else {
          this.showFeedback('microphone', `❌ Failed to stop: ${result.error}`);
        }
      } else {
        // Start dual audio capture (microphone + system audio)
        this.showFeedback('microphone', '🎙️ Starting dual audio capture...');
        
        // 1. Start microphone capture
        const micStarted = await this.startAudioCapture();
        if (!micStarted) {
          this.showFeedback('microphone', '❌ Failed to start microphone');
          return;
        }
        
        // 2. Check for headphones and decide on audio capture strategy
        const audioDevices = await navigator.mediaDevices.enumerateDevices();
        const outputDevices = audioDevices.filter(device => device.kind === 'audiooutput');
        const hasHeadphones = outputDevices.some(device => 
          device.label.toLowerCase().includes('headphone') || 
          device.label.toLowerCase().includes('headset') ||
          device.label.toLowerCase().includes('airpods') ||
          device.label.toLowerCase().includes('bluetooth')
        );
        
        let systemAudioStarted = false;
        
        if (hasHeadphones) {
          console.log('🎧 Headphones detected - using microphone-only mode with speaker diarization');
          this.showFeedback('microphone', '🎧 Headphones detected - using smart speaker separation');
        } else {
          console.log('🔍 Getting desktop sources for dual audio capture...');
          const sources = await this.getDesktopSources();
          
          console.log(`🔍 Found ${sources.length} desktop sources`);
          if (sources.length > 0) {
            // Try to find a meeting app window first
            let selectedSource = sources.find(source => {
              const name = source.name.toLowerCase();
              return name.includes('teams') || name.includes('zoom') || name.includes('meet') || name.includes('discord');
            });
            
            console.log('🔍 Meeting app source found:', selectedSource?.name || 'None');
            
            // If no meeting app found, use the first screen source
            if (!selectedSource) {
              selectedSource = sources.find(source => source.id.startsWith('screen:')) || sources[0];
              console.log('🔍 Using fallback source:', selectedSource?.name || 'None');
            }
            
            if (selectedSource) {
              console.log(`🔊 Attempting system audio capture from: ${selectedSource.name} (${selectedSource.id})`);
              systemAudioStarted = await this.startSystemAudioCapture(selectedSource.id);
              console.log(`🔊 System audio capture result: ${systemAudioStarted ? 'SUCCESS' : 'FAILED'}`);
            } else {
              console.error('❌ No suitable desktop source found');
            }
          } else {
            console.error('❌ No desktop sources available');
          }
        }
        
        // 3. Start voice recording service
        const result = await window.electronAPI.startVoiceRecording();
        if (result.success) {
          const statusMessage = systemAudioStarted 
            ? '🎙️+🔊 Recording: Microphone + System Audio (dual speaker mode)'
            : '🎙️ Recording: Microphone only (system audio failed)';
          this.showFeedback('microphone', statusMessage);
        } else {
          await this.stopAudioCapture();
          await this.stopSystemAudioCapture();
          this.showFeedback('microphone', `❌ Failed to start Azure Speech: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Microphone click error:', error);
      this.showFeedback('microphone', '❌ Voice recording error');
      await this.stopAudioCapture();
      await this.stopSystemAudioCapture();
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