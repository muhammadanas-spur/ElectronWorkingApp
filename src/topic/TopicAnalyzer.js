const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');
const PromptManager = require('../prompts/PromptManager');
const ConversationSummary = require('../conversation/ConversationSummary');

/**
 * TopicAnalyzer - Analyzes conversation transcripts to identify and track current topics
 * Uses OpenAI API to continuously analyze the conversation context and generate topic descriptions
 */
class TopicAnalyzer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      model: config.model || 'gpt-4o-mini',
      maxTokens: config.maxTokens || 150,
      temperature: config.temperature || 0.3,
      analysisInterval: config.analysisInterval || 1000, // 1 second for near real-time response
      minTranscriptsForAnalysis: config.minTranscriptsForAnalysis || 1, // Start analysis after just 1 transcript
      transcriptWindow: config.transcriptWindow || 10, // Reduced window for faster processing
      topicChangeThreshold: config.topicChangeThreshold || 0.3, // Threshold for detecting topic changes
      outputFile: config.outputFile || './current_topic.txt',
      debug: config.debug || false,
      ...config
    };
    
    // Initialize OpenAI
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in config.');
    }
    
    this.openai = new OpenAI({
      apiKey: this.config.apiKey
    });
    
    // State management
    this.currentTopic = null;
    this.lastAnalysisTimestamp = null;
    this.isAnalyzing = false;
    this.analysisTimer = null;
    this.lastTranscriptCount = 0;
    
    // Topic history for change detection
    this.topicHistory = [];
    
    // Initialize prompt manager
    this.promptManager = new PromptManager();
    
    // Initialize conversation summary
    this.conversationSummary = new ConversationSummary({
      summaryFile: './conversation_summary.txt',
      debug: this.config.debug
    });
    
    this.log('TopicAnalyzer initialized', { 
      model: this.config.model,
      outputFile: this.config.outputFile,
      analysisInterval: this.config.analysisInterval
    });
  }

  /**
   * Initialize the topic analyzer
   */
  async initialize() {
    try {
      // Ensure output directory exists
      const outputDir = path.dirname(this.config.outputFile);
      await fs.mkdir(outputDir, { recursive: true });
      
      // Initialize conversation summary
      await this.conversationSummary.initialize();
      
      // Initialize with empty topic
      await this.updateTopicFile('No conversation topic detected yet.');
      
      this.log('TopicAnalyzer initialized successfully');
      this.emit('initialized');
      return true;
    } catch (error) {
      this.log('Failed to initialize TopicAnalyzer', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Start continuous topic analysis
   */
  startAnalysis() {
    if (this.analysisTimer) {
      this.stopAnalysis();
    }
    
    this.analysisTimer = setInterval(() => {
      this.performPeriodicAnalysis();
    }, this.config.analysisInterval);
    
    this.log('Topic analysis started');
    this.emit('analysis-started');
  }

  /**
   * Stop continuous topic analysis
   */
  stopAnalysis() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
    
    this.log('Topic analysis stopped');
    this.emit('analysis-stopped');
  }

  /**
   * Analyze transcripts and update current topic
   */
  async analyzeTranscripts(transcripts) {
    if (this.isAnalyzing) {
      this.log('Analysis already in progress, skipping');
      return null;
    }

    if (!transcripts || transcripts.length < this.config.minTranscriptsForAnalysis) {
      this.log(`Not enough transcripts for analysis (${transcripts?.length || 0}/${this.config.minTranscriptsForAnalysis})`);
      return null;
    }

    try {
      this.isAnalyzing = true;
      this.log(`Analyzing ${transcripts.length} transcripts for topic detection`);

      // Get recent transcripts for analysis
      const recentTranscripts = transcripts.slice(-this.config.transcriptWindow);
      
      // Format transcripts for analysis
      const conversationText = this.formatTranscriptsForAnalysis(recentTranscripts);
      
      // Generate structured insights using OpenAI
      const insights = await this.generateTopicDescription(conversationText);
      
      if (insights) {
        // Update conversation summary with new insights
        await this.conversationSummary.updateSummary(recentTranscripts, insights);
        
        // Get intelligent task recommendations from conversation summary
        const intelligentTasks = this.conversationSummary.getTaskRecommendations();
        
        // Merge AI-generated tasks with intelligent recommendations
        const enhancedTaskActions = [...insights.taskActions, ...intelligentTasks]
          .filter((task, index, arr) => arr.indexOf(task) === index) // Remove duplicates
          .slice(0, 3); // Limit to 3 tasks
        
        // Check if topic has significantly changed
        const hasTopicChanged = await this.hasTopicChanged(insights.topic);
        
        if (hasTopicChanged || !this.currentTopic) {
          this.currentTopic = {
            topic: insights.topic,
            keyPoints: insights.keyPoints,
            questionActions: insights.questionActions,
            taskActions: enhancedTaskActions,
            timestamp: Date.now(),
            confidence: 0.8,
            transcriptCount: transcripts.length
          };
          
          // Update the topic file (for backup)
          await this.updateTopicFile(insights.topic);
          
          // Add to topic history
          this.topicHistory.push(this.currentTopic);
          
          // Keep only last 10 topics in history
          if (this.topicHistory.length > 10) {
            this.topicHistory.shift();
          }
          
          this.log('Insights updated', { 
            topic: insights.topic.substring(0, 50) + '...',
            keyPoints: insights.keyPoints.length,
            questionActions: insights.questionActions.length,
            taskActions: insights.taskActions.length,
            hasChanged: hasTopicChanged
          });
          
          this.emit('topic-updated', this.currentTopic);
          return this.currentTopic;
        } else {
          this.log('Topic has not significantly changed, keeping current insights');
        }
      }
      
      return this.currentTopic;
    } catch (error) {
      this.log('Error analyzing transcripts', error);
      this.emit('analysis-error', error);
      return null;
    } finally {
      this.isAnalyzing = false;
      this.lastAnalysisTimestamp = Date.now();
    }
  }

  /**
   * Perform periodic analysis if new transcripts are available
   */
  async performPeriodicAnalysis() {
    // This method will be called by external transcript manager
    // For now, we'll emit an event requesting transcripts
    this.emit('analysis-requested');
  }

  /**
   * Format transcripts for OpenAI analysis
   */
  formatTranscriptsForAnalysis(transcripts) {
    const formattedLines = transcripts.map(transcript => {
      const timestamp = new Date(transcript.timestamp).toLocaleTimeString();
      return `[${timestamp}] ${transcript.speaker}: ${transcript.text}`;
    });
    
    return formattedLines.join('\n');
  }

  /**
   * Generate structured insights using OpenAI API
   */
  async generateTopicDescription(conversationText) {
    try {
      // Get prompts from PromptManager
      const prompts = await this.promptManager.getTopicAnalysisPrompts(conversationText);
      
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: prompts.system
          },
          {
            role: 'user',
            content: prompts.user
          }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      const content = response.choices[0]?.message?.content?.trim();
      
      if (!content) {
        throw new Error('No insights generated');
      }

      // Try to parse JSON response
      let insights;
      try {
        // Clean up the content - sometimes AI adds markdown formatting
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/```json\s*/, '').replace(/```\s*$/, '');
        }
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/```\s*/, '').replace(/```\s*$/, '');
        }
        
        insights = JSON.parse(cleanContent);
        this.log('Successfully parsed JSON insights');
      } catch (parseError) {
        this.log('JSON parsing failed, creating fallback insights', parseError.message);
        // Fallback to simple topic if JSON parsing fails
        insights = {
          topic: content.length > 100 ? content.substring(0, 100) + '...' : content,
          keyPoints: [`Discussion about: ${content.substring(0, 80)}...`],
          questionActions: ['Available features overview', 'Support options information'],
          taskActions: []
        };
      }

      // Ensure structure is correct and clean
      const structuredInsights = {
        topic: (insights.topic || 'Conversation in progress').trim(),
        keyPoints: Array.isArray(insights.keyPoints) ? 
          insights.keyPoints.slice(0, 4).map(point => point.trim()) : 
          ['Analyzing conversation topics...'],
        questionActions: Array.isArray(insights.questionActions) ? 
          insights.questionActions.slice(0, 3).map(question => question.trim()) : 
          [],
        taskActions: Array.isArray(insights.taskActions) ? 
          insights.taskActions.slice(0, 2).map(task => task.trim()) : 
          []
      };

      this.log('Generated structured insights', { 
        topic: structuredInsights.topic.substring(0, 50) + '...',
        keyPointsCount: structuredInsights.keyPoints.length,
        questionActionsCount: structuredInsights.questionActions.length,
        taskActionsCount: structuredInsights.taskActions.length
      });

      return structuredInsights;
    } catch (error) {
      this.log('Error generating insights', error);
      throw error;
    }
  }

  /**
   * Check if the topic has significantly changed
   */
  async hasTopicChanged(newTopicDescription) {
    if (!this.currentTopic) {
      return true; // First topic
    }

    try {
      // Get the previous topic text for comparison
      const previousTopic = this.currentTopic.topic || this.currentTopic.description || 'No previous topic';
      
      // Get prompts from PromptManager
      const prompts = await this.promptManager.getTopicComparisonPrompts(previousTopic, newTopicDescription);
      
      // Use OpenAI to compare topics for similarity
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: prompts.system
          },
          {
            role: 'user',
            content: prompts.user
          }
        ],
        max_tokens: 10,
        temperature: 0.1
      });

      const result = response.choices[0]?.message?.content?.trim().toLowerCase();
      const hasChanged = result === 'yes';
      
      this.log('Topic change analysis', { 
        result, 
        hasChanged,
        previous: previousTopic.substring(0, 50) + '...',
        new: newTopicDescription.substring(0, 50) + '...'
      });
      
      return hasChanged;
    } catch (error) {
      this.log('Error comparing topics, assuming change', error);
      return true; // Default to assuming change on error
    }
  }

  /**
   * Update the topic file with new content
   */
  async updateTopicFile(topicDescription) {
    try {
      const timestamp = new Date().toLocaleString();
      const content = `Current Conversation Topic (Updated: ${timestamp})
==================================================

${topicDescription}

==================================================
This file is automatically updated as the conversation progresses.
Last analysis: ${timestamp}
`;

      await fs.writeFile(this.config.outputFile, content, 'utf8');
      
      this.log('Topic file updated', { 
        file: this.config.outputFile,
        length: content.length
      });
      
      this.emit('file-updated', { 
        file: this.config.outputFile, 
        content: topicDescription,
        timestamp: Date.now()
      });
    } catch (error) {
      this.log('Error updating topic file', error);
      this.emit('file-error', error);
      throw error;
    }
  }

  /**
   * Get current topic information
   */
  getCurrentTopic() {
    return this.currentTopic;
  }

  /**
   * Get topic history
   */
  getTopicHistory() {
    return [...this.topicHistory];
  }

  /**
   * Get analysis status
   */
  getStatus() {
    return {
      isRunning: !!this.analysisTimer,
      isAnalyzing: this.isAnalyzing,
      currentTopic: this.currentTopic,
      lastAnalysisTimestamp: this.lastAnalysisTimestamp,
      topicHistoryCount: this.topicHistory.length,
      outputFile: this.config.outputFile
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    const oldInterval = this.config.analysisInterval;
    this.config = { ...this.config, ...newConfig };
    
    // Restart analysis if interval changed
    if (this.analysisTimer && oldInterval !== this.config.analysisInterval) {
      this.stopAnalysis();
      this.startAnalysis();
    }
    
    this.log('Configuration updated', this.config);
    this.emit('config-updated', this.config);
  }

  /**
   * Clear topic history
   */
  clearHistory() {
    this.topicHistory = [];
    this.currentTopic = null;
    this.log('Topic history cleared');
    this.emit('history-cleared');
  }

  /**
   * Logging utility
   */
  log(message, data = null) {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] TopicAnalyzer: ${message}`, data || '');
    }
  }

  /**
   * Query knowledge base with customer question
   */
  async queryKnowledgeBase(customerQuestion, conversationContext, knowledgeBase) {
    try {
      this.log('Querying knowledge base', { question: customerQuestion.substring(0, 50) + '...' });

      // Get prompts from PromptManager
      const prompts = await this.promptManager.getKnowledgeBaseQueryPrompts(
        customerQuestion,
        conversationContext,
        knowledgeBase
      );

      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: prompts.system
          },
          {
            role: 'user',
            content: prompts.user
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      });

      const answer = response.choices[0]?.message?.content?.trim();
      
      if (!answer) {
        throw new Error('No answer generated');
      }

      this.log('Knowledge base answer generated', { 
        answerLength: answer.length,
        question: customerQuestion.substring(0, 30) + '...'
      });

      return answer;
    } catch (error) {
      this.log('Error querying knowledge base', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async destroy() {
    this.stopAnalysis();
    
    // Cleanup conversation summary  
    if (this.conversationSummary) {
      await this.conversationSummary.destroy();
    }
    
    this.removeAllListeners();
    this.log('TopicAnalyzer destroyed');
  }
}

module.exports = TopicAnalyzer;