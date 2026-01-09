import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Animated, Platform, Easing } from 'react-native';
import { useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { SmoothImage } from './SmoothImage';
import { frigateApi } from '../services/frigateApi';

interface SmartCameraThumbnailProps {
  cameraName: string;
  width: number;
  height: number;
  isMotionActive: boolean;
  hasActiveDetection?: boolean;
  refreshTimestamp?: number; // External timestamp to trigger refresh
  onLoad?: () => void;
}

/**
 * Smart Camera Thumbnail that switches between:
 * - Static image (when idle) with smooth periodic refresh
 * - Live MSE stream (when motion detected)
 * 
 * Mimics Frigate PWA behavior for dashboard camera cards.
 */
export const SmartCameraThumbnail: React.FC<SmartCameraThumbnailProps> = ({
  cameraName,
  width,
  height,
  isMotionActive,
  hasActiveDetection = false,
  refreshTimestamp = 0,
  onLoad,
}) => {
  const theme = useTheme();
  const [showLiveStream, setShowLiveStream] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const motionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pulsing animation for live dot
  useEffect(() => {
    if (isMotionActive) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.8,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(0.3);
    }
  }, [isMotionActive, pulseAnim]);

  const baseUrl = frigateApi.getBaseUrl();
  const token = frigateApi.getJWTToken();

  // Build static image URL - use external timestamp if provided, otherwise use current time
  const cacheKey = refreshTimestamp || Date.now();
  const imageUrl = `${baseUrl}/api/${cameraName}/latest.jpg?h=${Math.round(height)}&cache=${cacheKey}`;

  // MSE stream HTML for WebView - uses sub-stream (H264) for compatibility
  const getMseHtml = () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; }
        video { width: 100%; height: 100%; object-fit: contain; background: #000; }
      </style>
    </head>
    <body>
      <video id="video" autoplay muted playsinline></video>
      <script>
        const video = document.getElementById('video');
        const baseUrl = '${baseUrl}';
        const camera = '${cameraName}_sub';
        
        let ws, mediaSource, sourceBuffer, queue = [];
        
        function processQueue() {
          if (sourceBuffer && !sourceBuffer.updating && queue.length > 0) {
            // Drop old frames only if severely backed up
            while (queue.length > 30) queue.shift();
            sourceBuffer.appendBuffer(queue.shift());
          }
        }
        
        function connect() {
          const wsUrl = baseUrl.replace('http', 'ws') + '/api/go2rtc/api/ws?src=' + camera;
          window.ReactNativeWebView?.postMessage('log:Connecting to: ' + wsUrl);
          ws = new WebSocket(wsUrl);
          
          ws.onopen = () => {
            window.ReactNativeWebView?.postMessage('log:WS opened for ' + camera);
            ws.send(JSON.stringify({ type: 'mse' }));
          };
          
          ws.onmessage = async (event) => {
            if (typeof event.data === 'string') {
              const msg = JSON.parse(event.data);
              if (msg.type === 'mse') {
                window.ReactNativeWebView?.postMessage('log:Codec: ' + msg.value);
                mediaSource = new MediaSource();
                video.src = URL.createObjectURL(mediaSource);
                mediaSource.addEventListener('sourceopen', () => {
                  try {
                    sourceBuffer = mediaSource.addSourceBuffer(msg.value);
                    sourceBuffer.mode = 'segments';
                    sourceBuffer.addEventListener('updateend', () => {
                      // Trim old buffer data to prevent memory growth
                      if (sourceBuffer.buffered.length > 0) {
                        const end = sourceBuffer.buffered.end(0);
                        const start = sourceBuffer.buffered.start(0);
                        if (end - start > 30) {
                          try { sourceBuffer.remove(start, end - 10); } catch(e) {}
                        }
                      }
                      processQueue();
                    });
                    window.ReactNativeWebView?.postMessage('ready');
                  } catch (err) {
                    window.ReactNativeWebView?.postMessage('log:Buffer error: ' + err.message);
                  }
                });
              }
            } else if (event.data instanceof Blob) {
              const buffer = await event.data.arrayBuffer();
              queue.push(buffer);
              processQueue();
            }
          };
          
          ws.onerror = () => window.ReactNativeWebView?.postMessage('log:WS error');
          ws.onclose = () => setTimeout(connect, 2000);
        }
        
        // Keep video at live edge - gentle approach
        setInterval(() => {
          if (video.buffered.length > 0) {
            const end = video.buffered.end(0);
            // If more than 2s behind, jump to live (less aggressive)
            if (end - video.currentTime > 2) {
              video.currentTime = end - 0.5;
            }
          }
        }, 1000);
        
        connect();
      </script>
    </body>
    </html>
  `;

  // Handle motion state changes
  useEffect(() => {
    console.log(`[SmartThumb:${cameraName}] isMotionActive=${isMotionActive}, showLiveStream=${showLiveStream}`);
    
    if (isMotionActive && !showLiveStream) {
      // Motion started - show live stream (only if not already showing)
      if (motionTimeoutRef.current) {
        clearTimeout(motionTimeoutRef.current);
        motionTimeoutRef.current = null;
      }
      console.log(`[SmartThumb:${cameraName}] 🔴 Switching to LIVE stream`);
      setShowLiveStream(true);
    } else if (isMotionActive && showLiveStream) {
      // Motion still active, already showing - just clear any pending timeout
      if (motionTimeoutRef.current) {
        clearTimeout(motionTimeoutRef.current);
        motionTimeoutRef.current = null;
      }
    } else if (!isMotionActive && showLiveStream) {
      // Motion ended - keep stream for a bit, then fade back to static
      console.log(`[SmartThumb:${cameraName}] ⚪ Motion ended, will fade in 3s`);
      motionTimeoutRef.current = setTimeout(() => {
        console.log(`[SmartThumb:${cameraName}] ⚪ Fading back to static NOW`);
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          console.log(`[SmartThumb:${cameraName}] ⚪ Fade complete, hiding stream`);
          setShowLiveStream(false);
          setStreamReady(false);
        });
      }, 3000); // Keep stream 3 seconds after motion ends
    }

    return () => {
      if (motionTimeoutRef.current) {
        clearTimeout(motionTimeoutRef.current);
      }
    };
  }, [isMotionActive, showLiveStream, fadeAnim, cameraName]);

  // Fade in live stream when ready
  useEffect(() => {
    if (streamReady) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [streamReady, fadeAnim]);

  const handleStreamMessage = (event: { nativeEvent: { data: string } }) => {
    const msg = event.nativeEvent.data;
    if (msg.startsWith('log:')) {
      console.log(`[SmartThumb:${cameraName}] MSE: ${msg.slice(4)}`);
    } else if (msg === 'ready') {
      console.log(`[SmartThumb:${cameraName}] ✅ Stream ready!`);
      setStreamReady(true);
    } else {
      console.log(`[SmartThumb:${cameraName}] WebView:`, msg);
    }
  };

  const handleImageLoad = useCallback(() => {
    onLoad?.();
  }, [onLoad]);

  return (
    <View style={[
      styles.container, 
      { width, height },
      hasActiveDetection && styles.detectionBorder
    ]}>
      {/* Static image layer (always present as fallback) */}
      <SmoothImage
        source={{ uri: imageUrl }}
        style={styles.image}
        resizeMode="contain"
        onLoad={handleImageLoad}
      />

      {/* Live stream layer (overlaid when motion active) - only show when ready */}
      {showLiveStream && (
        <Animated.View style={[styles.streamOverlay, { opacity: fadeAnim }]}>
          <WebView
            source={{ html: getMseHtml(), baseUrl: baseUrl }}
            style={styles.webview}
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            onMessage={handleStreamMessage}
            scrollEnabled={false}
            bounces={false}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            originWhitelist={['*']}
            onError={(e) => console.log(`[SmartThumb:${cameraName}] WebView error:`, e.nativeEvent)}
            onLoadStart={() => console.log(`[SmartThumb:${cameraName}] WebView loading...`)}
            onLoadEnd={() => console.log(`[SmartThumb:${cameraName}] WebView loaded`)}
          />
        </Animated.View>
      )}

      {/* Live indicator - pulsing red dot */}
      {isMotionActive && (
        <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  detectionBorder: {
    borderWidth: 1,
    borderColor: '#F44336',
  },
  image: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  streamOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  liveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F44336',
  },
});
