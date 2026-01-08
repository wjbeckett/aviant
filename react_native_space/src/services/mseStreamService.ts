/**
 * MSE-like Streaming Service for React Native
 * 
 * This service replicates browser MSE functionality by:
 * 1. Connecting to go2rtc WebSocket MSE endpoint
 * 2. Receiving fMP4 (fragmented MP4) chunks
 * 3. Running a local HTTP server to serve the stream
 * 4. Allowing react-native-video to consume it
 * 
 * This enables H265 hardware decoding without transcoding!
 */

import TcpSocket from 'react-native-tcp-socket';
import { frigateApi } from './frigateApi';

interface MSEStreamConfig {
  cameraName: string;
  onReady?: (localUrl: string) => void;
  onError?: (error: Error) => void;
  onCodecInfo?: (mimeType: string) => void;
  onStats?: (stats: { bytesReceived: number; chunks: number }) => void;
}

interface ClientConnection {
  socket: any;
  headersSent: boolean;
}

export class MSEStreamService {
  private config: MSEStreamConfig;
  private webSocket: WebSocket | null = null;
  private httpServer: any = null;
  private serverPort: number = 9999;
  private isRunning: boolean = false;
  
  // Buffer for fMP4 data
  private initSegment: Uint8Array | null = null;
  private mediaBuffer: Uint8Array[] = [];
  private maxBufferSize = 50; // Keep last 50 chunks
  
  // Connected HTTP clients
  private clients: Map<number, ClientConnection> = new Map();
  private clientIdCounter = 0;
  
  // Stats
  private bytesReceived = 0;
  private chunksReceived = 0;
  private mimeType: string = '';

  constructor(config: MSEStreamConfig) {
    this.config = config;
  }

  async start(): Promise<string> {
    console.log('[MSE Service] Starting for camera:', this.config.cameraName);
    
    try {
      // Start HTTP server first
      await this.startHttpServer();
      
      // Then connect to go2rtc WebSocket
      await this.connectWebSocket();
      
      const localUrl = `http://127.0.0.1:${this.serverPort}/stream.mp4`;
      console.log('[MSE Service] Ready at:', localUrl);
      this.config.onReady?.(localUrl);
      
      return localUrl;
    } catch (error) {
      console.error('[MSE Service] Failed to start:', error);
      this.stop();
      throw error;
    }
  }

  stop(): void {
    console.log('[MSE Service] Stopping...');
    this.isRunning = false;
    
    // Close WebSocket
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }
    
    // Close all client connections
    this.clients.forEach((client) => {
      try {
        client.socket.destroy();
      } catch (e) {
        // Ignore
      }
    });
    this.clients.clear();
    
