import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  Linking,
} from 'react-native';
import { Text, Button, ActivityIndicator, IconButton } from 'react-native-paper';
import { frigateApi, Event } from '../services/frigateApi';

export const EventDetailsScreen = ({ route, navigation }: any) => {
  const { eventId } = route.params;
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

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
      const clipUrl = frigateApi.getEventClipUrl(event.id);
      Linking.openURL(clipUrl);
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
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading event...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

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
          Event Details
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Image
          source={{ uri: frigateApi.getEventThumbnailUrl(event.id) }}
          style={styles.thumbnail}
          resizeMode="contain"
        />

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
          {event.has_clip && (
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
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
  detailsContainer: {
    backgroundColor: '#1E1E1E',
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
    borderBottomColor: '#2E2E2E',
  },
  label: {
    color: '#9E9E9E',
  },
  value: {
    color: '#FFFFFF',
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
    color: '#9E9E9E',
  },
  errorText: {
    color: '#F44336',
  },
});
