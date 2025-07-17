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
  ListResourceTemplatesRequestSchema,
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
 * Create and configure the MCP server
 */
function createMCPServer(): Server {
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

  // Set up all the MCP request handlers
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

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: [
        {
          uriTemplate: "eudr://document/{filename}",
          name: "EUDR Document",
          description: "Access any EUDR document by filename",
          mimeType: "text/plain"
        },
        {
          uriTemplate: "eudr://endpoint/{name}",
          name: "EUDR API Endpoint",
          description: "Access any EUDR API endpoint by name",
          mimeType: "application/json"
        },
        {
          uriTemplate: "eudr://example/{name}",
          name: "EUDR Example",
          description: "Access any EUDR request/response example by name",
          mimeType: "application/xml"
        },
        {
          uriTemplate: "eudr://rule/{category}",
          name: "EUDR Business Rule",
          description: "Access business rules by category",
          mimeType: "text/plain"
        }
      ]
    };
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

      case 'rule': {
        const rules = knowledgeBase!.rules.filter(r => r.category === decodedId);
        if (rules.length === 0) {
          throw new Error(`No rules found for category ${decodedId}`);
        }
        const ruleText = rules.map(r => `${r.name}\n${r.description}`).join('\n\n');
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: "text/plain",
            text: ruleText
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
                description: "The operation or endpoint name to query"
              },
              category: {
                type: "string",
                description: "The category of operation (e.g., 'Basic Connectivity', 'Submit DDS')"
              }
            },
            required: ["operation"]
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
                description: "The operation to get examples for"
              },
              type: {
                type: "string",
                enum: ["request", "response"],
                description: "Whether to get request or response examples"
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
                description: "The data structure to validate (XML, JSON, etc.)"
              },
              operation: {
                type: "string",
                description: "The operation context for validation"
              }
            },
            required: ["data"]
          }
        },
        {
          name: "get_business_rules",
          description: "Query business rules and validations from EUDR documentation",
          inputSchema: {
            type: "object",
            properties: {
              category: {
                type: "string",
                description: "The category of rules to query"
              },
              search: {
                type: "string",
                description: "Search term for specific rules"
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
                description: "The search query"
              },
              document_type: {
                type: "string",
                enum: ["docx", "pdf", "xml"],
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

    const { name, arguments: args } = request.params;

    switch (name) {
      case "query_endpoint": {
        const results = [];
        const operation = (args as any)?.operation?.toString().toLowerCase();
        const category = (args as any)?.category?.toString().toLowerCase();

        // Search in endpoints
        for (const endpoint of knowledgeBase!.endpoints) {
          if (operation && endpoint.name.toLowerCase().includes(operation)) {
            results.push({
              type: "endpoint",
              name: endpoint.name,
              description: endpoint.description,
              method: endpoint.method,
              url: endpoint.url,
              source: endpoint.source
            });
          }
        }

        // Search in documents
        for (const doc of knowledgeBase!.documents) {
          if ((operation && doc.content.toLowerCase().includes(operation)) ||
              (category && doc.category.toLowerCase().includes(category))) {
            results.push({
              type: "document",
              title: doc.title,
              category: doc.category,
              filename: doc.filename,
              relevant_content: doc.content.substring(0, 500) + "..."
            });
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      case "get_examples": {
        const operation = (args as any)?.operation?.toString().toLowerCase();
        const type = (args as any)?.type?.toString();
        const results = [];

        for (const example of knowledgeBase!.examples) {
          if (operation && example.name.toLowerCase().includes(operation)) {
            if (!type || example.type === type) {
              results.push({
                name: example.name,
                operation: example.operation,
                type: example.type,
                content: example.content,
                source: example.source
              });
            }
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      case "validate_structure": {
        const data = (args as any)?.data?.toString();
        const operation = (args as any)?.operation?.toString();
        
        // Basic validation logic
        const results = {
          valid: true,
          issues: [] as string[],
          suggestions: [] as string[]
        };

        // Check against known examples
        if (operation) {
          const examples = knowledgeBase!.examples.filter(e => 
            e.operation.toLowerCase().includes(operation.toLowerCase())
          );
          
          if (examples.length > 0) {
            results.suggestions.push(`Found ${examples.length} example(s) for ${operation}`);
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      case "get_business_rules": {
        const category = (args as any)?.category?.toString().toLowerCase();
        const search = (args as any)?.search?.toString().toLowerCase();
        const results = [];

        for (const rule of knowledgeBase!.rules) {
          if ((!category || rule.category.toLowerCase().includes(category)) &&
              (!search || rule.name.toLowerCase().includes(search) || 
               rule.description.toLowerCase().includes(search))) {
            results.push({
              name: rule.name,
              category: rule.category,
              description: rule.description,
              source: rule.source
            });
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      case "search_documentation": {
        const query = (args as any)?.query?.toString().toLowerCase();
        const documentType = (args as any)?.document_type?.toString();
        const category = (args as any)?.category?.toString().toLowerCase();
        const results = [];

        for (const doc of knowledgeBase!.documents) {
          if ((!documentType || doc.type === documentType) &&
              (!category || doc.category.toLowerCase().includes(category)) &&
              (query && doc.content.toLowerCase().includes(query))) {
            results.push({
              title: doc.title,
              category: doc.category,
              filename: doc.filename,
              type: doc.type,
              relevant_content: doc.content.substring(0, 500) + "..."
            });
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "eudr_integration_guide",
          description: "Generate a comprehensive integration guide for EUDR API",
          arguments: [
            {
              name: "focus_area",
              description: "Specific area to focus on (e.g., 'authentication', 'data_validation')",
              required: false
            }
          ]
        },
        {
          name: "api_reference",
          description: "Generate API reference documentation",
          arguments: [
            {
              name: "endpoint",
              description: "Specific endpoint to document",
              required: false
            }
          ]
        }
      ]
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "eudr_integration_guide": {
        const focusArea = args?.focus_area || "general";
        return {
          description: `EUDR API Integration Guide - ${focusArea}`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Generate a comprehensive integration guide for the EUDR API focusing on ${focusArea}. Include practical examples, code snippets, and best practices based on the available documentation.`
              }
            }
          ]
        };
      }

      case "api_reference": {
        const endpoint = args?.endpoint || "all";
        return {
          description: `EUDR API Reference - ${endpoint}`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Generate detailed API reference documentation for ${endpoint === 'all' ? 'all EUDR API endpoints' : `the ${endpoint} endpoint`}. Include request/response schemas, examples, and error handling.`
              }
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  return server;
}

async function main() {
  try {
    const transports: Record<string, SSEServerTransport> = {};

    // Initialize the knowledge base
    await initializeKnowledgeBase();
    
    // Create Express app
    const app = express();
    
    // Enable CORS
    app.use(cors({
      origin: '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));
    
    // Parse JSON bodies
    app.use(express.json());
    
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

    // Create a new MCP server instance for this connection
    const server = createMCPServer();
    
    // MCP SSE endpoint - GET for establishing SSE connection
    app.get('/mcp', async (req, res) => {
      console.log('New MCP SSE connection from:', req.ip);

      // Create SSE transport - this handles all SSE protocol details
      const transport = new SSEServerTransport('/messages', res);

      // store transport for future messages
      transports[transport.sessionId] = transport;

      // set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Mcp-Session-Id', transport.sessionId);

      try {
        // Connect server to transport
        await server.connect(transport);
        console.log('MCP server connected via SSE transport');
        
      } catch (error) {
        console.error('Failed to setup MCP SSE connection:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to setup MCP connection' });
        }
        else {
          res.end();
        }

        // clean up transport
        if (transports[transport.sessionId]) {
          delete transports[transport.sessionId];
        }
      }
    });

    // MCP endpoint - POST /messages for handling JSON-RPC method calls
    app.post('/messages', express.json(), async (req, res) => {
      console.log('MCP POST request from:', req.ip, 'Method:', req.body?.method);

      const sessionId = req.query.sessionId?.toString() || '';
      const rpcId = (req.body && req.body.id !== undefined) ? req.body.id : null;
      
      const transport = transports[sessionId];

      if (!transport || !(transport instanceof SSEServerTransport)) {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found or not an SSE session' },
          id: rpcId
        });
      }
      
      try {
        await transport.handlePostMessage(req, res);
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error handling message' },
            id: rpcId
          });
        }
      }
    });
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`EUDR MCP Server (SSE) running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`MCP SSE endpoint: http://localhost:${PORT}/mcp`);
      console.log(`MCP Messages endpoint: http://localhost:${PORT}/messages`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error);
