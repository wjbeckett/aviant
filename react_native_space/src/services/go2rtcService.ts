/**
 * go2rtc Service
 * 
 * Utility functions for interacting with Frigate's go2rtc streaming component.
 * go2rtc provides multiple streaming protocols:
 * - RTSP: rtsp://host:8554/camera (low latency, Android native support)
 * - HLS: /api/hls/camera/index.m3u8 (universal, iOS/Android)
 * - WebRTC: /api/ws (lowest latency, complex)
 * - MSE: /api/ws (low latency, Chrome/Edge only)
 */

import { frigateApi } from './frigateApi';

export interface Go2RTCStream {
  name: string;
  available: boolean;
  protocols: {
    rtsp: boolean;
    hls: boolean;
    webrtc: boolean;
    mse: boolean;
  };
}

export interface Go2RTCConfig {
  enabled: boolean;
  streams: Go2RTCStream[];
}

class Go2RTCService {
  private baseUrl: string = '';
  private configCache: Go2RTCConfig | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor() {
    this.baseUrl = frigateApi.getBaseUrl();
  }

  /**
   * Check if go2rtc is available on this Frigate instance
   */
  async isAvailable(): Promise<boolean> {
    try {
      const token = frigateApi.getJWTToken();
      const response = await fetch(`${this.baseUrl}/api/go2rtc/streams`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.ok;
    } catch (error) {
      console.error('[go2rtc] Availability check failed:', error);
      return false;
    }
  }

  /**
   * Get available streams from go2rtc
   */
  async getStreams(): Promise<string[]> {
    try {
      const token = frigateApi.getJWTToken();
      const response = await fetch(`${this.baseUrl}/api/go2rtc/streams`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        console.error('[go2rtc] Failed to fetch streams:', response.status);
        return [];
      }
      
      const data = await response.json();
      return Object.keys(data);
    } catch (error) {
      console.error('[go2rtc] Failed to get streams:', error);
      return [];
    }
  }

  /**
   * Get RTSP URL for a camera
   * Format: rtsp://host:8554/camera_name
   */
  getRTSPUrl(cameraName: string): string {
    // Remove protocol from baseUrl (https:// or http://)
    const host = this.baseUrl.replace(/^https?:\/\//, '');
    return `rtsp://${host}:8554/${cameraName}`;
  }

  /**
   * Get HLS URL for a camera
   * Format: https://host/api/hls/camera_name/index.m3u8
   * 
   * Supports Low-Latency HLS (LL-HLS) for reduced latency:
   * - Standard HLS: 10-30 second latency
   * - LL-HLS: 2-3 second latency
   * 
   * @param cameraName - Camera identifier
   * @param lowLatency - Enable Low-Latency HLS mode (default: true)
   * @returns HLS stream URL with authentication token
   */
  getHLSUrl(cameraName: string, lowLatency: boolean = true): string {
    const token = frigateApi.getJWTToken();
    // Add LL-HLS parameter for lowest latency (2-3 seconds vs 10-30 seconds)
    const llParam = lowLatency ? '&ll=true' : '';
    return `${this.baseUrl}/api/hls/${cameraName}/index.m3u8?token=${token}${llParam}`;
  }

  /**
   * Get WebRTC WebSocket URL for a camera
   * Format: wss://host/api/ws?src=camera_name
   */
  getWebRTCUrl(cameraName: string): string {
    const wsProtocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.baseUrl.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${host}/api/ws?src=${cameraName}`;
  }

  /**
   * Get configuration with caching
   */
  async getConfig(): Promise<Go2RTCConfig> {
    // Return cached config if still valid
    if (this.configCache && Date.now() < this.cacheExpiry) {
      return this.configCache;
    }

    const available = await this.isAvailable();
    
    if (!available) {
      const config: Go2RTCConfig = {
        enabled: false,
        streams: [],
      };
      this.configCache = config;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      return config;
    }

    const streamNames = await this.getStreams();
    const streams: Go2RTCStream[] = streamNames.map(name => ({
      name,
      available: true,
      protocols: {
        rtsp: true, // Assume all streams support RTSP
        hls: true,  // Assume all streams support HLS
        webrtc: true,
        mse: true,
      },
    }));

    const config: Go2RTCConfig = {
      enabled: true,
      streams,
    };

    this.configCache = config;
    this.cacheExpiry = Date.now() + this.CACHE_TTL;
    
    return config;
  }

  /**
   * Test if a specific stream URL is working
   */
  async testStream(cameraName: string, protocol: 'rtsp' | 'hls'): Promise<boolean> {
    try {
      if (protocol === 'hls') {
        const url = this.getHLSUrl(cameraName);
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
      }
      // RTSP can't be tested with HTTP requests
      return true;
    } catch (error) {
      console.error(`[go2rtc] Failed to test ${protocol} stream:`, error);
      return false;
    }
  }
}

export const go2rtcService = new Go2RTCService();
