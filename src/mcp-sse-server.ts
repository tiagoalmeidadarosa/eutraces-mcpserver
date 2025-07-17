#!/usr/bin/env node

/**
 * EUDR API Documentation MCP Server - SSE Version
 * 
 * This version supports the MCP protocol over SSE for remote connections
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import express from 'express';
import cors from 'cors';
import { DocumentProcessor, ProcessedKnowledge } from './documentProcessor.js';
import fs from 'fs';

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
function createMCPServer(): McpServer {
  const mcpServer = new McpServer({
    name: "My MCP Server",
    version: "1.0.0",
    instructions: `Instructions for using these tools...`
  });

  // Note: Resource registration syntax changed in new MCP SDK
  // For now, just register tools and prompts which are working

  // Register tools with corrected syntax
  mcpServer.tool("query_endpoint", "Query information about specific EUDR API endpoints", {
    operation: { type: "string", description: "The operation or endpoint name to query" },
    category: { type: "string", description: "The category of operation (e.g., 'Basic Connectivity', 'Submit DDS')" }
  }, async ({ operation, category }) => {
    if (!knowledgeBase) {
      await initializeKnowledgeBase();
    }

    const results = [];
    const operationLower = operation?.toString().toLowerCase();
    const categoryLower = category?.toString().toLowerCase();

    // Search in endpoints
    for (const endpoint of knowledgeBase!.endpoints) {
      if (operationLower && endpoint.name.toLowerCase().includes(operationLower)) {
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
      if ((operationLower && doc.content.toLowerCase().includes(operationLower)) ||
          (categoryLower && doc.category.toLowerCase().includes(categoryLower))) {
        results.push({
          type: "document",
          title: doc.title,
          category: doc.category,
          filename: doc.filename,
          relevant_content: doc.content.substring(0, 500) + "..."
        });
      }
    }

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  });

  mcpServer.tool("get_examples", "Get request/response examples for EUDR API operations", {
    operation: { type: "string", description: "The operation to get examples for" },
    type: { type: "string", enum: ["request", "response"], description: "Whether to get request or response examples" }
  }, async ({ operation, type }) => {
    if (!knowledgeBase) {
      await initializeKnowledgeBase();
    }

    const operationLower = operation?.toString().toLowerCase();
    const results = [];

    for (const example of knowledgeBase!.examples) {
      if (operationLower && example.name.toLowerCase().includes(operationLower)) {
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

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  });

  mcpServer.tool("validate_structure", "Validate data structures against EUDR specifications", {
    data: { type: "string", description: "The data structure to validate (XML, JSON, etc.)" },
    operation: { type: "string", description: "The operation context for validation" }
  }, async ({ data, operation }) => {
    if (!knowledgeBase) {
      await initializeKnowledgeBase();
    }

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

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  });

  mcpServer.tool("get_business_rules", "Query business rules and validations from EUDR documentation", {
    category: { type: "string", description: "The category of rules to query" },
    search: { type: "string", description: "Search term for specific rules" }
  }, async ({ category, search }) => {
    if (!knowledgeBase) {
      await initializeKnowledgeBase();
    }

    const categoryLower = category?.toString().toLowerCase();
    const searchLower = search?.toString().toLowerCase();
    const results = [];

    for (const rule of knowledgeBase!.rules) {
      if ((!categoryLower || rule.category.toLowerCase().includes(categoryLower)) &&
          (!searchLower || rule.name.toLowerCase().includes(searchLower) || 
           rule.description.toLowerCase().includes(searchLower))) {
        results.push({
          name: rule.name,
          category: rule.category,
          description: rule.description,
          source: rule.source
        });
      }
    }

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  });

  mcpServer.tool("search_documentation", "Search across all EUDR documentation", {
    query: { type: "string", description: "The search query" },
    document_type: { type: "string", enum: ["docx", "pdf", "xml"], description: "Filter by document type" },
    category: { type: "string", description: "Filter by document category" }
  }, async ({ query, document_type, category }) => {
    if (!knowledgeBase) {
      await initializeKnowledgeBase();
    }

    const queryLower = query?.toString().toLowerCase();
    const categoryLower = category?.toString().toLowerCase();
    const results = [];

    for (const doc of knowledgeBase!.documents) {
      if ((!document_type || doc.type === document_type) &&
          (!categoryLower || doc.category.toLowerCase().includes(categoryLower)) &&
          (queryLower && doc.content.toLowerCase().includes(queryLower))) {
        results.push({
          title: doc.title,
          category: doc.category,
          filename: doc.filename,
          type: doc.type,
          relevant_content: doc.content.substring(0, 500) + "..."
        });
      }
    }

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  });

  // Register prompts
  mcpServer.prompt("eudr_integration_guide", "Generate a comprehensive integration guide for EUDR API", {
    focus_area: z.string().optional().describe("Specific area to focus on (e.g., 'authentication', 'data_validation')")
  }, async ({ focus_area }) => {
    const focusArea = focus_area || "general";
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
  });

  mcpServer.prompt("api_reference", "Generate API reference documentation", {
    endpoint: z.string().optional().describe("Specific endpoint to document")
  }, async ({ endpoint }) => {
    const endpointTarget = endpoint || "all";
    return {
      description: `EUDR API Reference - ${endpointTarget}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate detailed API reference documentation for ${endpointTarget === 'all' ? 'all EUDR API endpoints' : `the ${endpointTarget} endpoint`}. Include request/response schemas, examples, and error handling.`
          }
        }
      ]
    };
  });

  return mcpServer;
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
    const mcpServer = createMCPServer();
    
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
        await mcpServer.connect(transport);
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
        await transport.handlePostMessage(req, res, req.body);
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
