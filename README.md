# Overlay Assistant

A beautiful, transparent desktop overlay application built with Electron.js. This app provides a glassmorphism-styled overlay window that stays always-on-top and can be used as a foundation for desktop assistance applications.

![Overlay Assistant Demo](screenshot.png)

## Features

🔸 **Beautiful Glassmorphism UI** - Translucent overlay with backdrop blur effects
🔸 **Always-on-Top** - Stays above all other windows across multiple desktops/workspaces  
🔸 **Click-through Mode** - Toggle between interactive and click-through modes
🔸 **Multi-Monitor Support** - Automatically follows your cursor across displays
🔸 **Keyboard Shortcuts** - Global shortcuts work from anywhere
🔸 **Drag & Drop** - Draggable overlay window for easy positioning
🔸 **Responsive Design** - Adapts to different window sizes
🔸 **Cross-Platform** - Works on Windows, macOS, and Linux

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build CSS**
   ```bash
   npm run build-css
   ```

3. **Run the Application**
   ```bash
   npm start
   ```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+V` | Toggle window visibility |
| `Ctrl+Shift+I` | Toggle click-through mode |
| `Alt+A` | Alternative click-through toggle |
| `Ctrl+↑` | Move window up |
| `Ctrl+↓` | Move window down |
| `Ctrl+←` | Move window left |
| `Ctrl+→` | Move window right |
| `Ctrl+Shift+T` | Force always-on-top |

## Interface Elements

- **👁️ Eye Icon** - Toggle window visibility
- **👆 Pointer Icon** - Toggle between interactive and click-through modes  
- **ℹ️ Info Icon** - Show keyboard shortcuts and help
- **🟢 Green Dot** - Interactive mode (can click and drag)
- **🔴 Red Dot** - Click-through mode (clicks pass through to apps below)
- **⋮ Drag Handle** - Drag to reposition the overlay

## Development

### Project Structure
```
NewAIAssistant/
├── main.js              # Main Electron process
├── preload.js           # Secure IPC bridge
├── renderer.js          # UI logic and interactions
├── index.html           # Main overlay interface
├── package.json         # Project configuration
├── tailwind.config.js   # Tailwind CSS configuration
├── src/
│   └── input.css        # Source CSS with Tailwind directives
└── dist/
    └── output.css       # Compiled CSS output
```

### Building for Production

```bash
# Build CSS
npm run build-css

# Build distributable
npm run build
```

### Development Mode

```bash
# Start with development flags
npm run dev

# Watch CSS changes
npm run build-css -- --watch
```

## Customization

### Styling
Edit `src/input.css` to customize the appearance:
- Change glassmorphism effects
- Modify colors and transparency
- Adjust blur amounts
- Update animations

### Window Behavior
Modify `main.js` to change:
- Window size and positioning
- Always-on-top behavior
- Global shortcuts
- Multi-monitor handling

### UI Elements
Update `index.html` and `renderer.js` to:
- Add new control buttons
- Change layout and interactions
- Integrate with external APIs
- Add new features

## Advanced Usage

### Adding AI Features
This overlay provides the perfect foundation for AI-powered desktop assistants:

1. **Screen Capture** - Add screen capture capabilities for context awareness
2. **OCR Integration** - Extract text from screenshots for analysis
3. **LLM Integration** - Connect to AI services like OpenAI, Anthropic, or local models
4. **Voice Recognition** - Add speech-to-text for voice commands
5. **Smart Responses** - Display AI-generated responses in overlay windows

### Integration Examples

```javascript
// Example: Add screen capture button
document.getElementById('captureButton').addEventListener('click', async () => {
  const screenshot = await captureScreen();
  const analysis = await analyzeWithAI(screenshot);
  showResponse(analysis);
});

// Example: Add voice command
document.getElementById('micButton').addEventListener('click', async () => {
  const transcription = await startVoiceRecognition();
  const response = await processWithAI(transcription);
  displayResult(response);
});
```

## Technical Details

### Always-on-Top Implementation
- Uses Electron's `setAlwaysOnTop()` with platform-specific window levels
- Periodic enforcement to maintain position above other windows
- Special handling for macOS window levels (`screen-saver`, `floating`, etc.)

### Transparency & Blur
- CSS `backdrop-filter: blur()` for glassmorphism effects
- Transparent window background with gradient overlays
- Cross-platform blur support with fallbacks

### Click-through Technology
- `setIgnoreMouseEvents()` for click-through functionality
- Event forwarding to underlying applications
- Toggle between interactive and pass-through modes

## Platform Notes

### macOS
- Uses native window levels for better always-on-top behavior
- Supports multiple desktops/spaces
- Automatic hiding during screen sharing

### Windows
- Taskbar integration and skip taskbar options
- Multi-monitor DPI awareness
- Windows-specific always-on-top enforcement

### Linux
- X11 and Wayland compatibility
- Desktop environment integration
- Workspace/virtual desktop support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test across platforms
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Inspiration

This project is inspired by the overlay technology from OpenCluely, creating a clean foundation for building AI-powered desktop assistance applications.

---

**Ready to build something amazing?** This overlay gives you the perfect starting point for creating sophisticated desktop AI assistants, productivity tools, and interactive overlays. The beautiful glassmorphism design and robust always-on-top behavior provide a professional foundation for any desktop application.