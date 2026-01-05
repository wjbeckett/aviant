import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { TextInput, Button, Text, IconButton, HelperText } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import * as Sentry from '@sentry/react-native';

export const URLSetupScreen = () => {
  const navigation = useNavigation<any>();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const verifyConnection = async () => {
    const trimmedUrl = url.trim();
    
    if (!trimmedUrl) {
      Alert.alert('Error', 'Please enter your Frigate URL');
      return;
    }

    // Add protocol if missing - default to https for port 8971
    let finalUrl = trimmedUrl;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      // If it's a local IP without port, or has port 8971, use https
      if (finalUrl.includes(':8971') || 
          /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(finalUrl.split(':')[0])) {
        finalUrl = `https://${finalUrl}`;
      } else {
        finalUrl = `https://${finalUrl}`;
      }
    }

    // Add port 8971 if missing
    if (!finalUrl.match(/:\d+/)) {
      finalUrl = `${finalUrl}:8971`;
    }

    // Remove trailing slash
    finalUrl = finalUrl.replace(/\/$/, '');

    console.log('[URLSetup] Verifying connection to:', finalUrl);
    setLoading(true);

    try {
      // Test connection to Frigate API using the health check endpoint
      // This endpoint returns 200 OK without authentication
      const response = await axios.get(`${finalUrl}/api/`, {
        timeout: 10000,
        validateStatus: (status) => status === 200, // Only accept 200 as success
      });
      
      console.log('[URLSetup] Connection successful:', response.data);
      
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'Frigate URL verified',
        level: 'info',
        data: { url: finalUrl },
      });

      // Navigate to login screen with the verified URL
      navigation.navigate('Login', { frigateUrl: finalUrl });
      
    } catch (error: any) {
      console.error('[URLSetup] Connection failed:', error.message);
      console.error('[URLSetup] Error details:', error.code, error.response?.status);
      
      Sentry.captureException(error, {
        tags: { screen: 'url_setup' },
        extra: { 
          url: finalUrl, 
          errorMessage: error.message,
          errorCode: error.code,
          statusCode: error.response?.status,
        },
      });

      let errorMessage = 'Could not connect to Frigate.';
      let errorDetails = '';
      
      // Check for SSL certificate errors
      if (error.message?.toLowerCase().includes('certificate') || 
          error.message?.toLowerCase().includes('ssl') ||
          error.message?.toLowerCase().includes('unable to verify') ||
          error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          error.code === 'CERT_HAS_EXPIRED' ||
          error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        
        errorMessage = 'Self-Signed SSL Certificate';
        errorDetails = `This Frigate server uses a self-signed SSL certificate that is not trusted by your device.\n\n📱 TO FIX: Install the certificate on your Android device\n\n1. Export certificate from server (see Settings for guide)\n2. Settings → Security → Encryption & credentials\n3. Tap "Install a certificate" → CA certificate\n4. Select your certificate file (.crt or .pem)\n5. Return here and try again\n\n✅ BETTER OPTIONS:\n• Caddy, Nginx, or Traefik with Let's Encrypt (free)\n• Tailscale with MagicDNS (automatic HTTPS)\n• Cloudflare Tunnel\n\nSee Settings → Self-Signed Certificates for detailed guide.`;
        
        Alert.alert(
          errorMessage,
          errorDetails,
          [{ text: 'OK', style: 'default' }]
        );
        setLoading(false);
        return;
      }
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. Check if Frigate is running and the URL is correct.';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorMessage = 'Connection timeout. Check your network and URL.';
      } else if (error.message?.includes('Network Error') || error.message?.includes('Network request failed')) {
        errorMessage = 'Network error. Check your connection and URL.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Frigate API not found. Make sure the URL and port are correct.';
      } else if (error.response?.status === 401) {
        // This shouldn't happen with /api/ but just in case
        console.log('[URLSetup] Got 401 on health check - proceeding anyway');
        navigation.navigate('Login', { frigateUrl: finalUrl });
        setLoading(false);
        return;
      }

      Alert.alert(
        'Connection Failed',
        `${errorMessage}\n\nMake sure:\n• Frigate is running\n• URL is correct (port 8971)\n• Device can reach the server\n• For Tailscale: Use your Tailscale hostname`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Hero Section */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text variant="displaySmall" style={styles.title}>
            Aviant
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Connect to your Frigate NVR
          </Text>
        </View>

        {/* URL Input */}
        <View style={styles.form}>
          <TextInput
            label="Frigate URL"
            value={url}
            onChangeText={setUrl}
            mode="outlined"
            placeholder="your-frigate-nvr or 192.168.1.100"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            left={<TextInput.Icon icon="server-network" />}
            theme={{
              roundness: 12,
            }}
          />
          <HelperText type="info" visible>
            Enter your Frigate server address (HTTPS port 8971 will be added automatically)
          </HelperText>

          {/* Unified Action Button */}
          <Pressable
            style={({ pressed }) => [
              styles.unifiedButton,
              pressed && styles.unifiedButtonPressed,
              loading && styles.unifiedButtonDisabled,
            ]}
            onPress={verifyConnection}
            disabled={loading}
          >
            <View style={styles.buttonContainer}>
              {/* Settings Icon Section */}
              <Pressable
                style={styles.settingsSection}
                onPress={() => navigation.navigate('Settings')}
              >
                <MaterialCommunityIcons name="cog" size={24} color="#FFFFFF" />
              </Pressable>

              {/* Separator */}
              <View style={styles.separator} />

              {/* Next Section */}
              <View style={styles.nextSection}>
                {loading ? (
                  <Text style={styles.buttonText}>Verifying...</Text>
                ) : (
                  <>
                    <Text style={styles.buttonText}>Next</Text>
                    <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
                  </>
                )}
              </View>
            </View>
          </Pressable>
        </View>

        {/* Footer spacer */}
        <View style={styles.footer} />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    color: '#2196F3',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9E9E9E',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  input: {
    marginBottom: 8,
  },
  unifiedButton: {
    marginTop: 24,
    backgroundColor: '#2196F3',
    borderRadius: 12,
    overflow: 'hidden',
  },
  unifiedButtonPressed: {
    opacity: 0.8,
  },
  unifiedButtonDisabled: {
    opacity: 0.6,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
  },
  settingsSection: {
    width: 64,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  separator: {
    width: 1,
    height: '60%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  nextSection: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginBottom: 20,
  },
});
