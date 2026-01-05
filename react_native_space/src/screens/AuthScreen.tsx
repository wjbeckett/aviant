import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { TextInput, Button, Text, Divider, HelperText } from 'react-native-paper';
import * as Sentry from '@sentry/react-native';
import { useAuth } from '../context/AuthContext';

export const AuthScreen = () => {
  const { login } = useAuth();
  const [localUrl, setLocalUrl] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    const local = localUrl.trim();
    const remote = remoteUrl.trim();

    if (!local && !remote) {
      Alert.alert('Error', 'Please enter at least one Frigate URL (local or remote)');
      return;
    }

    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your username and password');
      return;
    }

    console.log('[AuthScreen] Starting login...');
    console.log('[AuthScreen] Local URL:', local || 'Not configured');
    console.log('[AuthScreen] Remote URL:', remote || 'Not configured');
    console.log('[AuthScreen] Username:', username.trim());

    setLoading(true);
    try {
      await login(username.trim(), password.trim(), local || undefined, remote || undefined);
      console.log('[AuthScreen] Login successful');
    } catch (error: any) {
      console.error('[AuthScreen] Login failed:', error.message);
      
      // Report to Sentry
      Sentry.captureException(error, {
        tags: { screen: 'auth' },
        extra: {
          localUrl: local ? 'configured' : 'not configured',
          remoteUrl: remote ? 'configured' : 'not configured',
          errorMessage: error.message,
        }
      });
      
      Alert.alert(
        'Login Failed',
        error.message || 'Could not login to Frigate. Please check your credentials and try again.'
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="displaySmall" style={styles.title}>
            Aviant
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Connect to your Frigate NVR
          </Text>
        </View>

        <View style={styles.form}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Network Configuration
          </Text>
          <HelperText type="info" visible>
            Configure your local and/or remote URLs. The app will automatically use the local URL when on your home network and switch to remote when away.
          </HelperText>

          <TextInput
            label="Local URL (Home Network)"
            value={localUrl}
            onChangeText={setLocalUrl}
            mode="outlined"
            placeholder="http://192.168.1.100:5000"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <HelperText type="info" visible>
            Local HTTP URL (port 5000 for unauthenticated or 8971 for authenticated)
          </HelperText>

          <TextInput
            label="Remote URL (Away from Home)"
            value={remoteUrl}
            onChangeText={setRemoteUrl}
            mode="outlined"
            placeholder="https://frigate.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <HelperText type="info" visible>
            Remote HTTPS URL (accessible from anywhere)
          </HelperText>

          <Divider style={styles.divider} />

          <TextInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            style={styles.input}
          />

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
            style={styles.input}
          />

          <HelperText type="info" visible>
            Use the same username and password you created in Frigate
          </HelperText>

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Login
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    color: '#2196F3',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9E9E9E',
  },
  form: {
    width: '100%',
  },
  sectionTitle: {
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 8,
  },
  divider: {
    marginVertical: 16,
    backgroundColor: '#424242',
  },
  input: {
    marginBottom: 8,
  },
  optionalLabel: {
    color: '#FFFFFF',
    marginBottom: 8,
  },
  helpText: {
    color: '#9E9E9E',
    marginBottom: 16,
  },
  button: {
    marginTop: 24,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
