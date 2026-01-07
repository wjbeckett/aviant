/**
 * WebRTC Service for go2rtc Integration
 * 
 * Handles WebRTC peer connection setup and signaling with go2rtc.
 * go2rtc provides low-latency (<500ms) live camera streams with audio.
 */

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import frigateApi from './frigateApi';
import * as Sentry from '@sentry/react-native';

export interface WebRTCConnectionConfig {
  cameraName: string;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: string) => void;
  onError?: (error: Error) => void;
}

export class WebRTCConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private config: WebRTCConnectionConfig;
  private baseUrl: string;
  
  constructor(config: WebRTCConnectionConfig) {
    this.config = config;
    this.baseUrl = frigateApi.getBaseUrl();
  }

  async connect(): Promise<void> {
    try {
      console.log('[WebRTC] Starting connection for camera:', this.config.cameraName);
      
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      this.setupEventHandlers();

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      console.log('[WebRTC] Created SDP offer');
      await this.peerConnection.setLocalDescription(offer);

      const answer = await this.sendOfferToGo2RTC(offer.sdp!);
      
      console.log('[WebRTC] Received SDP answer from go2rtc');
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: answer })
      );

      console.log('[WebRTC] Connection setup complete');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[WebRTC] Connection failed:', err);
      Sentry.captureException(err, {
        tags: { component: 'WebRTC', camera: this.config.cameraName },
      });
      this.config.onError?.(err);
      throw err;
    }
  }

  private async sendOfferToGo2RTC(offerSdp: string): Promise<string> {
    const url = `${this.baseUrl}/api/webrtc?src=${this.config.cameraName}`;
    console.log('[WebRTC] Sending offer to go2rtc:', url);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `frigate_token=${frigateApi.getJWTToken()}`,
        },
        body: JSON.stringify({
          type: 'offer',
          sdp: offerSdp,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`go2rtc signaling failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (data.type !== 'answer' || !data.sdp) {
        throw new Error('Invalid SDP answer from go2rtc');
      }

      return data.sdp;
    } catch (error) {
      console.error('[WebRTC] Signaling error:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.peerConnection) return;

    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        console.log('[WebRTC] Remote stream ready!');
        this.config.onRemoteStream?.(event.streams[0]);
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate:', event.candidate.candidate);
      } else {
        console.log('[WebRTC] ICE gathering complete');
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState || 'unknown';
      console.log('[WebRTC] Connection state:', state);
      this.config.onConnectionStateChange?.(state);

      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        console.error('[WebRTC] Connection failed or closed');
        this.config.onError?.(new Error(`Connection ${state}`));
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState || 'unknown';
      console.log('[WebRTC] ICE connection state:', state);
      
      if (state === 'failed') {
        console.error('[WebRTC] ICE connection failed');
        this.config.onError?.(new Error('ICE connection failed'));
      }
    };
  }

  disconnect(): void {
    console.log('[WebRTC] Disconnecting...');
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  getConnectionState(): string {
    return this.peerConnection?.connectionState || 'closed';
  }
}

export default {
  createConnection: (config: WebRTCConnectionConfig) => new WebRTCConnection(config),
};
