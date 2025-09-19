const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * TranscriptManager - Handles transcript processing, speaker tagging, and session management
 * Similar to the Python implementation's transcript handling
 */
class TranscriptManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enableSpeakerTagging: config.enableSpeakerTagging !== false,
      maxBufferSize: config.maxBufferSize || 1000,
      autoSave: config.autoSave !== false,
      sessionTimeout: config.sessionTimeout || 30000,
      saveDirectory: config.saveDirectory || './transcripts',
      debug: config.debug || false,
      // Quick fix for duplicate transcripts
      filterDuplicates: config.filterDuplicates !== false,
      suppressMicrophoneWhenSystemAudio: config.suppressMicrophoneWhenSystemAudio !== false,
      duplicateTimeWindow: config.duplicateTimeWindow || 3000, // 3 seconds
      similarityThreshold: config.similarityThreshold || 0.8, // 80% similarity
      preferSystemAudio: config.preferSystemAudio !== false, // Prefer "Other" over "Me"
      ...config
    };
    
    // Transcript storage
    this.transcripts = [];
    this.interimTranscripts = new Map(); // streamId -> interim text
    this.currentSession = null;
    
    // Speaker mapping
    this.speakerMap = {
      'microphone': 'Me',
      'system': 'Other'
    };
    
    // Session management
    this.sessionStartTime = null;
    this.lastActivity = null;
    this.sessionId = null;
    
    // Auto-save timer
    this.autoSaveTimer = null;
    
    this.log('TranscriptManager initialized', { config: this.config });
  }

  /**
   * Initialize the transcript manager
   */
  async initialize() {
    try {
      // Ensure save directory exists
      if (this.config.autoSave) {
        await this.ensureSaveDirectory();
      }
      
      this.log('TranscriptManager initialized successfully');
      this.emit('initialized');
      return true;
    } catch (error) {
      this.log('Failed to initialize TranscriptManager', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Start a new transcript session
   */
  startSession(sessionOptions = {}) {
    try {
      // End previous session if active
      if (this.currentSession) {
        this.endSession();
      }
      
      this.sessionId = this.generateSessionId();
      this.sessionStartTime = Date.now();
      this.lastActivity = Date.now();
      
      this.currentSession = {
        id: this.sessionId,
        startTime: this.sessionStartTime,
        endTime: null,
        transcripts: [],
        metadata: {
          captureMode: sessionOptions.captureMode || 'dual',
          language: sessionOptions.language || 'en-US',
          ...sessionOptions
        }
      };
      
      // Clear previous data
      this.transcripts = [];
      this.interimTranscripts.clear();
      
      // Set up auto-save if enabled
      if (this.config.autoSave) {
        this.setupAutoSave();
      }
      
      this.log('New transcript session started', { sessionId: this.sessionId });
      this.emit('session-started', { 
        sessionId: this.sessionId, 
        startTime: this.sessionStartTime 
      });
      
      return this.sessionId;
    } catch (error) {
      this.log('Failed to start session', error);
      this.emit('error', error);
      return null;
    }
  }

  /**
   * End the current transcript session
   */
  async endSession() {
    try {
      if (!this.currentSession) {
        this.log('No active session to end');
        return null;
      }
      
      this.currentSession.endTime = Date.now();
      this.currentSession.transcripts = [...this.transcripts];
      
      // Clear auto-save timer
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
      
      // Save final session if auto-save is enabled
      let savedPath = null;
      if (this.config.autoSave) {
        savedPath = await this.saveSession(this.currentSession);
      }
      
      const sessionSummary = {
        id: this.currentSession.id,
        startTime: this.currentSession.startTime,
        endTime: this.currentSession.endTime,
        duration: this.currentSession.endTime - this.currentSession.startTime,
        transcriptCount: this.transcripts.length,
        savedPath,
        summary: this.generateSessionSummary()
      };
      
      this.log('Transcript session ended', sessionSummary);
      this.emit('session-ended', sessionSummary);
      
      // Reset session
      const completedSession = { ...this.currentSession };
      this.currentSession = null;
      this.sessionId = null;
      
      return completedSession;
    } catch (error) {
      this.log('Failed to end session', error);
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Add an interim transcript result
   */
  addInterimTranscript(streamId, text, timestamp = Date.now()) {
    try {
      if (!text || !text.trim()) return;
      
      const speaker = this.getSpeakerFromStreamId(streamId);
      const taggedText = this.config.enableSpeakerTagging ? `[${speaker}] ${text.trim()}` : text.trim();
      
      // Store interim result
      this.interimTranscripts.set(streamId, {
        streamId,
        speaker,
        text: text.trim(),
        taggedText,
        timestamp,
        type: 'interim'
      });
      
      this.updateLastActivity();
      
      this.emit('interim-transcript', {
        streamId,
        speaker,
        text: text.trim(),
        taggedText,
        timestamp,
        type: 'interim'
      });
      
    } catch (error) {
      this.log('Error adding interim transcript', error);
    }
  }

  /**
   * Add a final transcript result
   */
  addFinalTranscript(streamId, text, confidence = 0.0, timestamp = Date.now()) {
    try {
      console.log(`TranscriptManager: addFinalTranscript called - streamId: ${streamId}, text: "${text}", confidence: ${confidence}`);
      
      if (!text || !text.trim()) {
        console.log(`TranscriptManager: Ignoring empty text`);
        return;
      }
      
      const speaker = this.getSpeakerFromStreamId(streamId);
      const taggedText = this.config.enableSpeakerTagging ? `[${speaker}] ${text.trim()}` : text.trim();
      
      const transcript = {
        id: this.generateTranscriptId(),
        streamId,
        speaker,
        text: text.trim(),
        taggedText,
        confidence,
        timestamp,
        type: 'final',
        sessionId: this.sessionId
      };
      
      console.log(`TranscriptManager: Created transcript object:`, transcript);
      
      // QUICK FIX: Check for duplicates and filter if needed
      if (this.config.filterDuplicates && this.shouldFilterDuplicate(transcript)) {
        console.log(`TranscriptManager: Filtered duplicate transcript from ${speaker}: "${text.trim()}"`);
        this.log(`Filtered duplicate transcript [${speaker}]: ${text.trim()}`);
        return null; // Don't add duplicate
      }
      
      // Add to transcripts
      this.transcripts.push(transcript);
      console.log(`TranscriptManager: Added to transcripts array, total count: ${this.transcripts.length}`);
      
      // Update session if active
      if (this.currentSession) {
        this.currentSession.transcripts.push(transcript);
        console.log(`TranscriptManager: Added to current session, session transcript count: ${this.currentSession.transcripts.length}`);
      } else {
        console.log(`TranscriptManager: No current session active!`);
      }
      
      // Clear interim result for this stream
      this.interimTranscripts.delete(streamId);
      
      // Manage buffer size
      if (this.transcripts.length > this.config.maxBufferSize) {
        this.transcripts.shift();
      }
      
      this.updateLastActivity();
      
      this.log(`Final transcript [${speaker}]: ${text.trim()}`);
      this.emit('final-transcript', transcript);
      this.emit('transcript-updated', this.getRecentTranscripts(10));
      
      return transcript;
    } catch (error) {
      this.log('Error adding final transcript', error);
      return null;
    }
  }

  /**
   * Get speaker name from stream ID
   */
  getSpeakerFromStreamId(streamId) {
    return this.speakerMap[streamId] || streamId;
  }

  /**
   * QUICK FIX: Check if a transcript should be filtered as duplicate
   */
  shouldFilterDuplicate(newTranscript) {
    try {
      // Option 1: If preferSystemAudio is enabled, suppress microphone when we have system audio
      if (this.config.suppressMicrophoneWhenSystemAudio && newTranscript.speaker === 'Me') {
        // Check if there's a recent "Other" transcript
        const recentOtherTranscripts = this.getRecentTranscriptsBySpeaker('Other', 5);
        if (recentOtherTranscripts.length > 0) {
          const latestOther = recentOtherTranscripts[recentOtherTranscripts.length - 1];
          const timeDiff = newTranscript.timestamp - latestOther.timestamp;
          
          // If system audio is active within the time window, suppress microphone
          if (timeDiff >= 0 && timeDiff <= this.config.duplicateTimeWindow) {
            console.log(`TranscriptManager: Suppressing microphone transcript - system audio is active`);
            return true;
          }
        }
      }

      // Option 2: Check for similar text in recent transcripts
      const recentTranscripts = this.getRecentTranscripts(10);
      
      for (const existingTranscript of recentTranscripts) {
        // Skip if same stream
        if (existingTranscript.streamId === newTranscript.streamId) continue;
        
        // Check if within time window
        const timeDiff = Math.abs(newTranscript.timestamp - existingTranscript.timestamp);
        if (timeDiff > this.config.duplicateTimeWindow) continue;
        
        // Check text similarity
        const similarity = this.calculateTextSimilarity(newTranscript.text, existingTranscript.text);
        
        if (similarity >= this.config.similarityThreshold) {
          console.log(`TranscriptManager: Found similar transcript - similarity: ${(similarity * 100).toFixed(1)}%`);
          
          // If preferSystemAudio, keep "Other" and filter "Me"
          if (this.config.preferSystemAudio) {
            if (newTranscript.speaker === 'Me' && existingTranscript.speaker === 'Other') {
              console.log(`TranscriptManager: Filtering microphone duplicate in favor of system audio`);
              return true; // Filter the microphone transcript
            }
            if (newTranscript.speaker === 'Other' && existingTranscript.speaker === 'Me') {
              // Remove the existing microphone transcript and keep the system audio one
              this.removeTranscript(existingTranscript.id);
              console.log(`TranscriptManager: Removed previous microphone transcript in favor of system audio`);
              return false; // Keep the system audio transcript
            }
          }
          
          // Default: keep the first one, filter the duplicate
          return true;
        }
      }
      
      return false; // Not a duplicate
    } catch (error) {
      console.error('TranscriptManager: Error checking for duplicates', error);
      return false; // On error, don't filter
    }
  }

  /**
   * QUICK FIX: Calculate text similarity using simple word matching
   */
  calculateTextSimilarity(text1, text2) {
    try {
      // Normalize texts
      const normalize = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').trim();
      
      const normalizedText1 = normalize(text1);
      const normalizedText2 = normalize(text2);
      
      if (!normalizedText1 || !normalizedText2) return 0;
      
      // If texts are identical, return 1
      if (normalizedText1 === normalizedText2) return 1;
      
      // Split into words
      const words1 = normalizedText1.split(/\s+/);
      const words2 = normalizedText2.split(/\s+/);
      
      // Calculate Jaccard similarity (intersection / union)
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      
      const intersection = new Set([...set1].filter(word => set2.has(word)));
      const union = new Set([...set1, ...set2]);
      
      const jaccardSimilarity = intersection.size / union.size;
      
      // Also check substring similarity for short phrases
      const longerText = normalizedText1.length > normalizedText2.length ? normalizedText1 : normalizedText2;
      const shorterText = normalizedText1.length <= normalizedText2.length ? normalizedText1 : normalizedText2;
      
      const substringMatch = longerText.includes(shorterText) ? 0.3 : 0;
      
      return Math.max(jaccardSimilarity, substringMatch);
    } catch (error) {
      console.error('TranscriptManager: Error calculating text similarity', error);
      return 0;
    }
  }

  /**
   * QUICK FIX: Get recent transcripts by speaker
   */
  getRecentTranscriptsBySpeaker(speaker, count = 10) {
    return this.transcripts
      .filter(t => t.speaker === speaker)
      .slice(-count);
  }

  /**
   * QUICK FIX: Remove a transcript by ID
   */
  removeTranscript(transcriptId) {
    try {
      const index = this.transcripts.findIndex(t => t.id === transcriptId);
      if (index !== -1) {
        this.transcripts.splice(index, 1);
        
        // Also remove from current session if active
        if (this.currentSession) {
          const sessionIndex = this.currentSession.transcripts.findIndex(t => t.id === transcriptId);
          if (sessionIndex !== -1) {
            this.currentSession.transcripts.splice(sessionIndex, 1);
          }
        }
        
        console.log(`TranscriptManager: Removed transcript ${transcriptId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('TranscriptManager: Error removing transcript', error);
      return false;
    }
  }

  /**
   * Get recent transcripts
   */
  getRecentTranscripts(count = 10) {
    return this.transcripts.slice(-count);
  }

  /**
   * Get all transcripts for current session
   */
  getSessionTranscripts() {
    return this.currentSession ? [...this.currentSession.transcripts] : [];
  }

  /**
   * Get current interim transcripts
   */
  getInterimTranscripts() {
    return Array.from(this.interimTranscripts.values());
  }

  /**
   * Search transcripts by text
   */
  searchTranscripts(query, options = {}) {
    const { 
      caseSensitive = false, 
      speaker = null,
      dateRange = null,
      limit = 50 
    } = options;
    
    let results = this.transcripts;
    
    // Filter by speaker
    if (speaker) {
      results = results.filter(t => t.speaker === speaker);
    }
    
    // Filter by date range
    if (dateRange && dateRange.start && dateRange.end) {
      results = results.filter(t => 
        t.timestamp >= dateRange.start && t.timestamp <= dateRange.end
      );
    }
    
    // Search text
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    results = results.filter(t => {
      const text = caseSensitive ? t.text : t.text.toLowerCase();
      return text.includes(searchQuery);
    });
    
    // Apply limit
    return results.slice(-limit);
  }

  /**
   * Generate session summary
   */
  generateSessionSummary() {
    if (!this.transcripts.length) {
      return {
        totalTranscripts: 0,
        speakers: [],
        duration: 0,
        wordCount: 0
      };
    }
    
    const speakers = [...new Set(this.transcripts.map(t => t.speaker))];
    const wordCount = this.transcripts.reduce((total, t) => 
      total + t.text.split(' ').length, 0
    );
    
    const speakerStats = speakers.map(speaker => {
      const speakerTranscripts = this.transcripts.filter(t => t.speaker === speaker);
      return {
        speaker,
        transcriptCount: speakerTranscripts.length,
        wordCount: speakerTranscripts.reduce((total, t) => 
          total + t.text.split(' ').length, 0
        )
      };
    });
    
    return {
      totalTranscripts: this.transcripts.length,
      speakers: speakerStats,
      duration: this.currentSession ? 
        (this.currentSession.endTime || Date.now()) - this.currentSession.startTime : 0,
      wordCount,
      averageConfidence: this.transcripts.reduce((sum, t) => sum + t.confidence, 0) / this.transcripts.length
    };
  }

  /**
   * Export transcripts in various formats
   */
  exportTranscripts(format = 'json', options = {}) {
    const transcripts = options.sessionOnly && this.currentSession 
      ? this.currentSession.transcripts 
      : this.transcripts;
    
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(transcripts, null, 2);
        
      case 'txt':
        return transcripts.map(t => 
          `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.taggedText}`
        ).join('\n');
        
      case 'csv':
        const headers = 'Timestamp,Speaker,Text,Confidence\n';
        const rows = transcripts.map(t => 
          `"${new Date(t.timestamp).toISOString()}","${t.speaker}","${t.text}","${t.confidence}"`
        ).join('\n');
        return headers + rows;
        
      case 'srt':
        return this.generateSRT(transcripts);
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate SRT subtitle format
   */
  generateSRT(transcripts) {
    let srt = '';
    let index = 1;
    
    transcripts.forEach((transcript, i) => {
      const start = new Date(transcript.timestamp);
      const end = i < transcripts.length - 1 
        ? new Date(transcripts[i + 1].timestamp)
        : new Date(transcript.timestamp + 3000); // 3 second default
      
      srt += `${index}\n`;
      srt += `${this.formatSRTTime(start)} --> ${this.formatSRTTime(end)}\n`;
      srt += `${transcript.taggedText}\n\n`;
      index++;
    });
    
    return srt;
  }

  /**
   * Format time for SRT format
   */
  formatSRTTime(date) {
    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())},${date.getMilliseconds().toString().padStart(3, '0')}`;
  }

  /**
   * Save session to file
   */
  async saveSession(session = null) {
    try {
      const sessionToSave = session || this.currentSession;
      if (!sessionToSave) {
        throw new Error('No session to save');
      }
      
      await this.ensureSaveDirectory();
      
      const timestamp = new Date(sessionToSave.startTime).toISOString().replace(/[:.]/g, '-');
      const filename = `session_${timestamp}.json`;
      const filePath = path.join(this.config.saveDirectory, filename);
      
      const sessionData = {
        ...sessionToSave,
        summary: this.generateSessionSummary(),
        exportedAt: Date.now()
      };
      
      await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
      
      this.log('Session saved', { filePath, transcriptCount: sessionToSave.transcripts.length });
      this.emit('session-saved', { filePath, session: sessionData });
      
      return filePath;
    } catch (error) {
      this.log('Failed to save session', error);
      this.emit('save-error', error);
      return null;
    }
  }

  /**
   * Setup auto-save functionality
   */
  setupAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    // Auto-save every 30 seconds if there's activity
    this.autoSaveTimer = setInterval(async () => {
      if (this.currentSession && this.transcripts.length > 0) {
        await this.saveSession();
      }
    }, 30000);
  }

  /**
   * Ensure save directory exists
   */
  async ensureSaveDirectory() {
    try {
      await fs.mkdir(this.config.saveDirectory, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Update last activity timestamp
   */
  updateLastActivity() {
    this.lastActivity = Date.now();
    
    // Check for session timeout
    if (this.currentSession && this.config.sessionTimeout) {
      const timeSinceActivity = Date.now() - this.lastActivity;
      if (timeSinceActivity > this.config.sessionTimeout) {
        this.log('Session timeout reached, ending session');
        this.endSession();
      }
    }
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate unique transcript ID
   */
  generateTranscriptId() {
    return `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Get current session status
   */
  getStatus() {
    return {
      hasActiveSession: !!this.currentSession,
      sessionId: this.sessionId,
      sessionStartTime: this.sessionStartTime,
      lastActivity: this.lastActivity,
      transcriptCount: this.transcripts.length,
      interimCount: this.interimTranscripts.size,
      autoSaveEnabled: this.config.autoSave && !!this.autoSaveTimer
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.log('Configuration updated', this.config);
    this.emit('config-updated', this.config);
  }

  /**
   * QUICK FIX: Enable/disable duplicate filtering
   */
  setDuplicateFiltering(enabled) {
    this.config.filterDuplicates = enabled;
    this.log(`Duplicate filtering ${enabled ? 'enabled' : 'disabled'}`);
    this.emit('config-updated', this.config);
  }

  /**
   * QUICK FIX: Enable "system audio only" mode (suppress all microphone)
   */
  setSystemAudioOnlyMode(enabled) {
    this.config.suppressMicrophoneWhenSystemAudio = enabled;
    this.config.preferSystemAudio = enabled;
    this.log(`System audio only mode ${enabled ? 'enabled' : 'disabled'}`);
    this.emit('config-updated', this.config);
  }

  /**
   * QUICK FIX: Set similarity threshold for duplicate detection
   */
  setSimilarityThreshold(threshold) {
    this.config.similarityThreshold = Math.max(0, Math.min(1, threshold));
    this.log(`Similarity threshold set to ${(this.config.similarityThreshold * 100).toFixed(1)}%`);
    this.emit('config-updated', this.config);
  }

  /**
   * Clear all transcripts
   */
  clearTranscripts() {
    this.transcripts = [];
    this.interimTranscripts.clear();
    this.log('All transcripts cleared');
    this.emit('transcripts-cleared');
  }

  /**
   * Logging utility
   */
  log(message, data = null) {
    // Always log for debugging
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] TranscriptManager: ${message}`, data || '');
  }

  /**
   * Cleanup resources
   */
  async destroy() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    // End active session
    if (this.currentSession) {
      await this.endSession();
    }
    
    this.removeAllListeners();
    this.log('TranscriptManager destroyed');
  }
}

module.exports = TranscriptManager;