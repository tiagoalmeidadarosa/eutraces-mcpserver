# MCP Remote Connection Guide

## The Answer to Your Question

To connect to your MCP server remotely in Cline, you need to use the **SSE (Server-Sent Events)** transport type with the correct URL format.

## Correct URL Format for Cline MCP Settings

Based on your existing settings file, here's the correct format:

```json
{
  "mcpServers": {
    "eudr-mcp-server-remote": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "type": "sse",
      "url": "https://your-app-name.azurewebsites.net/mcp"
    }
  }
}
```

## Step-by-Step Setup

### 1. Deploy to Azure App Service

First, deploy your MCP server to Azure:

```bash
# Build the project
npm run build

# Deploy to Azure (using Azure CLI)
az webapp create --resource-group eudr-mcp-rg --plan eudr-mcp-plan --name your-app-name --runtime "NODE|18-lts"
az webapp deployment source config-zip --resource-group eudr-mcp-rg --name your-app-name --src deployment.zip
```

### 2. Update Cline MCP Settings

Add this configuration to your Cline MCP settings file:

**File**: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "eutraces-mcpserver": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": [
        "c:/Users/tiago/Documents/Cline/MCP/eutraces-mcpserver/build/index.js"
      ]
    },
    "eudr-mcp-server-remote": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "type": "sse",
      "url": "https://YOUR-APP-NAME.azurewebsites.net/mcp"
    }
  }
}
```

### 3. Replace YOUR-APP-NAME

Replace `YOUR-APP-NAME` with your actual Azure App Service name. For example:
- `https://eudr-mcp-server-123.azurewebsites.net/mcp`
- `https://my-eudr-server.azurewebsites.net/mcp`

## Important Notes

### URL Structure
- **Base URL**: `https://your-app-name.azurewebsites.net`
- **MCP Endpoint**: `/mcp`
- **Full URL**: `https://your-app-name.azurewebsites.net/mcp`

### Transport Types
- **Local**: `stdio` (runs locally)
- **Remote**: `sse` (Server-Sent Events over HTTP)

### Current Implementation Status

**⚠️ Current Challenge**: The MCP SDK's SSE transport may not be fully compatible with the current implementation. You have two options:

#### Option 1: Use the Web Server (Recommended for Now)
Use the REST API endpoints I created:
- Deploy `src/web-server.ts` to Azure
- Access via HTTP REST API (not direct MCP integration)

#### Option 2: Wait for MCP SSE Support
The MCP protocol over SSE is still evolving. For now, the stdio transport (local) works perfectly.

## Testing Your Deployment

### 1. Test the Health Endpoint
```bash
curl https://your-app-name.azurewebsites.net/health
```

### 2. Test MCP Endpoint
```bash
curl https://your-app-name.azurewebsites.net/mcp
```

## Alternative: Custom MCP Bridge

If you need remote access immediately, you can create a bridge:

```javascript
// Local MCP bridge that connects to remote REST API
const MCPBridge = {
  async callTool(toolName, args) {
    const response = await fetch(`https://your-app.azurewebsites.net/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: args })
    });
    return response.json();
  }
};
```

## Current Working Solutions

### 1. Local MCP Server (Working)
```json
{
  "type": "stdio",
  "command": "node",
  "args": ["c:/Users/tiago/Documents/Cline/MCP/eutraces-mcpserver/build/index.js"]
}
```

### 2. Remote REST API (Working)
```bash
# Query endpoints
curl -X POST https://your-app.azurewebsites.net/tools/query_endpoint \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"operation": "SubmitDDS"}}'
```

### 3. Remote MCP via SSE (In Development)
```json
{
  "type": "sse",
  "url": "https://your-app-name.azurewebsites.net/mcp"
}
```

## Recommended Approach

For immediate remote access:

1. **Deploy the web server** (`src/web-server.ts`) to Azure
2. **Use the REST API** endpoints for remote access
3. **Keep the local MCP server** for Cline integration
4. **Monitor MCP SDK updates** for better SSE support

## Example Configuration

Here's a complete working configuration:

```json
{
  "mcpServers": {
    "eutraces-local": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": ["c:/Users/tiago/Documents/Cline/MCP/eutraces-mcpserver/build/index.js"]
    },
    "eutraces-remote": {
      "autoApprove": [],
      "disabled": true,
      "timeout": 60,
      "type": "sse",
      "url": "https://your-app-name.azurewebsites.net/mcp"
    }
  }
}
```

## Summary

**The URL you need is**: `https://your-app-name.azurewebsites.net/mcp`

However, the MCP over SSE transport is still evolving. For now, I recommend:
1. Use the local MCP server for Cline integration
2. Use the REST API for remote programmatic access
3. Monitor MCP SDK updates for better remote support

The web server I created provides full functionality via REST endpoints and is ready for production use!
