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
  SafeAreaView,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
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
import Video from 'react-native-video';
import { WebRTCConnection } from '../services/webrtcService';
import { frigateRecordingsApi } from '../services/frigateRecordingsApi';
import frigateApi from '../services/frigateApi';
import { format } from 'date-fns';
import * as Sentry from '@sentry/react-native';

type PlaybackMode = 'live' | 'timeline';

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
  const { cameraName } = route.params;
  
  // WebRTC state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const webrtcConnection = useRef<WebRTCConnection | null>(null);
  
  // Playback state
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('live');
  const [selectedTime, setSelectedTime] = useState<number | 'LIVE'>('LIVE');
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingReady, setRecordingReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const videoRef = useRef<Video>(null);
  
  // Timeline state
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize WebRTC on mount
  useEffect(() => {
    console.log('[CameraLive WebRTC] Initializing for camera:', cameraName);
    initializeWebRTC();
    fetchRecentEvents();

    return () => {
      console.log('[CameraLive WebRTC] Cleaning up');
      webrtcConnection.current?.disconnect();
    };
  }, [cameraName]);

  const initializeWebRTC = async () => {
    try {
      setLoading(true);
      setError(null);

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
      
      const eventData = await frigateRecordingsApi.getEventsInRange(
        cameraName,
        Math.floor(oneHourAgo / 1000),
        Math.floor(now / 1000)
      );
      
      setEvents(eventData);
      console.log(`[Timeline] Loaded ${eventData.length} events`);
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
        // Get 30-second clip around selected time
        const startTime = Math.floor(timestamp / 1000) - 15;
        const endTime = Math.floor(timestamp / 1000) + 15;
        
        const url = frigateRecordingsApi.getRecordingUrl(
          cameraName,
          startTime,
          endTime
        );
        
        console.log('[Timeline] Loading recording:', url);
        setRecordingUrl(url);
        // Keep live stream visible until recording is ready (onReadyForDisplay)
      } catch (err) {
        console.error('[Timeline] Failed to load recording:', err);
        setError('Failed to load recording');
        setBuffering(false);
      }
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
    <SafeAreaView style={styles.container}>
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
                  playbackMode === 'live' && connectionState === 'connected'
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

        {/* Live WebRTC Stream (always rendered when in live mode OR while recording buffers) */}
        {remoteStream && showLiveStream && (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={[styles.videoPlayer, { zIndex: showLiveStream ? 2 : 1 }]}
            objectFit="cover"
            mirror={false}
          />
        )}

        {/* Timeline Playback (MP4 Recording) - rendered behind live until ready */}
        {playbackMode === 'timeline' && recordingUrl && (
          <Video
            ref={videoRef}
            source={{ uri: recordingUrl }}
            style={[
              styles.videoPlayer,
              { 
                zIndex: recordingReady ? 2 : 1,
                opacity: recordingReady ? 1 : 0,
              },
            ]}
            resizeMode="cover"
            controls={false}
            paused={false}
            repeat={true}
            onReadyForDisplay={() => {
              console.log('[Video] Ready for display');
              setRecordingReady(true);
              setBuffering(false);
            }}
            onBuffer={({ isBuffering }) => {
              console.log('[Video] Buffering:', isBuffering);
              setBuffering(isBuffering);
            }}
            onError={(error) => {
              console.error('[Video] Playback error:', error);
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

      {/* Timeline (Scrollable) */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.timelineContainer}
        contentContainerStyle={styles.timelineContent}
        onScroll={handleTimelineScroll}
        scrollEventThrottle={100}
        showsVerticalScrollIndicator={true}
      >
        {/* LIVE Indicator */}
        <TouchableOpacity
          style={[
            styles.timelineItem,
            styles.liveItem,
            playbackMode === 'live' && styles.timelineItemActive,
          ]}
          onPress={handleGoLive}
        >
          <Text style={styles.liveLabel}>LIVE</Text>
          <Badge style={styles.liveBadge} size={8} />
        </TouchableOpacity>

        <View style={styles.timelineDivider} />

        {/* Time Markers with Events */}
        {timeMarkers.map((marker, index) => {
          // Find events at this time
          const eventsAtTime = events.filter(
            (e) =>
              e.start_time * 1000 >= marker.time - 2.5 * 60 * 1000 &&
              e.start_time * 1000 <= marker.time + 2.5 * 60 * 1000
          );

          return (
            <View key={index}>
              <TouchableOpacity
                style={[
                  styles.timelineItem,
                  selectedTime === marker.time && styles.timelineItemActive,
                ]}
                onPress={() => handleTimeSelect(marker.time)}
              >
                <Text style={styles.timelineTime}>{marker.label}</Text>
                
                {/* Event indicators */}
                {eventsAtTime.length > 0 && (
                  <View style={styles.eventIndicators}>
                    {eventsAtTime.slice(0, 3).map((event) => (
                      <Text key={event.id} style={styles.eventEmoji}>
                        {getEventEmoji(event.label)}
                      </Text>
                    ))}
                    {eventsAtTime.length > 3 && (
                      <Text style={styles.eventCount}>+{eventsAtTime.length - 3}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
              
              {index < timeMarkers.length - 1 && (
                <View style={styles.timelineDivider} />
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Info Banner */}
      {playbackMode === 'live' && remoteStream && (
        <Surface style={styles.infoBanner}>
          <Text style={styles.infoText}>⚡ WebRTC • Ultra Low Latency • Full Audio</Text>
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