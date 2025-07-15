import { DocumentProcessor } from './build/documentProcessor.js';
import fs from 'fs';

const DOCUMENTS_PATH = "./documents";

async function testProcessing() {
  console.log('Testing document processing...');
  
  // Check if documents path exists
  if (!fs.existsSync(DOCUMENTS_PATH)) {
    console.error('Documents path does not exist:', DOCUMENTS_PATH);
    return;
  }
  
  try {
    const processor = new DocumentProcessor(DOCUMENTS_PATH);
    console.log('Processing documents...');
    
    const knowledge = await processor.processAllDocuments();
    
    console.log('Processing complete!');
    console.log(`Found ${knowledge.documents.length} documents`);
    console.log(`Found ${knowledge.endpoints.length} endpoints`);
    console.log(`Found ${knowledge.examples.length} examples`);
    console.log(`Found ${knowledge.rules.length} rules`);
    
    // Save to cache
    await processor.saveKnowledge('./knowledge-cache.json');
    console.log('Knowledge cache saved successfully!');
    
    // Show some sample data
    if (knowledge.documents.length > 0) {
      console.log('\nSample document:', knowledge.documents[0].filename);
    }
    if (knowledge.examples.length > 0) {
      console.log('Sample example:', knowledge.examples[0].name);
    }
    
  } catch (error) {
    console.error('Error during processing:', error);
  }
}

testProcessing();
