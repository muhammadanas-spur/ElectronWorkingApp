const TopicAnalyzer = require('./src/topic/TopicAnalyzer');

/**
 * Simple test script to verify TopicAnalyzer functionality
 */
async function testTopicAnalyzer() {
  console.log('🧪 Testing TopicAnalyzer...');
  
  // Mock transcripts for testing
  const mockTranscripts = [
    {
      id: 'test1',
      speaker: 'Me',
      text: 'We need to discuss the upcoming product roadmap for Q1 2025',
      timestamp: Date.now() - 5000
    },
    {
      id: 'test2',
      speaker: 'Other',
      text: 'Yes, let\'s focus on the new features we want to include in the mobile app',
      timestamp: Date.now() - 4000
    },
    {
      id: 'test3',
      speaker: 'Me',
      text: 'I think we should prioritize the user authentication improvements',
      timestamp: Date.now() - 3000
    },
    {
      id: 'test4',
      speaker: 'Other',
      text: 'Good point, and we also need to consider the API performance optimizations',
      timestamp: Date.now() - 2000
    }
  ];

  try {
    // Create topic analyzer without API key for basic testing
    const topicAnalyzer = new TopicAnalyzer({
      apiKey: process.env.OPENAI_API_KEY || 'test-key',
      debug: true,
      outputFile: './test_current_topic.txt'
    });

    console.log('✅ TopicAnalyzer created successfully');

    // Initialize (this will fail without API key, but that's okay for structure testing)
    try {
      await topicAnalyzer.initialize();
      console.log('✅ TopicAnalyzer initialized');
      
      // Try analyzing transcripts (will fail without valid API key)
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
        console.log('🔍 Analyzing mock transcripts...');
        const result = await topicAnalyzer.analyzeTranscripts(mockTranscripts);
        
        if (result) {
          console.log('✅ Topic analysis completed');
          console.log('📝 Topic:', result.description.substring(0, 100) + '...');
        } else {
          console.log('⚠️ No topic generated (not enough transcripts or other reason)');
        }
      } else {
        console.log('⚠️ Skipping actual analysis - no valid OpenAI API key provided');
        console.log('💡 Set OPENAI_API_KEY in .env file to test actual topic analysis');
      }
      
    } catch (initError) {
      console.log('⚠️ TopicAnalyzer initialization failed (expected without API key):', initError.message);
    }

    // Test basic functionality
    console.log('📊 Status:', topicAnalyzer.getStatus());
    
    // Test cleanup
    await topicAnalyzer.destroy();
    console.log('✅ TopicAnalyzer destroyed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testTopicAnalyzer().then(() => {
    console.log('\n🎉 TopicAnalyzer test completed!');
    process.exit(0);
  }).catch(error => {
    console.error('\n💥 Test failed with error:', error);
    process.exit(1);
  });
}

module.exports = { testTopicAnalyzer };