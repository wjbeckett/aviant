import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text, IconButton, SegmentedButtons , useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { frigateApi } from '../services/frigateApi';

// CookieManager only works on native platforms (iOS/Android), not web
let CookieManager: any = null;
if (Platform.OS !== 'web') {
  CookieManager = require('@react-native-cookies/cookies').default;
}

type StreamType = 'webrtc' | 'mse' | 'mjpeg';

export const CameraLiveScreen = ({ route, navigation }: any) => {
  const theme = useTheme();
  const { cameraName } = route.params;
  const [error, setError] = useState(false);
  const [streamType, setStreamType] = useState<StreamType>('mse'); // Start with MSE (best balance of quality and compatibility)

  const baseUrl = frigateApi.getBaseUrl();
  const baseUrlObj = new URL(baseUrl);
  
  // Frigate proxies go2rtc through the main server on port 443
  // WebSocket endpoints: /live/webrtc/api/ws and /live/mse/api/ws
  const wsProtocol = baseUrlObj.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsBaseUrl = `${wsProtocol}//${baseUrlObj.host}`;
  
  console.log('[CameraLive] Camera:', cameraName);
  console.log('[CameraLive] Base URL:', baseUrl);
  console.log('[CameraLive] WebSocket base:', wsBaseUrl);
  console.log('[CameraLive] Stream type:', streamType);
  
  // Ensure WebView has access to authentication cookies (native platforms only)
  useEffect(() => {
    if (!CookieManager || Platform.OS === 'web') {
      // On web, cookies are automatically managed by the browser
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
            secure: baseUrlObj.protocol === 'https:',
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

  // WebRTC stream HTML (using Frigate's proxied go2rtc WebSocket)
  const webrtcWsUrl = `${wsBaseUrl}/live/webrtc/api/ws?src=${cameraName}`;
  console.log('[CameraLive] WebRTC WS URL:', webrtcWsUrl);
  
  const webrtcHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; }
        body {
          background-color: ${theme.dark ? "#000" : "#fff"};
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
        }
        video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .error {
          color: ${theme.colors.error};
          padding: 20px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <video id="video" autoplay muted playsinline controls></video>
      <div id="error" class="error" style="display: none;">
        <h3>WebRTC Stream Failed</h3>
        <p id="errorMsg"></p>
      </div>
      <script>
        console.log('Initializing WebRTC stream for ${cameraName}');
        const video = document.getElementById('video');
        const errorDiv = document.getElementById('error');
        const errorMsg = document.getElementById('errorMsg');
        
        // Simple WebRTC implementation using native WebRTC APIs
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        pc.ontrack = (event) => {
          console.log('Received track:', event.track.kind);
          video.srcObject = event.streams[0];
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stream_loaded',
            streamType: 'webrtc'
          }));
        };
        
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        
        const ws = new WebSocket('${webrtcWsUrl}');
        
        ws.onopen = () => {
          console.log('WebSocket connected');
          pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
          }).then(() => {
            ws.send(JSON.stringify({
              type: 'webrtc/offer',
              value: pc.localDescription.sdp
            }));
          });
        };
        
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'webrtc/answer') {
            pc.setRemoteDescription(new RTCSessionDescription({
              type: 'answer',
              sdp: msg.value
            }));
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          errorMsg.textContent = 'WebSocket connection failed';
          errorDiv.style.display = 'block';
          video.style.display = 'none';
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stream_error',
            streamType: 'webrtc',
            error: 'WebSocket connection failed'
          }));
        };
        
        ws.onclose = () => {
          console.log('WebSocket closed');
        };
        
        pc.oniceconnectionstatechange = () => {
          console.log('ICE connection state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            errorMsg.textContent = 'Connection failed: ' + pc.iceConnectionState;
            errorDiv.style.display = 'block';
            video.style.display = 'none';
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'stream_error',
              streamType: 'webrtc',
              error: pc.iceConnectionState
            }));
          }
        };
      </script>
    </body>
    </html>
  `;

  // MSE stream HTML (using Frigate's proxied go2rtc WebSocket)
  const mseWsUrl = `${wsBaseUrl}/live/mse/api/ws?src=${cameraName}`;
  console.log('[CameraLive] MSE WS URL:', mseWsUrl);
  
  const mseHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; }
        body {
          background-color: ${theme.dark ? "#000" : "#fff"};
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
        }
        video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .error {
          color: ${theme.colors.error};
          padding: 20px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <video id="video" autoplay muted playsinline controls></video>
      <div id="error" class="error" style="display: none;">
        <h3>MSE Stream Failed</h3>
        <p id="errorMsg"></p>
      </div>
      <script>
        console.log('Initializing MSE stream for ${cameraName}');
        const video = document.getElementById('video');
        const errorDiv = document.getElementById('error');
        const errorMsg = document.getElementById('errorMsg');
        
        const mediaSource = new MediaSource();
        video.src = URL.createObjectURL(mediaSource);
        
        let sourceBuffer = null;
        let queue = [];
        
        mediaSource.addEventListener('sourceopen', () => {
          console.log('MediaSource opened');
          
          const ws = new WebSocket('${mseWsUrl}');
          ws.binaryType = 'arraybuffer';
          
          ws.onopen = () => {
            console.log('MSE WebSocket connected');
          };
          
          ws.onmessage = (event) => {
            if (typeof event.data === 'string') {
              const msg = JSON.parse(event.data);
              console.log('MSE control message:', msg);
              
              if (msg.type === 'mse' && msg.value) {
                try {
                  sourceBuffer = mediaSource.addSourceBuffer(msg.value);
                  sourceBuffer.mode = 'segments';
                  
                  sourceBuffer.addEventListener('updateend', () => {
                    if (queue.length > 0 && !sourceBuffer.updating) {
                      const data = queue.shift();
                      sourceBuffer.appendBuffer(data);
                    }
                  });
                  
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'stream_loaded',
                    streamType: 'mse'
                  }));
                } catch (e) {
                  console.error('Failed to add source buffer:', e);
                  errorMsg.textContent = 'Codec not supported: ' + msg.value;
                  errorDiv.style.display = 'block';
                  video.style.display = 'none';
                }
              }
            } else if (event.data instanceof ArrayBuffer) {
              if (sourceBuffer) {
                if (sourceBuffer.updating || queue.length > 0) {
                  queue.push(event.data);
                } else {
                  try {
                    sourceBuffer.appendBuffer(event.data);
                  } catch (e) {
                    console.error('Failed to append buffer:', e);
                  }
                }
              }
            }
          };
          
          ws.onerror = (error) => {
            console.error('MSE WebSocket error:', error);
            errorMsg.textContent = 'WebSocket connection failed';
            errorDiv.style.display = 'block';
            video.style.display = 'none';
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'stream_error',
              streamType: 'mse',
              error: 'WebSocket connection failed'
            }));
          };
          
          ws.onclose = () => {
            console.log('MSE WebSocket closed');
          };
        });
        
        mediaSource.addEventListener('sourceclose', () => {
          console.log('MediaSource closed');
        });
      </script>
    </body>
    </html>
  `;

  // MJPEG stream HTML (last resort fallback)
  const mjpegStreamUrl = frigateApi.getCameraMjpegStreamUrl(cameraName);
  console.log('[CameraLive] MJPEG URL:', mjpegStreamUrl);
  
  const mjpegHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; }
        body {
          background-color: ${theme.dark ? "#000" : "#fff"};
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
        }
        img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .error {
          color: ${theme.colors.error};
          padding: 20px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <img id="stream" src="${mjpegStreamUrl}" alt="Live Stream" 
           onerror="handleError()" 
           onload="handleLoad()" />
      <div id="error" class="error" style="display: none;">
        <h3>Stream Failed</h3>
        <p>URL: ${mjpegStreamUrl}</p>
      </div>
      <script>
        function handleLoad() {
          console.log('MJPEG stream loaded successfully');
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stream_loaded',
            url: '${mjpegStreamUrl}'
          }));
        }
        
        function handleError() {
          console.error('MJPEG stream failed to load');
          document.getElementById('stream').style.display = 'none';
          document.getElementById('error').style.display = 'block';
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stream_error',
            url: '${mjpegStreamUrl}'
          }));
        }
      </script>
    </body>
    </html>
  `;

  const getStreamHtml = () => {
    switch (streamType) {
      case 'webrtc':
        return webrtcHtml;
      case 'mse':
        return mseHtml;
      case 'mjpeg':
        return mjpegHtml;
      default:
        return webrtcHtml;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          iconColor="#FFF"
          onPress={() => navigation.goBack()}
        />
        <Text variant="titleLarge" style={styles.title}>
          {cameraName}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.streamControls}>
        <SegmentedButtons
          value={streamType}
          onValueChange={(value) => {
            console.log('[CameraLive] Switching to stream type:', value);
            setStreamType(value as StreamType);
            setError(false); // Reset error state when switching
          }}
          buttons={[
            { value: 'webrtc', label: 'WebRTC', icon: 'video-wireless' },
            { value: 'mse', label: 'MSE', icon: 'play-circle' },
            { value: 'mjpeg', label: 'MJPEG', icon: 'image-multiple' },
          ]}
          style={styles.segmentedButtons}
        />
      </View>

      <WebView
        key={streamType} // Force re-render when stream type changes
        source={{ html: getStreamHtml() }}
        style={styles.webview}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[CameraLive] WebView error:', nativeEvent);
          setError(true);
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log('[CameraLive] Message from WebView:', data);
            if (data.type === 'stream_error') {
              setError(true);
            } else if (data.type === 'stream_loaded') {
              setError(false);
            }
          } catch (e) {
            console.error('[CameraLive] Failed to parse WebView message:', e);
          }
        }}
        onLoadStart={() => console.log('[CameraLive] WebView load started')}
        onLoadEnd={() => console.log('[CameraLive] WebView load ended')}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
      />

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load stream</Text>
          <Text style={styles.errorHint}>Try switching to a different quality</Text>
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
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 44 : 0,
  },
  title: {
    color: theme.colors.onSurface,
    textTransform: 'capitalize',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 48,
  },
  streamControls: {
    backgroundColor: theme.colors.surface,
    padding: 8,
  },
  segmentedButtons: {
    backgroundColor: theme.colors.background,
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
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 16,
    marginBottom: 8,
  },
  errorHint: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
  },
});
