// Renderer process JavaScript for the overlay interface
class OverlayRenderer {
  constructor() {
    this.isInteractive = true;
    this.isVisible = true;
    this.tooltipVisible = false;
    this.isScreenSharingActive = false;

    this.initializeElements();
    this.setupEventListeners();
    this.updateUI();
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

    // Update status dot - screen sharing takes priority
    if (this.isScreenSharingActive) {
      this.elements.statusDot.className = 'status-dot screen-sharing';
      this.elements.statusDot.title = 'Screen Sharing Detected - Stealth Mode Active';
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

  showFeedback(type, message) {
    // Create temporary feedback element
    const feedback = document.createElement('div');
    feedback.className = 'feedback-toast';
    feedback.textContent = message;
    feedback.style.cssText = `
      position: fixed;
      top: 70px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      pointer-events: none;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.2s ease;
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
    }, 1500);
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
        const [isVisible, isInteractive, isScreenSharingActive] = await Promise.all([
          window.electronAPI.isVisible(),
          window.electronAPI.isInteractive(),
          window.electronAPI.isScreenSharingActive()
        ]);
        
        this.isVisible = isVisible;
        this.isInteractive = isInteractive;
        this.isScreenSharingActive = isScreenSharingActive;
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  }

  handleMicrophoneClick() {
    // Placeholder for future microphone functionality
    console.log('Microphone button clicked - functionality coming soon!');
    
    // Show a temporary visual feedback
    const micIcon = this.elements.micButton.querySelector('i');
    const originalClass = micIcon.className;
    
    // Temporarily change icon to indicate it was clicked
    micIcon.className = 'fas fa-microphone-slash';
    setTimeout(() => {
      micIcon.className = originalClass;
    }, 500);
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