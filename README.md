# EUDR MCP Server

An MCP (Model Context Protocol) server that provides access to EUDR API documentation through intelligent query tools.

## Features

This MCP server processes EUDR API v1.3 documentation and offers the following tools:

### 🔧 Available Tools

1. **`query_endpoint`** - Query information about specific EUDR API endpoints
   - Parameters: `operation`, `category`
   - Example: Search for "SubmitDDS" or category "Basic Connectivity"

2. **`get_examples`** - Get request/response examples for operations
   - Parameters: `operation` (required), `type` (request/response)
   - Example: Get request examples for "EchoService"

3. **`validate_structure`** - Validate data structures against EUDR specifications
   - Parameters: `data` (required), `operation`
   - Example: Validate a request XML against available examples

4. **`get_business_rules`** - Query business rules and validations
   - Parameters: `category`, `search`
   - Example: Search for rules related to "Validation" or "GeoJSON"

5. **`search_documentation`** - Search across all EUDR documentation
   - Parameters: `query` (required), `document_type`, `category`
   - Example: Search for "geolocation" in DOCX, PDF, or XML documents

### 📚 Available Resources

- **Documents**: Direct access to processed DOCX, PDF, and XML files
- **Endpoints**: Structured information about API endpoints
- **Examples**: Request and response examples organized by operation

### 🎯 Available Prompts

- **`eudr_integration_guide`** - Generate comprehensive integration guide
- **`api_reference`** - Generate API reference documentation

## Processed Documentation

The server automatically processes:

- **Conformance Tests (CF1-CF7)**:
  - CF1: Basic Connectivity (EchoService)
  - CF2: Submit DDS
  - CF3: Retrieve DDS Status
  - CF4: Error Conditions
  - CF5: Amend DDS
  - CF6: Retract DDS
  - CF7: Retrieve Referenced DDS Data

- **File Types**:
  - DOCX files (detailed documentation)
  - PDF files (specifications and validation rules)
  - XML files (request/response examples)

- **Categories**:
  - API Specifications
  - Validation Rules
  - Development Options
  - Python Examples
  - Request/Response Examples
  - GeoJSON Documentation

## Installation and Configuration

1. **Prerequisites**:
   - Node.js 16+
   - EUDR API v1.3 documentation in: `documents/`

2. **Installation**:
   ```bash
   npm install
   npm run build
   ```

3. **Configuration in Cline MCP**:
   The server is already configured in: `cline_mcp_settings.json`

## Usage Examples

### Query Endpoint
```json
{
  "tool": "query_endpoint",
  "arguments": {
    "operation": "SubmitDDS"
  }
}
```

### Get Request Examples
```json
{
  "tool": "get_examples",
  "arguments": {
    "operation": "EchoService",
    "type": "request"
  }
}
```

### Search Documentation
```json
{
  "tool": "search_documentation",
  "arguments": {
    "query": "geolocation",
    "document_type": "pdf"
  }
}
```

### Validate Data Structure
```json
{
  "tool": "validate_structure",
  "arguments": {
    "data": "<xml>...</xml>",
    "operation": "SubmitDDS"
  }
}
```

## Knowledge Cache

The server automatically creates a cache (`knowledge-cache.json`) with:
- 24+ processed documents (DOCX, PDF, XML)
- 16+ request/response examples
- Identified endpoint structures
- Extracted business rules

## Project Structure

```
eutraces-mcpserver/
├── src/
│   ├── index.ts              # Main MCP server
│   └── documentProcessor.ts  # Document processor (DOCX, PDF, XML)
├── build/                    # Compiled files
├── documents/                # EUDR documentation files
├── knowledge-cache.json      # Processed knowledge cache
└── package.json
```

## Supported Document Types

The server processes three types of documents:

- **DOCX Files**: Detailed API documentation, specifications, and guides
- **PDF Files**: API specifications, validation rules, and technical documentation
- **XML Files**: Request and response examples for all operations

All file types are automatically processed and indexed for intelligent querying.

## Support

This MCP server was specifically created to work with EUDR API v1.3 documentation and provides intelligent access to:

- Technical API specifications
- Practical implementation examples
- Validation and business rules
- Development guides
- Conformance tests

You can now ask questions like:
- "How to make a SubmitDDS request?"
- "What are the CF3 response examples?"
- "How to validate geolocations in EUDR API?"
- "Show me the EchoService request structure"
- "What are the PDF validation rules for DDS?"

The server will automatically query the processed documentation and provide accurate answers based on official files.
