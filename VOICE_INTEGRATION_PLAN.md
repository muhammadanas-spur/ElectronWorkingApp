# Voice Integration Plan for NewAIAssistant

## Overview
This document outlines the implementation plan to integrate dual audio capture functionality (similar to the Testing project) into the NewAIAssistant Electron application. The goal is to enable real-time speech transcription with accurate speaker detection using physical audio source separation.

## Current State Analysis

### Existing Architecture
- **Platform**: Electron-based overlay application
- **UI**: Modern transparent overlay with always-on-top functionality
- **Features**: Screen sharing detection, interaction modes, keyboard shortcuts
- **Structure**: Clean separation between main process (`main.js`) and renderer (`renderer.js`)
- **Ready Elements**: Microphone button placeholder, IPC communication framework

### Key Findings
- ✅ Solid foundation with overlay window management
- ✅ IPC handlers established for feature extensions
- ✅ UI components ready for voice integration
- ✅ Configuration system can accommodate audio settings
- ⚠️ No current audio processing capabilities
- ⚠️ Missing Azure Speech SDK integration

## Implementation Strategy

### Core Concept: Dual Audio Stream Architecture
Following the proven approach from the Testing project:

1. **"Me" Stream**: Captures user's microphone input directly
2. **"Other" Stream**: Captures system audio (speakers/headphones output)
3. **Physical Separation**: Guarantees 100% accurate speaker identification
4. **Real-time Processing**: Live transcription with interim and final results

## Detailed Implementation Plan

### Phase 1: Dependencies and Environment Setup
**Files to modify**: `package.json`, `.env` (new)

#### Dependencies to Install
```bash
npm install microsoft-cognitiveservices-speech-sdk
npm install speaker
npm install node-record-lpcm16
npm install node-portaudio
npm install dotenv
npm install wav
```

#### Environment Configuration
Create `.env` file for:
- Azure Speech Service credentials
- Audio device preferences
- Capture mode settings
- Debug flags

### Phase 2: Core Audio Processing Module
**Files to create**: `src/audio/AudioCaptureManager.js`

#### AudioCaptureManager Class
```javascript
class AudioCaptureManager {
  constructor(config) {
    this.microphoneStream = null;
    this.systemAudioStream = null;
    this.isRecording = false;
    this.config = config;
  }
  
  // Dual stream management
  startMicrophoneCapture()
  startSystemAudioCapture()
  stopAllCapture()
  
  // Event handling
  onAudioData(source, audioBuffer)
  onError(error)
}
```

**Key Features**:
- Simultaneous microphone and system audio capture
- Audio format conversion (to 16kHz mono PCM for Azure)
- Buffer management and streaming
- Error handling and recovery
- Device enumeration and selection

### Phase 3: Azure Speech Integration
**Files to create**: `src/speech/SpeechRecognitionService.js`

#### SpeechRecognitionService Class
```javascript
class SpeechRecognitionService {
  constructor(azureConfig) {
    this.speechConfig = null;
    this.recognizers = new Map(); // 'me' and 'other' recognizers
    this.isActive = false;
  }
  
  // Dual recognizer setup
  createRecognizer(streamId, audioStream)
  startRecognition(streamId)
  stopRecognition(streamId)
  
  // Event callbacks
  onRecognizing(streamId, result)
  onRecognized(streamId, result)
  onError(streamId, error)
}
```

**Key Features**:
- Two separate Azure Speech recognizers
- Continuous recognition mode
- Interim and final result handling
- Language and model configuration

### Phase 4: Speaker Detection and Transcript Management
**Files to create**: `src/transcript/TranscriptManager.js`

#### TranscriptManager Class
```javascript
class TranscriptManager {
  constructor() {
    this.transcripts = [];
    this.buffer = [];
    this.sessionId = null;
  }
  
  // Transcript processing
  addTranscript(speaker, text, type) // 'interim' or 'final'
  tagSpeaker(streamId, text) // [Me] or [Other] tagging
  getRecentTranscripts(count)
  exportSession()
  
  // Event emitters
  onTranscriptUpdate(transcript)
  onSessionComplete(summary)
}
```

**Key Features**:
- Automatic speaker tagging based on audio source
- Transcript buffering for AI processing
- Session management and export
- Real-time transcript streaming to UI

### Phase 5: Main Process Integration
**Files to modify**: `main.js`

#### New IPC Handlers
```javascript
// Voice recording controls
ipcMain.handle('start-voice-recording', () => voiceManager.startRecording())
ipcMain.handle('stop-voice-recording', () => voiceManager.stopRecording())
ipcMain.handle('get-audio-devices', () => voiceManager.getAudioDevices())

// Transcript access
ipcMain.handle('get-recent-transcripts', (event, count) => transcriptManager.getRecent(count))
ipcMain.handle('get-session-status', () => voiceManager.getStatus())

// Configuration
ipcMain.handle('set-audio-config', (event, config) => voiceManager.updateConfig(config))
```

#### VoiceManager Integration
```javascript
class VoiceManager {
  constructor() {
    this.audioCapture = new AudioCaptureManager(config);
    this.speechService = new SpeechRecognitionService(azureConfig);
    this.transcriptManager = new TranscriptManager();
  }
  
  async initializeServices()
  async startDualCapture()
  async stopCapture()
  getRecordingStatus()
}
```

### Phase 6: UI Enhancements
**Files to modify**: `index.html`, `renderer.js`, CSS styles

#### New UI Components
1. **Recording Status Indicator**
   - Visual feedback for active recording
   - Speaker identification (Me/Other) indicators
   - Audio level meters

2. **Transcript Display Panel**
   - Expandable transcript view
   - Real-time transcript streaming
   - Speaker-color-coded messages
   - Scroll management

