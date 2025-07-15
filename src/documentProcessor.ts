import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXML = promisify(parseString);

export interface DocumentContent {
  filename: string;
  title: string;
  content: string;
  type: 'docx' | 'xml' | 'pdf';
  category: string;
  metadata: {
    size: number;
    modified: Date;
    path: string;
  };
}

export interface ProcessedKnowledge {
  documents: DocumentContent[];
  endpoints: EndpointInfo[];
  examples: ExampleInfo[];
  rules: RuleInfo[];
}

export interface EndpointInfo {
  name: string;
  description: string;
  method: string;
  url: string;
  requestExample?: string;
  responseExample?: string;
  category: string;
  source: string;
}

export interface ExampleInfo {
  name: string;
  type: 'request' | 'response';
  content: string;
  operation: string;
  source: string;
}

export interface RuleInfo {
  name: string;
  description: string;
  category: string;
  source: string;
}

export class DocumentProcessor {
  private documentsPath: string;
  private knowledge: ProcessedKnowledge;

  constructor(documentsPath: string) {
    this.documentsPath = documentsPath;
    this.knowledge = {
      documents: [],
      endpoints: [],
      examples: [],
      rules: []
    };
  }

  async processAllDocuments(): Promise<ProcessedKnowledge> {
    const files = this.getAllFiles(this.documentsPath);
    
    for (const filePath of files) {
      try {
        const doc = await this.processDocument(filePath);
        if (doc) {
          this.knowledge.documents.push(doc);
          this.extractStructuredInfo(doc);
        }
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
      }
    }

    return this.knowledge;
  }

