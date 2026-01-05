import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

// CookieManager only works on native platforms (iOS/Android), not web
let CookieManager: any = null;
if (Platform.OS !== 'web') {
  try {
    CookieManager = require('@react-native-cookies/cookies').default;
  } catch (error) {
    console.warn('CookieManager not available:', error);
  }
}

const FRIGATE_URL_KEY = 'frigate_url';
const FRIGATE_USERNAME_KEY = 'frigate_username';
const FRIGATE_PASSWORD_KEY = 'frigate_password';
const FRIGATE_JWT_TOKEN_KEY = 'frigate_jwt_token';

export interface FrigateConfig {
  cameras: Record<string, any>;
}

export interface Camera {
  name: string;
  enabled: boolean;
}

export interface Event {
  id: string;
  camera: string;
  label: string;
  start_time: number;
  end_time: number | null;
  has_clip: boolean;
  has_snapshot: boolean;
  thumbnail?: string;
}

interface LoginResponse {
  access_token?: string;
  token?: string;
}

class FrigateApiService {
  private client: AxiosInstance | null = null;
  private baseUrl: string = '';
  private jwtToken: string | null = null;
  private username: string = '';
  private password: string = '';

  async login(
    username: string, 
    password: string, 
    frigateUrl: string
  ): Promise<void> {
    try {
      this.username = username;
      this.password = password;
      this.baseUrl = frigateUrl.replace(/\/$/, '');

      console.log('[FrigateAPI] Attempting login to:', `${this.baseUrl}/api/login`);
      console.log('[FrigateAPI] Username:', username);
      
      try {
        const response = await axios.post(
          `${this.baseUrl}/api/login`,
          { user: username, password },
          { 
            timeout: 10000,
            withCredentials: true,
            headers: {
              'Content-Type': 'application/json',
            }
          }
        );

        console.log('[FrigateAPI] Login response status:', response.status);
        console.log('[FrigateAPI] Login response data:', JSON.stringify(response.data));
        
        // Frigate returns JWT in a cookie called "frigate_token"
        let token = null;
        
        // On native platforms (iOS/Android), use CookieManager to access cookies
        if (CookieManager && Platform.OS !== 'web') {
          try {
            const urlObj = new URL(this.baseUrl);
            const cookies = await CookieManager.get(urlObj.origin);
            console.log('[FrigateAPI] All cookies:', JSON.stringify(cookies, null, 2));
            
            // Extract the frigate_token cookie
            if (cookies.frigate_token) {
              token = cookies.frigate_token.value;
              console.log('[FrigateAPI] Found frigate_token cookie (length:', token.length, ')');
            }
          } catch (cookieError) {
            console.error('[FrigateAPI] Error reading cookies:', cookieError);
          }
        }
        
        // On web or if CookieManager failed, try to extract token from response body
        if (!token) {
          token = response.data?.access_token || 
                  response.data?.token || 
                  response.data?.jwt ||
                  response.data?.accessToken;
          
          if (token) {
            console.log('[FrigateAPI] Found token in response body (length:', token.length, ')');
          } else {
            // On web, cookies are automatically managed by the browser
            // We'll assume authentication succeeded if we got a 200 response
            if (Platform.OS === 'web') {
              console.log('[FrigateAPI] Web platform: cookies managed by browser, assuming auth successful');
              // Create a dummy token for web (won't be used, cookies handle auth)
              token = 'web-cookie-auth';
            }
          }
        }
        
        if (!token) {
          const errorMsg = 'No authentication token received from Frigate';
          console.error('[FrigateAPI]', errorMsg);
          console.error('[FrigateAPI] Response data:', JSON.stringify(response.data, null, 2));
          Sentry.captureMessage(errorMsg, {
            level: 'error',
            extra: { 
              response: response.data,
              frigateUrl: this.baseUrl
            }
          });
          throw new Error(errorMsg);
        }
        
        console.log('[FrigateAPI] Successfully extracted token (length:', token.length, ')');

        this.jwtToken = token;

        // Store credentials securely
        await SecureStore.setItemAsync(FRIGATE_URL_KEY, this.baseUrl);
        await SecureStore.setItemAsync(FRIGATE_USERNAME_KEY, username);
        await SecureStore.setItemAsync(FRIGATE_PASSWORD_KEY, password);
        await SecureStore.setItemAsync(FRIGATE_JWT_TOKEN_KEY, token);

        // Create axios instance with JWT token
        this.client = axios.create({
          baseURL: this.baseUrl,
          timeout: 30000,
          headers: {
            'Authorization': `Bearer ${this.jwtToken}`,
          },
          withCredentials: true,
        });

        console.log('[FrigateAPI] Testing connection with /api/config...');
        await this.getConfig();
        console.log('[FrigateAPI] Login successful!');
        
      } catch (loginError: any) {
        console.error('[FrigateAPI] Login failed:', loginError.response?.status, loginError.message);
        
        // Check what kind of error we got
        if (loginError.response?.status === 401) {
          throw new Error('Invalid username or password');
        } else {
          throw loginError;
        }
      }

    } catch (error: any) {
      console.error('[FrigateAPI] Login error:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
      });
      
      // Log to Sentry
      Sentry.captureException(error, {
        tags: { feature: 'login' },
        extra: { 
          frigateUrl: this.baseUrl,
          errorCode: error.code,
          statusCode: error.response?.status,
        }
      });
      
      // Provide user-friendly error messages
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('Invalid username or password');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot reach Frigate. Check if it's running and URLs are correct.`);
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        throw new Error(`Connection timeout. Check your network and Frigate URLs.`);
      } else if (error.message?.includes('Network Error') || error.message?.includes('Network request failed')) {
        throw new Error(`Network error. Check your Frigate URLs and network connection.`);
      } else {
        throw new Error(error.message || 'Login failed. Check console for details.');
      }
    }
  }

  async restoreSession(): Promise<boolean> {
    try {
      const url = await SecureStore.getItemAsync(FRIGATE_URL_KEY);
      const username = await SecureStore.getItemAsync(FRIGATE_USERNAME_KEY);
      const password = await SecureStore.getItemAsync(FRIGATE_PASSWORD_KEY);
      const token = await SecureStore.getItemAsync(FRIGATE_JWT_TOKEN_KEY);

      if (!token || !url) return false;

      this.baseUrl = url;
      this.username = username || '';
      this.password = password || '';
      this.jwtToken = token;

      // Create axios instance with stored JWT
      this.client = axios.create({
        baseURL: this.baseUrl,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`,
        },
        withCredentials: true,
      });

      // Test if token is still valid
      try {
        await this.getConfig();
        return true;
      } catch (error: any) {
        // Token expired or invalid, try to re-login if we have credentials
        if (username && password && url) {
          await this.login(username, password, url);
          return true;
        }
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async clearSession(): Promise<void> {
    // Clear cookies (native platforms only)
    if (CookieManager && this.baseUrl && Platform.OS !== 'web') {
      try {
        const urlObj = new URL(this.baseUrl);
        await CookieManager.clearByName(urlObj.origin, 'frigate_token');
        console.log('[FrigateAPI] Cleared frigate_token cookie');
      } catch (error) {
        console.error('[FrigateAPI] Error clearing cookies:', error);
      }
    }
    
    // Clear stored credentials
    await SecureStore.deleteItemAsync(FRIGATE_URL_KEY);
    await SecureStore.deleteItemAsync(FRIGATE_USERNAME_KEY);
    await SecureStore.deleteItemAsync(FRIGATE_PASSWORD_KEY);
    await SecureStore.deleteItemAsync(FRIGATE_JWT_TOKEN_KEY);
    
    // Reset state
    this.client = null;
    this.baseUrl = '';
    this.jwtToken = null;
    this.username = '';
    this.password = '';
  }

  private ensureClient(): AxiosInstance {
    if (!this.client) {
      throw new Error('Not logged in to Frigate. Please login first.');
    }
    return this.client;
  }

  async getConfig(): Promise<FrigateConfig> {
    const client = this.ensureClient();
    const response = await client.get('/api/config');
    return response.data;
  }

  async getCameras(): Promise<Camera[]> {
    const config = await this.getConfig();
    return Object.entries(config.cameras).map(([name, camera]: [string, any]) => ({
      name,
      enabled: camera.enabled !== false,
    }));
  }

  async getEvents(params?: {
    camera?: string;
    label?: string;
    after?: number;
    before?: number;
    limit?: number;
  }): Promise<Event[]> {
    const client = this.ensureClient();
    const response = await client.get('/api/events', { params });
    return response.data;
  }

  async getEvent(eventId: string): Promise<Event> {
    const client = this.ensureClient();
    const response = await client.get(`/api/events/${eventId}`);
    return response.data;
  }

  getEventThumbnailUrl(eventId: string): string {
    const token = this.jwtToken ? `?token=${this.jwtToken}` : '';
    return `${this.baseUrl}/api/events/${eventId}/thumbnail.jpg${token}`;
  }

  getEventClipUrl(eventId: string): string {
    const token = this.jwtToken ? `?token=${this.jwtToken}` : '';
    return `${this.baseUrl}/api/events/${eventId}/clip.mp4${token}`;
  }

  getCameraSnapshotUrl(cameraName: string): string {
    const token = this.jwtToken ? `&token=${this.jwtToken}` : '';
    return `${this.baseUrl}/api/${cameraName}/latest.jpg?t=${Date.now()}${token}`;
  }

  // WebRTC stream via go2rtc (high quality, low latency)
  getWebRTCStreamUrl(cameraName: string): string {
    // go2rtc typically runs on port 1984
    // WebRTC is accessed via go2rtc's web interface
    const baseUrlObj = new URL(this.baseUrl);
    const go2rtcUrl = `${baseUrlObj.protocol}//${baseUrlObj.hostname}:1984`;
    return `${go2rtcUrl}/api/webrtc?src=${cameraName}`;
  }

  // MSE/HLS stream for fallback (also via go2rtc)
  getMSEStreamUrl(cameraName: string): string {
    const baseUrlObj = new URL(this.baseUrl);
    const go2rtcUrl = `${baseUrlObj.protocol}//${baseUrlObj.hostname}:1984`;
    return `${go2rtcUrl}/api/stream.mp4?src=${cameraName}`;
  }

  // MJPEG stream as last fallback (lower quality)
  getCameraMjpegStreamUrl(cameraName: string): string {
    const token = this.jwtToken ? `?token=${this.jwtToken}` : '';
    return `${this.baseUrl}/api/${cameraName}${token}`;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getJWTToken(): string | null {
    return this.jwtToken;
  }
}

export const frigateApi = new FrigateApiService();
