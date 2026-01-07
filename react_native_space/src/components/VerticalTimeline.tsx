import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { format } from 'date-fns';
import { frigateApi } from '../services/frigateApi';

/**
 * Vertical Timeline Component - UniFi Protect Inspired
 * 
 * Features:
 * - Clean vertical timeline with center spine
 * - LIVE indicator at top with blue horizontal line
 * - Time markers on the left
 * - Event thumbnails on the right
 * - Blue dots for motion events
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
  timeRangeHours?: number;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const TIME_COLUMN_WIDTH = 70;
const SPINE_LEFT = TIME_COLUMN_WIDTH + 20;

// Zoom levels: interval in minutes, row height, hours to show
const ZOOM_LEVELS = [
  { interval: 1, rowHeight: 40, hours: 0.25, label: '1m' },    // 15 min view
  { interval: 2, rowHeight: 45, hours: 0.5, label: '2m' },     // 30 min view
  { interval: 5, rowHeight: 50, hours: 1, label: '5m' },       // 1 hour view
  { interval: 10, rowHeight: 50, hours: 2, label: '10m' },     // 2 hour view (default)
  { interval: 30, rowHeight: 55, hours: 6, label: '30m' },     // 6 hour view
  { interval: 60, rowHeight: 60, hours: 12, label: '1h' },     // 12 hour view
];
const DEFAULT_ZOOM_INDEX = 3; // 10 minute intervals

export const VerticalTimeline: React.FC<VerticalTimelineProps> = ({
  onTimeSelect,
  events,
  currentTime,
  timeRangeHours = 2,
}) => {
  const theme = useTheme();
  const isDark = theme.dark;
  const scrollViewRef = useRef<ScrollView>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Zoom state
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const zoomLevel = ZOOM_LEVELS[zoomIndex];
  
  const styles = createStyles(theme, isDark, zoomLevel.rowHeight);
  
  // Auto-update time every 10 seconds
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const timeRangeMs = zoomLevel.hours * 60 * 60 * 1000;

  // Generate time markers based on zoom level
  const generateTimeMarkers = () => {
    const markers: number[] = [];
    const interval = zoomLevel.interval * 60 * 1000;
    const startTime = now - timeRangeMs;
    for (let time = now; time >= startTime; time -= interval) {
      markers.push(time);
    }
    return markers;
  };

  const timeMarkers = generateTimeMarkers();
  const totalHeight = timeMarkers.length * zoomLevel.rowHeight + 80;
  
  // Zoom in/out handlers
  const handleZoomIn = useCallback(() => {
    setZoomIndex(prev => Math.max(0, prev - 1));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setZoomIndex(prev => Math.min(ZOOM_LEVELS.length - 1, prev + 1));
  }, []);

  const getScrollFromTimestamp = (timestamp: number | 'LIVE'): number => {
    if (timestamp === 'LIVE') return 0;
    const ageMs = now - timestamp;
    const ratio = ageMs / timeRangeMs;
    return ratio * (totalHeight - 80) + 60;
  };

  const handleScroll = (event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    
    setIsScrolling(true);
    
    // Determine timestamp from scroll position
    if (scrollY < 40) {
      onTimeSelect('LIVE');
    } else {
      const ratio = (scrollY - 60) / (totalHeight - 80);
      const timestamp = now - (ratio * timeRangeMs);
      onTimeSelect(Math.max(timestamp, now - timeRangeMs));
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 150);
  };

  const handleEventTap = (event: TimelineEvent) => {
    const timestamp = event.start_time * 1000;
    onTimeSelect(timestamp);
    const scrollY = getScrollFromTimestamp(timestamp);
    scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
  };

  // Get events near a time marker (within 5 min)
  const getEventsNearMarker = (markerTime: number) => {
    const range = 5 * 60 * 1000;
    return events.filter(event => {
      const eventTime = event.start_time * 1000;
      return Math.abs(eventTime - markerTime) < range;
    });
  };

  // Get thumbnail URL for event
  const getThumbnailUrl = (event: TimelineEvent) => {
    const baseUrl = frigateApi.getBaseUrl();
    return `${baseUrl}/api/events/${event.id}/thumbnail.jpg`;
  };

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
        contentContainerStyle={{ minHeight: totalHeight }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Vertical spine line */}
        <View style={styles.spineContainer}>
          <View style={styles.spine} />
        </View>

        {/* LIVE Section */}
        <TouchableOpacity
          style={styles.liveRow}
          onPress={() => {
            onTimeSelect('LIVE');
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
          }}
          activeOpacity={0.7}
        >
          <View style={styles.liveTimeColumn} />
          <View style={styles.liveBadgeContainer}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            <View style={styles.liveHorizontalLine} />
          </View>
        </TouchableOpacity>

        {/* Time Markers */}
        {timeMarkers.map((markerTime, index) => {
          const markerEvents = getEventsNearMarker(markerTime);
          const hasEvents = markerEvents.length > 0;
          const isSelected = currentTime !== 'LIVE' && 
            Math.abs(markerTime - (currentTime as number)) < 5 * 60 * 1000;

          return (
            <TouchableOpacity
              key={index}
              style={styles.timeRow}
              onPress={() => onTimeSelect(markerTime)}
              activeOpacity={0.7}
            >
              {/* Time label */}
              <View style={styles.timeColumn}>
                <Text style={[styles.timeText, isSelected && styles.timeTextSelected]}>
                  {format(markerTime, 'h:mm a')}
                </Text>
              </View>

              {/* Spine dot */}
              <View style={styles.dotColumn}>
                {hasEvents ? (
                  <View style={[styles.eventDot, isSelected && styles.eventDotSelected]} />
                ) : (
                  <View style={styles.smallTick} />
                )}
                {isSelected && <View style={styles.selectedLine} />}
              </View>

              {/* Event content */}
              <View style={styles.contentColumn}>
                {markerEvents.slice(0, 1).map((event) => (
                  <TouchableOpacity
                    key={event.id}
                    style={styles.eventCard}
                    onPress={() => handleEventTap(event)}
                  >
                    <Image
                      source={{ 
                        uri: getThumbnailUrl(event),
                        headers: { Authorization: `Bearer ${frigateApi.getJWTToken()}` }
                      }}
                      style={styles.thumbnail}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Current time overlay when not LIVE */}
      {currentTime !== 'LIVE' && (
        <View style={styles.currentTimeOverlay} pointerEvents="none">
          <View style={styles.currentTimeBadge}>
            <Text style={styles.currentTimeText}>
              {format(currentTime as number, 'h:mm:ss a')}
            </Text>
          </View>
          <View style={styles.currentTimeLine} />
        </View>
      )}
      
      {/* Zoom controls */}
      <View style={styles.zoomControls}>
        <IconButton
          icon="magnify-plus"
          size={20}
          onPress={handleZoomIn}
          disabled={zoomIndex === 0}
          style={styles.zoomButton}
          iconColor={isDark ? '#fff' : '#333'}
        />
        <View style={styles.zoomLabelContainer}>
          <Text style={styles.zoomLabel}>{zoomLevel.label}</Text>
        </View>
        <IconButton
          icon="magnify-minus"
          size={20}
          onPress={handleZoomOut}
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          style={styles.zoomButton}
          iconColor={isDark ? '#fff' : '#333'}
        />
      </View>
    </View>
  );
};

const createStyles = (theme: any, isDark: boolean, rowHeight: number = 50) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
    },
    scrollView: {
      flex: 1,
    },
    spineContainer: {
      position: 'absolute',
      left: SPINE_LEFT,
      top: 0,
      bottom: 0,
      width: 2,
    },
    spine: {
      flex: 1,
      width: 2,
      backgroundColor: isDark ? '#3a3a3a' : '#d0d0d0',
    },
    liveRow: {
      height: 60,
      flexDirection: 'row',
      alignItems: 'center',
    },
    liveTimeColumn: {
      width: TIME_COLUMN_WIDTH,
    },
    liveBadgeContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 10,
    },
    liveBadge: {
      backgroundColor: '#007AFF',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 4,
      zIndex: 2,
    },
    liveBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    liveHorizontalLine: {
      flex: 1,
      height: 2,
      backgroundColor: '#007AFF',
      marginLeft: -2,
    },
    timeRow: {
      height: rowHeight,
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeColumn: {
      width: TIME_COLUMN_WIDTH,
      paddingRight: 8,
      alignItems: 'flex-end',
    },
    timeText: {
      fontSize: 12,
      color: isDark ? '#888' : '#666',
      fontWeight: '500',
    },
    timeTextSelected: {
      color: '#007AFF',
      fontWeight: '700',
    },
    dotColumn: {
      width: 40,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    eventDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#007AFF',
    },
    eventDotSelected: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: '#007AFF',
    },
    smallTick: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? '#555' : '#bbb',
    },
    selectedLine: {
      position: 'absolute',
      left: 20,
      right: -SCREEN_WIDTH,
      height: 2,
      backgroundColor: '#007AFF',
    },
    contentColumn: {
      flex: 1,
      paddingLeft: 12,
      paddingRight: 16,
    },
    eventCard: {
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: isDark ? '#2a2a2a' : '#fff',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.4 : 0.15,
          shadowRadius: 4,
        },
        android: {
          elevation: 3,
        },
      }),
    },
    thumbnail: {
      width: '100%',
      height: 50,
      backgroundColor: isDark ? '#333' : '#eee',
    },
    currentTimeOverlay: {
      position: 'absolute',
      top: '40%',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
    },
    currentTimeBadge: {
      backgroundColor: '#007AFF',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      marginLeft: 8,
    },
    currentTimeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
    currentTimeLine: {
      flex: 1,
      height: 2,
      backgroundColor: '#007AFF',
      marginLeft: 4,
    },
    zoomControls: {
      position: 'absolute',
      bottom: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderRadius: 20,
      paddingHorizontal: 4,
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
    zoomButton: {
      margin: 0,
    },
    zoomLabelContainer: {
      paddingHorizontal: 4,
      minWidth: 30,
      alignItems: 'center',
    },
    zoomLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#aaa' : '#666',
    },
  });
