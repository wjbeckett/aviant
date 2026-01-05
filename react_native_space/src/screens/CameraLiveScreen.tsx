import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text, IconButton, SegmentedButtons } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { frigateApi } from '../services/frigateApi';

type StreamType = 'webrtc' | 'mse' | 'mjpeg';

export const CameraLiveScreen = ({ route, navigation }: any) => {
  const { cameraName } = route.params;
  const [error, setError] = useState(false);
  const [streamType, setStreamType] = useState<StreamType>('webrtc');

  const baseUrl = frigateApi.getBaseUrl();
  const baseUrlObj = new URL(baseUrl);
  
  // go2rtc runs on port 1984 by default
  const go2rtcUrl = `${baseUrlObj.protocol}//${baseUrlObj.hostname}:1984`;

  // WebRTC stream HTML (using go2rtc's built-in player)
  const webrtcHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; }
        body {
          background-color: #000;
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
      </style>
      <script src="${go2rtcUrl}/webrtc/webrtc.js"></script>
    </head>
    <body>
      <video id="video" autoplay muted playsinline controls></video>
      <script>
        const video = document.getElementById('video');
        const webrtc = new WebRTCPlayer(video, "${go2rtcUrl}/api/ws?src=${cameraName}");
      </script>
    </body>
    </html>
  `;

  // MSE/HLS stream HTML (fallback option)
  const mseHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; }
        body {
          background-color: #000;
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
      </style>
    </head>
    <body>
      <video id="video" autoplay muted playsinline controls></video>
      <script>
        const video = document.getElementById('video');
        const mediaSource = new MediaSource();
        video.src = URL.createObjectURL(mediaSource);
        
        mediaSource.addEventListener('sourceopen', () => {
          fetch('${go2rtcUrl}/api/stream.mp4?src=${cameraName}')
            .then(response => {
              const reader = response.body.getReader();
              const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.640028"');
              
              function push() {
                reader.read().then(({done, value}) => {
                  if (done) return;
                  sourceBuffer.appendBuffer(value);
                  if (!sourceBuffer.updating) push();
                });
              }
              
              sourceBuffer.addEventListener('updateend', push);
              push();
            });
        });
      </script>
    </body>
    </html>
  `;

  // MJPEG stream HTML (last resort fallback)
  const mjpegStreamUrl = frigateApi.getCameraMjpegStreamUrl(cameraName);
  const mjpegHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; }
        body {
          background-color: #000;
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
      </style>
    </head>
    <body>
      <img src="${mjpegStreamUrl}" alt="Live Stream" />
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
          onValueChange={(value) => setStreamType(value as StreamType)}
          buttons={[
            { value: 'webrtc', label: 'HD' },
            { value: 'mse', label: 'High' },
            { value: 'mjpeg', label: 'Low' },
          ]}
          style={styles.segmentedButtons}
        />
      </View>

      <WebView
        key={streamType} // Force re-render when stream type changes
        source={{ html: getStreamHtml() }}
        style={styles.webview}
        onError={() => setError(true)}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 44 : 0,
  },
  title: {
    color: '#FFF',
    textTransform: 'capitalize',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 48,
  },
  streamControls: {
    backgroundColor: '#1E1E1E',
    padding: 8,
  },
  segmentedButtons: {
    backgroundColor: '#121212',
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
    color: '#F44336',
    fontSize: 16,
    marginBottom: 8,
  },
  errorHint: {
    color: '#9E9E9E',
    fontSize: 14,
  },
});