3. **Audio Controls**
   - Start/Stop recording button
   - Device selection dropdown
   - Volume controls
   - Settings panel

#### Enhanced Microphone Button
```javascript
// Transform existing placeholder into functional control
async handleMicrophoneClick() {
  if (this.isRecording) {
    await this.stopRecording();
  } else {
    await this.startRecording();
  }
  this.updateUI();
}
```

#### New UI States
- **Idle**: Ready to record
- **Recording**: Active dual capture with visual indicators
- **Processing**: Speech recognition in progress
- **Error**: Audio/service errors with recovery options

### Phase 7: Configuration and Settings
**Files to create**: `src/config/VoiceConfig.js`, `.env.example`

#### Configuration Options
```javascript
const VoiceConfig = {
  azure: {
    subscriptionKey: process.env.AZURE_SPEECH_KEY,
    region: process.env.AZURE_SPEECH_REGION,
    language: 'en-US'
  },
  audio: {
    captureMode: 'dual', // 'dual', 'microphone-only'
    sampleRate: 16000,
    channels: 1,
    inputDevice: 'default',
    enableSystemAudio: true,
    audioBufferSize: 1024
  },
  transcript: {
    enableInterimResults: true,
    autoSave: true,
    maxBufferSize: 1000,
    sessionTimeout: 30000
  }
};
```

#### Settings UI Panel
- Azure credentials configuration
- Audio device selection
- Recording preferences
- Transcript options

### Phase 8: Testing and Validation
**Files to create**: `tests/voice-integration-test.js`

#### Test Scenarios
1. **Dual Audio Capture**
   - Microphone-only recording
   - System audio capture
   - Simultaneous dual capture

2. **Speaker Detection Accuracy**
   - User speech → [Me] tagging
   - System audio → [Other] tagging
   - Mixed audio scenarios

3. **Speech Recognition Quality**
   - Clear speech transcription
   - Background noise handling
   - Multiple speakers

4. **Real-time Performance**
   - Low latency transcription
   - UI responsiveness
   - Memory usage optimization

## File Structure After Implementation

```
NewAIAssistant/
├── src/
│   ├── audio/
│   │   ├── AudioCaptureManager.js
│   │   └── AudioDeviceManager.js
│   ├── speech/
│   │   ├── SpeechRecognitionService.js
│   │   └── AzureSpeechConfig.js
│   ├── transcript/
│   │   ├── TranscriptManager.js
│   │   └── SessionManager.js
│   ├── config/
│   │   └── VoiceConfig.js
│   └── ui/
│       ├── VoiceUI.js
│       └── TranscriptPanel.js
├── .env
├── .env.example
├── main.js (modified)
├── renderer.js (modified)
├── index.html (modified)
└── package.json (modified)
```

## Technical Considerations

### Audio Processing Challenges
1. **Format Conversion**: Convert various audio formats to Azure Speech requirements
2. **Latency Optimization**: Minimize delay between speech and transcription
3. **Device Compatibility**: Handle different audio devices and drivers
4. **System Audio Capture**: Platform-specific implementations for loopback audio

### Azure Speech Integration
1. **Connection Management**: Handle network interruptions and reconnection
2. **Rate Limiting**: Manage API usage and costs
3. **Language Support**: Configure appropriate speech models
4. **Error Recovery**: Graceful handling of recognition failures

### Performance Optimization
1. **Memory Management**: Efficient audio buffer handling
2. **CPU Usage**: Optimize audio processing and recognition
3. **UI Responsiveness**: Non-blocking audio operations
4. **Resource Cleanup**: Proper cleanup of audio streams and recognizers

## Success Metrics

### Functional Requirements
- ✅ Dual audio capture working simultaneously
- ✅ Accurate speaker detection (>95% accuracy)
- ✅ Real-time transcription with <2 second delay
- ✅ Clean integration with existing overlay UI
- ✅ Stable operation during long sessions (>30 minutes)

### User Experience
- ✅ Intuitive controls and visual feedback
- ✅ Reliable start/stop functionality
- ✅ Clear transcript display with speaker identification
- ✅ Minimal impact on system performance
- ✅ Easy configuration and setup

## Risk Mitigation

### Potential Issues
1. **Audio Permission Issues**: Implement proper permission requests
2. **Azure Service Failures**: Add fallback and retry mechanisms
3. **Device Compatibility**: Test across different hardware configurations
4. **Performance Impact**: Monitor and optimize resource usage

### Fallback Strategies
1. **Single Stream Mode**: Fall back to microphone-only if system audio fails
2. **Offline Transcription**: Cache audio for later processing if network fails
3. **Alternative Providers**: Support for other speech recognition services
4. **Manual Corrections**: Allow user to edit transcripts

## Timeline Estimate

- **Phase 1-2**: Dependencies + Core Audio (2-3 hours)
- **Phase 3-4**: Speech Recognition + Transcript Management (3-4 hours)
- **Phase 5**: Main Process Integration (2 hours)
- **Phase 6**: UI Enhancements (3-4 hours)
- **Phase 7**: Configuration (1-2 hours)
- **Phase 8**: Testing and Debugging (2-3 hours)

**Total Estimated Time**: 13-18 hours

## Next Steps

1. ✅ Create this implementation plan
2. 🔄 Install required dependencies
3. 🔄 Implement core audio capture module
4. 🔄 Integrate Azure Speech recognition
5. 🔄 Build speaker detection system
6. 🔄 Enhance UI for voice features
7. 🔄 Add configuration support
8. 🔄 Test and validate implementation

---

This plan provides a comprehensive roadmap for implementing the dual audio capture functionality while maintaining the existing overlay application's architecture and user experience.