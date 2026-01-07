import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, Alert } from 'react-native';
import { Text, IconButton, useTheme, Button, Menu } from 'react-native-paper';
import Video, { OnLoadData, OnProgressData, VideoRef } from 'react-native-video';
import { frigateApi } from '../services/frigateApi';
import { go2rtcService } from '../services/go2rtcService';
import { frigateRecordingsApi } from '../services/frigateRecordingsApi';
import { VerticalTimeline } from '../components/VerticalTimeline';
import * as Sentry from '@sentry/react-native';

/**
 * Native Video Player Camera Screen with Timeline Scrubbing
 * 
 * This uses react-native-video with native players:
 * - iOS: AVPlayer (Apple's native player)
 * - Android: ExoPlayer (Google's native player)
 * 
 * Two modes:
 * 1. LIVE MODE: LL-HLS stream (2-3 sec latency)
 * 2. TIMELINE MODE: MP4 recordings (seekable)
 * 
 * Features:
 * - Vertical timeline with event markers
 * - Smooth switching between live and recordings
 * - Event detection overlay
 * - Professional native experience like UniFi Protect, Ring, etc.
 */

type StreamType = 'll-hls' | 'rtsp' | 'mjpeg';
type PlaybackMode = 'live' | 'timeline';

interface StreamConfig {
  uri: string;
  type: StreamType;
  label: string;
}

