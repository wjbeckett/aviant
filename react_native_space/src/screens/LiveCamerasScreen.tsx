import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  Pressable,
  StatusBar,
  ScrollView,
  Modal,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { Text, ActivityIndicator, Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { frigateApi, Camera, Event } from '../services/frigateApi';
import { frigateWebSocket, CameraActivityMap, FrigateEventMessage } from '../services/frigateWebSocket';
import { SmartCameraThumbnail } from '../components/SmartCameraThumbnail';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';

type LayoutMode = 'grid' | 'stacked';

interface RecentEvent extends Event {}

export const LiveCamerasScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { logout } = useAuth();
  
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('stacked');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showConnectionTooltip, setShowConnectionTooltip] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [cameraLastMotion, setCameraLastMotion] = useState<Record<string, number>>({});
  const [cameraThumbnailTimestamps, setCameraThumbnailTimestamps] = useState<Record<string, number>>({});
  const [cameraMotionActive, setCameraMotionActive] = useState<Record<string, boolean>>({});
  const [cameraActiveDetections, setCameraActiveDetections] = useState<Record<string, boolean>>({});
  const [wsConnected, setWsConnected] = useState(false);

  const screenWidth = Dimensions.get('window').width;

  const loadCameras = useCallback(async () => {
    try {
      setError(null);
      const cameraList = await frigateApi.getCameras();
      setCameras(cameraList.filter((c) => c.enabled));
      setIsConnected(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load cameras');
      setIsConnected(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadRecentEvents = useCallback(async () => {
    try {
      const events = await frigateApi.getEvents({ limit: 20 });
      setRecentEvents(events);
      
      // Build last motion map per camera
      const motionMap: Record<string, number> = {};
      events.forEach(event => {
        if (!motionMap[event.camera] || event.start_time > motionMap[event.camera]) {
          motionMap[event.camera] = event.start_time;
        }
      });
      setCameraLastMotion(motionMap);
    } catch (err) {
      console.error('[LiveCameras] Failed to load events:', err);
    }
  }, []);

  // Load last motion times from recent events
  const loadLastMotionTimes = useCallback(async () => {
    try {
      const events = await frigateApi.getEvents({ limit: 20 });
      const lastMotionMap: Record<string, number> = {};
      events.forEach(event => {
        if (!lastMotionMap[event.camera] || event.start_time > lastMotionMap[event.camera]) {
          lastMotionMap[event.camera] = event.start_time;
        }
      });
      setCameraLastMotion(lastMotionMap);
    } catch (err) {
      console.error('[LiveCameras] Failed to load motion times:', err);
    }
  }, []);

  // Handle WebSocket camera activity updates (motion state) - for live switching
  const handleCameraActivity = useCallback((activity: CameraActivityMap) => {
    const newMotionState: Record<string, boolean> = {};
    
    for (const [camera, state] of Object.entries(activity)) {
      newMotionState[camera] = state.motion;
    }
    
    // Log cameras with motion
    const camerasWithMotion = Object.entries(newMotionState)
      .filter(([_, motion]) => motion)
      .map(([cam]) => cam);
    if (camerasWithMotion.length > 0) {
      console.log('[Dashboard] Cameras with motion:', camerasWithMotion.join(', '));
    }
    
    setCameraMotionActive(prev => {
      const changed = Object.entries(newMotionState).some(
        ([cam, motion]) => prev[cam] !== motion
      );
      if (changed) {
        console.log('[Dashboard] Motion state changed:', newMotionState);
      }
      if (!changed) return prev;
      return { ...prev, ...newMotionState };
    });
  }, []);

  // Refresh all thumbnails (called on mount and focus)
  const refreshAllThumbnails = useCallback(() => {
    const now = Date.now();
    console.log('[Dashboard] Refreshing all thumbnails at', now);
    setCameraThumbnailTimestamps(prev => {
      const updated: Record<string, number> = {};
      cameras.forEach(camera => {
        updated[camera.name] = now;
      });
      return updated;
    });
  }, [cameras]);

  // Initial load
  useEffect(() => {
    console.log('[Dashboard] Initial load');
    loadCameras();
    loadRecentEvents();
    loadLastMotionTimes();
  }, [loadCameras, loadRecentEvents, loadLastMotionTimes]);

  // Set up WebSocket connection and intervals
  useEffect(() => {
    if (cameras.length === 0) return;
    
    console.log('[Dashboard] Setting up WebSocket and intervals for', cameras.length, 'cameras');
    
    // Initial refresh
    refreshAllThumbnails();
    
    // Connect to WebSocket for real-time events
    frigateWebSocket.connect();
    
    // Subscribe to camera activity (motion topics) for live switching
    const unsubscribeActivity = frigateWebSocket.onCameraActivity(handleCameraActivity);
    
    // Track active detections per camera for red border + live event ribbon updates
    const detectionTimeouts: Record<string, NodeJS.Timeout> = {};
    const addedEventIds = new Set<string>();
    
    const unsubscribeEvents = frigateWebSocket.onEvent((event, camera, label) => {
      const payload = event.after;
      const isLive = payload.active && !payload.stationary && !payload.end_time;
      const eventType = event.type;
      
      if (isLive) {
        // Clear any pending timeout
        if (detectionTimeouts[camera]) {
          clearTimeout(detectionTimeouts[camera]);
        }
        setCameraActiveDetections(prev => ({ ...prev, [camera]: true }));
        // Auto-clear after 3 seconds if no more updates
        detectionTimeouts[camera] = setTimeout(() => {
          setCameraActiveDetections(prev => ({ ...prev, [camera]: false }));
        }, 3000);
      } else if (payload.end_time) {
        // Detection ended
        if (detectionTimeouts[camera]) {
          clearTimeout(detectionTimeouts[camera]);
        }
        setCameraActiveDetections(prev => ({ ...prev, [camera]: false }));
      }
      
      // Add new DETECTIONS to ribbon (notification-worthy items only)
      const notificationLabels = ['person', 'car', 'dog', 'cat', 'package', 'motorcycle', 'bicycle', 'face', 'license_plate'];
      const isNotificationWorthy = eventType === 'new' 
        && notificationLabels.includes(payload.label)
        && payload.top_score >= 0.5;
      
      if (isNotificationWorthy && !addedEventIds.has(payload.id)) {
        addedEventIds.add(payload.id);
        const newEvent: RecentEvent = {
          id: payload.id,
          camera: payload.camera,
          label: payload.label,
          start_time: payload.start_time,
          end_time: payload.end_time || null,
          has_clip: payload.has_clip,
          has_snapshot: payload.has_snapshot,
        };
        setRecentEvents(prev => [newEvent, ...prev.slice(0, 19)]); // Keep max 20
        console.log(`[Dashboard] 🔔 Detection added to ribbon: ${label} on ${camera} (score: ${payload.top_score.toFixed(2)})`);
        
        // Update last motion time for this camera
        setCameraLastMotion(prev => ({
          ...prev,
          [camera]: payload.start_time
        }));
      }
    });
    
    const unsubscribeConnection = frigateWebSocket.onConnectionChange((connected) => {
      console.log('[Dashboard] WebSocket connected:', connected);
      setWsConnected(connected);
      setIsConnected(connected);
    });
    
    // Periodic thumbnail refresh every 60 seconds (for idle cameras)
    const thumbnailInterval = setInterval(() => {
      console.log('[Dashboard] Periodic thumbnail refresh');
      refreshAllThumbnails();
    }, 60000);
    
    return () => {
      unsubscribeActivity();
      unsubscribeEvents();
      unsubscribeConnection();
      clearInterval(thumbnailInterval);
      Object.values(detectionTimeouts).forEach(clearTimeout);
      frigateWebSocket.disconnect();
    };
  }, [cameras.length, handleCameraActivity, refreshAllThumbnails]);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      console.log('[Dashboard] Screen focused');
      loadRecentEvents();
      loadLastMotionTimes();
      if (cameras.length > 0) {
        refreshAllThumbnails();
      }
      // Reconnect WebSocket if disconnected
      if (!frigateWebSocket.isConnected()) {
        frigateWebSocket.connect();
      }
    }, [loadRecentEvents, loadLastMotionTimes, cameras.length, refreshAllThumbnails])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadCameras();
    loadRecentEvents();
  };

  const handleLogout = () => {
    setShowProfileMenu(false);
    Alert.alert(
      'Logout',
      'Are you sure you want to logout from Frigate?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (diff < 172800) return 'Yesterday';
    
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatMotionTime = (timestamp: number): string => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 60) return 'Motion just now';
    if (diff < 3600) return `Motion ${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `Motion ${Math.floor(diff / 3600)}h ago`;
    return 'No recent motion';
  };

  const getLabelIcon = (label: string): string => {
    const lower = label.toLowerCase();
    if (lower === 'person') return 'walk';
    if (lower === 'car') return 'car';
    if (lower === 'dog' || lower === 'cat') return 'paw';
    if (lower === 'package') return 'package-variant';
    if (lower === 'bird') return 'bird';
    return 'motion-sensor';
  };

  const handleEventTap = (event: RecentEvent) => {
    // Start 5 seconds before the event so user doesn't miss the detection
    const startTime = (event.start_time - 5) * 1000;
    navigation.navigate('CameraLive', {
      cameraName: event.camera,
      initialTimestamp: startTime,
    });
  };

  // Event ribbon item with preview gif
  const renderEventItem = ({ item }: { item: RecentEvent }) => (
    <Pressable style={styles.eventCard} onPress={() => handleEventTap(item)}>
      <View style={styles.eventImageContainer}>
        <Image
          source={{ uri: frigateApi.getEventPreviewUrl(item.id) }}
          style={styles.eventThumbnail}
          resizeMode="cover"
        />
        <View style={styles.eventLabelBadge}>
          <MaterialCommunityIcons 
            name={getLabelIcon(item.label) as any} 
            size={10} 
            color="#FFF" 
          />
        </View>
      </View>
      <View style={styles.eventInfo}>
        <Text style={styles.eventCamera} numberOfLines={1}>{item.camera.replace(/_/g, ' ')}</Text>
        <Text style={styles.eventTime}>{formatTimeAgo(item.start_time)}</Text>
      </View>
    </Pressable>
  );

  // Get thumbnail URL with cache-busting timestamp
  const getThumbnailUrl = (cameraName: string) => {
    const timestamp = cameraThumbnailTimestamps[cameraName] || Date.now();
    const baseUrl = frigateApi.getCameraSnapshotUrl(cameraName);
    return baseUrl.includes('?') ? `${baseUrl}&cache=${timestamp}` : `${baseUrl}?cache=${timestamp}`;
  };

  // Camera card
  const renderCamera = ({ item, index }: { item: Camera; index: number }) => {
    const isStacked = layoutMode === 'stacked';
    const cardWidth = isStacked ? screenWidth : (screenWidth - 36) / 2;
    const cardHeight = isStacked ? (cardWidth * 9) / 16 : 90;
    const lastMotion = cameraLastMotion[item.name];
    const hasMotion = cameraMotionActive[item.name] || false;
    const hasDetection = cameraActiveDetections[item.name] || false;
    const refreshTs = cameraThumbnailTimestamps[item.name] || 0;
    
    // Debug: log when hasMotion changes for this camera
    if (hasMotion) {
      console.log(`[renderCamera] ${item.name} hasMotion=${hasMotion}`);
    }

    return (
      <Pressable
        style={[
          styles.cameraCard,
          {
            width: cardWidth,
            marginRight: isStacked ? 0 : (index % 2 === 0 ? 6 : 0),
            marginLeft: isStacked ? 0 : (index % 2 === 1 ? 6 : 0),
            borderRadius: isStacked ? 0 : 12,
          },
        ]}
        onPress={() => navigation.navigate('CameraLive', { cameraName: item.name })}
      >
        <SmartCameraThumbnail
          cameraName={item.name}
          width={cardWidth}
          height={cardHeight}
          isMotionActive={hasMotion}
          hasActiveDetection={hasDetection}
          refreshTimestamp={refreshTs}
        />
        
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraName}>{item.name.replace(/_/g, ' ')}</Text>
          {lastMotion && (
            <Text style={styles.cameraMotion}>{formatMotionTime(lastMotion)}</Text>
          )}
        </View>
      </Pressable>
    );
  };

  // Profile menu
  const ProfileMenu = () => (
    <Modal
      visible={showProfileMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowProfileMenu(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowProfileMenu(false)}>
        <View style={styles.profileMenu}>
          <TouchableOpacity 
            style={styles.profileMenuItem}
            onPress={() => {
              setShowProfileMenu(false);
              Alert.alert('Coming Soon', 'Password change will be available in a future update.');
            }}
          >
            <Ionicons name="key-outline" size={20} color={theme.colors.onSurface} />
            <Text style={styles.profileMenuText}>Change Password</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.profileMenuItem} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
            <Text style={[styles.profileMenuText, { color: theme.colors.error }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );

  // Header
  const Header = () => (
    <View style={styles.header}>
      <Pressable style={styles.headerButton} onPress={() => setShowProfileMenu(true)}>
        <Ionicons name="person-circle-outline" size={28} color={theme.colors.onSurface} />
      </Pressable>
      
      <View style={styles.connectionContainer}>
        <Pressable 
          style={styles.connectionStatus}
          onPress={() => setShowConnectionTooltip(!showConnectionTooltip)}
        >
          <MaterialCommunityIcons 
            name={isConnected ? "server-network" : "server-network-off"}
            size={20} 
            color={isConnected ? '#4CAF50' : theme.colors.error} 
          />
        </Pressable>
        
        {showConnectionTooltip && (
          <Pressable 
            style={styles.tooltip}
            onPress={() => setShowConnectionTooltip(false)}
          >
            <View style={styles.tooltipArrow} />
            <Text style={styles.tooltipText}>
              {isConnected ? 'Connected to Frigate' : 'Disconnected from Frigate'}
            </Text>
          </Pressable>
        )}
      </View>
      
      <Pressable 
        style={styles.headerButton}
        onPress={() => Alert.alert('Notifications', 'Notifications coming soon!')}
      >
        <Ionicons name="notifications-outline" size={24} color={theme.colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );

  // Section header component
  const sectionHeaderColor = theme.dark ? '#FFFFFF' : '#949594';
  const SectionHeader = ({ icon, title, count, rightElement }: { icon: string; title: string; count?: number; rightElement?: React.ReactNode }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name={icon as any} size={16} color={sectionHeaderColor} />
        <Text style={[styles.sectionTitle, { color: sectionHeaderColor }]}>{title}</Text>
        {count !== undefined && (
          <Text style={styles.sectionCount}>{count}</Text>
        )}
      </View>
      {rightElement}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
        <Header />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading cameras...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
        <Header />
        <ProfileMenu />
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="server-network-off" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>Connection Error</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
          <Button mode="contained" onPress={loadCameras} style={styles.retryButton}>Retry</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      <ProfileMenu />
      
      <Pressable style={{ flex: 1 }} onPress={() => setShowConnectionTooltip(false)}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <Header />

        {/* Events Section */}
        {recentEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader icon="time-outline" title="Recent" />
            <FlatList
              data={recentEvents}
              renderItem={renderEventItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eventsContainer}
            />
          </View>
        )}

        {/* Cameras Section */}
        <View style={styles.section}>
          <SectionHeader 
            icon="videocam-outline" 
            title="Cameras"
            count={cameras.length}
            rightElement={
              <View style={styles.layoutToggle}>
                <Pressable
                  style={[styles.layoutButton, layoutMode === 'grid' && styles.layoutButtonActive]}
                  onPress={() => setLayoutMode('grid')}
                >
                  <Ionicons name="grid-outline" size={16} color={layoutMode === 'grid' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                </Pressable>
                <Pressable
                  style={[styles.layoutButton, layoutMode === 'stacked' && styles.layoutButtonActive]}
                  onPress={() => setLayoutMode('stacked')}
                >
                  <Ionicons name="list-outline" size={16} color={layoutMode === 'stacked' ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                </Pressable>
              </View>
            }
          />

          {cameras.length === 0 ? (
            <View style={styles.emptyCameras}>
              <Text style={styles.emptyText}>No cameras found</Text>
              <Button mode="contained" onPress={loadCameras}>Refresh</Button>
            </View>
          ) : (
            <FlatList
              data={cameras}
              renderItem={renderCamera}
              keyExtractor={(item) => item.name}
              numColumns={layoutMode === 'grid' ? 2 : 1}
              key={layoutMode}
              scrollEnabled={false}
              extraData={{ motion: cameraMotionActive, detections: cameraActiveDetections }}
              contentContainerStyle={layoutMode === 'grid' ? styles.camerasContainerGrid : styles.camerasContainerStacked}
            />
          )}
        </View>
      </ScrollView>
      </Pressable>
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
    padding: 24,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    padding: 4,
  },
  connectionContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  tooltip: {
    position: 'absolute',
    top: 32,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    zIndex: 100,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: theme.dark ? 0 : 1,
    borderColor: theme.colors.outlineVariant,
  },
  tooltipArrow: {
    position: 'absolute',
    top: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: theme.colors.surface,
  },
  tooltipText: {
    color: theme.colors.onSurface,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  
  // Profile Menu
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    paddingTop: 100,
    paddingLeft: 16,
  },
  profileMenu: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 8,
    width: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  profileMenuText: {
    fontSize: 15,
    color: theme.colors.onSurface,
  },
  menuDivider: {
    height: 1,
    backgroundColor: theme.colors.outlineVariant,
    marginHorizontal: 8,
  },
  
  // Sections
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#949594',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginLeft: 4,
  },
  
  // Events Ribbon
  eventsContainer: {
    paddingHorizontal: 12,
    gap: 10,
  },
  eventCard: {
    width: 110,
  },
  eventImageContainer: {
    width: 110,
    height: 75,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  eventThumbnail: {
    width: '100%',
    height: '100%',
  },
  eventLabelBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: {
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  eventCamera: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.onSurface,
    textTransform: 'capitalize',
  },
  eventTime: {
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginTop: 1,
  },
  
  // Layout Toggle
  layoutToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 8,
    padding: 2,
  },
  layoutButton: {
    padding: 6,
    borderRadius: 6,
  },
  layoutButtonActive: {
    backgroundColor: theme.colors.surface,
  },
  
  // Cameras
  camerasContainerGrid: {
    paddingHorizontal: 12,
  },
  camerasContainerStacked: {
    // No horizontal padding for edge-to-edge
  },
  cameraCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    marginBottom: 10,
  },
  cameraImage: {
    width: '100%',
    backgroundColor: '#1a1a1a',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 10,
  },
  cameraName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cameraMotion: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  
  // Empty/Error States
  emptyCameras: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 16,
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.onSurfaceVariant,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.error,
    marginTop: 16,
  },
  errorSubtext: {
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  retryButton: {
    marginTop: 8,
  },
});
