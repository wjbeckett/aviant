import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';

const FRIGATE_LOCAL_URL_KEY = 'frigate_local_url';
const FRIGATE_REMOTE_URL_KEY = 'frigate_remote_url';
const FRIGATE_USERNAME_KEY = 'frigate_username';
const FRIGATE_PASSWORD_KEY = 'frigate_password';
const FRIGATE_JWT_TOKEN_KEY = 'frigate_jwt_token';
const FRIGATE_CURRENT_URL_KEY = 'frigate_current_url';

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
  private localUrl: string = '';
  private remoteUrl: string = '';
  private jwtToken: string | null = null;
  private username: string = '';
  private password: string = '';

  /**
   * Test if a URL is reachable
   */
  private async testConnection(url: string): Promise<boolean> {
    try {
      console.log('[FrigateAPI] Testing connection to:', url);
      await axios.get(`${url}/api/version`, { timeout: 3000 });
      console.log('[FrigateAPI] Connection successful to:', url);
      return true;
    } catch (error) {
      console.log('[FrigateAPI] Connection failed to:', url);
      return false;
    }
  }

  /**
   * Determine which URL to use (local or remote)
   */
  private async selectBestUrl(): Promise<string> {
    // If we have both URLs, test local first (faster), then remote
    if (this.localUrl && this.remoteUrl) {
      console.log('[FrigateAPI] Testing which URL is reachable...');
      
      const localReachable = await this.testConnection(this.localUrl);
      if (localReachable) {
        console.log('[FrigateAPI] Using local URL:', this.localUrl);
        return this.localUrl;
      }
      
      const remoteReachable = await this.testConnection(this.remoteUrl);
      if (remoteReachable) {
        console.log('[FrigateAPI] Using remote URL:', this.remoteUrl);
        return this.remoteUrl;
      }
      
      throw new Error('Neither local nor remote Frigate URL is reachable');
    }
    
    // If only one URL is configured, use it
    const url = this.localUrl || this.remoteUrl || this.baseUrl;
    if (!url) {
      throw new Error('No Frigate URL configured');
    }
    return url;
  }

  async login(
    username: string, 
    password: string, 
    localUrl?: string, 
    remoteUrl?: string
  ): Promise<void> {
    try {
      this.username = username;
      this.password = password;
      
      // Store URLs
      if (localUrl) this.localUrl = localUrl.replace(/\/$/, '');
      if (remoteUrl) this.remoteUrl = remoteUrl.replace(/\/$/, '');
      
      // Select the best URL (local if available, otherwise remote)
      this.baseUrl = await this.selectBestUrl();

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

        console.log('[FrigateAPI] Login response:', response.status, response.data);
        
        const token = response.data?.access_token || 
                      response.data?.token || 
                      response.data?.jwt ||
                      response.data?.accessToken;
        
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

        this.jwtToken = token;

        // Store credentials securely
        if (this.localUrl) await SecureStore.setItemAsync(FRIGATE_LOCAL_URL_KEY, this.localUrl);
        if (this.remoteUrl) await SecureStore.setItemAsync(FRIGATE_REMOTE_URL_KEY, this.remoteUrl);
        await SecureStore.setItemAsync(FRIGATE_CURRENT_URL_KEY, this.baseUrl);
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
          frigateUrl,
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

  /**
   * Switch to a different URL (local or remote) and reconnect
   */
  async switchUrl(): Promise<void> {
    if (!this.username || !this.password) {
      throw new Error('Cannot switch URL: No credentials stored');
    }
    
    // Re-select the best URL
    this.baseUrl = await this.selectBestUrl();
    
    // Re-login with new URL
    await this.login(this.username, this.password, this.localUrl, this.remoteUrl);
  }

  async restoreSession(): Promise<boolean> {
    try {
      const localUrl = await SecureStore.getItemAsync(FRIGATE_LOCAL_URL_KEY);
      const remoteUrl = await SecureStore.getItemAsync(FRIGATE_REMOTE_URL_KEY);
      const currentUrl = await SecureStore.getItemAsync(FRIGATE_CURRENT_URL_KEY);
      const username = await SecureStore.getItemAsync(FRIGATE_USERNAME_KEY);
      const password = await SecureStore.getItemAsync(FRIGATE_PASSWORD_KEY);
      const token = await SecureStore.getItemAsync(FRIGATE_JWT_TOKEN_KEY);

      if (!token || (!localUrl && !remoteUrl && !currentUrl)) return false;

      this.localUrl = localUrl || '';
      this.remoteUrl = remoteUrl || '';
      this.baseUrl = currentUrl || '';
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
        if (username && password) {
          await this.login(username, password, this.localUrl, this.remoteUrl);
          return true;
        }
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async clearSession(): Promise<void> {
    await SecureStore.deleteItemAsync(FRIGATE_LOCAL_URL_KEY);
    await SecureStore.deleteItemAsync(FRIGATE_REMOTE_URL_KEY);
    await SecureStore.deleteItemAsync(FRIGATE_CURRENT_URL_KEY);
    await SecureStore.deleteItemAsync(FRIGATE_USERNAME_KEY);
    await SecureStore.deleteItemAsync(FRIGATE_PASSWORD_KEY);
    await SecureStore.deleteItemAsync(FRIGATE_JWT_TOKEN_KEY);
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
