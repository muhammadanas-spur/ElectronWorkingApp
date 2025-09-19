const fs = require('fs').promises;
const path = require('path');

/**
 * PromptManager - Manages prompt templates for OpenAI API calls
 * Loads prompts from external files and provides template replacement functionality
 */
class PromptManager {
  constructor(promptsDir = __dirname) {
    this.promptsDir = promptsDir;
    this.promptCache = {};
  }

  /**
   * Load a prompt from file with caching
   */
  async loadPrompt(promptName) {
    if (this.promptCache[promptName]) {
      return this.promptCache[promptName];
    }

    try {
      const promptPath = path.join(this.promptsDir, `${promptName}.txt`);
      const promptContent = await fs.readFile(promptPath, 'utf8');
      this.promptCache[promptName] = promptContent.trim();
      return this.promptCache[promptName];
    } catch (error) {
      throw new Error(`Failed to load prompt '${promptName}': ${error.message}`);
    }
  }

  /**
   * Replace template variables in prompt text
   */
  replaceTemplateVariables(promptText, variables = {}) {
    let result = promptText;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }
    
    return result;
  }

  /**
   * Get topic analysis prompts
   */
  async getTopicAnalysisPrompts(conversationText) {
    const systemPrompt = await this.loadPrompt('topic-analysis');
    const userPromptTemplate = await this.loadPrompt('topic-analysis-user');
    
    const userPrompt = this.replaceTemplateVariables(userPromptTemplate, {
      conversationText: conversationText
    });

    return {
      system: systemPrompt,
      user: userPrompt
    };
  }

  /**
   * Get topic comparison prompts
   */
  async getTopicComparisonPrompts(previousTopic, newTopic) {
    const systemPrompt = await this.loadPrompt('topic-comparison');
    const userPromptTemplate = await this.loadPrompt('topic-comparison-user');
    
    const userPrompt = this.replaceTemplateVariables(userPromptTemplate, {
      previousTopic: previousTopic,
      newTopic: newTopic
    });

    return {
      system: systemPrompt,
      user: userPrompt
    };
  }

  /**
   * Clear prompt cache (useful for development/testing)
   */
  clearCache() {
    this.promptCache = {};
  }
}

module.exports = PromptManager;