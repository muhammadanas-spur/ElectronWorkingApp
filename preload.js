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
  
  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});