import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { Text, Badge, useTheme } from 'react-native-paper';
import { frigateApi } from '../services/frigateApi';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

/**
 * Live Camera Thumbnail Component
 * 
 * Features:
 * - Auto-refreshing thumbnail (1 fps)
 * - Event detection overlay (person, car, etc.)
 * - Live indicator badge
 * - Smooth image transitions
 * 
 * Mimics Frigate PWA's camera preview cards
 */

interface Event {
  id: string;
  label: string; // 'person', 'car', 'dog', etc.
  score: number;
  box: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1
}

interface CameraStats {
  camera_fps: number;
  detection_fps: number;
  process_fps: number;
  skipped_fps: number;
}

interface LiveCameraThumbnailProps {
  cameraName: string;
  width?: number;
  height?: number;
  refreshInterval?: number; // milliseconds
  showEventOverlay?: boolean;
}

export const LiveCameraThumbnail: React.FC<LiveCameraThumbnailProps> = ({
  cameraName,
  width = Dimensions.get('window').width - 32,
  height = 200,
  refreshInterval = 1000, // 1 fps default
  showEventOverlay = true,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  
  const [imageUrl, setImageUrl] = useState<string>('');
  const [events, setEvents] = useState<Event[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [stats, setStats] = useState<CameraStats | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const baseUrl = frigateApi.getBaseUrl();
  const token = frigateApi.getJWTToken();

  // Fetch latest thumbnail
  const fetchThumbnail = () => {
    // Add timestamp to prevent caching
    const url = `${baseUrl}/api/${cameraName}/latest.jpg?token=${token}&t=${Date.now()}`;
    setImageUrl(url);
  };

  // Fetch current events (for overlay)
  const fetchEvents = async () => {
    try {
      const response = await fetch(
        `${baseUrl}/api/events?camera=${cameraName}&has_clip=false&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          const event = data[0];
          // Check if event is recent (within last 5 seconds)
          const eventTime = new Date(event.start_time * 1000);
          const now = new Date();
          const ageMs = now.getTime() - eventTime.getTime();
          
          if (ageMs < 5000 && event.box) {
            setEvents([{
              id: event.id,
              label: event.label,
              score: event.top_score || 0,
              box: event.box,
            }]);
            setIsLive(true);
          } else {
            setEvents([]);
            setIsLive(false);
          }
        } else {
          setEvents([]);
          setIsLive(false);
        }
      }
    } catch (error) {
      console.error('[LiveThumbnail] Failed to fetch events:', error);
    }
  };

  // Fetch camera stats
  const fetchStats = async () => {
    try {
      const response = await fetch(
        `${baseUrl}/api/stats`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data[cameraName]) {
          setStats(data[cameraName]);
        }
      }
    } catch (error) {
      console.error('[LiveThumbnail] Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchThumbnail();
    if (showEventOverlay) {
      fetchEvents();
    }

    // Set up periodic refresh
    intervalRef.current = setInterval(() => {
      fetchThumbnail();
      if (showEventOverlay) {
        fetchEvents();
      }
    }, refreshInterval);

    // Fetch stats every 5 seconds
    const statsInterval = setInterval(fetchStats, 5000);
    fetchStats();

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearInterval(statsInterval);
    };
  }, [cameraName, refreshInterval, showEventOverlay]);

  // Convert normalized box coordinates to pixel coordinates
  const getBoxCoordinates = (box: [number, number, number, number]) => {
    const [x1, y1, x2, y2] = box;
    return {
      x: x1 * width,
      y: y1 * height,
      width: (x2 - x1) * width,
      height: (y2 - y1) * height,
    };
  };

  return (
    <View style={[styles.container, { width, height }]}>
      {/* Live thumbnail */}
      <Image
        source={{ uri: imageUrl }}
        style={styles.image}
        resizeMode="cover"
      />

      {/* Event detection overlay */}
      {showEventOverlay && events.length > 0 && (
        <Svg style={styles.overlay} width={width} height={height}>
          {events.map((event) => {
            const box = getBoxCoordinates(event.box);
            return (
              <React.Fragment key={event.id}>
                {/* Bounding box */}
                <Rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  stroke="#ff0000"
                  strokeWidth={2}
                  fill="none"
                />
                {/* Label */}
                <Rect
                  x={box.x}
                  y={box.y - 20}
                  width={100}
                  height={20}
                  fill="rgba(255, 0, 0, 0.8)"
                />
                <SvgText
                  x={box.x + 5}
                  y={box.y - 5}
                  fill="white"
                  fontSize={12}
                  fontWeight="bold"
                >
                  {event.label} {Math.round(event.score * 100)}%
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      )}

      {/* Live indicator badge */}
      {isLive && (
        <View style={styles.liveBadge}>
          <Badge style={styles.badge}>🔴 LIVE</Badge>
        </View>
      )}

      {/* Camera stats */}
      {stats && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {stats.camera_fps.toFixed(0)} fps • {stats.detection_fps.toFixed(1)} det
          </Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  badge: {
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statsContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statsText: {
    color: '#fff',
    fontSize: 10,
  },
});
