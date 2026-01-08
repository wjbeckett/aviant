/**
 * Unified Camera Live Screen with WebRTC + Timeline
 * 
 * Layout:
 * - Video player on top (16:9 aspect ratio)
 * - Timeline scrolls below (fills remaining space)
 * - Ultra-smooth transitions between live and recordings
 * 
 * Seamless Buffering Strategy:
 * - Keep live stream visible while recording buffers
 * - Only switch display once recording is ready to play
 * - No black screens or loading indicators
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  Platform,
  AppState,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Appbar,
  IconButton,
  useTheme,
  Text,
  Surface,
  FAB,
  Badge,
} from 'react-native-paper';
import { RTCView, MediaStream } from 'react-native-webrtc';
import Video, { VideoRef } from 'react-native-video';
import { WebRTCConnection } from '../services/webrtcService';
import { MSEStreamService, createMSEStream } from '../services/mseStreamService';
import { frigateRecordingsApi } from '../services/frigateRecordingsApi';
import { frigateApi } from '../services/frigateApi';
import { format } from 'date-fns';
import * as Sentry from '@sentry/react-native';
import { VerticalTimeline } from '../components/VerticalTimeline';

type PlaybackMode = 'live' | 'timeline';
type StreamType = 'webrtc' | 'mse' | 'hls';  // Added MSE option

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const VIDEO_HEIGHT = (SCREEN_WIDTH * 9) / 16; // 16:9 aspect ratio
const TIMELINE_HEIGHT = SCREEN_HEIGHT - VIDEO_HEIGHT - 120; // Remaining space

interface TimelineEvent {
  id: string;
  label: string;
  start_time: number;
  end_time: number;
  thumbnail?: string;
  has_clip: boolean;
}

export const CameraLiveScreenWebRTC = ({ route, navigation }: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { cameraName, initialTimestamp } = route.params;
  
  // Stream state
  const [streamType, setStreamType] = useState<StreamType>('webrtc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [mseUrl, setMseUrl] = useState<string | null>(null);
  const [mseCodec, setMseCodec] = useState<string | null>(null);
  const webrtcConnection = useRef<WebRTCConnection | null>(null);
  const mseStreamService = useRef<MSEStreamService | null>(null);
  
  // Playback state
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('live');
  const [selectedTime, setSelectedTime] = useState<number | 'LIVE'>('LIVE');
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingReady, setRecordingReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [recordingEndTime, setRecordingEndTime] = useState<number>(0); // Track where current clip ends
  const videoRef = useRef<VideoRef>(null);
  
  // Timeline state
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize stream on mount - check codec first
  useEffect(() => {
    console.log('[CameraLive] Initializing for camera:', cameraName);
    
    const initializeStream = async () => {
      // Check if camera is H265 - if so, skip WebRTC and go straight to MSE
      const isH265 = await frigateApi.isH265Camera(cameraName);
      if (isH265) {
        console.log('[CameraLive] H265 camera detected, using MSE directly');
        fallbackToMSE();
      } else {
        console.log('[CameraLive] H264 camera, using WebRTC');
        initializeWebRTC();
      }
    };
    
    initializeStream();
    fetchRecentEvents();

    // If we have an initial timestamp (from tapping an event), start playback there
    if (initialTimestamp) {
      console.log('[CameraLive] Starting at timestamp:', new Date(initialTimestamp).toLocaleString());
      // Small delay to let the stream initialize first
      setTimeout(() => {
        handleTimeSelect(initialTimestamp);
      }, 1000);
    }

    return () => {
      console.log('[CameraLive] Cleaning up');
      webrtcConnection.current?.disconnect();
      mseStreamService.current?.stop();
    };
  }, [cameraName]);

  // Stop streaming when app goes to background (battery saving)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('[CameraLive] App backgrounded, stopping streams');
        webrtcConnection.current?.disconnect();
        mseStreamService.current?.stop();
      } else if (nextAppState === 'active') {
        console.log('[CameraLive] App active, reconnecting');
        // Only reconnect if we were in live mode
        if (playbackMode === 'live') {
          initializeWebRTC();
        }
      }
    });

    return () => subscription.remove();
  }, [playbackMode]);

  // Fallback to MSE stream (best option for H265 - uses local HTTP proxy)
  const fallbackToMSE = useCallback(async () => {
    console.log('[CameraLive] Falling back to MSE stream (fMP4 proxy)');
    webrtcConnection.current?.disconnect();
    setStreamType('mse');
    setRemoteStream(null);
    setLoading(true);
    setConnectionState('connecting');
    
    try {
      // Create MSE stream service
      const mseService = createMSEStream({
        cameraName,
        onReady: (localUrl) => {
          console.log('[CameraLive] MSE stream ready:', localUrl);
          setMseUrl(localUrl);
          setLoading(false);
          setConnectionState('mse');
        },
        onCodecInfo: (mimeType) => {
          console.log('[CameraLive] MSE codec:', mimeType);
          setMseCodec(mimeType);
        },
        onError: (err) => {
          console.error('[CameraLive] MSE error:', err);
          // Fall back to HLS if MSE fails
          fallbackToHLS();
        },
        onStats: (stats) => {
          console.log('[CameraLive] MSE stats:', stats);
        }
      });
      
      mseStreamService.current = mseService;
      await mseService.start();
    } catch (err) {
      console.error('[CameraLive] MSE failed, falling back to HLS:', err);
      fallbackToHLS();
    }
  }, [cameraName]);

  // Fallback to HLS stream (last resort - higher latency)
  const fallbackToHLS = useCallback(() => {
    console.log('[CameraLive] Falling back to HLS stream');
    webrtcConnection.current?.disconnect();
    mseStreamService.current?.stop();
    setStreamType('hls');
    setRemoteStream(null);
    setMseUrl(null);
    
    // Build HLS URL
    const baseUrl = frigateApi.getBaseUrl();
    const token = frigateApi.getJWTToken();
    const url = `${baseUrl}/api/go2rtc/api/stream.m3u8?src=${encodeURIComponent(cameraName)}&token=${token}`;
    console.log('[CameraLive] HLS URL:', url);
    setHlsUrl(url);
    setLoading(false);
    setConnectionState('hls');
  }, [cameraName]);

  const initializeWebRTC = async () => {
    try {
      setLoading(true);
      setError(null);
      setStreamType('webrtc');

      const connection = new WebRTCConnection({
        cameraName,
        onRemoteStream: (stream) => {
          console.log('[CameraLive WebRTC] Remote stream received!');
          setRemoteStream(stream);
          setLoading(false);
        },
        onConnectionStateChange: (state) => {
          console.log('[CameraLive WebRTC] Connection state:', state);
          setConnectionState(state);
          
          if (state === 'connected') {
            setLoading(false);
          }
        },
        onCodecError: (err) => {
          // H265/HEVC codec not supported by WebRTC - try MSE first (lower latency)
          console.log('[CameraLive] Codec error, trying MSE fallback:', err.message);
          fallbackToMSE();
        },
        onError: (err) => {
          console.error('[CameraLive WebRTC] Error:', err);
          setError(err.message);
          setLoading(false);
          
          Sentry.captureException(err, {
            tags: { screen: 'CameraLiveWebRTC', camera: cameraName },
          });
        },
      });

      webrtcConnection.current = connection;
      await connection.connect();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[CameraLive WebRTC] Failed to initialize:', error);
      setError(error.message);
      setLoading(false);
      
      Sentry.captureException(error, {
        tags: { screen: 'CameraLiveWebRTC', camera: cameraName },
      });
    }
  };

  // Fetch recent events for timeline
  const fetchRecentEvents = async () => {
    try {
      setLoadingEvents(true);
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      
      console.log(`[Timeline] Fetching events for ${cameraName} from ${new Date(oneHourAgo).toLocaleTimeString()} to ${new Date(now).toLocaleTimeString()}`);
      
      const eventData = await frigateRecordingsApi.getEventsInRange(
        cameraName,
        oneHourAgo,  // Pass milliseconds, API converts to seconds
        now
      );
      
      // Map to TimelineEvent format
      const timelineEvents: TimelineEvent[] = eventData.map(e => ({
        id: e.id,
        label: e.label,
        start_time: e.start_time,
        end_time: e.end_time || e.start_time + 10, // Default duration if still active
        has_clip: e.has_clip,
      }));
      
      setEvents(timelineEvents);
      console.log(`[Timeline] Loaded ${timelineEvents.length} events:`, timelineEvents.map(e => `${e.label}@${new Date(e.start_time * 1000).toLocaleTimeString()}`));
    } catch (err) {
      console.error('[Timeline] Failed to fetch events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Handle timeline scroll to switch between live and recordings
  const handleTimelineScroll = useCallback(
    (event: any) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      setIsScrolling(true);
      
      // Debounce to avoid too many switches
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        
        // If scrolled to top (within 50px), go LIVE
        if (scrollY < 50) {
          handleGoLive();
        } else {
          // Calculate timestamp based on scroll position
          const now = Date.now();
          const oneHourAgo = now - 60 * 60 * 1000;
          const maxScroll = 600; // Assume 600px for 1 hour
          const ratio = Math.min(scrollY / maxScroll, 1);
          const timestamp = now - (ratio * (60 * 60 * 1000));
          
          handleTimeSelect(timestamp);
        }
      }, 300);
    },
    []
  );

  // Handle timeline selection
  const handleTimeSelect = async (timestamp: number | 'LIVE') => {
    console.log('[Timeline] Selected:', timestamp);
    setSelectedTime(timestamp);

    if (timestamp === 'LIVE') {
      // Switch back to live WebRTC
      setPlaybackMode('live');
      setRecordingUrl(null);
      setRecordingReady(false);
    } else {
      // Switch to recording playback
      setPlaybackMode('timeline');
      setRecordingReady(false); // Reset ready state
      setBuffering(true);
      
      try {
        // Start from selected time, play until NOW
        const startTime = Math.floor(timestamp / 1000);
        const endTime = Math.floor(Date.now() / 1000);
        
        loadRecordingSegment(startTime, endTime);
      } catch (err) {
        console.error('[Timeline] Failed to load recording:', err);
        setError('Failed to load recording');
        setBuffering(false);
      }
    }
  };

  // Load a recording segment
  const loadRecordingSegment = (startTime: number, endTime: number) => {
    const url = frigateRecordingsApi.getRecordingUrl(cameraName, startTime, endTime);
    
    const durationMinutes = ((endTime - startTime) / 60).toFixed(1);
    console.log('[Timeline] Loading segment:', new Date(startTime * 1000).toLocaleTimeString(), '-', new Date(endTime * 1000).toLocaleTimeString());
    console.log('[Timeline] Duration:', durationMinutes, 'minutes');
    
    setRecordingEndTime(endTime); // Track where this clip ends
    setRecordingUrl(url);
    setRecordingReady(false);
  };

  // Handle when recording segment ends - load next segment or go live
  const handleRecordingEnd = () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const gap = nowSeconds - recordingEndTime;
    
    console.log('[Timeline] Segment ended. Gap to live:', gap, 'seconds');
    
    // If we're within 10 seconds of live, switch to live stream
    if (gap <= 10) {
      console.log('[Timeline] Caught up! Switching to live');
      handleGoLive();
    } else {
      // Load next segment from where we left off to NOW
      console.log('[Timeline] Loading next segment to catch up...');
      setBuffering(true);
      loadRecordingSegment(recordingEndTime, nowSeconds);
    }
  };

  const handleGoLive = () => {
    handleTimeSelect('LIVE');
    // Scroll to top
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleRetry = () => {
    webrtcConnection.current?.disconnect();
    initializeWebRTC();
  };

  // Generate time markers for timeline
  const generateTimeMarkers = () => {
    const markers: { time: number; label: string }[] = [];
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const interval = 5 * 60 * 1000; // 5 minutes
    
    for (let time = now; time >= oneHourAgo; time -= interval) {
      markers.push({
        time,
        label: format(time, 'HH:mm'),
      });
    }
    
    return markers;
  };

  const timeMarkers = generateTimeMarkers();

  // Get emoji for event type
  const getEventEmoji = (label: string): string => {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('person')) return '🚶';
    if (lowerLabel.includes('car')) return '🚗';
    if (lowerLabel.includes('dog')) return '🐕';
    if (lowerLabel.includes('cat')) return '🐈';
    if (lowerLabel.includes('bird')) return '🐦';
    if (lowerLabel.includes('package')) return '📦';
    return '🔴';
  };

  // Determine which player to show
  const showLiveStream = playbackMode === 'live' || !recordingReady;
  const showRecording = playbackMode === 'timeline' && recordingReady;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <StatusBar 
        barStyle={theme.dark ? 'light-content' : 'dark-content'} 
        backgroundColor={theme.colors.surface}
      />
      {/* Header */}
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={cameraName} />
        
        {/* Connection status indicator */}
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  playbackMode === 'live' && (connectionState === 'connected' || connectionState === 'mse' || connectionState === 'hls')
                    ? '#4CAF50'
                    : playbackMode === 'timeline'
                    ? '#2196F3'
                    : connectionState === 'connecting'
                    ? '#FF9800'
                    : '#F44336',
              },
            ]}
          />
          <Text style={styles.statusText}>
            {playbackMode === 'live'
              ? connectionState === 'connected'
                ? 'LIVE'
                : connectionState === 'mse'
                ? 'LIVE (MSE)'
                : connectionState === 'hls'
                ? 'LIVE (HLS)'
                : connectionState.toUpperCase()
              : buffering
              ? 'BUFFERING...'
              : 'PLAYBACK'}
          </Text>
        </View>
        
        {error && (
          <IconButton icon="refresh" onPress={handleRetry} />
        )}
      </Appbar.Header>

      {/* Video Player Area (16:9) */}
      <View style={styles.videoContainer}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Connecting to camera...</Text>
            <Text style={styles.loadingSubtext}>
              {connectionState === 'new' && 'Initializing WebRTC...'}
              {connectionState === 'connecting' && 'Establishing connection...'}
              {connectionState === 'checking' && 'Checking ICE candidates...'}
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Connection Failed</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <IconButton
              icon="refresh"
              mode="contained"
              size={32}
              onPress={handleRetry}
              style={styles.retryButton}
            />
            <Text style={styles.errorHint}>Tap to retry</Text>
          </View>
        )}

        {/* Live WebRTC Stream */}
        {streamType === 'webrtc' && remoteStream && showLiveStream && (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={[styles.videoPlayer, { zIndex: showLiveStream ? 2 : 1 }]}
            objectFit="cover"
            mirror={false}
          />
        )}
        
        {/* Live MSE Stream (fMP4 proxy - best for H265) */}
        {streamType === 'mse' && mseUrl && showLiveStream && (
          <Video
            source={{ uri: mseUrl }}
            style={[styles.videoPlayer, { zIndex: showLiveStream ? 2 : 1 }]}
            resizeMode="cover"
            controls={false}
            paused={false}
            repeat={false}
            bufferConfig={{
              minBufferMs: 500,
              maxBufferMs: 2000,
              bufferForPlaybackMs: 250,
              bufferForPlaybackAfterRebufferMs: 500,
            }}
            onReadyForDisplay={() => {
              console.log('[MSE] Ready for display');
              setLoading(false);
            }}
            onBuffer={({ isBuffering }) => {
              console.log('[MSE] Buffering:', isBuffering);
            }}
            onError={(error) => {
              console.error('[MSE] Playback error:', error);
              // Fall back to HLS if MSE playback fails
              fallbackToHLS();
            }}
          />
        )}

        {/* Live HLS Stream (last resort fallback for H265 cameras) */}
        {streamType === 'hls' && hlsUrl && showLiveStream && (
          <Video
            source={{ 
              uri: hlsUrl,
              headers: { Authorization: `Bearer ${frigateApi.getJWTToken()}` }
            }}
            style={[styles.videoPlayer, { zIndex: showLiveStream ? 2 : 1 }]}
            resizeMode="cover"
            controls={false}
            paused={false}
            repeat={true}
            onReadyForDisplay={() => {
              console.log('[HLS] Ready for display');
              setLoading(false);
            }}
            onBuffer={({ isBuffering }) => {
              console.log('[HLS] Buffering:', isBuffering);
            }}
            onError={(error) => {
              console.error('[HLS] Playback error:', error);
              setError('HLS stream failed');
            }}
          />
        )}

        {/* Timeline Playback (MP4 Recording) */}
        {playbackMode === 'timeline' && recordingUrl && (
          <Video
            ref={videoRef}
            source={{ uri: recordingUrl }}
            style={[
              styles.videoPlayer,
              { 
                zIndex: 10, // Always on top when in timeline mode
              },
            ]}
            resizeMode="cover"
            controls={true}
            paused={false}
            repeat={false}
            onReadyForDisplay={() => {
              console.log('[Recording] Ready for display, URL:', recordingUrl.substring(0, 80));
              setRecordingReady(true);
              setBuffering(false);
            }}
            onBuffer={({ isBuffering }) => {
              console.log('[Recording] Buffering:', isBuffering);
              setBuffering(isBuffering);
            }}
            onProgress={({ currentTime }) => {
              // Log progress every 5 seconds
              if (Math.floor(currentTime) % 5 === 0) {
                console.log('[Recording] Progress:', Math.floor(currentTime), 'seconds');
              }
            }}
            onEnd={() => {
              // Recording segment ended - load next or go live
              console.log('[Recording] Segment ended');
              handleRecordingEnd();
            }}
            onError={(error) => {
              console.error('[Recording] Playback error:', error);
              setError('Failed to play recording');
              setBuffering(false);
              // Fall back to live
              handleGoLive();
            }}
          />
        )}

        {/* Buffering indicator overlay */}
        {buffering && playbackMode === 'timeline' && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.bufferingText}>Loading recording...</Text>
          </View>
        )}
      </View>

      {/* Vertical Timeline Component */}
      <VerticalTimeline
        onTimeSelect={handleTimeSelect}
        events={events}
        currentTime={selectedTime}
        timeRangeHours={1}
      />

      {/* Info Banner */}
      {playbackMode === 'live' && streamType === 'webrtc' && remoteStream && (
        <Surface style={styles.infoBanner}>
          <Text style={styles.infoText}>⚡ WebRTC • Ultra Low Latency</Text>
        </Surface>
      )}

      {playbackMode === 'live' && streamType === 'mse' && mseUrl && (
        <Surface style={styles.infoBanner}>
          <Text style={styles.infoText}>🚀 MSE Proxy • H265 Low Latency{mseCodec ? ` • ${mseCodec.split(';')[0]}` : ''}</Text>
        </Surface>
      )}

      {playbackMode === 'live' && streamType === 'hls' && hlsUrl && (
        <Surface style={styles.infoBanner}>
          <Text style={styles.infoText}>📺 HLS • H265 (Higher Latency)</Text>
        </Surface>
      )}

      {playbackMode === 'timeline' && (
        <Surface style={styles.infoBanner}>
          <Text style={styles.infoText}>📹 Playback • Scroll to top for LIVE</Text>
        </Surface>
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    videoContainer: {
      width: SCREEN_WIDTH,
      height: VIDEO_HEIGHT,
      backgroundColor: '#000',
      position: 'relative',
    },
    videoPlayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: SCREEN_WIDTH,
      height: VIDEO_HEIGHT,
    },
    loadingContainer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      zIndex: 10,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: '#FFF',
      fontWeight: '600',
    },
    loadingSubtext: {
      marginTop: 8,
      fontSize: 14,
      color: '#AAA',
    },
    errorContainer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      padding: 24,
      zIndex: 10,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#F44336',
      marginBottom: 12,
    },
    errorMessage: {
      fontSize: 14,
      color: '#FFF',
      textAlign: 'center',
      marginBottom: 24,
    },
    retryButton: {
      backgroundColor: theme.colors.primary,
    },
    errorHint: {
      marginTop: 8,
      fontSize: 12,
      color: '#AAA',
    },
    bufferingOverlay: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      zIndex: 3,
    },
    bufferingText: {
      marginLeft: 8,
      fontSize: 12,
      color: '#FFF',
      fontWeight: '600',
    },
    statusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 8,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    timelineContainer: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    timelineContent: {
      paddingVertical: 16,
    },
    timelineItem: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    timelineItemActive: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    liveItem: {
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
    },
    liveLabel: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#4CAF50',
    },
    liveBadge: {
      backgroundColor: '#F44336',
    },
    timelineDivider: {
      height: 1,
      backgroundColor: theme.colors.outline,
      marginHorizontal: 20,
    },
    timelineTime: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    eventIndicators: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    eventEmoji: {
      fontSize: 20,
    },
    eventCount: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginLeft: 4,
    },
    infoBanner: {
      padding: 8,
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceVariant,
    },
    infoText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
    },
  });