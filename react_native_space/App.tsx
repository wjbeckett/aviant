import React from 'react';
import { useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Sentry from '@sentry/react-native';
import * as SystemUI from 'expo-system-ui';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { URLSetupScreen } from './src/screens/URLSetupScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { LiveCamerasScreen } from './src/screens/LiveCamerasScreen';
import { EventsScreen } from './src/screens/EventsScreen';
// Camera streaming implementations:
// 1. CameraLiveScreenNative - Native video player with RTSP/HLS (RECOMMENDED - TRUE NATIVE)
// 2. CameraLiveScreenSimple - Embeds Frigate PWA (WebView)
// 3. CameraLiveScreenMJPEG - MJPEG only (simple, reliable)
// 4. CameraLiveScreen - Complex WebRTC/MSE in WebView (not recommended)
import { CameraLiveScreen } from './src/screens/CameraLiveScreen'; // Complex WebView version
import { CameraLiveScreenSimple } from './src/screens/CameraLiveScreen_SIMPLE'; // Frigate PWA in WebView
import { CameraLiveScreenMJPEG } from './src/screens/CameraLiveScreen_MJPEG'; // MJPEG in WebView
import { CameraLiveScreenNative } from './src/screens/CameraLiveScreen_NATIVE'; // NATIVE VIDEO PLAYER

// Choose which implementation to use:
const CameraLiveComponent = CameraLiveScreenNative; // TRUE NATIVE - Uses AVPlayer/ExoPlayer!
import { EventDetailsScreen } from './src/screens/EventDetailsScreen';
import { darkTheme, lightTheme } from './src/theme/theme';

// Initialize Sentry for error tracking (optional - only if DSN is configured)
// IMPORTANT: Must be done before creating any instrumentation
let routingInstrumentation: Sentry.ReactNavigationInstrumentation | undefined;
let sentryInitialized = false;

if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  try {
    // Check if Sentry native module is available by checking if nativeCrash exists
    // Use typeof check to avoid "Cannot read property 'prototype' of undefined" error
    if (typeof Sentry.nativeCrash !== 'undefined' && Sentry.nativeCrash) {
      // Create routing instrumentation AFTER checking DSN exists
      routingInstrumentation = new Sentry.ReactNavigationInstrumentation();
      
      Sentry.init({
        dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
        enableInExpoDevelopment: false,
        debug: __DEV__,
        // Enable performance monitoring
        tracesSampleRate: 1.0,
        // Connect routing instrumentation
        integrations: [
          new Sentry.ReactNativeTracing({
            routingInstrumentation,
            tracingOrigins: ['localhost', /^\//],
          }),
        ],
        // Enable crash reporting
        enableAutoSessionTracking: true,
        // Session tracking interval
        sessionTrackingIntervalMillis: 30000,
        // Add release version
        release: 'aviant@1.0.0',
        dist: '1',
        // Add environment
        environment: __DEV__ ? 'development' : 'production',
      });
      sentryInitialized = true;
      console.log('Sentry initialized successfully');
    } else {
      console.warn('Sentry native module not available in Expo Go - build native app to enable');
    }
  } catch (error) {
    console.warn('Sentry initialization skipped:', error instanceof Error ? error.message : String(error));
  }
}

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface MainTabsProps {
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => Promise<void>;
}

function MainTabs({ themePreference, onThemeChange }: MainTabsProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
      }}
    >
      <Tab.Screen
        name="LiveTab"
        component={LiveCamerasScreen}
        options={{
          tabBarLabel: 'Live',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="video" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="EventsTab"
        component={EventsScreen}
        options={{
          tabBarLabel: 'Events',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="history" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      >
        {() => (
          <SettingsScreen
            route={{
              params: {
                themePreference,
                onThemeChange,
              },
            } as any}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// Create navigation ref for Sentry
const navigationRef = React.createRef<any>();

interface AppNavigatorProps {
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => Promise<void>;
}

function AppNavigator({ themePreference, onThemeChange }: AppNavigatorProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        // Register navigation container with Sentry (only if Sentry is initialized)
        if (routingInstrumentation) {
          routingInstrumentation.registerNavigationContainer(navigationRef);
        }
      }}
      onStateChange={() => {
        // Track screen views (only if Sentry is initialized)
        if (sentryInitialized && routingInstrumentation) {
          const currentRoute = navigationRef.current?.getCurrentRoute();
          if (currentRoute) {
            Sentry.addBreadcrumb({
              category: 'navigation',
              message: `Navigated to ${currentRoute.name}`,
              level: 'info',
              data: {
                screen: currentRoute.name,
                params: currentRoute.params,
              },
            });
          }
        }
      }}
    >
      {isAuthenticated ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main">
            {() => <MainTabs themePreference={themePreference} onThemeChange={onThemeChange} />}
          </Stack.Screen>
          <Stack.Screen name="CameraLive" component={CameraLiveComponent} />
          <Stack.Screen name="EventDetails" component={EventDetailsScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="URLSetup" component={URLSetupScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Settings">
            {() => (
              <SettingsScreen
                route={{
                  params: {
                    themePreference,
                    onThemeChange,
                  },
                } as any}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export type ThemePreference = 'light' | 'dark' | 'system';

export default function App() {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreference] = React.useState<ThemePreference>('light');
  const [isThemeLoaded, setIsThemeLoaded] = React.useState(false);

  // Load theme preference from AsyncStorage
  React.useEffect(() => {
    async function loadThemePreference() {
      try {
        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        const stored = await AsyncStorage.getItem('app_theme_preference');
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemePreference(stored);
        }
      } catch (error) {
        console.warn('Failed to load theme preference:', error);
      } finally {
        setIsThemeLoaded(true);
      }
    }
    loadThemePreference();
  }, []);

  // Determine active theme based on preference
  const activeTheme = React.useMemo(() => {
    if (themePreference === 'system') {
      return systemColorScheme === 'dark' ? darkTheme : lightTheme;
    }
    return themePreference === 'dark' ? darkTheme : lightTheme;
  }, [themePreference, systemColorScheme]);

  // Update theme preference
  const updateThemePreference = React.useCallback(async (newPreference: ThemePreference) => {
    try {
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.setItem('app_theme_preference', newPreference);
      setThemePreference(newPreference);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }, []);

  // Set system UI colors to match theme
  React.useEffect(() => {
    SystemUI.setBackgroundColorAsync(activeTheme.colors.background);
  }, [activeTheme]);

  // Don't render until theme is loaded
  if (!isThemeLoaded) {
    return null;
  }
  
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider theme={activeTheme}>
          <AuthProvider>
            <AppNavigator 
              themePreference={themePreference}
              onThemeChange={updateThemePreference}
            />
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
