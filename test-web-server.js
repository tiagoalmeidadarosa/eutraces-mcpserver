// Simple test script for the web server
import fetch from 'node-fetch';
import { spawn } from 'child_process';

const SERVER_URL = 'http://localhost:3000';

async function testEndpoint(path, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${SERVER_URL}${path}`, options);
    const data = await response.json();
    
    console.log(`✓ ${method} ${path}:`, response.status);
    console.log('  Response:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
    return data;
  } catch (error) {
    console.error(`✗ ${method} ${path}:`, error.message);
    return null;
  }
}

async function runTests() {
  console.log('Testing EUDR MCP Web Server...\n');
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test health endpoint
  await testEndpoint('/health');
  
  // Test info endpoint
  await testEndpoint('/info');
  
  // Test resources endpoint
  await testEndpoint('/resources');
  
  // Test tools
  await testEndpoint('/tools/query_endpoint', 'POST', {
    arguments: { operation: 'SubmitDDS' }
  });
  
  await testEndpoint('/tools/get_examples', 'POST', {
    arguments: { operation: 'EchoService', type: 'request' }
  });
  
  await testEndpoint('/tools/search_documentation', 'POST', {
    arguments: { query: 'geolocation' }
  });
  
  console.log('\nTests completed!');
}

// Start server and run tests
console.log('Starting web server...');
const server = spawn('node', ['build/web-server.js'], { stdio: 'inherit' });

// Run tests after a delay
setTimeout(runTests, 3000);

// Clean up
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.kill();
  process.exit(0);
});
