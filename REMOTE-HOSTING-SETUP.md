# EUDR MCP Server - Remote Hosting Setup

## Overview

Your EUDR MCP Server has been successfully configured for remote hosting on Azure App Service. The server can now operate in two modes:

1. **Local MCP Mode** (Original): Uses stdio transport for local MCP connections
2. **Remote Web Mode** (New): Exposes REST API endpoints for remote access

## 🚀 Quick Start

### Local Testing

```bash
# Build the project
npm run build

# Start the web server
npm start

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/info
```

### Azure Deployment

```bash
# Deploy via Azure CLI
az webapp create --resource-group eudr-mcp-rg --plan eudr-mcp-plan --name your-app-name --runtime "NODE|18-lts"
az webapp deployment source config-zip --resource-group eudr-mcp-rg --name your-app-name --src deployment.zip
```

## 📁 Files Created/Modified

### New Files:
- `src/web-server.ts` - HTTP REST API server
- `web.config` - Azure App Service configuration
- `deployment-guide.md` - Detailed deployment instructions
- `.github/workflows/deploy.yml` - GitHub Actions deployment
- `test-web-server.js` - Testing script
- `REMOTE-HOSTING-SETUP.md` - This file

### Modified Files:
- `package.json` - Added web server scripts and dependencies

## 🔧 API Endpoints

Once deployed, your server exposes these endpoints:

### Health & Information
- `GET /health` - Server health status
- `GET /info` - Server information and capabilities

### Resources
- `GET /resources` - List all EUDR documentation resources

### Tools (All POST requests)
- `POST /tools/query_endpoint` - Query EUDR API endpoints
- `POST /tools/get_examples` - Get request/response examples
- `POST /tools/validate_structure` - Validate XML/JSON structures
- `POST /tools/get_business_rules` - Get business rules
- `POST /tools/search_documentation` - Search across documentation

## 📋 Usage Examples

### Query EUDR Endpoints
```bash
curl -X POST https://your-app.azurewebsites.net/tools/query_endpoint \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"operation": "SubmitDDS"}}'
```

### Get Request Examples
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

### Validate Data Structure
```bash
curl -X POST https://your-app.azurewebsites.net/tools/validate_structure \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"data": "<xml>...</xml>", "operation": "SubmitDDS"}}'
```

## 🌐 Integration Options

### Option 1: Direct HTTP REST API

Use the REST endpoints directly from any programming language:

```javascript
// JavaScript/Node.js
const response = await fetch('https://your-app.azurewebsites.net/tools/query_endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    arguments: { operation: 'SubmitDDS' }
  })
});
const data = await response.json();
```

```python
# Python
import requests

response = requests.post(
    'https://your-app.azurewebsites.net/tools/query_endpoint',
    json={'arguments': {'operation': 'SubmitDDS'}}
)
data = response.json()
```

### Option 2: MCP Bridge (Custom Implementation)

Create a bridge that connects traditional MCP clients to the REST API:

```javascript
// Bridge example (conceptual)
class MCPWebBridge {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  
  async callTool(name, args) {
    const response = await fetch(`${this.baseUrl}/tools/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: args })
    });
    return response.json();
  }
}
```

## 🔐 Security Considerations

The current implementation is designed for development/testing. For production:

1. **Add Authentication**: 
   - API keys
   - OAuth 2.0
   - Azure AD integration

2. **Implement Rate Limiting**:
   - Prevent abuse
   - Control resource usage

3. **Configure CORS**:
   - Restrict origins
   - Set appropriate headers

4. **Enable HTTPS**:
   - Handled automatically by Azure App Service

## 📊 Monitoring & Scaling

### Application Insights
- Enable in Azure Portal → App Service → Application Insights
- Monitor performance, errors, and usage

### Auto-scaling
- Configure scaling rules based on CPU/memory usage
- Set minimum and maximum instance counts

### Cost Management
- Use Basic tier for development
- Standard/Premium for production
- Monitor costs with Azure Cost Management

## 🧪 Testing

### Local Testing
```bash
# Run the test script
node test-web-server.js
```

### Production Testing
```bash
# Health check
curl https://your-app.azurewebsites.net/health

# Full functionality test
curl -X POST https://your-app.azurewebsites.net/tools/search_documentation \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"query": "EUDR"}}'
```

## 🚀 Deployment Options

### 1. Azure CLI
```bash
az webapp create --resource-group eudr-mcp-rg --plan eudr-mcp-plan --name eudr-mcp-server --runtime "NODE|18-lts"
```

### 2. GitHub Actions
- Push to main branch triggers automatic deployment
- Requires `AZURE_WEBAPP_PUBLISH_PROFILE` secret

### 3. VS Code Extension
- Install Azure App Service extension
- Right-click → Deploy to Web App

### 4. Azure Portal
- Create App Service from portal
- Use deployment center for GitHub integration

## 📈 Architecture Benefits

### Remote Access
- ✅ Access from anywhere
- ✅ No local MCP server needed
- ✅ Centralized knowledge base
- ✅ Multiple simultaneous connections

### Scalability
- ✅ Auto-scaling capabilities
- ✅ Load balancing
- ✅ Global distribution
- ✅ High availability

### Maintenance
- ✅ Centralized updates
- ✅ Monitoring and logging
- ✅ Backup and recovery
- ✅ Version control

## 🎯 Next Steps

1. **Deploy to Azure**:
   - Choose deployment method
   - Configure environment variables
   - Test all endpoints

2. **Implement Security**:
   - Add authentication
   - Configure CORS
   - Set up rate limiting

3. **Add Monitoring**:
   - Enable Application Insights
   - Set up alerts
   - Configure logging

4. **Optimize Performance**:
   - Configure caching
   - Optimize knowledge base loading
   - Set up CDN if needed

5. **Integration**:
   - Create client libraries
   - Document API usage
   - Set up CI/CD pipeline

## 📞 Support

For issues or questions:
1. Check Azure App Service logs
2. Review deployment guide
3. Test endpoints locally first
4. Monitor Application Insights

Your EUDR MCP Server is now ready for remote hosting! 🎉
