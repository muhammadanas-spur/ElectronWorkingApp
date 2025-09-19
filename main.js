const { app, BrowserWindow, globalShortcut, screen, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const winston = require('winston');
const VoiceManager = require('./src/VoiceManager');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'overlay-assistant' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

class OverlayApplication {
  constructor() {
    this.mainWindow = null;
    this.isVisible = true;
    this.isInteractive = true;
    this.currentDisplay = null;
    
    // Screen sharing detection properties
    this.isScreenBeingShared = false;
    this.wasVisibleBeforeSharing = false;
    this.screenSharingWatcher = null;

    // Voice functionality
    this.voiceManager = null;
    this.voiceInitialized = false;

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    app.whenReady().then(() => this.onAppReady());
    app.on('window-all-closed', () => this.onWindowAllClosed());
    app.on('activate', () => this.onActivate());
    app.on('will-quit', () => this.onWillQuit());

    this.setupIPCHandlers();
  }

  async onAppReady() {
    logger.info('Overlay Assistant starting...');

    try {
      await this.createMainWindow();
      this.setupGlobalShortcuts();
      this.setupScreenTracking();
      this.setupScreenSharingDetection();
      await this.initializeVoiceManager();

      logger.info('Overlay Assistant initialized successfully');
    } catch (error) {
      logger.error('Application initialization failed', error);
      app.quit();
    }
  }

  async createMainWindow() {
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workArea;

    this.mainWindow = new BrowserWindow({
      width: 520,
      height: 60,
      x: 50,
      y: 20,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      closable: false,
      backgroundColor: '#00000000',
      hasShadow: false,
      visibleOnAllWorkspaces: true,
      fullscreenable: false,
      useContentSize: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        backgroundThrottling: false,
        devTools: true,
        disableHtmlFullscreenWindowResize: true
      },
      show: false
    });

    // Load the main overlay interface
    await this.mainWindow.loadFile('index.html');

    // Platform-specific always-on-top enforcement
    this.enforceAlwaysOnTop();
    
    // Apply stealth measures including content protection
    this.applyStealthMeasures();

    // Show window on current desktop
    this.showOnCurrentDesktop();

    // Development tools (uncomment for debugging)
    // this.mainWindow.webContents.openDevTools({ mode: 'detach' });

    logger.info('Main overlay window created');
  }

  enforceAlwaysOnTop() {
    if (process.platform === 'darwin') {
      // macOS - use different window levels
      try {
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 2);
      } catch (error) {
        try {
          this.mainWindow.setAlwaysOnTop(true, 'floating', 2);
        } catch (fallbackError) {
          this.mainWindow.setAlwaysOnTop(true);
        }
      }
    } else {
      // Windows and Linux
      this.mainWindow.setAlwaysOnTop(true);
    }

    // Periodic enforcement
    setInterval(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (process.platform === 'darwin') {
          try {
            this.mainWindow.setAlwaysOnTop(true, 'floating', 1);
          } catch (error) {
            this.mainWindow.setAlwaysOnTop(true);
          }
        } else {
          this.mainWindow.setAlwaysOnTop(true);
        }
      }
    }, 3000);
  }

  showOnCurrentDesktop() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    if (process.platform === 'darwin') {
      // macOS specific handling
      this.mainWindow.hide();
      this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      
      setTimeout(() => {
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.show();
          this.mainWindow.focus();
          
          // Revert to single workspace after showing
          setTimeout(() => {
            if (!this.mainWindow.isDestroyed()) {
              this.mainWindow.setVisibleOnAllWorkspaces(false);
            }
          }, 300);
        }
      }, 50);
    } else {
      // Windows and Linux
      this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.mainWindow.show();
      this.mainWindow.focus();
      
      setTimeout(() => {
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.setVisibleOnAllWorkspaces(false);
        }
      }, 500);
    }

    logger.info('Window shown on current desktop');
  }

  setupGlobalShortcuts() {
    const shortcuts = {
      'CommandOrControl+Shift+V': () => this.toggleVisibility(),
      'CommandOrControl+Shift+I': () => this.toggleInteraction(),
      'Alt+A': () => this.toggleInteraction(),
      'CommandOrControl+Shift+T': () => this.enforceAlwaysOnTop(),
      'CommandOrControl+Up': () => this.moveWindow(0, -20),
      'CommandOrControl+Down': () => this.moveWindow(0, 20),
      'CommandOrControl+Left': () => this.moveWindow(-20, 0),
      'CommandOrControl+Right': () => this.moveWindow(20, 0),
      'CommandOrControl+Shift+D': () => {
        // Toggle screen sharing detection mode for testing
        if (this.isScreenBeingShared) {
          this.disableScreenSharingMode();
        } else {
          this.enableScreenSharingMode();
        }
      }
    };

    Object.entries(shortcuts).forEach(([accelerator, handler]) => {
      const success = globalShortcut.register(accelerator, handler);
      logger.info(`Global shortcut registered: ${accelerator} - ${success ? 'Success' : 'Failed'}`);
    });
  }

  setupScreenTracking() {
    // Track active screen for multi-monitor support
    const cursorPoint = screen.getCursorScreenPoint();
    this.currentDisplay = screen.getDisplayNearestPoint(cursorPoint);

    screen.on('display-added', () => this.handleDisplayChange());
    screen.on('display-removed', () => this.handleDisplayChange());
    screen.on('display-metrics-changed', () => this.handleDisplayChange());

    // Periodic screen tracking
    setInterval(() => {
      this.trackActiveScreen();
    }, 2000);

    logger.info('Screen tracking initialized');
  }

  trackActiveScreen() {
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    if (!this.currentDisplay || activeDisplay.id !== this.currentDisplay.id) {
      this.currentDisplay = activeDisplay;
      this.moveWindowToActiveScreen();
      
      logger.info(`Active screen changed to display ${activeDisplay.id}`);
    }
  }

  handleDisplayChange() {
    setTimeout(() => {
      this.moveWindowToActiveScreen();
    }, 500);
  }

  moveWindowToActiveScreen() {
    if (!this.currentDisplay || !this.mainWindow || this.mainWindow.isDestroyed()) return;

    const { x: displayX, y: displayY, width: displayWidth } = this.currentDisplay.workArea;
    const [windowWidth] = this.mainWindow.getSize();
    
    // Position at top-left of the active display
    const newX = displayX + 50;
    const newY = displayY + 20;
    
    this.mainWindow.setPosition(newX, newY);
    
    // Maintain always-on-top after moving
    this.enforceAlwaysOnTop();
    
    // Show on current desktop if visible
    if (this.mainWindow.isVisible()) {
      this.showOnCurrentDesktop();
    }

    logger.info(`Window moved to active screen: ${newX}, ${newY}`);
  }

  setupIPCHandlers() {
    ipcMain.handle('toggle-visibility', () => this.toggleVisibility());
    ipcMain.handle('toggle-interaction', () => this.toggleInteraction());
    ipcMain.handle('move-window', (event, { deltaX, deltaY }) => this.moveWindow(deltaX, deltaY));
    ipcMain.handle('resize-window', (event, { width, height }) => this.resizeWindow(width, height));
    ipcMain.handle('auto-resize-window', (event, { width, height }) => this.autoResizeWindow(width, height));
    ipcMain.handle('get-window-stats', () => this.getWindowStats());
    ipcMain.handle('enforce-always-on-top', () => this.enforceAlwaysOnTop());
    
    // Screen sharing control
    ipcMain.handle('enable-screen-sharing-mode', () => this.enableScreenSharingMode());
    ipcMain.handle('disable-screen-sharing-mode', () => this.disableScreenSharingMode());
    ipcMain.handle('is-screen-sharing-active', () => this.isInScreenSharingMode());
    
    // Voice recording controls
    ipcMain.handle('start-voice-recording', () => this.startVoiceRecording());
    ipcMain.handle('stop-voice-recording', () => this.stopVoiceRecording());
    ipcMain.handle('toggle-voice-recording', () => this.toggleVoiceRecording());
    ipcMain.handle('get-voice-status', () => this.getVoiceStatus());
    
    // Audio data processing (from renderer process)
    ipcMain.handle('process-audio-data', (event, audioData) => this.processAudioData(audioData));
    ipcMain.handle('process-system-audio-data', (event, audioData) => this.processSystemAudioData(audioData));
    ipcMain.handle('set-microphone-active', (event, active) => this.setMicrophoneActive(active));
    ipcMain.handle('set-system-audio-active', (event, active) => this.setSystemAudioActive(active));
    ipcMain.handle('update-audio-devices', (event, devices) => this.updateAudioDevices(devices));
    
    // Desktop capturer for system audio
    ipcMain.handle('get-desktop-sources', () => this.getDesktopSources());
    
    // Voice configuration and devices
    ipcMain.handle('get-audio-devices', () => this.getAudioDevices());
    ipcMain.handle('get-voice-config', () => this.getVoiceConfig());
    ipcMain.handle('update-voice-config', (event, section, updates) => this.updateVoiceConfig(section, updates));
    ipcMain.handle('test-azure-connection', () => this.testAzureConnection());
    
    // Transcript management
    ipcMain.handle('get-recent-transcripts', (event, count) => this.getRecentTranscripts(count));
    ipcMain.handle('search-transcripts', (event, query, options) => this.searchTranscripts(query, options));
    ipcMain.handle('export-session', (event, format) => this.exportSession(format));
    
    // Status queries
    ipcMain.handle('is-visible', () => this.isVisible);
    ipcMain.handle('is-interactive', () => this.isInteractive);
  }

  toggleVisibility() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;

    if (this.isVisible) {
      this.mainWindow.hide();
      this.isVisible = false;
      logger.info('Window hidden');
    } else {
      this.showOnCurrentDesktop();
      this.isVisible = true;
      logger.info('Window shown');
    }

    return this.isVisible;
  }

  toggleInteraction() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;

    this.isInteractive = !this.isInteractive;
    
    if (this.isInteractive) {
      // Interactive mode: allow mouse events
      this.mainWindow.setIgnoreMouseEvents(false);
      logger.info('Window interaction enabled');
    } else {
      // Non-interactive mode: click-through
      this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
      logger.info('Window interaction disabled (click-through)');
    }

    // Notify renderer process
    this.mainWindow.webContents.send('interaction-mode-changed', this.isInteractive);

    return this.isInteractive;
  }

  moveWindow(deltaX, deltaY) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const [currentX, currentY] = this.mainWindow.getPosition();
    const newX = currentX + deltaX;
    const newY = currentY + deltaY;
    
    this.mainWindow.setPosition(newX, newY);
    
    logger.info(`Window moved by ${deltaX}, ${deltaY} to ${newX}, ${newY}`);
    return { x: newX, y: newY };
  }

  resizeWindow(width, height) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    // Enforce reasonable bounds
    const minWidth = 60;
    const maxWidth = 800;
    const minHeight = 40;
    const maxHeight = 200;

    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
    const clampedHeight = Math.max(minHeight, Math.min(maxHeight, Math.round(height)));

    this.mainWindow.setSize(clampedWidth, clampedHeight);
    
    logger.info(`Window resized to ${clampedWidth}x${clampedHeight}`);
    return { width: clampedWidth, height: clampedHeight };
  }

  autoResizeWindow(width, height) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    // Auto-resize based on content with more generous bounds
    const minWidth = 300;
    const maxWidth = 900;
    const minHeight = 50;
    const maxHeight = 400;

    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(width + 40))); // Add padding
    const clampedHeight = Math.max(minHeight, Math.min(maxHeight, Math.round(height + 20))); // Add padding

    // Use content size for more precise control
    this.mainWindow.setContentSize(clampedWidth, clampedHeight);
    
    logger.info(`Window auto-resized to ${clampedWidth}x${clampedHeight}`);
    return { width: clampedWidth, height: clampedHeight };
  }

  getWindowStats() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return { error: 'Window not available' };
    }

    return {
      isVisible: this.isVisible,
      isInteractive: this.isInteractive,
      position: this.mainWindow.getPosition(),
      size: this.mainWindow.getSize(),
      isAlwaysOnTop: this.mainWindow.isAlwaysOnTop(),
      isFocused: this.mainWindow.isFocused(),
      display: this.currentDisplay ? this.currentDisplay.id : null
    };
  }

  onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  onActivate() {
    if (!this.mainWindow) {
      this.createMainWindow();
    } else if (this.mainWindow.isVisible()) {
      this.showOnCurrentDesktop();
    }
  }

  onWillQuit() {
    globalShortcut.unregisterAll();
    
    // Clean up screen sharing watcher
    if (this.screenSharingWatcher) {
      clearInterval(this.screenSharingWatcher);
      this.screenSharingWatcher = null;
    }
    
    // Clean up voice manager
    if (this.voiceManager) {
      this.voiceManager.destroy();
      this.voiceManager = null;
    }
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy();
    }

    logger.info('Overlay Assistant shutting down');
  }

  // Voice Manager Methods
  
  /**
   * Initialize voice manager
   */
  async initializeVoiceManager() {
    try {
      logger.info('Initializing Voice Manager...');
      
      this.voiceManager = new VoiceManager(this.mainWindow);
      
      // Set up voice manager events
      this.voiceManager.on('initialized', () => {
        this.voiceInitialized = true;
        logger.info('Voice Manager initialized successfully');
        this.mainWindow?.webContents.send('voice-manager-initialized');
      });
      
      this.voiceManager.on('initialization-error', (error) => {
        logger.warn('Voice Manager initialization failed', error.message);
        this.voiceInitialized = false;
        this.mainWindow?.webContents.send('voice-manager-error', { 
          type: 'initialization', 
          message: error.message 
        });
      });
      
      this.voiceManager.on('recording-started', (data) => {
        logger.info('Voice recording started', data);
        this.mainWindow?.webContents.send('voice-recording-started', data);
      });
      
      this.voiceManager.on('recording-stopped', (data) => {
        logger.info('Voice recording stopped', data);
        this.mainWindow?.webContents.send('voice-recording-stopped', data);
      });
      
      this.voiceManager.on('recording-error', (error) => {
        logger.error('Voice recording error', error);
        this.mainWindow?.webContents.send('voice-manager-error', { 
          type: 'recording', 
          message: error.message 
        });
      });
      
      // Initialize voice manager
      try {
        await this.voiceManager.initialize();
        logger.info('Voice Manager initialization completed successfully');
      } catch (initError) {
        logger.warn('Voice Manager initialization failed, but continuing with limited functionality', initError.message);
        this.voiceInitialized = false;
        
        // Still keep the voice manager for basic functionality
        this.mainWindow?.webContents.send('voice-manager-limited', {
          reason: initError.message,
          availableFeatures: ['audio-capture']
        });
      }
      
    } catch (error) {
      logger.warn('Voice Manager setup failed completely - voice features will be disabled', error.message);
      this.voiceManager = null;
      this.voiceInitialized = false;
      
      // Notify renderer that voice features are unavailable
      this.mainWindow?.webContents.send('voice-manager-unavailable', {
        reason: error.message
      });
    }
  }

  /**
   * Start voice recording
   */
  async startVoiceRecording() {
    if (!this.voiceManager || !this.voiceInitialized) {
      logger.warn('Voice Manager not available');
      return { success: false, error: 'Voice Manager not initialized' };
    }
    
    try {
      const result = await this.voiceManager.startRecording();
      return { success: result };
    } catch (error) {
      logger.error('Failed to start voice recording', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop voice recording
   */
  async stopVoiceRecording() {
    if (!this.voiceManager || !this.voiceInitialized) {
      return { success: false, error: 'Voice Manager not initialized' };
    }
    
    try {
      const result = await this.voiceManager.stopRecording();
      return { success: result };
    } catch (error) {
      logger.error('Failed to stop voice recording', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Toggle voice recording
   */
  async toggleVoiceRecording() {
    if (!this.voiceManager || !this.voiceInitialized) {
      return { success: false, error: 'Voice Manager not initialized' };
    }
    
    try {
      const result = await this.voiceManager.toggleRecording();
      return { success: result, isRecording: this.voiceManager.isRecording };
    } catch (error) {
      logger.error('Failed to toggle voice recording', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get voice recording status
   */
  getVoiceStatus() {
    if (!this.voiceManager) {
      return { 
        available: false, 
        initialized: false,
        error: 'Voice Manager not available' 
      };
    }
    
    return {
      available: true,
      initialized: this.voiceInitialized,
      ...this.voiceManager.getStatus()
    };
  }

  /**
   * Get available audio devices
   */
  getAudioDevices() {
    if (!this.voiceManager || !this.voiceInitialized) {
      return { inputDevices: [], outputDevices: [] };
    }
    
    return this.voiceManager.getAudioDevices();
  }

  /**
   * Get voice configuration for UI
   */
  getVoiceConfig() {
    if (!this.voiceManager) {
      return { available: false };
    }
    
    return {
      available: true,
      initialized: this.voiceInitialized,
      ...this.voiceManager.getConfigForUI()
    };
  }

  /**
   * Update voice configuration
   */
  updateVoiceConfig(section, updates) {
    if (!this.voiceManager) {
      return { success: false, error: 'Voice Manager not available' };
    }
    
    try {
      const result = this.voiceManager.updateConfig(section, updates);
      return { success: result };
    } catch (error) {
      logger.error('Failed to update voice configuration', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Azure Speech connection
   */
  async testAzureConnection() {
    if (!this.voiceManager) {
      return { success: false, error: 'Voice Manager not available' };
    }
    
    try {
      return await this.voiceManager.testAzureConnection();
    } catch (error) {
      logger.error('Azure connection test failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get recent transcripts
   */
  getRecentTranscripts(count = 10) {
    if (!this.voiceManager || !this.voiceInitialized) {
      return [];
    }
    
    return this.voiceManager.getRecentTranscripts(count);
  }

  /**
   * Search transcripts
   */
  searchTranscripts(query, options = {}) {
    if (!this.voiceManager || !this.voiceInitialized) {
      return [];
    }
    
    return this.voiceManager.searchTranscripts(query, options);
  }

  /**
   * Export current session
   */
  exportSession(format = 'json') {
    if (!this.voiceManager || !this.voiceInitialized) {
      return null;
    }
    
    try {
      return this.voiceManager.exportSession(format);
    } catch (error) {
      logger.error('Failed to export session', error);
      return null;
    }
  }

  /**
   * Process audio data from renderer process
   */
  processAudioData(audioData) {
    if (!this.voiceManager || !this.voiceInitialized) {
      return { success: false, error: 'Voice Manager not initialized' };
    }
    
    try {
      this.voiceManager.processRendererAudioData(audioData);
      return { success: true };
    } catch (error) {
      logger.error('Failed to process audio data', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set microphone active state
   */
  setMicrophoneActive(active) {
    if (!this.voiceManager || !this.voiceInitialized) {
      return { success: false, error: 'Voice Manager not initialized' };
    }
    
    try {
      this.voiceManager.audioCapture.setMicrophoneActive(active);
      return { success: true };
    } catch (error) {
      logger.error('Failed to set microphone active state', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update audio devices from renderer process
   */
  updateAudioDevices(devices) {
    if (!this.voiceManager || !this.voiceInitialized) {
      return { success: false, error: 'Voice Manager not initialized' };
    }
    
    try {
      this.voiceManager.audioCapture.updateAudioDevices(devices);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update audio devices', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process system audio data from desktop capturer
   */
  processSystemAudioData(audioData) {
    if (!this.voiceManager || !this.voiceInitialized) {
      return { success: false, error: 'Voice Manager not initialized' };
    }
    
    try {
      this.voiceManager.processSystemAudioData(audioData);
      return { success: true };
    } catch (error) {
      logger.error('Failed to process system audio data', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set system audio active state
   */
  setSystemAudioActive(active) {
    if (!this.voiceManager || !this.voiceInitialized) {
      return { success: false, error: 'Voice Manager not initialized' };
    }
    
    try {
      this.voiceManager.audioCapture.setSystemAudioActive(active);
      return { success: true };
    } catch (error) {
      logger.error('Failed to set system audio active state', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available desktop sources for system audio capture
   */
  async getDesktopSources() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 320, height: 180 }
      });
      
      // Filter for common meeting applications and system sources
      const filteredSources = sources.filter(source => {
        const name = source.name.toLowerCase();
        return name.includes('teams') || 
               name.includes('zoom') || 
               name.includes('meet') || 
               name.includes('skype') || 
               name.includes('discord') || 
               name.includes('screen') ||
               source.id.startsWith('screen:');
      });
      
      return { 
        success: true, 
        sources: filteredSources.map(source => ({
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail?.toDataURL?.() || null
        }))
      };
    } catch (error) {
      logger.error('Failed to get desktop sources', error);
      return { success: false, error: error.message };
    }
  }
  
  // Screen sharing detection system
  setupScreenSharingDetection() {
    // Skip on Linux to avoid portal errors
    if (process.platform === 'linux') {
      logger.info('Skipping screen sharing detection on Linux to avoid portal screencast errors');
      return;
    }

    // Check every 3 seconds for screen sharing activity
    this.screenSharingWatcher = setInterval(async () => {
      await this.checkScreenSharingStatus();
    }, 3000);

    logger.info('Screen sharing detection initialized');
  }

  async checkScreenSharingStatus() {
    try {
      // Use desktopCapturer to detect if screen is being captured
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 }
      });

      const wasSharing = this.isScreenBeingShared;
      
      // Simple heuristic: if we can't get sources or get very few, screen might be shared
      // More sophisticated detection would require platform-specific APIs
      const potentialSharing = sources.length === 0 || 
        (process.platform === 'win32' && sources.length < 2);
      
      this.isScreenBeingShared = potentialSharing;
      
      if (wasSharing !== this.isScreenBeingShared) {
        if (this.isScreenBeingShared) {
          this.handleScreenSharingStarted();
        } else {
          this.handleScreenSharingStopped();
        }
      }
    } catch (error) {
      logger.debug('Screen sharing detection error', { error: error.message });
      // On error, assume screen sharing might be active (safer approach)
      if (!this.isScreenBeingShared) {
        this.isScreenBeingShared = true;
        this.handleScreenSharingStarted();
      }
    }
  }

  handleScreenSharingStarted() {
    logger.info('🕵️ Screen sharing detected - hiding overlay for stealth mode');
    
    // Remember if window was visible before hiding
    this.wasVisibleBeforeSharing = this.isVisible;
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // Hide window and move it far off-screen
      this.mainWindow.hide();
      this.mainWindow.setPosition(-10000, -10000);
      this.isVisible = false;
      
      // Notify renderer about screen sharing state
      this.mainWindow.webContents.send('screen-sharing-started');
    }
    
    logger.info('✅ Overlay hidden - invisible to screen sharing software');
  }

  handleScreenSharingStopped() {
    logger.info('🔄 Screen sharing ended - restoring overlay visibility');
    
    if (this.wasVisibleBeforeSharing && this.mainWindow && !this.mainWindow.isDestroyed()) {
      // Restore window to active screen
      this.moveWindowToActiveScreen();
      this.showOnCurrentDesktop();
      this.isVisible = true;
      
      // Notify renderer about screen sharing state
      this.mainWindow.webContents.send('screen-sharing-stopped');
    }
    
    logger.info('✅ Overlay restored - screen sharing stealth mode deactivated');
  }
  
  // Apply stealth measures including content protection
  applyStealthMeasures() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    try {
      // Enable content protection to prevent screen capture
      this.mainWindow.setContentProtection(true);
      logger.info('✅ Content protection enabled - overlay protected from screen capture');
    } catch (error) {
      logger.debug('Content protection not supported on this platform:', error.message);
    }
    
    // Additional stealth: skip taskbar
    this.mainWindow.setSkipTaskbar(true);
    
    // Make window appear on all workspaces initially, then revert
    this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    setTimeout(() => {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.setVisibleOnAllWorkspaces(false);
      }
    }, 1000);
  }
  
  // Manual screen sharing mode control
  enableScreenSharingMode() {
    if (!this.isScreenBeingShared) {
      this.isScreenBeingShared = true;
      this.handleScreenSharingStarted();
    }
  }
  
  disableScreenSharingMode() {
    if (this.isScreenBeingShared) {
      this.isScreenBeingShared = false;
      this.handleScreenSharingStopped();
    }
  }
  
  isInScreenSharingMode() {
    return this.isScreenBeingShared;
  }
}

// Start the application
new OverlayApplication();