    // Stop HTTP server
    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch (e) {
        // Ignore
      }
      this.httpServer = null;
    }
    
    // Clear buffers
    this.initSegment = null;
    this.mediaBuffer = [];
    this.bytesReceived = 0;
    this.chunksReceived = 0;
    
    console.log('[MSE Service] Stopped');
  }

  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Try ports 9999-10010
      const tryPort = (port: number) => {
        if (port > 10010) {
          reject(new Error('No available port found'));
          return;
        }
        
        console.log('[MSE Service] Trying port:', port);
        
        const server = TcpSocket.createServer((socket: any) => {
          this.handleHttpClient(socket);
        });
        
        server.on('error', (error: any) => {
          console.log('[MSE Service] Port', port, 'failed:', error.message);
          server.close();
          tryPort(port + 1);
        });
        
        server.listen(
          { port, host: '127.0.0.1' },
          () => {
            console.log('[MSE Service] HTTP server listening on port:', port);
            this.serverPort = port;
            this.httpServer = server;
            this.isRunning = true;
            resolve();
          }
        );
      };
      
      tryPort(9999);
    });
  }

  private handleHttpClient(socket: any): void {
    const clientId = this.clientIdCounter++;
    let requestData = '';
    
    console.log('[MSE Service] New HTTP client connected:', clientId);
    
    socket.on('data', (data: Buffer) => {
      requestData += data.toString();
      
      // Check if we have a complete HTTP request
      if (requestData.includes('\r\n\r\n')) {
        const requestLine = requestData.split('\r\n')[0];
        console.log('[MSE Service] HTTP Request:', requestLine);
        
        if (requestLine.includes('GET /stream.mp4') || requestLine.includes('GET /stream')) {
          this.serveStream(socket, clientId);
        } else if (requestLine.includes('GET /status')) {
          this.serveStatus(socket);
        } else {
          // 404
          const response = 'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n';
          socket.write(response);
          socket.destroy();
        }
      }
    });
    
    socket.on('error', (error: any) => {
      console.log('[MSE Service] Client', clientId, 'error:', error.message);
      this.clients.delete(clientId);
    });
    
    socket.on('close', () => {
      console.log('[MSE Service] Client', clientId, 'disconnected');
      this.clients.delete(clientId);
    });
  }

  private serveStream(socket: any, clientId: number): void {
    console.log('[MSE Service] Serving stream to client:', clientId);
    
    // Send HTTP headers for chunked transfer
    const headers = [
      'HTTP/1.1 200 OK',
      'Content-Type: video/mp4',
      'Transfer-Encoding: chunked',
      'Connection: keep-alive',
      'Cache-Control: no-cache, no-store',
      'Access-Control-Allow-Origin: *',
      '',
      ''
    ].join('\r\n');
    
    socket.write(headers);
    
    // Track this client
    this.clients.set(clientId, {
      socket,
      headersSent: true
    });
    
    // Send init segment if we have it
    if (this.initSegment) {
      console.log('[MSE Service] Sending init segment to client:', clientId, 'size:', this.initSegment.length);
      this.sendChunkedData(socket, this.initSegment);
    }
    
    // Send buffered media chunks
    for (const chunk of this.mediaBuffer) {
      this.sendChunkedData(socket, chunk);
    }
  }

  private serveStatus(socket: any): void {
    const status = JSON.stringify({
      running: this.isRunning,
      camera: this.config.cameraName,
      mimeType: this.mimeType,
      bytesReceived: this.bytesReceived,
      chunksReceived: this.chunksReceived,
      clients: this.clients.size,
      hasInitSegment: this.initSegment !== null,
      bufferSize: this.mediaBuffer.length
    });
    
    const response = [
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      `Content-Length: ${status.length}`,
      '',
      status
    ].join('\r\n');
    
    socket.write(response);
    socket.destroy();
  }

  private sendChunkedData(socket: any, data: Uint8Array): void {
    try {
      // HTTP chunked transfer encoding format:
      // <size in hex>\r\n
      // <data>\r\n
      const sizeHex = data.length.toString(16);
      socket.write(sizeHex + '\r\n');
      // react-native-tcp-socket accepts Uint8Array directly
      socket.write(data);
      socket.write('\r\n');
    } catch (error) {
      console.error('[MSE Service] Error sending chunk:', error);
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const baseUrl = frigateApi.getBaseUrl();
      const token = frigateApi.getJWTToken();
      
      // Convert HTTP to WS URL
      const wsBase = baseUrl.replace(/^http/, 'ws');
      const wsUrl = `${wsBase}/api/go2rtc/api/ws?src=${encodeURIComponent(this.config.cameraName)}`;
      
      console.log('[MSE Service] Connecting to WebSocket:', wsUrl);
      
      this.webSocket = new WebSocket(wsUrl);
      this.webSocket.binaryType = 'arraybuffer';
      
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
      
      this.webSocket.onopen = () => {
        console.log('[MSE Service] WebSocket connected, requesting MSE stream');
        // Request MSE stream type
        this.webSocket?.send(JSON.stringify({ type: 'mse' }));
      };
      
      this.webSocket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          // JSON message
          try {
            const message = JSON.parse(event.data);
            console.log('[MSE Service] Received message:', message.type, message.value?.substring?.(0, 50));
            
            if (message.type === 'mse') {
              // Codec info received
              this.mimeType = message.value;
              console.log('[MSE Service] Codec info:', this.mimeType);
              this.config.onCodecInfo?.(this.mimeType);
              
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve();
              }
            } else if (message.type === 'error') {
              console.error('[MSE Service] Server error:', message.value);
              this.config.onError?.(new Error(message.value));
            }
          } catch (e) {
            console.error('[MSE Service] Failed to parse message:', e);
          }
        } else if (event.data instanceof ArrayBuffer) {
          // Binary fMP4 data
          this.handleFMP4Data(new Uint8Array(event.data));
        }
      };
      
      this.webSocket.onerror = (error) => {
        console.error('[MSE Service] WebSocket error:', error);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('WebSocket connection failed'));
        }
      };
      
      this.webSocket.onclose = (event) => {
        console.log('[MSE Service] WebSocket closed:', event.code, event.reason);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`WebSocket closed: ${event.reason}`));
        }
      };
    });
  }

  private handleFMP4Data(data: Uint8Array): void {
    this.bytesReceived += data.length;
    this.chunksReceived++;
    
    // Check if this is an init segment (starts with 'ftyp' box)
    // ftyp box signature: 0x66 0x74 0x79 0x70 at offset 4
    if (data.length > 8 && 
        data[4] === 0x66 && data[5] === 0x74 && 
        data[6] === 0x79 && data[7] === 0x70) {
      console.log('[MSE Service] Received init segment, size:', data.length);
      this.initSegment = data;
      
      // Send to all connected clients
      this.broadcastToClients(data);
      return;
    }
    
    // Regular media segment - add to buffer
    this.mediaBuffer.push(data);
    
    // Trim buffer if too large
    while (this.mediaBuffer.length > this.maxBufferSize) {
      this.mediaBuffer.shift();
    }
    
    // Broadcast to all clients
    this.broadcastToClients(data);
    
    // Report stats periodically
    if (this.chunksReceived % 30 === 0) {
      this.config.onStats?.({
        bytesReceived: this.bytesReceived,
        chunks: this.chunksReceived
      });
    }
  }

  private broadcastToClients(data: Uint8Array): void {
    this.clients.forEach((client, clientId) => {
      try {
        if (client.headersSent) {
          this.sendChunkedData(client.socket, data);
        }
      } catch (error) {
        console.error('[MSE Service] Failed to send to client', clientId, error);
        this.clients.delete(clientId);
      }
    });
  }

  // Utility to get current stats
  getStats() {
    return {
      running: this.isRunning,
      mimeType: this.mimeType,
      bytesReceived: this.bytesReceived,
      chunksReceived: this.chunksReceived,
      connectedClients: this.clients.size,
      hasInitSegment: this.initSegment !== null,
      bufferSize: this.mediaBuffer.length,
      serverPort: this.serverPort
    };
  }
}

// Factory function for easy use
export const createMSEStream = (config: MSEStreamConfig): MSEStreamService => {
  return new MSEStreamService(config);
};
