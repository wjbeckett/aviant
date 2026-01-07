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

    // Add protocol if missing
    let finalUrl = trimmedUrl;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `http://${finalUrl}`;
    }

    // Remove trailing slash
    finalUrl = finalUrl.replace(/\/$/, '');

    console.log('[URLSetup] Verifying connection to:', finalUrl);
    setLoading(true);

    try {
      // Test connection to Frigate API
      const response = await axios.get(`${finalUrl}/api/version`, {
        timeout: 10000,
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
      
      Sentry.captureException(error, {
        tags: { screen: 'url_setup' },
        extra: { url: finalUrl, errorMessage: error.message },
      });

      let errorMessage = 'Could not connect to Frigate.';
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. Check if Frigate is running and the URL is correct.';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorMessage = 'Connection timeout. Check your network and URL.';
      } else if (error.message?.includes('Network Error') || error.message?.includes('Network request failed')) {
        errorMessage = 'Network error. Check your connection and URL.';
      }

      Alert.alert(
        'Connection Failed',
        `${errorMessage}\n\nMake sure:\n• Frigate is running\n• URL is correct (port 8971 for authenticated access)\n• You can access Frigate from this device`
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
            placeholder="192.168.1.100:8971 or frigate.example.com:8971"
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
            Enter local IP or remote domain (port 8971 for authenticated access)
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
