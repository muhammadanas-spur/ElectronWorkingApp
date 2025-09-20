const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * ConversationSummary - Maintains comprehensive meeting minutes and conversation context
 * Tracks issues, resolutions, customer sentiment, and decision points for intelligent task creation
 */
class ConversationSummary extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      summaryFile: config.summaryFile || './conversation_summary.txt',
      maxSummaryLength: config.maxSummaryLength || 2000,
      updateInterval: config.updateInterval || 30000, // 30 seconds
      debug: config.debug || false,
      ...config
    };
    
    // Conversation state tracking
    this.currentSummary = {
      customerInfo: {
        name: 'Customer',
        company: '',
        priority: 'normal'
      },
      sessionStart: null,
      mainTopics: [],
      issuesReported: [],
      resolutionsProvided: [],
      questionsAsked: [],
      followUpNeeded: [],
      sentiment: 'neutral',
      urgencyLevel: 'normal',
      technicalComplexity: 'low',
      escalationFlags: [],
      meetingMinutes: '',
      lastUpdated: null
    };
    
    this.isInitialized = false;
    this.log('ConversationSummary initialized', { summaryFile: this.config.summaryFile });
  }
  
  /**
   * Initialize the conversation summary system
   */
  async initialize() {
    try {
      // Ensure directory exists
      const summaryDir = path.dirname(this.config.summaryFile);
      await fs.mkdir(summaryDir, { recursive: true });
      
      // Try to load existing summary
      await this.loadExistingSummary();
      
      this.isInitialized = true;
      this.log('ConversationSummary initialized successfully');
      this.emit('initialized');
      
      return true;
    } catch (error) {
      this.log('Failed to initialize ConversationSummary', error);
      this.emit('error', error);
      return false;
    }
  }
  
  /**
   * Load existing summary if available
   */
  async loadExistingSummary() {
    try {
      const summaryContent = await fs.readFile(this.config.summaryFile, 'utf8');
      const lines = summaryContent.split('\n');
      
      // Parse existing summary (simple format for now)
      this.currentSummary.meetingMinutes = summaryContent;
      this.currentSummary.lastUpdated = Date.now();
      
      this.log('Loaded existing conversation summary');
    } catch (error) {
      // File doesn't exist or can't be read - start fresh
      this.currentSummary.sessionStart = Date.now();
      this.log('Starting fresh conversation summary');
    }
  }
  
  /**
   * Update conversation summary with new insights
   */
  async updateSummary(transcripts, currentTopic) {
    if (!this.isInitialized) {
      return;
    }
    
    try {
      // Analyze new transcripts for key information
      const analysis = this.analyzeConversationContent(transcripts, currentTopic);
      
      // Update summary components
      this.updateConversationState(analysis);
      
      // Generate updated meeting minutes
      await this.generateMeetingMinutes();
      
      // Save to file
      await this.saveSummaryToFile();
      
      this.currentSummary.lastUpdated = Date.now();
      this.emit('summary-updated', this.currentSummary);
      
      this.log('Conversation summary updated', {
        topics: this.currentSummary.mainTopics.length,
        issues: this.currentSummary.issuesReported.length,
        urgency: this.currentSummary.urgencyLevel
      });
      
    } catch (error) {
      this.log('Error updating conversation summary', error);
      this.emit('error', error);
    }
  }
  
  /**
   * Analyze conversation content for key insights
   */
  analyzeConversationContent(transcripts, currentTopic) {
    const recentTranscripts = transcripts.slice(-10); // Last 10 for analysis
    const analysis = {
      newIssues: [],
      newQuestions: [],
      resolutionAttempts: [],
      urgencyIndicators: [],
      sentimentIndicators: [],
      technicalTerms: []
    };
    
    recentTranscripts.forEach(transcript => {
      const text = transcript.text.toLowerCase();
      const speaker = transcript.speaker;
      
      // Detect issues and problems
      if (this.containsIssueKeywords(text)) {
        analysis.newIssues.push({
          issue: transcript.text,
          speaker: speaker,
          timestamp: transcript.timestamp
        });
      }
      
      // Detect questions
      if (text.includes('?') || this.containsQuestionKeywords(text)) {
        analysis.newQuestions.push({
          question: transcript.text,
          speaker: speaker,
          timestamp: transcript.timestamp
        });
      }
      
      // Detect urgency
      if (this.containsUrgencyKeywords(text)) {
        analysis.urgencyIndicators.push(text);
      }
      
      // Detect sentiment
      if (this.containsNegativeSentiment(text)) {
        analysis.sentimentIndicators.push('negative');
      } else if (this.containsPositiveSentiment(text)) {
        analysis.sentimentIndicators.push('positive');
      }
      
      // Detect technical complexity
      if (this.containsTechnicalTerms(text)) {
        analysis.technicalTerms.push(text);
      }
    });
    
    return analysis;
  }
  
  /**
   * Update conversation state based on analysis
   */
  updateConversationState(analysis) {
    // Update issues
    analysis.newIssues.forEach(issue => {
      if (!this.currentSummary.issuesReported.some(existing => 
        existing.issue === issue.issue)) {
        this.currentSummary.issuesReported.push(issue);
      }
    });
    
    // Update questions
    analysis.newQuestions.forEach(question => {
      if (!this.currentSummary.questionsAsked.some(existing => 
        existing.question === question.question)) {
        this.currentSummary.questionsAsked.push(question);
      }
    });
    
    // Update urgency level
    if (analysis.urgencyIndicators.length > 0) {
      this.currentSummary.urgencyLevel = 'high';
    } else if (analysis.urgencyIndicators.length === 0 && 
               this.currentSummary.issuesReported.length > 2) {
      this.currentSummary.urgencyLevel = 'medium';
    }
    
    // Update sentiment
    const negativeCount = analysis.sentimentIndicators.filter(s => s === 'negative').length;
    const positiveCount = analysis.sentimentIndicators.filter(s => s === 'positive').length;
    
    if (negativeCount > positiveCount) {
      this.currentSummary.sentiment = 'negative';
    } else if (positiveCount > negativeCount) {
      this.currentSummary.sentiment = 'positive';
    }
    
    // Update technical complexity
    if (analysis.technicalTerms.length > 2) {
      this.currentSummary.technicalComplexity = 'high';
    } else if (analysis.technicalTerms.length > 0) {
      this.currentSummary.technicalComplexity = 'medium';
    }
  }
  
  /**
   * Generate comprehensive meeting minutes
   */
  async generateMeetingMinutes() {
    const sessionDuration = this.currentSummary.sessionStart ? 
      Math.round((Date.now() - this.currentSummary.sessionStart) / 60000) : 0;
    
    let minutes = `CUSTOMER SUPPORT SESSION SUMMARY\n`;
    minutes += `Date: ${new Date().toLocaleString()}\n`;
    minutes += `Duration: ${sessionDuration} minutes\n`;
    minutes += `Customer: ${this.currentSummary.customerInfo.name}\n`;
    minutes += `Priority Level: ${this.currentSummary.customerInfo.priority.toUpperCase()}\n`;
    minutes += `Urgency: ${this.currentSummary.urgencyLevel.toUpperCase()}\n`;
    minutes += `Sentiment: ${this.currentSummary.sentiment.toUpperCase()}\n`;
    minutes += `Technical Complexity: ${this.currentSummary.technicalComplexity.toUpperCase()}\n\n`;
    
    // Issues reported
    if (this.currentSummary.issuesReported.length > 0) {
      minutes += `ISSUES REPORTED:\n`;
      this.currentSummary.issuesReported.forEach((issue, index) => {
        minutes += `${index + 1}. ${issue.issue} (${issue.speaker})\n`;
      });
      minutes += `\n`;
    }
    
    // Questions asked
    if (this.currentSummary.questionsAsked.length > 0) {
      minutes += `QUESTIONS ASKED:\n`;
      this.currentSummary.questionsAsked.forEach((question, index) => {
        minutes += `${index + 1}. ${question.question} (${question.speaker})\n`;
      });
      minutes += `\n`;
    }
    
    // Follow-up needed
    if (this.currentSummary.followUpNeeded.length > 0) {
      minutes += `FOLLOW-UP REQUIRED:\n`;
      this.currentSummary.followUpNeeded.forEach((item, index) => {
        minutes += `${index + 1}. ${item}\n`;
      });
      minutes += `\n`;
    }
    
    this.currentSummary.meetingMinutes = minutes;
  }
  
  /**
   * Save summary to file
   */
  async saveSummaryToFile() {
    try {
      await fs.writeFile(this.config.summaryFile, this.currentSummary.meetingMinutes, 'utf8');
      this.log('Conversation summary saved to file');
    } catch (error) {
      this.log('Error saving summary to file', error);
      throw error;
    }
  }
  
  /**
   * Get intelligent task recommendations based on conversation analysis
   */
  getTaskRecommendations() {
    const recommendations = [];
    
    // Jira ticket recommendations
    if (this.shouldCreateJiraTicket()) {
      const jiraRecommendation = this.generateJiraRecommendation();
      recommendations.push(jiraRecommendation);
    }
    
    // Follow-up meeting recommendations
    if (this.shouldScheduleFollowUp()) {
      const followUpRecommendation = this.generateFollowUpRecommendation();
      recommendations.push(followUpRecommendation);
    }
    
    return recommendations;
  }
  
  /**
   * Determine if a Jira ticket should be created
   */
  shouldCreateJiraTicket() {
    // Create Jira ticket if:
    // - Technical issues reported
    // - Bugs mentioned
    // - Feature requests
    // - Multiple unresolved issues
    
    const hasIssues = this.currentSummary.issuesReported.length > 0;
    const highComplexity = this.currentSummary.technicalComplexity === 'high';
    const multipleIssues = this.currentSummary.issuesReported.length > 1;
    
    return hasIssues && (highComplexity || multipleIssues);
  }
  
  /**
   * Generate Jira ticket recommendation
   */
  generateJiraRecommendation() {
    const issuesSummary = this.currentSummary.issuesReported
      .map(issue => issue.issue)
      .join('; ');
    
    return `Create Jira ticket: ${issuesSummary.substring(0, 50)}...`;
  }
  
  /**
   * Determine if follow-up should be scheduled
   */
  shouldScheduleFollowUp() {
    // Schedule follow-up if:
    // - Complex discussions that need more time
    // - Customer requests follow-up
    // - Escalation needed
    // - Multiple unresolved questions
    
    const complexDiscussion = this.currentSummary.technicalComplexity === 'high';
    const manyQuestions = this.currentSummary.questionsAsked.length > 3;
    const negativeExperience = this.currentSummary.sentiment === 'negative';
    
    return complexDiscussion || manyQuestions || negativeExperience;
  }
  
  /**
   * Generate follow-up recommendation
   */
  generateFollowUpRecommendation() {
    if (this.currentSummary.sentiment === 'negative') {
      return 'Schedule follow-up call to address customer concerns';
    } else if (this.currentSummary.technicalComplexity === 'high') {
      return 'Schedule technical follow-up with specialist';
    } else {
      return 'Schedule follow-up to review progress';
    }
  }
  
  // Keyword detection methods
  containsIssueKeywords(text) {
    const issueKeywords = ['problem', 'issue', 'error', 'bug', 'broken', 'not working', 'failed', 'crash'];
    return issueKeywords.some(keyword => text.includes(keyword));
  }
  
  containsQuestionKeywords(text) {
    const questionKeywords = ['how', 'what', 'where', 'when', 'why', 'can you', 'could you', 'would you'];
    return questionKeywords.some(keyword => text.includes(keyword));
  }
  
  containsUrgencyKeywords(text) {
    const urgencyKeywords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'blocking'];
    return urgencyKeywords.some(keyword => text.includes(keyword));
  }
  
  containsNegativeSentiment(text) {
    const negativeKeywords = ['frustrated', 'angry', 'disappointed', 'terrible', 'awful', 'hate'];
    return negativeKeywords.some(keyword => text.includes(keyword));
  }
  
  containsPositiveSentiment(text) {
    const positiveKeywords = ['great', 'excellent', 'perfect', 'thank you', 'appreciate', 'helpful'];
    return positiveKeywords.some(keyword => text.includes(keyword));
  }
  
  containsTechnicalTerms(text) {
    const technicalKeywords = ['api', 'database', 'server', 'integration', 'configuration', 'deployment'];
    return technicalKeywords.some(keyword => text.includes(keyword));
  }
  
  /**
   * Get current conversation summary
   */
  getSummary() {
    return { ...this.currentSummary };
  }
  
  /**
   * Reset conversation summary
   */
  reset() {
    this.currentSummary = {
      customerInfo: { name: 'Customer', company: '', priority: 'normal' },
      sessionStart: Date.now(),
      mainTopics: [],
      issuesReported: [],
      resolutionsProvided: [],
      questionsAsked: [],
      followUpNeeded: [],
      sentiment: 'neutral',
      urgencyLevel: 'normal',
      technicalComplexity: 'low',
      escalationFlags: [],
      meetingMinutes: '',
      lastUpdated: null
    };
    
    this.log('Conversation summary reset');
    this.emit('summary-reset');
  }
  
  /**
   * Logging utility
   */
  log(message, data = null) {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`[${timestamp}] ConversationSummary: ${message}`, data);
      } else {
        console.log(`[${timestamp}] ConversationSummary: ${message}`);
      }
    }
  }
  
  /**
   * Cleanup resources
   */
  async destroy() {
    this.removeAllListeners();
    this.log('ConversationSummary destroyed');
  }
}

module.exports = ConversationSummary;