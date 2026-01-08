import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { Text, Button, ActivityIndicator, IconButton, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Video, { VideoRef } from 'react-native-video';
import { frigateApi, Event } from '../services/frigateApi';

export const EventDetailsScreen = ({ route, navigation }: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { eventId } = route.params;
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVideo, setShowVideo] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const videoRef = useRef<VideoRef>(null);

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  const loadEvent = async () => {
    try {
      const eventData = await frigateApi.getEvent(eventId);
      setEvent(eventData);
    } catch (err) {
      console.error('Failed to load event:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewClip = () => {
    if (event) {
      setShowVideo(true);
      setVideoLoading(true);
    }
  };

  const handleGoToLive = () => {
    if (event) {
      navigation.navigate('CameraLive', { cameraName: event.camera });
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.surface} />
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading event...</Text>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.surface} />
        <Text style={styles.errorText}>Event not found</Text>
      </SafeAreaView>
    );
  }

  const clipUrl = frigateApi.getEventClipUrl(event.id);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.surface} />
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          iconColor={theme.colors.onSurface}
          onPress={() => navigation.goBack()}
        />
        <Text variant="titleLarge" style={styles.title}>
          Event Details
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Video Player or Thumbnail */}
        {showVideo ? (
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{ uri: clipUrl }}
              style={styles.video}
              resizeMode="contain"
              controls={true}
              paused={false}
              onReadyForDisplay={() => setVideoLoading(false)}
              onError={(err) => {
                console.error('[EventDetails] Video error:', err);
                setVideoLoading(false);
              }}
            />
            {videoLoading && (
              <View style={styles.videoLoading}>
                <ActivityIndicator size="large" color="#FFF" />
              </View>
            )}
            <IconButton
              icon="close"
              size={24}
              iconColor="#FFF"
              style={styles.closeVideoButton}
              onPress={() => setShowVideo(false)}
            />
          </View>
        ) : (
          <Image
            source={{ uri: frigateApi.getEventThumbnailUrl(event.id) }}
            style={styles.thumbnail}
            resizeMode="contain"
          />
        )}

        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Text variant="labelLarge" style={styles.label}>
              Camera
            </Text>
            <Text variant="bodyLarge" style={styles.value}>
              {event.camera}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="labelLarge" style={styles.label}>
              Detection
            </Text>
            <Text variant="bodyLarge" style={styles.value}>
              {event.label}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="labelLarge" style={styles.label}>
              Start Time
            </Text>
            <Text variant="bodyLarge" style={styles.value}>
              {formatTime(event.start_time)}
            </Text>
          </View>

          {event.end_time && (
            <View style={styles.detailRow}>
              <Text variant="labelLarge" style={styles.label}>
                End Time
              </Text>
              <Text variant="bodyLarge" style={styles.value}>
                {formatTime(event.end_time)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {event.has_clip && !showVideo && (
            <Button
              mode="contained"
              onPress={handleViewClip}
              style={styles.button}
              icon="play-circle"
            >
              View Clip
            </Button>
          )}
          <Button
            mode="outlined"
            onPress={handleGoToLive}
            style={styles.button}
            icon="camera"
          >
            Go to Live View
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
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
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 48,
  },
  scrollContent: {
    padding: 16,
  },
  thumbnail: {
    width: '100%',
    height: 300,
    backgroundColor: '#000',
    borderRadius: 12,
    marginBottom: 24,
  },
  videoContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#000',
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeVideoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  detailsContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
  },
  label: {
    color: theme.colors.onSurfaceVariant,
  },
  value: {
    color: theme.colors.onSurface,
    textTransform: 'capitalize',
  },
  actions: {
    gap: 12,
  },
  button: {
    marginBottom: 8,
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.onSurfaceVariant,
  },
  errorText: {
    color: theme.colors.error,
  },
});
