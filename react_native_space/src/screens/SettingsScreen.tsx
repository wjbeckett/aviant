import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {
  TextInput,
  Button,
  Text,
  IconButton,
  Switch,
  Divider,
  HelperText,
  Card,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';

const REMOTE_URL_KEY = 'frigate_remote_url';
const URL_SWITCHING_ENABLED_KEY = 'url_switching_enabled';

export const SettingsScreen = () => {
  const navigation = useNavigation();
  const [remoteUrl, setRemoteUrl] = useState('');
  const [urlSwitchingEnabled, setUrlSwitchingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedRemoteUrl = await SecureStore.getItemAsync(REMOTE_URL_KEY);
      const savedSwitching = await SecureStore.getItemAsync(URL_SWITCHING_ENABLED_KEY);
      
      if (savedRemoteUrl) setRemoteUrl(savedRemoteUrl);
      if (savedSwitching) setUrlSwitchingEnabled(savedSwitching === 'true');
    } catch (error) {
      console.error('[Settings] Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      // Save remote URL if provided
      if (remoteUrl.trim()) {
        let finalUrl = remoteUrl.trim();
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
          finalUrl = `https://${finalUrl}`;
        }
        finalUrl = finalUrl.replace(/\/$/, '');
        await SecureStore.setItemAsync(REMOTE_URL_KEY, finalUrl);
      } else {
        await SecureStore.deleteItemAsync(REMOTE_URL_KEY);
      }

      // Save URL switching preference
      await SecureStore.setItemAsync(
        URL_SWITCHING_ENABLED_KEY,
        urlSwitchingEnabled.toString()
      );

      Sentry.addBreadcrumb({
        category: 'settings',
        message: 'Settings saved',
        level: 'info',
        data: {
          remoteUrlConfigured: !!remoteUrl.trim(),
          urlSwitchingEnabled,
        },
      });

      Alert.alert('Success', 'Settings saved successfully');
      navigation.goBack();
    } catch (error: any) {
      console.error('[Settings] Failed to save settings:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          iconColor="#FFFFFF"
          onPress={() => navigation.goBack()}
        />
        <Text variant="headlineMedium" style={styles.headerTitle}>
          Settings
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Remote Access Section */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Remote Access
            </Text>
            <HelperText type="info" visible>
              Configure a secondary URL for accessing Frigate when away from your local network
            </HelperText>

            <TextInput
              label="Remote URL (Optional)"
              value={remoteUrl}
              onChangeText={setRemoteUrl}
              mode="outlined"
              placeholder="frigate.example.com:8971"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              left={<TextInput.Icon icon="cloud" />}
              style={styles.input}
              theme={{
                roundness: 12,
              }}
            />
            <HelperText type="info" visible>
              Use HTTPS and port 8971. For self-signed certificates, install the certificate on your device first.
            </HelperText>
          </Card.Content>
        </Card>

        {/* URL Switching Section */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.switchRow}>
              <View style={styles.switchTextContainer}>
                <Text variant="titleMedium" style={styles.switchTitle}>
                  Automatic URL Switching
                </Text>
                <Text variant="bodySmall" style={styles.switchDescription}>
                  Automatically switch between local and remote URLs based on network availability
                </Text>
              </View>
              <Switch
                value={urlSwitchingEnabled}
                onValueChange={setUrlSwitchingEnabled}
                color="#2196F3"
              />
            </View>
          </Card.Content>
        </Card>

        <Divider style={styles.divider} />

        {/* SSL Certificate Help */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Self-Signed Certificates
            </Text>
            <Text variant="bodySmall" style={styles.helpText}>
              If your Frigate server uses a self-signed SSL certificate, you'll need to install it on your Android device:
            </Text>
            <Text variant="bodySmall" style={styles.helpStep}>
              1. Get the certificate from your server{'\n'}
              2. Settings → Security → Encryption & credentials{'\n'}
              3. Install a certificate → CA certificate{'\n'}
              4. Select your certificate file{'\n'}
              5. Return to this app
            </Text>
            <Text variant="bodySmall" style={styles.helpText}>
              Alternative solutions:{'\n'}
              • Use Caddy, Nginx, or Traefik with Let's Encrypt{'\n'}
              • Access via Tailscale with MagicDNS{'\n'}
              • Use ngrok or Cloudflare Tunnel
            </Text>
          </Card.Content>
        </Card>

        {/* About Section */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              About
            </Text>
            <Text variant="bodyMedium" style={styles.aboutText}>
              Aviant v1.0.0
            </Text>
            <Text variant="bodySmall" style={styles.aboutDescription}>
              A mobile client for Frigate NVR. Not officially associated with Frigate.
            </Text>
          </Card.Content>
        </Card>

        {/* Save Button */}
        <Button
          mode="contained"
          onPress={saveSettings}
          loading={loading}
          disabled={loading}
          style={styles.saveButton}
          contentStyle={styles.buttonContent}
          icon="content-save"
        >
          Save Settings
        </Button>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  sectionTitle: {
    color: '#FFFFFF',
    marginBottom: 8,
  },
  input: {
    marginTop: 8,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    color: '#FFFFFF',
    marginBottom: 4,
  },
  switchDescription: {
    color: '#9E9E9E',
  },
  divider: {
    marginVertical: 8,
    backgroundColor: '#424242',
  },
  helpText: {
    color: '#9E9E9E',
    lineHeight: 20,
    marginBottom: 12,
  },
  helpStep: {
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  aboutText: {
    color: '#FFFFFF',
    marginBottom: 4,
  },
  aboutDescription: {
    color: '#9E9E9E',
  },
  saveButton: {
    marginTop: 16,
    marginBottom: 32,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
