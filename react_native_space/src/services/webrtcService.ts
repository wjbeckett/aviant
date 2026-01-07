/**
 * WebRTC Service for go2rtc Integration (WebSocket Signaling)
 * 
 * go2rtc WebSocket protocol uses specific message format:
 * - {"type": "webrtc/offer", "value": "SDP string"}
 * - {"type": "webrtc/answer", "value": "SDP string"}
 * - {"type": "webrtc/candidate", "value": "candidate string"}
 */

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
} from 'react-native-webrtc';
import { frigateApi } from './frigateApi';
import * as Sentry from '@sentry/react-native';

export interface WebRTCConnectionConfig {
  cameraName: string;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: string) => void;
  onError?: (error: Error) => void;
  onCodecError?: (error: Error) => void;  // Specific callback for codec mismatch
}

export class WebRTCConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private webSocket: WebSocket | null = null;
  private config: WebRTCConnectionConfig;
  private baseUrl: string;
  private isConnecting: boolean = false;
  
  constructor(config: WebRTCConnectionConfig) {
    this.config = config;
    this.baseUrl = frigateApi.getBaseUrl();
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('[WebRTC] Already connecting, skipping...');
      return;
    }
    
    this.isConnecting = true;
    
    try {
      console.log('[WebRTC] Starting WebSocket signaling for camera:', this.config.cameraName);
      
      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      this.setupPeerConnectionHandlers();
      
      // Open WebSocket first
      await this.openWebSocket();
      
      // Create offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      console.log('[WebRTC] Created SDP offer');
      await this.peerConnection.setLocalDescription(offer);
      
      // Send offer immediately via WebSocket (go2rtc format)
      this.sendWebSocketMessage({
        type: 'webrtc/offer',
        value: offer.sdp,
      });
      
      console.log('[WebRTC] Sent offer via WebSocket, awaiting answer...');
    } catch (error) {
      this.isConnecting = false;
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[WebRTC] Connection failed:', err);
      Sentry.captureException(err);
      this.config.onError?.(err);
      throw err;
    }
  }

  private async openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl
        .replace('https://', 'wss://')
        .replace('http://', 'ws://');
      
      const fullUrl = `${wsUrl}/api/go2rtc/api/ws?src=${encodeURIComponent(this.config.cameraName)}`;
      console.log('[WebRTC] Opening WebSocket:', fullUrl);
      
      this.webSocket = new WebSocket(fullUrl);
      
      this.webSocket.onopen = () => {
        console.log('[WebRTC] WebSocket connected');
        resolve();
      };
      
      this.webSocket.onerror = (event: any) => {
        console.error('[WebRTC] WebSocket error:', event.message || event);
        reject(new Error('WebSocket connection failed'));
      };
      
      this.webSocket.onclose = (event) => {
        console.log('[WebRTC] WebSocket closed:', event.code, event.reason);
      };
      
      this.webSocket.onmessage = (event) => {
        this.handleWebSocketMessage(event.data);
      };
      
      setTimeout(() => {
        if (this.webSocket?.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private handleWebSocketMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      console.log('[WebRTC] Received WS message:', message.type);
      
      switch (message.type) {
        case 'webrtc/answer':
          this.handleAnswer(message.value);
          break;
        case 'webrtc/candidate':
          this.handleRemoteCandidate(message.value);
          break;
        case 'error':
          console.error('[WebRTC] Server error:', message.value);
          const errorMsg = message.value as string;
          // Detect codec mismatch errors (H265 not supported)
          if (errorMsg.includes('codecs not matched') || errorMsg.includes('H265')) {
            console.log('[WebRTC] Codec mismatch detected - triggering fallback');
            this.config.onCodecError?.(new Error(errorMsg));
          } else {
            this.config.onError?.(new Error(errorMsg));
          }
          break;
        default:
          console.log('[WebRTC] Unknown message type:', message.type, message);
      }
    } catch (error) {
      console.error('[WebRTC] Failed to parse WS message:', error, data);
    }
  }

  private async handleAnswer(sdp: string): Promise<void> {
    try {
      console.log('[WebRTC] Received SDP answer, length:', sdp.length);
      
      if (!this.peerConnection) {
        throw new Error('PeerConnection not initialized');
      }
      
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp })
      );
      console.log('[WebRTC] Remote description set successfully');
      this.isConnecting = false;
    } catch (error) {
      console.error('[WebRTC] Failed to set remote description:', error);
      this.config.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async handleRemoteCandidate(candidateStr: string): Promise<void> {
    try {
      if (!this.peerConnection || !candidateStr) return;
      
      console.log('[WebRTC] Adding remote ICE candidate');
      const candidate = new RTCIceCandidate({
        candidate: candidateStr,
        sdpMid: '0',
        sdpMLineIndex: 0,
      });
      await this.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error('[WebRTC] Failed to add remote candidate:', error);
    }
  }

  private sendWebSocketMessage(message: object): void {
    if (this.webSocket?.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(message);
      console.log('[WebRTC] Sending WS message type:', (message as any).type);
      this.webSocket.send(json);
    } else {
      console.error('[WebRTC] WebSocket not open, cannot send message');
    }
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return;

    // Handle remote tracks
    (this.peerConnection as any).addEventListener('track', (event: any) => {
      console.log('[WebRTC] Received remote track:', event.track?.kind);
      if (event.streams && event.streams[0]) {
        console.log('[WebRTC] ✅ Remote stream ready!');
        this.config.onRemoteStream?.(event.streams[0]);
      }
    });

    // Send local ICE candidates (go2rtc format)
    (this.peerConnection as any).addEventListener('icecandidate', (event: any) => {
      if (event.candidate) {
        console.log('[WebRTC] Sending local ICE candidate');
        this.sendWebSocketMessage({
          type: 'webrtc/candidate',
          value: event.candidate.candidate,
        });
      }
    });

    // Connection state changes
    (this.peerConnection as any).addEventListener('connectionstatechange', () => {
      const state = (this.peerConnection as any)?.connectionState || 'unknown';
      console.log('[WebRTC] Connection state:', state);
      this.config.onConnectionStateChange?.(state);

      if (state === 'connected') {
        console.log('[WebRTC] ✅ Connection established!');
        this.isConnecting = false;
      } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        console.error('[WebRTC] Connection failed or closed');
        this.config.onError?.(new Error(`Connection ${state}`));
      }
    });

    // ICE connection state
    (this.peerConnection as any).addEventListener('iceconnectionstatechange', () => {
      const state = this.peerConnection?.iceConnectionState || 'unknown';
      console.log('[WebRTC] ICE connection state:', state);
      
      if (state === 'connected' || state === 'completed') {
        console.log('[WebRTC] ✅ ICE connected!');
      } else if (state === 'failed') {
        console.error('[WebRTC] ICE connection failed');
        this.config.onError?.(new Error('ICE connection failed'));
      }
    });
  }

  disconnect(): void {
    console.log('[WebRTC] Disconnecting...');
    this.isConnecting = false;
    
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  getConnectionState(): string {
    return (this.peerConnection as any)?.connectionState || 'closed';
  }
}

export default {
  createConnection: (config: WebRTCConnectionConfig) => new WebRTCConnection(config),
};
