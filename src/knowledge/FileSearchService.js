/**
 * FileSearchService - Handles OpenAI file search functionality using Responses API
 * Replaces the traditional knowledge base MD file approach with vector store search
 */

const OpenAI = require('openai');

class FileSearchService {
  constructor(config = {}) {
    this.config = {
      apiKey: process.env.OPENAI_API_KEY,
      vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID,
      model: config.model || 'gpt-4o',
      maxResults: config.maxResults || 5,
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    if (!this.config.vectorStoreId) {
      throw new Error('OpenAI Vector Store ID is required');
    }

    this.openai = new OpenAI({
      apiKey: this.config.apiKey
    });

    this.isInitialized = false;
    this.log('FileSearchService initialized', {
      model: this.config.model,
      vectorStoreId: this.config.vectorStoreId.substring(0, 10) + '...',
      maxResults: this.config.maxResults
    });
  }

  /**
   * Initialize the service and verify vector store access
   */
  async initialize() {
    try {
      // Verify vector store exists and is accessible
      const vectorStore = await this.openai.vectorStores.retrieve(this.config.vectorStoreId);
      this.log('Vector store verified', {
        name: vectorStore.name,
        fileCount: vectorStore.file_counts,
        status: vectorStore.status
      });

      this.isInitialized = true;
      return true;
    } catch (error) {
      this.log('Failed to initialize FileSearchService', error);
      throw new Error(`Failed to initialize file search service: ${error.message}`);
    }
  }

  /**
   * Search knowledge base using OpenAI file search
   * @param {string} question - The customer question to search for
   * @param {string} conversationContext - Current conversation context
   * @returns {Promise<Object>} - Search results with answer and citations
   */
  async searchKnowledgeBase(question, conversationContext = '') {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      this.log('Searching knowledge base', { 
        question: question.substring(0, 50) + '...',
        contextLength: conversationContext.length
      });

      // Construct the search query with context
      const searchInput = this.buildSearchInput(question, conversationContext);

      // Use OpenAI Responses API with file search tool
      const response = await this.openai.responses.create({
        model: this.config.model,
        input: searchInput,
        tools: [{
          type: "file_search",
          vector_store_ids: [this.config.vectorStoreId],
          max_num_results: this.config.maxResults
        }],
        include: ["file_search_call.results"] // Include search results in response
      });

      return this.processSearchResponse(response, question);
    } catch (error) {
      this.log('Error searching knowledge base', error);
      throw new Error(`Knowledge base search failed: ${error.message}`);
    }
  }

  /**
   * Build the search input combining question and context
   * @param {string} question - Customer question
   * @param {string} conversationContext - Conversation context
   * @returns {string} - Formatted search input
   */
  buildSearchInput(question, conversationContext) {
    let searchInput = `Customer Question: ${question}`;
    
    if (conversationContext && conversationContext.trim().length > 0) {
      searchInput += `\n\nConversation Context:\n${conversationContext}`;
    }

    searchInput += `\n\nPlease provide a helpful, accurate, and professional answer based on the knowledge base. If the information isn't available, clearly indicate that and suggest contacting support.`;

    return searchInput;
  }

  /**
   * Process the OpenAI response and extract answer with citations
   * @param {Object} response - OpenAI response object
   * @param {string} originalQuestion - Original customer question
   * @returns {Object} - Processed response with answer and metadata
   */
  processSearchResponse(response, originalQuestion) {
    try {
      const result = {
        answer: null,
        citations: [],
        searchResults: [],
        fileSearchCallId: null,
        timestamp: new Date().toISOString()
      };

      // Find the file search call and message in the output
      let fileSearchCall = null;
      let messageOutput = null;

      for (const output of response.output || []) {
        if (output.type === 'file_search_call') {
          fileSearchCall = output;
          result.fileSearchCallId = output.id;
          if (output.search_results) {
            result.searchResults = output.search_results;
          }
        } else if (output.type === 'message' && output.role === 'assistant') {
          messageOutput = output;
        }
      }

      // Extract answer from message content
      if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
        const textContent = messageOutput.content.find(c => c.type === 'output_text');
        if (textContent) {
          result.answer = textContent.text;
          
          // Extract citations from annotations
          if (textContent.annotations) {
            result.citations = textContent.annotations
              .filter(annotation => annotation.type === 'file_citation')
              .map(citation => ({
                fileId: citation.file_id,
                filename: citation.filename,
                index: citation.index
              }));
          }
        }
      }

      // Log search metadata
      this.log('Knowledge base search completed', {
        question: originalQuestion.substring(0, 30) + '...',
        answerLength: result.answer ? result.answer.length : 0,
        citationCount: result.citations.length,
        searchResultsCount: result.searchResults.length,
        fileSearchCallId: result.fileSearchCallId
      });

      if (!result.answer) {
        throw new Error('No answer generated from knowledge base search');
      }

      return result;
    } catch (error) {
      this.log('Error processing search response', error);
      throw new Error(`Failed to process search response: ${error.message}`);
    }
  }

  /**
   * Get vector store information
   * @returns {Promise<Object>} - Vector store details
   */
  async getVectorStoreInfo() {
    try {
      const vectorStore = await this.openai.vectorStores.retrieve(this.config.vectorStoreId);
      const files = await this.openai.vectorStores.files.list({
        vector_store_id: this.config.vectorStoreId
      });

      return {
        id: vectorStore.id,
        name: vectorStore.name,
        status: vectorStore.status,
        fileCounts: vectorStore.file_counts,
        files: files.data.map(file => ({
          id: file.id,
          status: file.status,
          createdAt: file.created_at
        })),
        createdAt: vectorStore.created_at,
        lastActiveAt: vectorStore.last_active_at
      };
    } catch (error) {
      this.log('Error getting vector store info', error);
      throw error;
    }
  }

  /**
   * Search with custom filters (if needed for future enhancement)
   * @param {string} question - Search question
   * @param {string} conversationContext - Context
   * @param {Object} filters - Metadata filters
   * @returns {Promise<Object>} - Search results
   */
  async searchWithFilters(question, conversationContext = '', filters = null) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const searchInput = this.buildSearchInput(question, conversationContext);
      
      const tool = {
        type: "file_search",
        vector_store_ids: [this.config.vectorStoreId],
        max_num_results: this.config.maxResults
      };

      // Add filters if provided
      if (filters) {
        tool.filters = filters;
      }

      const response = await this.openai.responses.create({
        model: this.config.model,
        input: searchInput,
        tools: [tool],
        include: ["file_search_call.results"]
      });

      return this.processSearchResponse(response, question);
    } catch (error) {
      this.log('Error in filtered search', error);
      throw error;
    }
  }

  /**
   * Logger helper - uses console.log for simplicity
   */
  log(message, data = null) {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [FileSearchService] ${message}`;
      if (data) {
        console.log(logMessage, data);
      } else {
        console.log(logMessage);
      }
    }
  }
}

module.exports = FileSearchService;