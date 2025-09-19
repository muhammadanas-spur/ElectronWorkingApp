const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Window control
  toggleVisibility: () => ipcRenderer.invoke('toggle-visibility'),
  toggleInteraction: () => ipcRenderer.invoke('toggle-interaction'),
  moveWindow: (deltaX, deltaY) => ipcRenderer.invoke('move-window', { deltaX, deltaY }),
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', { width, height }),
  autoResizeWindow: (width, height) => ipcRenderer.invoke('auto-resize-window', { width, height }),
  enforceAlwaysOnTop: () => ipcRenderer.invoke('enforce-always-on-top'),
  
  // Screen sharing detection
  enableScreenSharingMode: () => ipcRenderer.invoke('enable-screen-sharing-mode'),
  disableScreenSharingMode: () => ipcRenderer.invoke('disable-screen-sharing-mode'),
  isScreenSharingActive: () => ipcRenderer.invoke('is-screen-sharing-active'),
  
  // Voice recording controls
  startVoiceRecording: () => ipcRenderer.invoke('start-voice-recording'),
  stopVoiceRecording: () => ipcRenderer.invoke('stop-voice-recording'),
  toggleVoiceRecording: () => ipcRenderer.invoke('toggle-voice-recording'),
  getVoiceStatus: () => ipcRenderer.invoke('get-voice-status'),
  
  // Audio data processing (from renderer to main process)
  processAudioData: (audioData) => ipcRenderer.invoke('process-audio-data', audioData),
  processSystemAudioData: (audioData) => ipcRenderer.invoke('process-system-audio-data', audioData),
  setMicrophoneActive: (active) => ipcRenderer.invoke('set-microphone-active', active),
  setSystemAudioActive: (active) => ipcRenderer.invoke('set-system-audio-active', active),
  updateAudioDevices: (devices) => ipcRenderer.invoke('update-audio-devices', devices),
  
  // Desktop capturer for system audio
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  
  // Voice configuration and devices
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  getVoiceConfig: () => ipcRenderer.invoke('get-voice-config'),
  updateVoiceConfig: (section, updates) => ipcRenderer.invoke('update-voice-config', section, updates),
  testAzureConnection: () => ipcRenderer.invoke('test-azure-connection'),
  
  // Transcript management
  getRecentTranscripts: (count) => ipcRenderer.invoke('get-recent-transcripts', count),
  searchTranscripts: (query, options) => ipcRenderer.invoke('search-transcripts', query, options),
  exportSession: (format) => ipcRenderer.invoke('export-session', format),
  
  // QUICK FIX: Transcript configuration for duplicate filtering
  updateTranscriptConfig: (config) => ipcRenderer.invoke('update-transcript-config', config),
  
  // Topic analysis
  getCurrentTopic: () => ipcRenderer.invoke('get-current-topic'),
  getTopicStatus: () => ipcRenderer.invoke('get-topic-status'),
  analyzeTopicManually: () => ipcRenderer.invoke('analyze-topic-manually'),
  
  // Status queries
  getWindowStats: () => ipcRenderer.invoke('get-window-stats'),
  isVisible: () => ipcRenderer.invoke('is-visible'),
  isInteractive: () => ipcRenderer.invoke('is-interactive'),
  
  // Event listeners
  onInteractionModeChanged: (callback) => {
    ipcRenderer.on('interaction-mode-changed', (event, isInteractive) => callback(isInteractive));
  },
  
  onScreenSharingStarted: (callback) => {
    ipcRenderer.on('screen-sharing-started', () => callback());
  },
  
  onScreenSharingStopped: (callback) => {
    ipcRenderer.on('screen-sharing-stopped', () => callback());
  },
  
  // Voice event listeners
  onVoiceManagerInitialized: (callback) => {
    ipcRenderer.on('voice-manager-initialized', () => callback());
  },
  
  onVoiceManagerError: (callback) => {
    ipcRenderer.on('voice-manager-error', (event, error) => callback(error));
  },
  
  onVoiceManagerUnavailable: (callback) => {
    ipcRenderer.on('voice-manager-unavailable', (event, data) => callback(data));
  },
  
  onVoiceRecordingStarted: (callback) => {
    ipcRenderer.on('voice-recording-started', (event, data) => callback(data));
  },
  
  onVoiceRecordingStopped: (callback) => {
    ipcRenderer.on('voice-recording-stopped', (event, data) => callback(data));
  },
  
  onInterimTranscript: (callback) => {
    ipcRenderer.on('interim-transcript', (event, transcript) => callback(transcript));
  },
  
  onFinalTranscript: (callback) => {
    ipcRenderer.on('final-transcript', (event, transcript) => callback(transcript));
  },

  // Knowledge base queries
  queryKnowledgeBase: (question, context) => ipcRenderer.invoke('query-knowledge-base', { question, context }),

  // Topic analysis event listeners
  onTopicUpdated: (callback) => {
    ipcRenderer.on('topic-updated', (event, topic) => callback(topic));
  },

  onTopicFileUpdated: (callback) => {
    ipcRenderer.on('topic-file-updated', (event, data) => callback(data));
  },
  
  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});