import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  Pressable,
} from 'react-native';
import { Text, ActivityIndicator, Chip, Appbar , useTheme } from 'react-native-paper';
import { frigateApi, Event } from '../services/frigateApi';

export const EventsScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const eventList = await frigateApi.getEvents({ limit: 50 });
      setEvents(eventList);
    } catch (err: any) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadEvents();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const renderEvent = ({ item }: { item: Event }) => (
    <Pressable
      style={styles.eventCard}
      onPress={() => navigation.navigate('EventDetails', { eventId: item.id })}
    >
      <Image
        source={{ uri: frigateApi.getEventThumbnailUrl(item.id) }}
        style={styles.eventThumbnail}
        resizeMode="cover"
      />
      <View style={styles.eventInfo}>
        <View style={styles.eventHeader}>
          <Text variant="titleMedium" style={styles.eventCamera}>
            {item.camera}
          </Text>
          <Chip mode="flat" textStyle={styles.chipText}>
            {item.label}
          </Chip>
        </View>
        <Text variant="bodySmall" style={styles.eventTime}>
          {formatTime(item.start_time)}
        </Text>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.Content title="Events" />
        </Appbar.Header>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.Content title="Events" />
        </Appbar.Header>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No events found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Events" />
      </Appbar.Header>
      <FlatList
        data={events}
        renderItem={renderEvent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />
    </View>
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
  listContent: {
    padding: 16,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 4,
  },
  eventThumbnail: {
    width: 120,
    height: 90,
    backgroundColor: '#000',
  },
  eventInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventCamera: {
    color: theme.colors.onSurface,
    textTransform: 'capitalize',
    flex: 1,
  },
  eventTime: {
    color: theme.colors.onSurfaceVariant,
  },
  chipText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.onSurfaceVariant,
  },
  emptyText: {
    color: theme.colors.onSurfaceVariant,
  },
});
