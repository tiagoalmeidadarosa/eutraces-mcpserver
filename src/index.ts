#!/usr/bin/env node

/**
 * EUDR API Documentation MCP Server
 * 
 * This MCP server provides access to EUDR API documentation including:
 * - Querying specific endpoints and operations
 * - Retrieving request/response examples
 * - Validating data structures
 * - Searching business rules
 * - General documentation search
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

// Path to the EUDR documentation
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
      console.error('Loaded knowledge base from cache');
      return;
    }

    // Process documents if cache doesn't exist
    console.error('Processing EUDR documentation...');
    const processor = new DocumentProcessor(DOCUMENTS_PATH);
    knowledgeBase = await processor.processAllDocuments();
    
    // Save to cache
    await processor.saveKnowledge(KNOWLEDGE_CACHE_PATH);
    console.error(`Processed ${knowledgeBase.documents.length} documents`);
    
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

/**
 * Handler for listing available resources
 * Exposes documents, endpoints, examples, and rules as resources
 */
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

/**
 * Handler for reading resource contents
 */
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

/**
 * Handler for listing available tools
 */
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

/**
 * Handler for tool execution
 */
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

/**
 * Handler for listing available prompts
 */
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

/**
 * Handler for prompts
 */
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
 * Start the server using stdio transport
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('EUDR MCP server running on stdio');
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
