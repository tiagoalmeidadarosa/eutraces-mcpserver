#!/usr/bin/env node

/**
 * EUDR API Documentation MCP Server - SSE Version
 * 
 * This version supports the MCP protocol over SSE for remote connections
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from 'express';
import cors from 'cors';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DocumentProcessor, ProcessedKnowledge } from './documentProcessor.js';
import fs from 'fs';
import path from 'path';

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
 * Create an MCP server with capabilities for resources, tools, and prompts
 */
const server = new Server(
  {
    name: "eutraces-mcpserver",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

// Set up all the MCP request handlers (same as original index.ts)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  if (!knowledgeBase) {
    await initializeKnowledgeBase();
  }

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

  return { resources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (!knowledgeBase) {
    await initializeKnowledgeBase();
  }

  const url = new URL(request.params.uri);
  const [, type, id] = url.pathname.split('/');
  const decodedId = decodeURIComponent(id);

  switch (type) {
    case 'document': {
      const doc = knowledgeBase!.documents.find(d => d.filename === decodedId);
      if (!doc) {
        throw new Error(`Document ${decodedId} not found`);
      }
      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "text/plain",
          text: doc.content
        }]
      };
    }

    case 'endpoint': {
      const endpoint = knowledgeBase!.endpoints.find(e => e.name === decodedId);
      if (!endpoint) {
        throw new Error(`Endpoint ${decodedId} not found`);
      }
      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(endpoint, null, 2)
        }]
      };
    }

    case 'example': {
      const example = knowledgeBase!.examples.find(e => e.name === decodedId);
      if (!example) {
        throw new Error(`Example ${decodedId} not found`);
      }
      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/xml",
          text: example.content
        }]
      };
    }

    default:
      throw new Error(`Unknown resource type: ${type}`);
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_endpoint",
        description: "Query information about specific EUDR API endpoints",
        inputSchema: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              description: "Operation name (e.g., 'SubmitDDS', 'RetrieveDDS', 'EchoService')"
            },
            category: {
              type: "string",
              description: "Category filter (e.g., 'Submit DDS', 'Basic Connectivity')"
            }
          }
        }
      },
      {
        name: "get_examples",
        description: "Get request/response examples for EUDR API operations",
        inputSchema: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              description: "Operation name (e.g., 'SubmitDDS', 'RetrieveDDS')"
            },
            type: {
              type: "string",
              enum: ["request", "response"],
              description: "Type of example to retrieve"
            }
          },
          required: ["operation"]
        }
      },
      {
        name: "validate_structure",
        description: "Validate data structures against EUDR specifications",
        inputSchema: {
          type: "object",
          properties: {
            data: {
              type: "string",
              description: "JSON or XML data to validate"
            },
            operation: {
              type: "string",
              description: "Operation context for validation"
            }
          },
          required: ["data"]
        }
      },
      {
        name: "get_business_rules",
        description: "Query business rules and validation requirements",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Rule category (e.g., 'Validation', 'GeoJSON')"
            },
            search: {
              type: "string",
              description: "Search term to find specific rules"
            }
          }
        }
      },
      {
        name: "search_documentation",
        description: "Search across all EUDR documentation",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query"
            },
            document_type: {
              type: "string",
              enum: ["pdf", "docx", "xml"],
              description: "Filter by document type"
            },
            category: {
              type: "string",
              description: "Filter by document category"
            }
          },
          required: ["query"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!knowledgeBase) {
    await initializeKnowledgeBase();
  }

  switch (request.params.name) {
    case "query_endpoint": {
      const { operation, category } = request.params.arguments || {};
      
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
        return {
          content: [{
            type: "text",
            text: "No endpoints found matching the criteria."
          }]
        };
      }
      
      const result = endpoints.map(e => ({
        name: e.name,
        method: e.method,
        url: e.url,
        description: e.description,
        category: e.category,
        source: e.source
      }));
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    }

    case "get_examples": {
      const { operation, type } = request.params.arguments || {};
      
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
        return {
          content: [{
            type: "text",
            text: "No examples found matching the criteria."
          }]
        };
      }
      
      const result = examples.map(e => ({
        name: e.name,
        type: e.type,
        operation: e.operation,
        content: e.content,
        source: e.source
      }));
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    }

    case "validate_structure": {
      const { data, operation } = request.params.arguments || {};
      
      if (!data || typeof data !== 'string') {
        return {
          content: [{
            type: "text",
            text: "No data provided for validation."
          }]
        };
      }
      
      // Find relevant examples for comparison
      let relevantExamples = knowledgeBase!.examples;
      if (operation && typeof operation === 'string') {
        relevantExamples = relevantExamples.filter(e => 
          e.operation.toLowerCase().includes(operation.toLowerCase())
        );
      }
      
      const validation = {
        provided_data: data,
        operation_context: operation || "Not specified",
        relevant_examples: relevantExamples.map(e => ({
          name: e.name,
          type: e.type,
          operation: e.operation
        })),
        validation_notes: "Compare the provided data structure with the relevant examples above."
      };
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(validation, null, 2)
        }]
      };
    }

    case "get_business_rules": {
      const { category, search } = request.params.arguments || {};
      
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
        return {
          content: [{
            type: "text",
            text: "No business rules found matching the criteria."
          }]
        };
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(rules, null, 2)
        }]
      };
    }

    case "search_documentation": {
      const { query, document_type, category } = request.params.arguments || {};
      
      if (!query || typeof query !== 'string') {
        return {
          content: [{
            type: "text",
            text: "No search query provided."
          }]
        };
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
        return {
          content: [{
            type: "text",
            text: "No documents found matching the search criteria."
          }]
        };
      }
      
      const results = searchResults.map(d => {
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
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2)
        }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "eudr_integration_guide",
        description: "Generate a comprehensive integration guide for EUDR API",
      },
      {
        name: "api_reference",
        description: "Generate API reference documentation",
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (!knowledgeBase) {
    await initializeKnowledgeBase();
  }

  switch (request.params.name) {
    case "eudr_integration_guide": {
      const documents = knowledgeBase!.documents
        .filter(d => d.category.includes('Basic Connectivity') || d.category.includes('Development'))
        .map(d => ({
          type: "resource" as const,
          resource: {
            uri: `eudr://document/${encodeURIComponent(d.filename)}`,
            mimeType: "text/plain",
            text: d.content
          }
        }));

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Create a comprehensive integration guide for the EUDR API based on the following documentation:"
            }
          },
          ...documents.map(doc => ({
            role: "user" as const,
            content: doc
          })),
          {
            role: "user",
            content: {
              type: "text",
              text: "Please provide a step-by-step integration guide with code examples."
            }
          }
        ]
      };
    }

    case "api_reference": {
      const endpoints = knowledgeBase!.endpoints.map(e => ({
        type: "resource" as const,
        resource: {
          uri: `eudr://endpoint/${encodeURIComponent(e.name)}`,
          mimeType: "application/json",
          text: JSON.stringify(e, null, 2)
        }
      }));

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Generate comprehensive API reference documentation for the following EUDR API endpoints:"
            }
          },
          ...endpoints.map(endpoint => ({
            role: "user" as const,
            content: endpoint
          })),
          {
            role: "user",
            content: {
              type: "text",
              text: "Please organize this into a clear API reference with descriptions, parameters, and examples."
            }
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown prompt: ${request.params.name}`);
  }
});

/**
 * Start the SSE server
 */
async function main() {
  try {
    // Initialize the knowledge base
    await initializeKnowledgeBase();
    
    // Create Express app
    const app = express();
    
    // Enable CORS
    app.use(cors({
      origin: '*',
      credentials: true
    }));
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        documents: knowledgeBase?.documents.length || 0,
        endpoints: knowledgeBase?.endpoints.length || 0,
        examples: knowledgeBase?.examples.length || 0
      });
    });
    
    // Handle SSE requests manually (without using the problematic SSEServerTransport)
    app.get('/mcp', (req, res) => {
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      
      // Send initial connection message
      res.write('data: {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}\n\n');
      
      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write('data: {"type": "ping"}\n\n');
      }, 30000);
      
      // Handle client disconnect
      req.on('close', () => {
        clearInterval(keepAlive);
        res.end();
      });
    });
    
    // Handle MCP protocol messages via POST
    app.post('/mcp', express.json(), async (req, res) => {
      try {
        const { method, params, id } = req.body;
        
        // Basic MCP protocol handling
        let result = null;
        
        switch (method) {
          case 'tools/list':
            // Return the tools list directly
            result = {
              tools: [
                {
                  name: "query_endpoint",
                  description: "Query information about specific EUDR API endpoints"
                },
                {
                  name: "get_examples", 
                  description: "Get request/response examples for EUDR API operations"
                },
                {
                  name: "validate_structure",
                  description: "Validate data structures against EUDR specifications"
                },
                {
                  name: "get_business_rules",
                  description: "Query business rules and validation requirements"
                },
                {
                  name: "search_documentation",
                  description: "Search across all EUDR documentation"
                }
              ]
            };
            break;
            
          case 'resources/list':
            // Return simplified resources list
            result = {
              resources: [
                {
                  uri: "eudr://info",
                  name: "EUDR Documentation",
                  description: "EUDR API documentation and examples"
                }
              ]
            };
            break;
            
          case 'tools/call':
            result = { 
              error: { 
                code: -32601, 
                message: `Tool calling not fully implemented in SSE mode. Please use the REST API endpoints at /tools/${params?.name} instead.` 
              } 
            };
            break;
            
          default:
            result = { 
              error: { 
                code: -32601, 
                message: `Method ${method} not supported in simplified SSE implementation. Please use the REST API endpoints instead.` 
              } 
            };
        }
        
        res.json({
          jsonrpc: "2.0",
          id: id,
          result: result
        });
        
      } catch (error) {
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body.id,
          error: {
            code: -32603,
            message: 'Internal server error',
            data: error instanceof Error ? error.message : String(error)
          }
        });
      }
    });
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`EUDR MCP Server (SSE) running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`MCP SSE endpoint: http://localhost:${PORT}/mcp`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error);
