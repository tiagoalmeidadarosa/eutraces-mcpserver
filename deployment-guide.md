# EUDR MCP Server - Azure App Service Deployment Guide

This guide explains how to deploy the EUDR MCP Server to Azure App Service for remote access.

## Overview

The MCP Server has been modified to work in two modes:
1. **Local Mode**: Traditional MCP server using stdio transport (original functionality)
2. **Web Mode**: HTTP REST API server for remote access

## Files for Deployment

### Key Files Created:
- `src/web-server.ts` - Web version of the MCP server
- `web.config` - IIS configuration for Azure App Service
- `deployment-guide.md` - This deployment guide

### Modified Files:
- `package.json` - Added web server scripts and dependencies

## Deployment Steps

### 1. Prepare Your Code

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Azure App Service Deployment

#### Option A: Deploy via Azure CLI

```bash
# Login to Azure
az login

# Create resource group (if needed)
az group create --name eudr-mcp-rg --location "East US"

# Create App Service plan
az appservice plan create --name eudr-mcp-plan --resource-group eudr-mcp-rg --sku B1 --is-linux

# Create web app
az webapp create --resource-group eudr-mcp-rg --plan eudr-mcp-plan --name eudr-mcp-server --runtime "NODE|18-lts"

# Deploy code
az webapp deployment source config-zip --resource-group eudr-mcp-rg --name eudr-mcp-server --src deployment.zip
```

#### Option B: Deploy via GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure App Service

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm install
      
    - name: Build project
      run: npm run build
      
    - name: Deploy to Azure
      uses: azure/webapps-deploy@v2
      with:
        app-name: 'eudr-mcp-server'
        publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
```

#### Option C: Deploy via VS Code

1. Install Azure App Service extension
2. Right-click on project folder
3. Select "Deploy to Web App"
4. Follow the prompts

### 3. Environment Configuration

Set these environment variables in Azure App Service:

```bash
# Required
NODE_ENV=production
PORT=8080

# Optional
DOCUMENTS_PATH=./documents
KNOWLEDGE_CACHE_PATH=./knowledge-cache.json
```

### 4. Application Settings

In Azure Portal → App Service → Configuration:

- **Runtime version**: Node.js 18 LTS
- **Startup Command**: `npm start`
- **Always On**: Enabled (prevents cold starts)

## API Endpoints

Once deployed, your server will expose these endpoints:

### Health & Info
- `GET /health` - Health check
- `GET /info` - Server information

### Resources
- `GET /resources` - List all available resources

### Tools (POST requests)
- `POST /tools/query_endpoint` - Query EUDR API endpoints
- `POST /tools/get_examples` - Get request/response examples
- `POST /tools/validate_structure` - Validate data structures
- `POST /tools/get_business_rules` - Get business rules
- `POST /tools/search_documentation` - Search documentation

## Usage Examples

### Query Endpoint
```bash
curl -X POST https://your-app.azurewebsites.net/tools/query_endpoint \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"operation": "SubmitDDS"}}'
```

### Get Examples
```bash
curl -X POST https://your-app.azurewebsites.net/tools/get_examples \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"operation": "EchoService", "type": "request"}}'
```

### Search Documentation
```bash
curl -X POST https://your-app.azurewebsites.net/tools/search_documentation \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"query": "geolocation", "document_type": "pdf"}}'
```

## Connecting from MCP Clients

### For Traditional MCP Clients

You'll need to create a bridge or use a custom transport. The web server exposes the same functionality as REST endpoints.

### For Custom Applications

Use the HTTP REST API directly:

```javascript
const response = await fetch('https://your-app.azurewebsites.net/tools/query_endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    arguments: {
      operation: 'SubmitDDS'
    }
  })
});

const data = await response.json();
console.log(data.result);
```

## Security Considerations

1. **Authentication**: The current implementation has no authentication. Consider adding:
   - API keys
   - OAuth 2.0
   - Azure AD integration

2. **Rate Limiting**: Implement rate limiting to prevent abuse

3. **CORS**: Configure CORS properly for production use

4. **HTTPS**: Always use HTTPS in production (handled by Azure App Service)

## Monitoring

Enable Application Insights for monitoring:

1. Go to Azure Portal → App Service → Application Insights
2. Enable Application Insights
3. Configure alerts for errors and performance issues

## Scaling

- **Vertical Scaling**: Increase App Service plan tier
- **Horizontal Scaling**: Enable auto-scaling rules
- **Global Distribution**: Use Azure Front Door for multiple regions

## Troubleshooting

### Common Issues:

1. **Build Failures**: Check Node.js version compatibility
2. **Memory Issues**: Increase App Service plan size
3. **Startup Errors**: Check startup command and logs
4. **Document Processing**: Ensure documents folder is included in deployment

### Debug Commands:

```bash
# Check logs
az webapp log tail --name eudr-mcp-server --resource-group eudr-mcp-rg

# SSH into container
az webapp ssh --name eudr-mcp-server --resource-group eudr-mcp-rg
```

## Cost Optimization

- Use **Basic** or **Standard** tier for development
- Enable **Auto Scaling** to handle traffic spikes
- Consider **Azure Functions** for serverless deployment
- Use **Application Insights** to monitor performance

## Next Steps

1. Deploy to Azure App Service
2. Test all endpoints
3. Implement authentication
4. Add monitoring and alerts
5. Configure custom domain (optional)
6. Set up CI/CD pipeline

Your EUDR MCP Server will be accessible at: `https://your-app-name.azurewebsites.net`
