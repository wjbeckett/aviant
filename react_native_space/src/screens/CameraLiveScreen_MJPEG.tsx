import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { frigateApi } from '../services/frigateApi';
import * as Sentry from '@sentry/react-native';

/**
 * MJPEG-only Camera Live Screen
 * 
 * This is the simplest and most reliable streaming approach:
 * - Just an image URL pointing to MJPEG stream
 * - No WebSocket negotiation required
 * - Works everywhere, always
 * - Higher bandwidth than MSE, but guaranteed to work
 * 
 * Use this as a fallback when WebRTC/MSE are problematic.
 */
export const CameraLiveScreenMJPEG = ({ route, navigation }: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { cameraName } = route.params;
  const [error, setError] = useState(false);

  const baseUrl = frigateApi.getBaseUrl();
  const token = frigateApi.getJWTToken();
  
  // Frigate MJPEG endpoint with authentication token
  const mjpegUrl = `${baseUrl}/api/${cameraName}?token=${token}`;
  
  console.log('[CameraLive MJPEG] Camera:', cameraName);
  console.log('[CameraLive MJPEG] Stream URL:', mjpegUrl);

  // Simple HTML to display MJPEG stream
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { 
          margin: 0; 
          padding: 0;
          overflow: hidden;
        }
        body {
          background-color: ${theme.dark ? '#000' : '#000'};
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          width: 100vw;
          position: fixed;
        }
        img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }
        .error {
          color: #f44336;
          padding: 20px;
          text-align: center;
          display: none;
        }
      </style>
    </head>
    <body>
      <img 
        id="stream" 
        src="${mjpegUrl}" 
        alt="Live Stream"
        onerror="document.getElementById('stream').style.display='none'; document.getElementById('error').style.display='block';"
      />
      <div id="error" class="error">
        <h3>Stream Failed</h3>
        <p>Unable to load MJPEG stream</p>
      </div>
      <script>
        // Log when stream loads
        document.getElementById('stream').onload = function() {
          console.log('MJPEG stream loaded successfully');
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stream_loaded',
            streamType: 'mjpeg'
          }));
        };
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      {/* Header with camera name and back button */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          iconColor={theme.colors.onPrimary}
          size={24}
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>{cameraName}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.streamType}>MJPEG</Text>
        </View>
      </View>

      {/* MJPEG stream in WebView */}
      <WebView
        source={{ html }}
        style={styles.webview}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[CameraLive MJPEG] WebView error:', nativeEvent);
          setError(true);
          
          // Report to Sentry
          try {
            Sentry.captureException(new Error(`MJPEG error: ${nativeEvent.description}`), {
              contexts: {
                webview: {
                  camera: cameraName,
                  url: mjpegUrl,
                  nativeEvent: nativeEvent,
                },
              },
            });
          } catch (e) {
            console.error('[CameraLive MJPEG] Failed to report to Sentry:', e);
          }
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log('[CameraLive MJPEG] Message from WebView:', data);
            if (data.type === 'stream_loaded') {
              setError(false);
            }
          } catch (e) {
            console.error('[CameraLive MJPEG] Failed to parse WebView message:', e);
          }
        }}
        onLoadStart={() => console.log('[CameraLive MJPEG] WebView load started')}
        onLoadEnd={() => console.log('[CameraLive MJPEG] WebView load ended')}
        // Media playback
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // JavaScript
        javaScriptEnabled
        domStorageEnabled
        // Debugging
        webviewDebuggingEnabled={true}
        // Disable unwanted features
        bounces={false}
        scrollEnabled={false}
      />

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load stream</Text>
          <Text style={styles.errorHint}>Check your connection</Text>
        </View>
      )}
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
  headerRight: {
    paddingHorizontal: 12,
  },
  streamType: {
    color: theme.colors.onPrimary,
    fontSize: 12,
    opacity: 0.8,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 16,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  errorHint: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
  },
});
