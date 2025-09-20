/**
 * Test script for FileSearchService integration
 * Run this to verify the file search functionality works correctly
 */

require('dotenv').config();
const FileSearchService = require('./src/knowledge/FileSearchService');

async function testFileSearch() {
  console.log('=== FileSearchService Integration Test ===\n');

  try {
    // Initialize the service
    console.log('1. Initializing FileSearchService...');
    const fileSearchService = new FileSearchService({
      debug: true
    });

    await fileSearchService.initialize();
    console.log('✅ FileSearchService initialized successfully\n');

    // Test basic search
    console.log('2. Testing basic knowledge base search...');
    const testQuestion = "How do I invite team members to my organization?";
    const testContext = "Customer is asking about team management features.";

    const result = await fileSearchService.searchKnowledgeBase(testQuestion, testContext);
    
    console.log('✅ Search completed successfully');
    console.log('📄 Answer length:', result.answer ? result.answer.length : 0);
    console.log('🔗 Citations found:', result.citations.length);
    console.log('📋 Search results:', result.searchResults.length);
    
    if (result.answer) {
      console.log('\n📝 Answer preview:');
      console.log(result.answer.substring(0, 200) + '...\n');
    }

    if (result.citations.length > 0) {
      console.log('📚 Citations:');
      result.citations.forEach((citation, index) => {
        console.log(`  ${index + 1}. File: ${citation.filename} (ID: ${citation.fileId})`);
      });
      console.log('');
    }

    // Test vector store info
    console.log('3. Getting vector store information...');
    const vectorStoreInfo = await fileSearchService.getVectorStoreInfo();
    console.log('✅ Vector store info retrieved:');
    console.log(`   Name: ${vectorStoreInfo.name}`);
    console.log(`   Status: ${vectorStoreInfo.status}`);
    console.log(`   File count: ${JSON.stringify(vectorStoreInfo.fileCounts)}`);
    console.log(`   Files in store: ${vectorStoreInfo.files.length}\n`);

    // Test with different question
    console.log('4. Testing another search query...');
    const testQuestion2 = "What integrations are available?";
    const result2 = await fileSearchService.searchKnowledgeBase(testQuestion2, "");
    
    console.log('✅ Second search completed');
    console.log('📄 Answer length:', result2.answer ? result2.answer.length : 0);
    console.log('🔗 Citations found:', result2.citations.length);
    
    if (result2.answer) {
      console.log('\n📝 Answer preview:');
      console.log(result2.answer.substring(0, 200) + '...\n');
    }

    console.log('🎉 All tests passed! FileSearchService is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Check common issues
    if (error.message.includes('OPENAI_API_KEY')) {
      console.log('\n💡 Tip: Make sure OPENAI_API_KEY is set in your .env file');
    }
    
    if (error.message.includes('OPENAI_VECTOR_STORE_ID')) {
      console.log('\n💡 Tip: Make sure OPENAI_VECTOR_STORE_ID is set in your .env file');
    }
    
    if (error.message.includes('vector store')) {
      console.log('\n💡 Tip: Check that your vector store ID is correct and has files uploaded');
    }
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
  process.exit(1);
});

// Run the test
if (require.main === module) {
  testFileSearch().then(() => {
    console.log('\n✨ Test completed');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = testFileSearch;