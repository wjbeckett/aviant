import { frigateApi } from './frigateApi';

/**
 * Frigate WebSocket Event Types
 */
export interface FrigateEvent {
  id: string;
  camera: string;
  label: string;
  sub_label: string | null;
  top_score: number;
  score: number;
  start_time: number;
  end_time: number | null;
  active: boolean;
  stationary: boolean;
  box: [number, number, number, number];
  snapshot?: {
    frame_time: number;
    box: [number, number, number, number];
    score: number;
  };
  has_snapshot: boolean;
  has_clip: boolean;
  recognized_license_plate: string | null;
  current_zones: string[];
}

export interface FrigateWebSocketMessage {
  topic: string;
  payload: string | number;
}

export interface FrigateEventMessage {
  before: FrigateEvent;
  after: FrigateEvent;
  type: 'new' | 'update' | 'end';
}

export interface CameraActivity {
  motion: boolean;
  objects: Array<{
    id: string;
    label: string;
    stationary: boolean;
    score: number;
  }>;
}

export type CameraActivityMap = Record<string, CameraActivity>;

export type EventCallback = (event: FrigateEventMessage, camera: string, label: string) => void;
export type ConnectionCallback = (connected: boolean) => void;
export type StatsCallback = (stats: any) => void;
export type CameraActivityCallback = (activity: CameraActivityMap) => void;

/**
 * Frigate WebSocket Service
 * 
 * Connects to Frigate's /ws endpoint for real-time events.
 * Used for:
 * - Real-time detection updates (switch dashboard to live view)
 * - Push notifications
 * - Live bounding box overlays
 */
class FrigateWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000; // Start with 2 seconds
  
  // Callbacks
  private eventCallbacks: Set<EventCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private statsCallbacks: Set<StatsCallback> = new Set();
  private cameraActivityCallbacks: Set<CameraActivityCallback> = new Set();
  
  // Track active detections per camera
  private activeDetections: Map<string, Set<string>> = new Map(); // camera -> Set<eventId>
  
  // Current camera activity state
  private cameraActivity: CameraActivityMap = {};
  
  /**
   * Connect to Frigate WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[FrigateWS] Already connected');
      return;
    }
    
    const baseUrl = frigateApi.getBaseUrl();
    if (!baseUrl) {
      console.error('[FrigateWS] No base URL configured');
      return;
    }
    
    // Convert http(s) to ws(s)
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
    console.log('[FrigateWS] Connecting to:', wsUrl);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[FrigateWS] Connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 2000;
        this.notifyConnectionChange(true);
      };
      
      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
      
      this.ws.onerror = (error) => {
        console.error('[FrigateWS] Error:', error);
      };
      
      this.ws.onclose = (event) => {
        console.log('[FrigateWS] Disconnected:', event.code, event.reason);
        this.notifyConnectionChange(false);
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('[FrigateWS] Failed to connect:', err);
      this.scheduleReconnect();
    }
  }
  
  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    console.log('[FrigateWS] Disconnecting');
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    
    this.notifyConnectionChange(false);
  }
  
  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[FrigateWS] Max reconnect attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000);
    
    console.log(`[FrigateWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: FrigateWebSocketMessage = JSON.parse(data);
      
      // Handle individual camera motion topics: {camera}/motion -> ON/OFF
      if (message.topic.endsWith('/motion')) {
        const camera = message.topic.replace('/motion', '');
        const isMotion = message.payload === 'ON';
        this.handleIndividualMotion(camera, isMotion);
      }
      
      // Handle camera activity (motion state) - bulk updates
      else if (message.topic === 'camera_activity') {
        const activity: CameraActivityMap = JSON.parse(message.payload as string);
        this.handleCameraActivity(activity);
      }
      
      // Handle detection events - for notifications
      else if (message.topic === 'events') {
        const eventData: FrigateEventMessage = JSON.parse(message.payload as string);
        this.handleEventMessage(eventData);
      }
      
      // Handle stats updates
      else if (message.topic === 'stats') {
        const stats = JSON.parse(message.payload as string);
        this.notifyStats(stats);
      }
      
    } catch (err) {
      // Some messages may not be JSON
      // console.debug('[FrigateWS] Non-JSON message:', data);
    }
  }
  
  /**
   * Handle individual camera motion topic: {camera}/motion -> ON/OFF
   */
  private handleIndividualMotion(camera: string, isMotion: boolean): void {
    const prevMotion = this.cameraActivity[camera]?.motion;
    
    // Only log and notify if changed
    if (prevMotion !== isMotion) {
      if (isMotion) {
        console.log(`[FrigateWS] 🔴 Motion started: ${camera}`);
      } else {
        console.log(`[FrigateWS] ⚪ Motion ended: ${camera}`);
      }
      
      // Update our activity map
      if (!this.cameraActivity[camera]) {
        this.cameraActivity[camera] = { motion: isMotion, objects: [] };
      } else {
        this.cameraActivity[camera].motion = isMotion;
      }
      
      // Notify listeners with updated activity map
      this.cameraActivityCallbacks.forEach(callback => {
        try {
          callback(this.cameraActivity);
        } catch (err) {
          console.error('[FrigateWS] Camera activity callback error:', err);
        }
      });
    }
  }
  
  /**
   * Handle camera activity updates (motion state)
   */
  private handleCameraActivity(activity: CameraActivityMap): void {
    // Check for changes and log
    for (const [camera, state] of Object.entries(activity)) {
      const prevMotion = this.cameraActivity[camera]?.motion;
      if (prevMotion !== state.motion) {
        if (state.motion) {
          console.log(`[FrigateWS] 🔴 Motion started: ${camera}`);
        } else {
          console.log(`[FrigateWS] ⚪ Motion ended: ${camera}`);
        }
      }
    }
    
    this.cameraActivity = activity;
    
    // Notify listeners
    this.cameraActivityCallbacks.forEach(callback => {
      try {
        callback(activity);
      } catch (err) {
        console.error('[FrigateWS] Camera activity callback error:', err);
      }
    });
  }
  
  /**
   * Handle detection event message (for notifications)
   */
  private handleEventMessage(event: FrigateEventMessage): void {
    const camera = event.after.camera;
    const label = event.after.label;
    const eventId = event.after.id;
    const isActive = event.after.active;
    const isStationary = event.after.stationary;
    const hasEnded = !!event.after.end_time;
    
    console.log(`[FrigateWS] Event: ${event.type} - ${label} on ${camera} (active=${isActive}, stationary=${isStationary}, ended=${hasEnded})`);
    
    // Track active detections
    if (!this.activeDetections.has(camera)) {
      this.activeDetections.set(camera, new Set());
    }
    
    const cameraDetections = this.activeDetections.get(camera)!;
    
    // Consider detection "live" if:
    // - It's a new event, OR
    // - Object is actively moving (active=true, not stationary), OR
    // - It's an update with no end_time and object is moving
    const isLiveDetection = 
      event.type === 'new' || 
      (isActive && !isStationary && !hasEnded);
    
    if (isLiveDetection) {
      const wasEmpty = cameraDetections.size === 0;
      cameraDetections.add(eventId);
      
      if (wasEmpty) {
        console.log(`[FrigateWS] 🔴 Live detection started: ${label} on ${camera}`);
      }
    }
    
    // Remove from tracking if ended or became stationary
    if (event.type === 'end' || hasEnded || (isStationary && !isActive)) {
      cameraDetections.delete(eventId);
      
      if (cameraDetections.size === 0) {
        console.log(`[FrigateWS] ⚪ All live detections ended on ${camera}`);
      }
    }
    
    // Notify all listeners
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event, camera, label);
      } catch (err) {
        console.error('[FrigateWS] Event callback error:', err);
      }
    });
  }
  
  /**
   * Check if camera has active detection
   */
  hasActiveDetection(camera: string): boolean {
    const detections = this.activeDetections.get(camera);
    return detections ? detections.size > 0 : false;
  }
  
  /**
   * Get all cameras with active detections
   */
  getCamerasWithActiveDetections(): string[] {
    const cameras: string[] = [];
    this.activeDetections.forEach((detections, camera) => {
      if (detections.size > 0) {
        cameras.push(camera);
      }
    });
    return cameras;
  }
  
  /**
   * Subscribe to detection events
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }
  
  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }
  
  /**
   * Subscribe to stats updates
   */
  onStats(callback: StatsCallback): () => void {
    this.statsCallbacks.add(callback);
    return () => this.statsCallbacks.delete(callback);
  }
  
  /**
   * Subscribe to camera activity updates (motion state)
   */
  onCameraActivity(callback: CameraActivityCallback): () => void {
    this.cameraActivityCallbacks.add(callback);
    return () => this.cameraActivityCallbacks.delete(callback);
  }
  
  /**
   * Check if camera has motion
   */
  hasMotion(camera: string): boolean {
    return this.cameraActivity[camera]?.motion ?? false;
  }
  
  /**
   * Get all cameras with motion
   */
  getCamerasWithMotion(): string[] {
    return Object.entries(this.cameraActivity)
      .filter(([_, state]) => state.motion)
      .map(([camera]) => camera);
  }
  
  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(callback => {
      try {
        callback(connected);
      } catch (err) {
        console.error('[FrigateWS] Connection callback error:', err);
      }
    });
  }
  
  private notifyStats(stats: any): void {
    this.statsCallbacks.forEach(callback => {
      try {
        callback(stats);
      } catch (err) {
        console.error('[FrigateWS] Stats callback error:', err);
      }
    });
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const frigateWebSocket = new FrigateWebSocketService();
