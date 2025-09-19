# Audio Capture Analysis - NewAIAssistant

## Executive Summary

This codebase implements a sophisticated dual-audio capture system for an Electron-based overlay assistant application. **Contrary to your initial assumption**, the application captures BOTH microphone input AND system audio (when available), not just microphone input. The system uses a hybrid approach combining browser APIs (getUserMedia, getDisplayMedia) in the renderer process with Azure Speech Services for transcription.

## Architecture Overview

The application follows a modular architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Renderer      │    │   Main Process  │    │   Azure Speech  │
│   Process       │    │                 │    │   Services      │
│                 │    │                 │    │                 │
│ • getUserMedia  │◄──►│ • VoiceManager  │◄──►│ • Speech-to-Text│
│ • getDisplayMedia│    │ • IPC Handlers  │    │ • Diarization   │
│ • Audio Processing│    │ • Audio Routing │    │ • Dual Streams  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Detailed Component Analysis

### 1. Main Process (main.js)

**File**: `main.js`
**Purpose**: Electron main process managing the overlay window and voice features

#### Key Audio-Related Features:
- **Voice Manager Integration**: Lines 467-530 initialize VoiceManager for dual audio processing
- **IPC Handlers**: Lines 296-318 handle audio data processing requests from renderer
- **Dual Audio Support**:
  - `processAudioData()` - handles microphone audio from renderer
  - `processSystemAudioData()` - handles desktop/system audio capture
  - `getDesktopSources()` - provides available desktop sources for system audio

#### Audio Flow in Main Process:
1. **Initialization**: Creates VoiceManager instance with Azure credentials
2. **Event Handling**: Sets up listeners for voice recording events
3. **Audio Routing**: Routes audio data from renderer to appropriate processing streams
4. **Session Management**: Manages recording sessions and transcript storage

### 2. Renderer Process (renderer.js)

**File**: `renderer.js`
**Purpose**: Frontend audio capture and real-time processing

#### Audio Capture Strategy:
The renderer implements a **dual audio capture system**:

##### Microphone Capture (Lines 615-663):
```javascript
// Primary microphone capture
this.mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
});
```

##### System Audio Capture (Lines 819-897):
```javascript
// System audio capture attempts multiple approaches:
try {
  // Method 1: getDisplayMedia (preferred)
  this.systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: false
  });
} catch (displayError) {
  // Method 2: getUserMedia with chromeMediaSource (fallback)
  this.systemAudioStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
      }
    }
  });
}
```

#### Audio Processing Pipeline:
1. **Real-time Processing**: Uses Web Audio API ScriptProcessor for real-time audio data
2. **Format Conversion**: Converts Float32 to Int16 for Azure Speech SDK compatibility
3. **Noise Filtering**: Only sends audio above noise threshold (0.001) to Azure
4. **Dual Stream Management**: Maintains separate processing chains for mic and system audio

### 3. VoiceManager (src/VoiceManager.js)

**File**: `src/VoiceManager.js`
**Purpose**: Central orchestrator for voice features

#### Core Responsibilities:
- **Component Coordination**: Manages AudioCaptureManager, SpeechRecognitionService, and TranscriptManager
- **Dual Stream Processing**: Handles both microphone and system audio streams
- **Session Management**: Manages recording sessions with proper cleanup
- **Event Coordination**: Routes events between components and renderer process

#### Audio Flow Management:
```javascript
// Handles microphone audio (Lines 264-274)
handleMicrophoneAudio(audioData) {
  if (this.speechService.isStreamActive('microphone')) {
    this.speechService.processAudioData('microphone', audioData.audioData);
  }
}

// Handles system audio (Lines 279-289)
handleSystemAudio(audioData) {
  if (this.speechService.isStreamActive('system')) {
    this.speechService.processAudioData('system', audioData.audioData);
  }
}
```

### 4. AudioCaptureManager (src/audio/AudioCaptureManager.js)

**File**: `src/audio/AudioCaptureManager.js`
**Purpose**: Audio stream coordination and processing

#### Key Features:
- **Hybrid Architecture**: Coordinates between Electron main process and renderer-based capture
- **Speaker Tagging**: Tags audio sources as "Me" (microphone) or "Other" (system)
- **Buffer Management**: Handles audio data buffering and format conversion
- **Device Management**: Manages audio device enumeration and selection