export const CameraLiveScreenNative = ({ route, navigation }: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { cameraName } = route.params;
  const videoRef = useRef<VideoRef>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamType, setStreamType] = useState<StreamType>('ll-hls'); // Default to LL-HLS for lowest latency
  const [menuVisible, setMenuVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffering, setBuffering] = useState(false);
  
  // Timeline state
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('live');
  const [selectedTime, setSelectedTime] = useState<number | 'LIVE'>('LIVE');
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const baseUrl = frigateApi.getBaseUrl();
  const token = frigateApi.getJWTToken();

  // Generate stream URLs based on playback mode
  const getVideoSource = (): { uri: string; label: string } => {
    if (playbackMode === 'live') {
      // Live mode: use LL-HLS/RTSP/MJPEG based on streamType
      const configs: Record<StreamType, { uri: string; label: string }> = {
        'll-hls': {
          uri: go2rtcService.getHLSUrl(cameraName, true),
          label: 'LIVE (LL-HLS)',
        },
        rtsp: {
          uri: go2rtcService.getRTSPUrl(cameraName),
          label: 'LIVE (RTSP)',
        },
        mjpeg: {
          uri: `${baseUrl}/api/${cameraName}?token=${token}`,
          label: 'LIVE (MJPEG)',
        },
      };
      return configs[streamType];
    } else {
      // Timeline mode: use MP4 recording
      const timestamp = selectedTime === 'LIVE' ? Date.now() : selectedTime;
      const startTime = timestamp - (5 * 60 * 1000); // 5 minutes before
      const endTime = timestamp + (5 * 60 * 1000);   // 5 minutes after
      
      return {
        uri: frigateRecordingsApi.getRecordingUrl(cameraName, startTime, endTime),
        label: 'RECORDING',
      };
    }
  };

  const currentSource = getVideoSource();

  console.log('[CameraLive Native] Camera:', cameraName);
  console.log('[CameraLive Native] Playback mode:', playbackMode);
  console.log('[CameraLive Native] Stream type:', streamType);
  console.log('[CameraLive Native] Video URI:', currentSource.uri);

  // Fetch events for timeline
  useEffect(() => {
    const fetchEvents = async () => {
      setLoadingEvents(true);
      try {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const fetchedEvents = await frigateRecordingsApi.getEventsInRange(
          cameraName,
          oneHourAgo,
          now,
          50
        );
        setEvents(fetchedEvents);
        console.log(`[CameraLive Native] Loaded ${fetchedEvents.length} events`);
      } catch (error) {
        console.error('[CameraLive Native] Failed to load events:', error);
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchEvents();
    
    // Refresh events every 30 seconds
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [cameraName]);

  // Handle time selection from timeline
  const handleTimeSelect = (timestamp: number | 'LIVE') => {
    console.log('[CameraLive Native] Time selected:', timestamp);
    setSelectedTime(timestamp);
    
    if (timestamp === 'LIVE') {
      // Switch to live mode
      if (playbackMode !== 'live') {
        console.log('[CameraLive Native] Switching to LIVE mode');
        setPlaybackMode('live');
        setLoading(true);
      }
    } else {
      // Switch to timeline mode
      if (playbackMode !== 'timeline') {
        console.log('[CameraLive Native] Switching to TIMELINE mode');
        setPlaybackMode('timeline');
        setLoading(true);
      }
    }
  };

  // Auto-retry with fallback on error
  useEffect(() => {
    if (error && retryCount < 3) {
      console.log(`[CameraLive Native] Auto-retry ${retryCount + 1}/3`);
      const timer = setTimeout(() => {
        setError(null);
        setRetryCount(retryCount + 1);
      }, 2000);
      return () => clearTimeout(timer);
    } else if (error && retryCount >= 3) {
      // After 3 retries, try next stream type
      console.log('[CameraLive Native] Max retries reached, trying fallback');
      if (streamType === 'll-hls') {
        console.log('[CameraLive Native] Falling back to RTSP');
        setStreamType('rtsp');
        setRetryCount(0);
        setError(null);
      } else if (streamType === 'rtsp') {
        console.log('[CameraLive Native] Falling back to MJPEG');
        setStreamType('mjpeg');
        setRetryCount(0);
        setError(null);
      }
    }
  }, [error, retryCount, streamType]);

  const handleLoad = (data: OnLoadData) => {
    console.log('[CameraLive Native] Video loaded:', data);
    setLoading(false);
    setBuffering(false);
    setError(null);
    setRetryCount(0);
    
    // Report success to Sentry
    try {
      Sentry.addBreadcrumb({
        message: 'Video stream loaded successfully',
        data: {
          camera: cameraName,
          streamType: streamType,
          duration: data.duration,
        },
        level: 'info',
      });
    } catch (e) {
      console.error('[CameraLive Native] Failed to add Sentry breadcrumb:', e);
    }
  };

  const handleError = (error: any) => {
    console.error('[CameraLive Native] Video error:', error);
    const errorMsg = error?.error?.localizedDescription || 
                     error?.error?.message || 
                     'Failed to load stream';
    setError(errorMsg);
    setLoading(false);
    setBuffering(false);
    
    // Report to Sentry
    try {
      Sentry.captureException(new Error(`Video stream error: ${errorMsg}`), {
        contexts: {
          video: {
            camera: cameraName,
            playbackMode: playbackMode,
            streamType: streamType,
            uri: currentSource.uri,
            retryCount: retryCount,
            error: error,
          },
        },
      });
    } catch (e) {
      console.error('[CameraLive Native] Failed to report to Sentry:', e);
    }
  };

  const handleProgress = (data: OnProgressData) => {
    setCurrentTime(data.currentTime);
    // Video is playing, ensure loading is false
    if (loading) {
      setLoading(false);
    }
  };

  const handleBuffer = ({ isBuffering }: { isBuffering: boolean }) => {
    console.log('[CameraLive Native] Buffering:', isBuffering);
    setBuffering(isBuffering);
  };

  const handleRetry = () => {
    console.log('[CameraLive Native] Manual retry');
    setError(null);
    setLoading(true);
    setRetryCount(0);
  };

  const handleChangeStream = (type: StreamType) => {
    console.log('[CameraLive Native] Changing stream to:', type);
    setStreamType(type);
    setError(null);
    setLoading(true);
    setRetryCount(0);
    setMenuVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* Header with controls */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          iconColor={theme.colors.onPrimary}
          size={24}
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>{cameraName}</Text>
        
        {/* Stream type menu */}
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="tune"
              iconColor={theme.colors.onPrimary}
              size={24}
              onPress={() => setMenuVisible(true)}
            />
          }
        >
          <Menu.Item
            onPress={() => handleChangeStream('ll-hls')}
            title="LL-HLS (2-3 sec) ⚡"
            leadingIcon={streamType === 'll-hls' ? 'check' : undefined}
          />
          <Menu.Item
            onPress={() => handleChangeStream('rtsp')}
            title="RTSP (<1 sec) 🏠"
            leadingIcon={streamType === 'rtsp' ? 'check' : undefined}
          />
          <Menu.Item
            onPress={() => handleChangeStream('mjpeg')}
            title="MJPEG (Fallback)"
            leadingIcon={streamType === 'mjpeg' ? 'check' : undefined}
          />
        </Menu>

        {/* Mute/unmute */}
        <IconButton
          icon={muted ? 'volume-off' : 'volume-high'}
          iconColor={theme.colors.onPrimary}
          size={24}
          onPress={() => setMuted(!muted)}
        />
      </View>

      {/* Stream type indicator */}
      <View style={styles.streamTypeContainer}>
        <Text style={styles.streamTypeText}>{currentSource.label}</Text>
      </View>

      {/* Native Video Player */}
      <View style={styles.videoContainer}>
        {!error ? (
          <Video
            ref={videoRef}
            source={{ uri: currentSource.uri }}
            key={currentSource.uri} // Force re-render when source changes
            style={styles.video}
            paused={paused}
            muted={muted}
            // Live stream settings
            playInBackground={false}
            playWhenInactive={false}
            ignoreSilentSwitch="ignore"
            // Low-latency buffer configuration
            // These aggressive settings minimize buffering for live streams
            bufferConfig={{
              minBufferMs: streamType === 'll-hls' ? 500 : 1000,      // Minimum buffer (lower = lower latency)
              maxBufferMs: streamType === 'll-hls' ? 2000 : 3000,     // Maximum buffer
              bufferForPlaybackMs: 300,                                 // Start playing ASAP
              bufferForPlaybackAfterRebufferMs: 500,                   // Resume quickly after buffering
            }}
            // Additional low-latency settings
            maxBitRate={streamType === 'll-hls' ? 5000000 : undefined} // 5 Mbps limit for LL-HLS
            resizeMode="contain"
            repeat={false}
            reportBandwidth={true}
            // Event handlers
            onLoad={handleLoad}
            onError={handleError}
            onProgress={handleProgress}
            onBuffer={handleBuffer}
            // Platform-specific
            {...(Platform.OS === 'android' && {
              // Android ExoPlayer settings
              allowsExternalPlayback: false,
              controls: false,
            })}
            {...(Platform.OS === 'ios' && {
              // iOS AVPlayer settings
              pictureInPicture: false,
              controls: false,
            })}
          />
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Stream Failed</Text>
            <Text style={styles.errorDetails}>{error}</Text>
            <Button
              mode="contained"
              onPress={handleRetry}
              style={styles.retryButton}
            >
              Retry
            </Button>
            <Text style={styles.errorHint}>
              Try changing stream type from the menu above
            </Text>
          </View>
        )}
      </View>

      {/* Vertical Timeline */}
      <VerticalTimeline
        onTimeSelect={handleTimeSelect}
        events={events}
        currentTime={selectedTime}
        timeRangeHours={1}
      />

      {/* Loading indicator */}
      {(loading || buffering) && !error && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>
            {buffering ? 'Buffering...' : 'Loading stream...'}
          </Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.controls}>
        <IconButton
          icon={paused ? 'play' : 'pause'}
          iconColor={theme.colors.onSurface}
          size={32}
          onPress={() => setPaused(!paused)}
        />
        <Text style={styles.liveIndicator}>
          {!paused && !error && playbackMode === 'live' ? '🔴 LIVE' : ''}
          {playbackMode === 'timeline' ? '📼 RECORDING' : ''}
        </Text>
      </View>
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerTitle: {
    flex: 1,
    color: theme.colors.onPrimary,
    fontSize: 18,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  streamTypeContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    zIndex: 10,
  },
  streamTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9, // Maintain 16:9 aspect ratio
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorDetails: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    marginBottom: 16,
  },
  errorHint: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  liveIndicator: {
    color: '#f00',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