  private getAllFiles(dirPath: string): string[] {
    const files: string[] = [];
    
    if (!fs.existsSync(dirPath)) {
      return files;
    }

    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else if (this.isSupportedFile(item)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private isSupportedFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.docx', '.xml', '.pdf'].includes(ext);
  }

  private async processDocument(filePath: string): Promise<DocumentContent | null> {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);
    
    let content = '';
    let type: 'docx' | 'xml' | 'pdf';
    
    try {
      switch (ext) {
        case '.docx':
          type = 'docx';
          content = await this.processDOCX(filePath);
          break;
        case '.xml':
          type = 'xml';
          content = await this.processXML(filePath);
          break;
        case '.pdf':
          type = 'pdf';
          content = await this.processPDF(filePath);
          break;
        default:
          return null;
      }

      return {
        filename,
        title: this.extractTitle(filename, content),
        content,
        type,
        category: this.categorizeDocument(filename),
        metadata: {
          size: stat.size,
          modified: stat.mtime,
          path: filePath
        }
      };
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error);
      return null;
    }
  }

  private async processDOCX(filePath: string): Promise<string> {
    try {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error(`Error processing DOCX ${filePath}:`, error);
      return `Error processing DOCX: ${filePath}`;
    }
  }

  private async processXML(filePath: string): Promise<string> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      try {
        const parsed = await parseXML(content);
        return JSON.stringify(parsed, null, 2);
      } catch (error) {
        // If XML parsing fails, return as plain text
        return content;
      }
    } catch (error) {
      console.error(`Error processing XML ${filePath}:`, error);
      return `Error processing XML: ${filePath}`;
    }
  }

  private async processPDF(filePath: string): Promise<string> {
    try {
      const buffer = fs.readFileSync(filePath);
      const uint8Array = new Uint8Array(buffer);
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;
      let text = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        text += pageText + '\n';
      }
      
      return text;
    } catch (error) {
      console.error(`Error processing PDF ${filePath}:`, error);
      return `Error processing PDF: ${filePath}`;
    }
  }

  private extractTitle(filename: string, content: string): string {
    // Try to extract title from filename
    let title = filename.replace(/\.[^/.]+$/, ""); // Remove extension
    
    // Look for title patterns in content
    const titlePatterns = [
      /^#\s*(.+)$/m,  // Markdown title
      /^Title:\s*(.+)$/m,  // Title: format
      /^(.+)\n={3,}$/m,  // Underlined title
    ];
    
    for (const pattern of titlePatterns) {
      const match = content.match(pattern);
      if (match) {
        title = match[1].trim();
        break;
      }
    }
    
    return title;
  }

  private categorizeDocument(filename: string): string {
    const lower = filename.toLowerCase();
    
    if (lower.includes('cf1')) return 'Basic Connectivity';
    if (lower.includes('cf2')) return 'Submit DDS';
    if (lower.includes('cf3')) return 'Retrieve DDS Status';
    if (lower.includes('cf4')) return 'Error Conditions';
    if (lower.includes('cf5')) return 'Amend DDS';
    if (lower.includes('cf6')) return 'Retract DDS';
    if (lower.includes('cf7')) return 'Retrieve Referenced DDS';
    if (lower.includes('validation')) return 'Validation Rules';
    if (lower.includes('specification')) return 'API Specifications';
    if (lower.includes('development')) return 'Development Options';
    if (lower.includes('geojson')) return 'GeoJSON';
    if (lower.includes('python')) return 'Python Examples';
    if (lower.includes('request')) return 'Request Examples';
    if (lower.includes('response')) return 'Response Examples';
    
    return 'General';
  }

  private extractStructuredInfo(doc: DocumentContent) {
    this.extractEndpoints(doc);
    this.extractExamples(doc);
    this.extractRules(doc);
  }

  private extractEndpoints(doc: DocumentContent) {
    const content = doc.content;
    
    // Extract endpoint information from content
    const endpointPatterns = [
      /(?:POST|GET|PUT|DELETE)\s+([^\s]+)/g,
      /endpoint[:\s]+([^\s]+)/gi,
      /url[:\s]+([^\s]+)/gi,
    ];
    
    for (const pattern of endpointPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const endpoint = match[1];
        if (endpoint && endpoint.includes('/')) {
          this.knowledge.endpoints.push({
            name: this.extractOperationName(endpoint, doc.category),
            description: this.extractEndpointDescription(content, endpoint),
            method: this.extractMethod(content, endpoint),
            url: endpoint,
            category: doc.category,
            source: doc.filename
          });
        }
      }
    }
  }

  private extractExamples(doc: DocumentContent) {
    if (doc.type === 'xml') {
      const isRequest = doc.filename.toLowerCase().includes('request');
      const isResponse = doc.filename.toLowerCase().includes('response');
      
      if (isRequest || isResponse) {
        this.knowledge.examples.push({
          name: doc.title,
          type: isRequest ? 'request' : 'response',
          content: doc.content,
          operation: this.extractOperationFromFilename(doc.filename),
          source: doc.filename
        });
      }
    }
  }

  private extractRules(doc: DocumentContent) {
    if (doc.category === 'Validation Rules') {
      // Extract validation rules from content
      const rulePatterns = [
        /rule[:\s]+([^\n]+)/gi,
        /validation[:\s]+([^\n]+)/gi,
        /must[:\s]+([^\n]+)/gi,
        /should[:\s]+([^\n]+)/gi,
      ];
      
      for (const pattern of rulePatterns) {
        let match;
        while ((match = pattern.exec(doc.content)) !== null) {
          this.knowledge.rules.push({
            name: match[1].trim(),
            description: match[1].trim(),
            category: 'Validation',
            source: doc.filename
          });
        }
      }
    }
  }

  private extractOperationName(endpoint: string, category: string): string {
    const parts = endpoint.split('/');
    const lastPart = parts[parts.length - 1];
    return `${category} - ${lastPart}`;
  }

  private extractEndpointDescription(content: string, endpoint: string): string {
    const lines = content.split('\n');
    const endpointLine = lines.findIndex(line => line.includes(endpoint));
    
    if (endpointLine >= 0) {
      // Look for description in surrounding lines
      for (let i = Math.max(0, endpointLine - 3); i < Math.min(lines.length, endpointLine + 3); i++) {
        const line = lines[i].trim();
        if (line && !line.includes(endpoint) && line.length > 20) {
          return line;
        }
      }
    }
    
    return `${endpoint} endpoint`;
  }

  private extractMethod(content: string, endpoint: string): string {
    const methodMatch = content.match(new RegExp(`(POST|GET|PUT|DELETE)\\s+${endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
    return methodMatch ? methodMatch[1].toUpperCase() : 'POST';
  }

  private extractOperationFromFilename(filename: string): string {
    const lower = filename.toLowerCase();
    
    if (lower.includes('echo')) return 'EchoService';
    if (lower.includes('submit')) return 'SubmitDDS';
    if (lower.includes('retrieve')) return 'RetrieveDDS';
    if (lower.includes('amend')) return 'AmendDDS';
    if (lower.includes('retract')) return 'RetractDDS';
    if (lower.includes('statement')) return 'GetStatement';
    
    return 'Unknown';
  }

  async saveKnowledge(outputPath: string): Promise<void> {
    const knowledgeJson = JSON.stringify(this.knowledge, null, 2);
    fs.writeFileSync(outputPath, knowledgeJson);
  }

  getKnowledge(): ProcessedKnowledge {
    return this.knowledge;
  }
}
