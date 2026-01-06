import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { Text, ActivityIndicator, Button, Appbar , useTheme } from 'react-native-paper';
import { frigateApi, Camera } from '../services/frigateApi';
import { useAuth } from '../context/AuthContext';

export const LiveCamerasScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const { logout } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCameras = useCallback(async () => {
    try {
      setError(null);
      const cameraList = await frigateApi.getCameras();
      setCameras(cameraList.filter((c) => c.enabled));
    } catch (err: any) {
      setError(err.message || 'Failed to load cameras');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadCameras();
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout from Frigate?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const renderCamera = ({ item }: { item: Camera }) => (
    <Pressable
      style={styles.cameraCard}
      onPress={() => navigation.navigate('CameraLive', { cameraName: item.name })}
    >
      <Image
        source={{ uri: frigateApi.getCameraSnapshotUrl(item.name) }}
        style={styles.cameraImage}
        resizeMode="cover"
      />
      <View style={styles.cameraInfo}>
        <Text variant="titleMedium" style={styles.cameraName}>
          {item.name}
        </Text>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.Content title="Live Cameras" />
          <Appbar.Action icon="logout" onPress={handleLogout} />
        </Appbar.Header>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading cameras...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.Content title="Live Cameras" />
          <Appbar.Action icon="logout" onPress={handleLogout} />
        </Appbar.Header>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <Button mode="contained" onPress={loadCameras} style={styles.retryButton}>
            Retry
          </Button>
          <Button mode="text" onPress={handleLogout} style={styles.disconnectButton}>
            Logout
          </Button>
        </View>
      </View>
    );
  }

  if (cameras.length === 0) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.Content title="Live Cameras" />
          <Appbar.Action icon="logout" onPress={handleLogout} />
        </Appbar.Header>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No cameras found</Text>
          <Button mode="contained" onPress={loadCameras} style={styles.retryButton}>
            Refresh
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Live Cameras" />
        <Appbar.Action icon="logout" onPress={handleLogout} />
      </Appbar.Header>
      <FlatList
        data={cameras}
        renderItem={renderCamera}
        keyExtractor={(item) => item.name}
        numColumns={2}
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
    padding: 24,
  },
  listContent: {
    padding: 8,
  },
  cameraCard: {
    flex: 1,
    margin: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
  },
  cameraImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#000',
  },
  cameraInfo: {
    padding: 12,
  },
  cameraName: {
    color: theme.colors.onSurface,
    textTransform: 'capitalize',
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.onSurfaceVariant,
  },
  errorText: {
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyText: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 16,
  },
  retryButton: {
    marginTop: 16,
  },
  disconnectButton: {
    marginTop: 8,
  },
});