#### Audio Processing Logic:
```javascript
processAudioData(audioData, source = 'microphone') {
  const speakerTag = source === 'microphone' ? 'Me' : 'Other';
  const processedBuffer = this.processAudioBuffer(audioData);

  const eventName = source === 'microphone' ? 'microphone-audio' : 'system-audio';
  this.emit(eventName, {
    source: source,
    speaker: speakerTag,
    audioData: processedBuffer,
    timestamp: Date.now()
  });
}
```

### 5. SpeechRecognitionService (src/speech/SpeechRecognitionService.js)

**File**: `src/speech/SpeechRecognitionService.js`
**Purpose**: Azure Speech Services integration

#### Dual Stream Recognition:
- **Concurrent Recognizers**: Creates separate Azure Speech recognizer instances for each audio source
- **Speaker Diarization**: Enables Azure's speaker separation for improved accuracy
- **Continuous Recognition**: Maintains persistent connection to Azure for real-time transcription

#### Configuration:
```javascript
// Enable speaker diarization for multi-speaker detection
speechConfig.setProperty('DiarizationEnabled', 'true');
speechConfig.setProperty('MaxSpeakerCount', '2');
```

### 6. TranscriptManager (src/transcript/TranscriptManager.js)

**File**: `src/transcript/TranscriptManager.js`
**Purpose**: Transcript processing and session management

#### Speaker Differentiation:
```javascript
// Speaker mapping for dual streams
this.speakerMap = {
  'microphone': 'Me',
  'system': 'Other'
};
```

#### Features:
- **Real-time Transcript Processing**: Handles both interim and final results
- **Session Management**: Organizes transcripts into recording sessions
- **Export Capabilities**: Supports JSON, TXT, CSV, and SRT formats
- **Auto-save**: Automatically saves sessions to prevent data loss

## Audio Capture Flow Diagram

```
┌─────────────────┐
│   User Clicks   │
│  Microphone     │
│    Button       │
└─────┬───────────┘
      │
      ▼
┌─────────────────┐    ┌─────────────────┐
│  Renderer       │    │  Check for      │
│  Process        │    │  Headphones     │
│                 │    │                 │
│ 1. Start Mic    │────► If No Headphones│
│    Capture      │    │ Start System    │
│ 2. getUserMedia │    │ Audio Capture   │
└─────┬───────────┘    └─────────────────┘
      │                          │
      ▼                          ▼
┌─────────────────┐    ┌─────────────────┐
│ Audio Context   │    │ getDisplayMedia │
│ ScriptProcessor │    │ or getUserMedia │
│                 │    │ (chromeMedia)   │
│ Real-time PCM   │    │                 │
│ Processing      │    │ Desktop Sources │
└─────┬───────────┘    └─────┬───────────┘
      │                      │
      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Format Convert  │    │ Format Convert  │
│ Float32→Int16   │    │ Float32→Int16   │
│                 │    │                 │
│ Noise Filter    │    │ Noise Filter    │
│ (>0.001)        │    │ (>0.001)        │
└─────┬───────────┘    └─────┬───────────┘
      │                      │
      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Main Process    │    │ Main Process    │
│ IPC Handler     │    │ IPC Handler     │
│                 │    │                 │
│ processAudio    │    │ processSystem   │
│ Data()          │    │ AudioData()     │
└─────┬───────────┘    └─────┬───────────┘
      │                      │
      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ VoiceManager    │    │ VoiceManager    │
│                 │    │                 │
│ handleMicrophone│    │ handleSystem    │
│ Audio()         │    │ Audio()         │
│                 │    │                 │
│ Speaker: "Me"   │    │ Speaker: "Other"│
└─────┬───────────┘    └─────┬───────────┘
      │                      │
      ▼                      ▼
┌─────────────────────────────────────────┐
│         SpeechRecognitionService        │
│                                         │
│ ┌─────────────────┐ ┌─────────────────┐ │
│ │ Microphone      │ │ System Audio    │ │
│ │ Stream          │ │ Stream          │ │
│ │                 │ │                 │ │
│ │ Azure Speech    │ │ Azure Speech    │ │
│ │ Recognizer      │ │ Recognizer      │ │
│ └─────────────────┘ └─────────────────┘ │
└─────┬───────────────────────────────────┘
      │
      ▼
┌─────────────────┐
│ TranscriptManager│
│                 │
│ • Tag Speakers  │
│ • Store Results │
│ • Export Data   │
│ • Save Sessions │
└─────────────────┘
```

## Smart Audio Capture Strategy

The application implements an intelligent audio capture strategy:

### 1. Headphone Detection (Lines 964-971):
```javascript
const hasHeadphones = outputDevices.some(device =>
  device.label.toLowerCase().includes('headphone') ||
  device.label.toLowerCase().includes('headset') ||
  device.label.toLowerCase().includes('airpods') ||
  device.label.toLowerCase().includes('bluetooth')
);
```

### 2. Adaptive Capture Mode:
- **With Headphones**: Uses microphone-only mode with Azure's speaker diarization
- **Without Headphones**: Attempts dual capture (microphone + system audio)

### 3. Desktop Source Selection (Lines 984-1007):
```javascript
// Priority order for system audio sources:
1. Meeting apps (Teams, Zoom, Meet, Discord)
2. Screen sources
3. Fallback to first available source
```

## Technical Implementation Details

### Audio Format Specifications:
- **Sample Rate**: 16kHz (Azure Speech requirement)
- **Bit Depth**: 16-bit PCM
- **Channels**: Mono (1 channel)
- **Format**: Int16Array converted to Buffer for Azure SDK

### Performance Optimizations:
1. **Selective Processing**: Only sends audio above noise threshold
2. **Buffer Management**: Limits buffer size to prevent memory issues
3. **Event-driven Architecture**: Non-blocking audio processing
4. **Periodic Logging**: Logs only 10% of audio samples to reduce console spam

### Error Handling:
- **Graceful Degradation**: Falls back to microphone-only if system audio fails
- **Permission Handling**: Provides clear feedback for microphone access issues
- **Stream Recovery**: Attempts reconnection on Azure Speech errors

## Configuration Management

### Environment Variables (.env):
```bash
# Azure Speech Services
AZURE_SPEECH_KEY=your_key_here
AZURE_SPEECH_REGION=eastus
AZURE_SPEECH_LANGUAGE=en-US

# Audio Configuration
AUDIO_CAPTURE_MODE=dual
ENABLE_SYSTEM_AUDIO=true
AUDIO_SAMPLE_RATE=16000

# Debug Options
DEBUG_AUDIO=false
DEBUG_SPEECH=false
```

### VoiceConfig Features:
- **Environment Loading**: Automatic .env file loading
- **Validation**: Checks for required Azure credentials
- **Runtime Updates**: Allows configuration changes during runtime
- **Multiple Formats**: Supports various export formats (JSON, TXT, CSV, SRT)

## Security and Privacy Considerations

### Content Protection:
- **Screen Sharing Detection**: Automatically hides overlay during screen sharing
- **Content Protection**: Enables window content protection to prevent capture
- **Stealth Mode**: Moves window off-screen when screen sharing is detected

### Data Handling:
- **Local Storage**: Transcripts saved locally in `./transcripts/` directory
- **Session Isolation**: Each recording session is separate
- **Automatic Cleanup**: Manages buffer sizes to prevent memory leaks

## Current Limitations and Potential Issues

### 1. System Audio Capture Challenges:
- **Browser Limitations**: getDisplayMedia for audio-only is not universally supported
- **Permission Requirements**: Requires user consent for desktop audio capture
- **Platform Differences**: Different behavior on Windows, macOS, and Linux

### 2. Azure Speech Dependencies:
- **Network Required**: Requires internet connection for transcription
- **API Costs**: Azure Speech usage incurs costs
- **Latency**: Network round-trip affects real-time performance

### 3. Format Compatibility:
- **Electron Constraints**: Limited by Electron's audio APIs
- **Browser Security**: Subject to browser security restrictions
- **Device Support**: Varies by audio hardware and drivers

## Recommendations for Improvement

### 1. Enhanced System Audio:
- Implement native audio capture modules for better system audio support
- Add support for WASAPI on Windows for more reliable desktop audio
- Consider using node-speaker or similar libraries for direct audio access

### 2. Offline Capabilities:
- Integrate local speech recognition models (e.g., Whisper.js)
- Implement hybrid online/offline transcription
- Add offline audio recording with later transcription

### 3. Advanced Features:
- Real-time noise cancellation
- Audio quality enhancement
- Multi-language detection
- Voice activity detection

## Conclusion

The NewAIAssistant implements a sophisticated dual-audio capture system that goes far beyond simple microphone recording. It successfully captures both microphone input and system audio when available, uses intelligent source selection, and provides real-time transcription with speaker differentiation. The modular architecture allows for easy maintenance and extension, while the error handling ensures graceful degradation when components fail.

The system represents a well-thought-out solution for dual-stream audio capture in an Electron environment, leveraging modern web APIs and cloud services to provide a robust voice transcription experience.