#!/usr/bin/env node

/**
 * EUDR API Documentation MCP Server - Web Version
 * 
 * This version exposes the MCP server functionality as REST endpoints for remote access
 */

import { DocumentProcessor, ProcessedKnowledge } from './documentProcessor.js';
import fs from 'fs';
import path from 'path';
import http from 'http';
import url from 'url';

// Configuration
const PORT = process.env.PORT || 3000;
const DOCUMENTS_PATH = "./documents";
const KNOWLEDGE_CACHE_PATH = "./knowledge-cache.json";

/**
 * Global knowledge base loaded from processed documents
 */
let knowledgeBase: ProcessedKnowledge | null = null;

/**
 * Initialize or load the knowledge base
 */
async function initializeKnowledgeBase(): Promise<void> {
  try {
    // Try to load from cache first
    if (fs.existsSync(KNOWLEDGE_CACHE_PATH)) {
      const cached = fs.readFileSync(KNOWLEDGE_CACHE_PATH, 'utf8');
      knowledgeBase = JSON.parse(cached);
      console.log('Loaded knowledge base from cache');
      return;
    }

    // Process documents if cache doesn't exist
    console.log('Processing EUDR documentation...');
    const processor = new DocumentProcessor(DOCUMENTS_PATH);
    knowledgeBase = await processor.processAllDocuments();
    
    // Save to cache
    await processor.saveKnowledge(KNOWLEDGE_CACHE_PATH);
    console.log(`Processed ${knowledgeBase.documents.length} documents`);
    
  } catch (error) {
    console.error('Error initializing knowledge base:', error);
    // Initialize empty knowledge base as fallback
    knowledgeBase = {
      documents: [],
      endpoints: [],
      examples: [],
      rules: []
    };
  }
}

/**
 * CORS headers
 */
function setCORSHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Send JSON response
 */
function sendJSON(res: http.ServerResponse, data: any, statusCode: number = 200) {
  setCORSHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Send error response
 */
function sendError(res: http.ServerResponse, message: string, statusCode: number = 500) {
  sendJSON(res, { error: message }, statusCode);
}

/**
 * Parse request body
 */
function parseRequestBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Handle query_endpoint tool
 */
async function handleQueryEndpoint(args: any): Promise<any> {
  const { operation, category } = args;
  
  let endpoints = knowledgeBase!.endpoints;
  
  if (operation && typeof operation === 'string') {
    endpoints = endpoints.filter(e => 
      e.name.toLowerCase().includes(operation.toLowerCase()) ||
      e.description.toLowerCase().includes(operation.toLowerCase())
    );
  }
  
  if (category && typeof category === 'string') {
    endpoints = endpoints.filter(e => 
      e.category.toLowerCase().includes(category.toLowerCase())
    );
  }
  
  if (endpoints.length === 0) {
    return "No endpoints found matching the criteria.";
  }
  
  return endpoints.map(e => ({
    name: e.name,
    method: e.method,
    url: e.url,
    description: e.description,
    category: e.category,
    source: e.source
  }));
}

/**
 * Handle get_examples tool
 */
async function handleGetExamples(args: any): Promise<any> {
  const { operation, type } = args;
  
  let examples = knowledgeBase!.examples;
  
  if (operation && typeof operation === 'string') {
    examples = examples.filter(e => 
      e.operation.toLowerCase().includes(operation.toLowerCase())
    );
  }
  
  if (type && typeof type === 'string') {
    examples = examples.filter(e => e.type === type);
  }
  
  if (examples.length === 0) {
    return "No examples found matching the criteria.";
  }
  
  return examples.map(e => ({
    name: e.name,
    type: e.type,
    operation: e.operation,
    content: e.content,
    source: e.source
  }));
}

/**
 * Handle validate_structure tool
 */
async function handleValidateStructure(args: any): Promise<any> {
  const { data, operation } = args;
  
  if (!data || typeof data !== 'string') {
    return "No data provided for validation.";
  }
  
  // Find relevant examples for comparison
  let relevantExamples = knowledgeBase!.examples;
  if (operation && typeof operation === 'string') {
    relevantExamples = relevantExamples.filter(e => 
      e.operation.toLowerCase().includes(operation.toLowerCase())
    );
  }
  
  return {
    provided_data: data,
    operation_context: operation || "Not specified",
    relevant_examples: relevantExamples.map(e => ({
      name: e.name,
      type: e.type,
      operation: e.operation
    })),
    validation_notes: "Compare the provided data structure with the relevant examples above."
  };
}

/**
 * Handle get_business_rules tool
 */
async function handleGetBusinessRules(args: any): Promise<any> {
  const { category, search } = args;
  
  let rules = knowledgeBase!.rules;
  
  if (category && typeof category === 'string') {
    rules = rules.filter(r => 
      r.category.toLowerCase().includes(category.toLowerCase())
    );
  }
  
  if (search && typeof search === 'string') {
    rules = rules.filter(r => 
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase())
    );
  }
  
  if (rules.length === 0) {
    return "No business rules found matching the criteria.";
  }
  
  return rules;
}

