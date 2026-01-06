import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Text, Badge, useTheme } from 'react-native-paper';
import { format } from 'date-fns';

/**
 * Vertical Timeline Component
 * 
 * Features:
 * - Scrollable vertical timeline
 * - "LIVE" indicator at top
 * - Time markers every 5 minutes
 * - Event markers (person, car, etc.)
 * - Tap event to jump to timestamp
 * - Smooth scrolling
 */

interface TimelineEvent {
  id: string;
  label: string;
  start_time: number;
  end_time: number;
  thumbnail?: string;
  has_clip: boolean;
}

interface VerticalTimelineProps {
  onTimeSelect: (timestamp: number | 'LIVE') => void;
  events: TimelineEvent[];
  currentTime: number | 'LIVE';
  timeRangeHours?: number; // How many hours to show (default 1)
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const TIMELINE_HEIGHT = SCREEN_HEIGHT * 0.7;
const MINUTES_PER_PIXEL = 0.1; // 10 pixels per minute

export const VerticalTimeline: React.FC<VerticalTimelineProps> = ({
  onTimeSelect,
  events,
  currentTime,
  timeRangeHours = 1,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const scrollViewRef = useRef<ScrollView>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const now = Date.now();
  const timeRangeMs = timeRangeHours * 60 * 60 * 1000;
  const startTime = now - timeRangeMs;

  // Generate time markers (every 5 minutes)
  const generateTimeMarkers = () => {
    const markers: number[] = [];
    const interval = 5 * 60 * 1000; // 5 minutes
    for (let time = now; time >= startTime; time -= interval) {
      markers.push(time);
    }
    return markers;
  };

  const timeMarkers = generateTimeMarkers();
  const totalHeight = timeMarkers.length * 60; // 60 pixels per marker

  // Convert scroll position to timestamp
  const getTimestampFromScroll = (scrollY: number): number | 'LIVE' => {
    if (scrollY < 30) return 'LIVE'; // Top 30px = LIVE
    
    const ratio = scrollY / totalHeight;
    const timestamp = now - (ratio * timeRangeMs);
    return timestamp;
  };

  // Convert timestamp to scroll position
  const getScrollFromTimestamp = (timestamp: number | 'LIVE'): number => {
    if (timestamp === 'LIVE') return 0;
    
    const ageMs = now - timestamp;
    const ratio = ageMs / timeRangeMs;
    return ratio * totalHeight;
  };

  // Handle scroll
  const handleScroll = (event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    const timestamp = getTimestampFromScroll(scrollY);
    
    setIsScrolling(true);
    onTimeSelect(timestamp);

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set new timeout
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  };

  // Handle event tap
  const handleEventTap = (event: TimelineEvent) => {
    const timestamp = event.start_time * 1000;
    onTimeSelect(timestamp);
    
    // Scroll to event position
    const scrollY = getScrollFromTimestamp(timestamp);
    scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
  };

  // Get events near a time marker
  const getEventsNearMarker = (markerTime: number) => {
    const range = 2.5 * 60 * 1000; // 2.5 minutes before and after
    return events.filter(event => {
      const eventTime = event.start_time * 1000;
      return Math.abs(eventTime - markerTime) < range;
    });
  };

  // Format time for display
  const formatTime = (timestamp: number) => {
    return format(timestamp, 'HH:mm');
  };

  // Get emoji for event label
  const getEventEmoji = (label: string) => {
    const emojiMap: { [key: string]: string } = {
      person: '🚶',
      car: '🚗',
      dog: '🐕',
      cat: '🐈',
      bird: '🐦',
      package: '📦',
    };
    return emojiMap[label.toLowerCase()] || '📹';
  };

  // Scroll to current time when currentTime changes externally
  useEffect(() => {
    if (!isScrolling && currentTime !== 'LIVE') {
      const scrollY = getScrollFromTimestamp(currentTime);
      scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
    }
  }, [currentTime]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={{ height: totalHeight + 100 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* LIVE indicator at top */}
        <View style={styles.liveSection}>
          <View style={styles.liveIndicator}>
            <Text style={styles.liveText}>🔴 LIVE</Text>
          </View>
        </View>

        {/* Time markers */}
        {timeMarkers.map((markerTime, index) => {
          const nearbyEvents = getEventsNearMarker(markerTime);
          const isCurrentMarker =
            currentTime !== 'LIVE' &&
            Math.abs(currentTime - markerTime) < 2.5 * 60 * 1000;

          return (
            <View key={markerTime} style={styles.markerContainer}>
              {/* Time label */}
              <View
                style={[
                  styles.timeLabel,
                  isCurrentMarker && styles.currentTimeLabel,
                ]}
              >
                <Text
                  style={[
                    styles.timeText,
                    isCurrentMarker && styles.currentTimeText,
                  ]}
                >
                  {formatTime(markerTime)}
                </Text>
              </View>

              {/* Vertical line */}
              <View
                style={[
                  styles.verticalLine,
                  nearbyEvents.length > 0 && styles.verticalLineWithEvents,
                  isCurrentMarker && styles.currentVerticalLine,
                ]}
              />

              {/* Event badges */}
              {nearbyEvents.length > 0 && (
                <View style={styles.eventBadges}>
                  {nearbyEvents.map((event) => (
                    <TouchableOpacity
                      key={event.id}
                      onPress={() => handleEventTap(event)}
                      style={styles.eventBadge}
                    >
                      <Badge style={styles.badge}>
                        {getEventEmoji(event.label)} {event.label}
                      </Badge>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Current time indicator overlay */}
      {currentTime !== 'LIVE' && (
        <View style={styles.currentTimeOverlay}>
          <View style={styles.currentTimeMarker}>
            <Text style={styles.currentTimeOverlayText}>
              {formatTime(
                typeof currentTime === 'number' ? currentTime : now
              )}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1, // Fill remaining space between video and controls
      width: '100%',
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.outline,
    },
    scrollView: {
      flex: 1,
    },
    liveSection: {
      height: 60,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 8,
    },
    liveIndicator: {
      backgroundColor: 'rgba(255, 0, 0, 0.1)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(255, 0, 0, 0.3)',
    },
    liveText: {
      fontSize: 11,
      fontWeight: 'bold',
      color: '#ff0000',
    },
    markerContainer: {
      height: 60,
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
    },
    timeLabel: {
      position: 'absolute',
      left: 4,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      zIndex: 2,
    },
    currentTimeLabel: {
      backgroundColor: theme.colors.primaryContainer,
    },
    timeText: {
      fontSize: 10,
      color: theme.colors.onSurfaceVariant,
    },
    currentTimeText: {
      color: theme.colors.primary,
      fontWeight: 'bold',
    },
    verticalLine: {
      width: 2,
      height: '100%',
      backgroundColor: theme.colors.outlineVariant,
      position: 'absolute',
      left: '50%',
      marginLeft: -1,
    },
    verticalLineWithEvents: {
      backgroundColor: theme.colors.primary,
      width: 3,
    },
    currentVerticalLine: {
      backgroundColor: theme.colors.primary,
      width: 4,
    },
    eventBadges: {
      position: 'absolute',
      right: 4,
      zIndex: 3,
    },
    eventBadge: {
      marginVertical: 2,
    },
    badge: {
      fontSize: 9,
      backgroundColor: theme.colors.errorContainer,
    },
    currentTimeOverlay: {
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      alignItems: 'center',
      marginTop: -15,
      pointerEvents: 'none',
    },
    currentTimeMarker: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        },
        android: {
          elevation: 4,
        },
      }),
    },
    currentTimeOverlayText: {
      fontSize: 10,
      fontWeight: 'bold',
      color: theme.colors.onPrimary,
    },
  });
