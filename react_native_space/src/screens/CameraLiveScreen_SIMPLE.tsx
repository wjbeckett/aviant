import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { frigateApi } from '../services/frigateApi';
import * as Sentry from '@sentry/react-native';

// CookieManager only works on native platforms (iOS/Android), not web
let CookieManager: any = null;
if (Platform.OS !== 'web') {
  CookieManager = require('@react-native-cookies/cookies').default;
}

/**
 * Simplified Camera Live Screen
 * 
 * Instead of trying to implement complex WebRTC/MSE streaming ourselves,
 * we simply load Frigate's own web UI which has years of proven development.
 * 
 * This approach:
 * - Is more reliable (battle-tested by thousands of users)
 * - Auto-selects best streaming method (jsmpeg/MSE/WebRTC)
 * - Handles all edge cases
 * - Gets automatic updates when Frigate improves
 * - Requires minimal code
 */
export const CameraLiveScreenSimple = ({ route, navigation }: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { cameraName } = route.params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const baseUrl = frigateApi.getBaseUrl();
  
  // Load Frigate's camera page directly
  // Frigate will handle stream selection, authentication, and playback
  const frigateUrl = `${baseUrl}/cameras/${cameraName}`;

  console.log('[CameraLive] Loading Frigate PWA for camera:', cameraName);
  console.log('[CameraLive] URL:', frigateUrl);

  // Ensure WebView has access to authentication cookies (native platforms only)
  useEffect(() => {
    if (!CookieManager || Platform.OS === 'web') {
      console.log('[CameraLive] Web platform: cookies managed by browser');
      return;
    }
    
    const setupCookies = async () => {
      try {
        const jwtToken = frigateApi.getJWTToken();
        if (jwtToken && jwtToken !== 'web-cookie-auth') {
          // Set the frigate_token cookie for WebView
          await CookieManager.set(baseUrl, {
            name: 'frigate_token',
            value: jwtToken,
            path: '/',
            secure: baseUrl.startsWith('https'),
            httpOnly: false, // WebView needs to access it
          });
          console.log('[CameraLive] Set frigate_token cookie for WebView');
        }
      } catch (error) {
        console.error('[CameraLive] Error setting cookies:', error);
      }
    };
    
    setupCookies();
  }, [baseUrl]);

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
        <IconButton
          icon="refresh"
          iconColor={theme.colors.onPrimary}
          size={24}
          onPress={() => {
            // Force refresh by updating key (not shown in this snippet)
            setLoading(true);
          }}
        />
      </View>

      {/* Load Frigate's own web UI */}
      <WebView
        source={{ uri: frigateUrl }}
        style={styles.webview}
        onLoadStart={() => {
          console.log('[CameraLive] WebView load started');
          setLoading(true);
          setError(false);
        }}
        onLoadEnd={() => {
          console.log('[CameraLive] WebView load ended');
          setLoading(false);
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[CameraLive] WebView error:', nativeEvent);
          setError(true);
          setLoading(false);
          
          // Report to Sentry
          try {
            Sentry.captureException(new Error(`WebView error: ${nativeEvent.description}`), {
              contexts: {
                webview: {
                  camera: cameraName,
                  url: frigateUrl,
                  nativeEvent: nativeEvent,
                },
              },
            });
          } catch (e) {
            console.error('[CameraLive] Failed to report to Sentry:', e);
          }
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[CameraLive] HTTP error:', nativeEvent.statusCode, nativeEvent.url);
          setError(true);
          setLoading(false);
        }}
        // Authentication
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
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
      />

      {/* Loading indicator */}
      {loading && !error && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading stream...</Text>
        </View>
      )}

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load camera</Text>
          <Text style={styles.errorHint}>Check your connection and try refreshing</Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
  webview: {
    flex: 1,
    backgroundColor: '#000',
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
    color: theme.colors.onPrimary,
    marginTop: 16,
    fontSize: 16,
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
    textAlign: 'center',
  },
});