/**
 * Handle search_documentation tool
 */
async function handleSearchDocumentation(args: any): Promise<any> {
  const { query, document_type, category } = args;
  
  if (!query || typeof query !== 'string') {
    return "No search query provided.";
  }
  
  let documents = knowledgeBase!.documents;
  
  if (document_type && typeof document_type === 'string') {
    documents = documents.filter(d => d.type === document_type);
  }
  
  if (category && typeof category === 'string') {
    documents = documents.filter(d => 
      d.category.toLowerCase().includes(category.toLowerCase())
    );
  }
  
  // Search in content
  const searchResults = documents.filter(d => 
    d.content.toLowerCase().includes(query.toLowerCase()) ||
    d.title.toLowerCase().includes(query.toLowerCase()) ||
    d.filename.toLowerCase().includes(query.toLowerCase())
  );
  
  if (searchResults.length === 0) {
    return "No documents found matching the search criteria.";
  }
  
  return searchResults.map(d => {
    const content = d.content.toLowerCase();
    const queryLower = query.toLowerCase();
    const index = content.indexOf(queryLower);
    
    let excerpt = "";
    if (index >= 0) {
      const start = Math.max(0, index - 100);
      const end = Math.min(content.length, index + query.length + 100);
      excerpt = d.content.substring(start, end);
    }
    
    return {
      filename: d.filename,
      title: d.title,
      category: d.category,
      type: d.type,
      excerpt: excerpt || d.content.substring(0, 200) + "..."
    };
  });
}

/**
 * Main request handler
 */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    setCORSHeaders(res);
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // Ensure knowledge base is initialized
    if (!knowledgeBase) {
      await initializeKnowledgeBase();
    }

    // Health check endpoint
    if (pathname === '/health') {
      sendJSON(res, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        documents: knowledgeBase?.documents.length || 0,
        endpoints: knowledgeBase?.endpoints.length || 0,
        examples: knowledgeBase?.examples.length || 0
      });
      return;
    }

    // Info endpoint
    if (pathname === '/info') {
      sendJSON(res, {
        name: 'EUDR MCP Server',
        version: '0.1.0',
        description: 'Model Context Protocol server for EUDR API documentation',
        capabilities: ['resources', 'tools', 'prompts'],
        transport: 'HTTP REST'
      });
      return;
    }

    // List resources endpoint
    if (pathname === '/resources') {
      const resources = [];

      // Add documents as resources
      for (const doc of knowledgeBase!.documents) {
        resources.push({
          uri: `eudr://document/${encodeURIComponent(doc.filename)}`,
          mimeType: "text/plain",
          name: doc.title,
          description: `${doc.category} - ${doc.filename} (${doc.type.toUpperCase()})`
        });
      }

      // Add endpoints as resources
      for (const endpoint of knowledgeBase!.endpoints) {
        resources.push({
          uri: `eudr://endpoint/${encodeURIComponent(endpoint.name)}`,
          mimeType: "application/json",
          name: endpoint.name,
          description: `${endpoint.method} ${endpoint.url} - ${endpoint.description}`
        });
      }

      // Add examples as resources
      for (const example of knowledgeBase!.examples) {
        resources.push({
          uri: `eudr://example/${encodeURIComponent(example.name)}`,
          mimeType: "application/xml",
          name: example.name,
          description: `${example.type} example for ${example.operation}`
        });
      }

      sendJSON(res, { resources });
      return;
    }

    // Tool execution endpoints
    if (pathname?.startsWith('/tools/')) {
      const toolName = pathname.substring(7);
      
      if (method !== 'POST') {
        sendError(res, 'Method not allowed', 405);
        return;
      }

      const body = await parseRequestBody(req);
      const args = body.arguments || {};

      let result: any;
      switch (toolName) {
        case 'query_endpoint':
          result = await handleQueryEndpoint(args);
          break;
        case 'get_examples':
          result = await handleGetExamples(args);
          break;
        case 'validate_structure':
          result = await handleValidateStructure(args);
          break;
        case 'get_business_rules':
          result = await handleGetBusinessRules(args);
          break;
        case 'search_documentation':
          result = await handleSearchDocumentation(args);
          break;
        default:
          sendError(res, `Unknown tool: ${toolName}`, 404);
          return;
      }

      sendJSON(res, { result });
      return;
    }

    // Default 404
    sendError(res, 'Not found', 404);

  } catch (error) {
    console.error('Request error:', error);
    sendError(res, 'Internal server error', 500);
  }
}

/**
 * Start the web server
 */
async function main() {
  try {
    // Initialize the knowledge base
    await initializeKnowledgeBase();
    
    // Create HTTP server
    const server = http.createServer(handleRequest);
    
    // Start listening
    server.listen(PORT, () => {
      console.log(`EUDR MCP Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Info: http://localhost:${PORT}/info`);
      console.log(`Resources: http://localhost:${PORT}/resources`);
      console.log(`Tools: http://localhost:${PORT}/tools/{tool_name}`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error);
