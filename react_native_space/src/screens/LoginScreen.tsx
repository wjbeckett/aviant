import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { TextInput, Button, Text, IconButton, Chip , useTheme } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { useAuth } from '../context/AuthContext';

export const LoginScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const styles = createStyles(theme);
  const route = useRoute<any>();
  const { login } = useAuth();
  
  const frigateUrl = route.params?.frigateUrl || '';
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your username and password');
      return;
    }

    console.log('[Login] Attempting login to:', frigateUrl);
    console.log('[Login] Username:', username.trim());

    setLoading(true);
    try {
      await login(username.trim(), password.trim(), frigateUrl);
      console.log('[Login] Login successful');
    } catch (error: any) {
      console.error('[Login] Login failed:', error.message);
      
      Sentry.captureException(error, {
        tags: { screen: 'login' },
        extra: {
          frigateUrl: frigateUrl,
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
        {/* Back Button */}
        <View style={styles.backButton}>
          <IconButton
            icon="arrow-left"
            size={24}
            iconColor={theme.colors.onSurfaceVariant}
            onPress={() => navigation.goBack()}
          />
        </View>

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
        </View>

        {/* Connection Info */}
        <View style={styles.connectionInfo}>
          <Text variant="bodyMedium" style={styles.connectingToLabel}>
            Connecting to
          </Text>
          <Chip
            icon="server-network"
            style={styles.urlChip}
            textStyle={styles.urlChipText}
          >
            {frigateUrl}
          </Chip>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <TextInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            left={<TextInput.Icon icon="account" />}
            style={styles.input}
            theme={{
              roundness: 12,
            }}
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
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
            style={styles.input}
            theme={{
              roundness: 12,
            }}
          />

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.loginButton}
            contentStyle={styles.buttonContent}
            icon="login"
          >
            Login
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginLeft: -12,
    marginTop: 8,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 32,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  title: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  connectionInfo: {
    alignItems: 'center',
    marginBottom: 32,
  },
  connectingToLabel: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 8,
  },
  urlChip: {
    backgroundColor: theme.colors.surface,
  },
  urlChipText: {
    color: theme.colors.primary,
  },
  form: {
    width: '100%',
  },
  input: {
    marginBottom: 16,
  },
  loginButton: {
    marginTop: 8,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
