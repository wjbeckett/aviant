import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import type { ThemePreference } from '../../App';
import type { RouteProp } from '@react-navigation/native';

type SettingsScreenRouteProp = RouteProp<{
  Settings: {
    themePreference: ThemePreference;
    onThemeChange: (theme: ThemePreference) => Promise<void>;
  };
}>;

interface Props {
  route: SettingsScreenRouteProp;
}

function SettingsScreen({ route }: Props) {
  const { frigateUrl, clearFrigateUrl, logout, isAuthenticated } = useAuth();
  const theme = useTheme();
  const navigation = useNavigation();
  const styles = createStyles(theme);
  
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemePreference>(
    route.params?.themePreference || 'light'
  );

  // Update local state when route params change
  useEffect(() => {
    if (route.params?.themePreference) {
      setCurrentTheme(route.params.themePreference);
    }
  }, [route.params?.themePreference]);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          onPress: logout,
          style: 'destructive',
        },
      ]
    );
  };

  const handleClearURL = () => {
    Alert.alert(
      'Clear Frigate URL',
      'This will remove the stored Frigate server URL and you will need to set it up again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: clearFrigateUrl,
          style: 'destructive',
        },
      ]
    );
  };

  const handleTestSentry = () => {
    try {
      if (!Sentry.captureException) {
        Alert.alert(
          'Sentry Not Available',
          'Sentry error tracking is not initialized. The native module may not be properly linked.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Send a test error
      Sentry.captureException(new Error('Test error from Settings screen'));
      
      // Send a test message
      Sentry.captureMessage('Test message from Aviant app', 'info');
      
      // Add a breadcrumb
      Sentry.addBreadcrumb({
        message: 'User tested Sentry integration',
        level: 'info',
        data: {
          screen: 'Settings',
          timestamp: new Date().toISOString(),
        },
      });

      Alert.alert(
        'Sentry Test Sent',
        'Test error, message, and breadcrumb have been sent to Sentry. Check your Sentry dashboard.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Sentry Test Failed',
        'Failed to send test data to Sentry. Error: ' + (error as Error).message,
        [{ text: 'OK' }]
      );
    }
  };

  const handleThemeSelect = async (selectedTheme: ThemePreference) => {
    setShowThemeModal(false);
    setCurrentTheme(selectedTheme);
    if (route.params?.onThemeChange) {
      await route.params.onThemeChange(selectedTheme);
    }
  };

  const getThemeLabel = (preference: ThemePreference): string => {
    switch (preference) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
      default:
        return 'Light';
    }
  };

  const renderSettingItem = (
    icon: any,
    title: string,
    subtitle?: string,
    onPress?: () => void,
    destructive?: boolean
  ) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingLeft}>
        <Ionicons
          name={icon}
          size={24}
          color={destructive ? theme.colors.error : theme.colors.primary}
          style={styles.settingIcon}
        />
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, destructive && styles.destructiveText]}>
            {title}
          </Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {onPress && (
        <Ionicons name="chevron-forward" size={20} color={theme.colors.secondary} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : null}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APPEARANCE</Text>
          {renderSettingItem(
            'color-palette-outline',
            'Theme',
            getThemeLabel(currentTheme),
            () => setShowThemeModal(true)
          )}
        </View>

        {/* Server Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SERVER</Text>
          {renderSettingItem(
            'server-outline',
            'Frigate Server',
            frigateUrl || 'Not configured'
          )}
          {renderSettingItem(
            'trash-outline',
            'Clear Server URL',
            'Remove stored Frigate URL',
            handleClearURL,
            true
          )}
        </View>

        {/* Account Section - Only show when authenticated */}
        {isAuthenticated && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            {renderSettingItem(
              'log-out-outline',
              'Logout',
              'Sign out of your account',
              handleLogout,
              true
            )}
          </View>
        )}

        {/* Diagnostics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DIAGNOSTICS</Text>
          {renderSettingItem(
            'bug-outline',
            'Test Error Tracking',
            'Send test event to Sentry',
            handleTestSentry
          )}
        </View>

        {/* App Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Aviant v1.0.0</Text>
          <Text style={styles.footerText}>Frigate NVR Mobile Client</Text>
        </View>
      </ScrollView>

      {/* Theme Selection Modal */}
      <Modal
        visible={showThemeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowThemeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowThemeModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Theme</Text>
            
            <TouchableOpacity
              style={styles.themeOption}
              onPress={() => handleThemeSelect('light')}
            >
              <View style={styles.themeOptionLeft}>
                <Ionicons name="sunny-outline" size={24} color={theme.colors.onSurface} />
                <Text style={styles.themeOptionText}>Light</Text>
              </View>
              {currentTheme === 'light' && (
                <Ionicons name="checkmark" size={24} color={theme.colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.themeOption}
              onPress={() => handleThemeSelect('dark')}
            >
              <View style={styles.themeOptionLeft}>
                <Ionicons name="moon-outline" size={24} color={theme.colors.onSurface} />
                <Text style={styles.themeOptionText}>Dark</Text>
              </View>
              {currentTheme === 'dark' && (
                <Ionicons name="checkmark" size={24} color={theme.colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.themeOption}
              onPress={() => handleThemeSelect('system')}
            >
              <View style={styles.themeOptionLeft}>
                <Ionicons name="phone-portrait-outline" size={24} color={theme.colors.onSurface} />
                <Text style={styles.themeOptionText}>System</Text>
              </View>
              {currentTheme === 'system' && (
                <Ionicons name="checkmark" size={24} color={theme.colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowThemeModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.dark ? '#2A2A2A' : '#E0E0E0',
    },
    backButton: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.onSurface,
      flex: 1,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 32,
    },
    scrollView: {
      flex: 1,
    },
    section: {
      marginTop: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.secondary,
      paddingHorizontal: 20,
      paddingBottom: 8,
      letterSpacing: 0.5,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surface,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.dark ? '#2A2A2A' : '#E0E0E0',
    },
    settingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    settingIcon: {
      marginRight: 16,
    },
    settingTextContainer: {
      flex: 1,
    },
    settingTitle: {
      fontSize: 16,
      color: theme.colors.onSurface,
      fontWeight: '500',
    },
    settingSubtitle: {
      fontSize: 14,
      color: theme.colors.secondary,
      marginTop: 2,
    },
    destructiveText: {
      color: theme.colors.error,
    },
    footer: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    footerText: {
      fontSize: 12,
      color: theme.colors.secondary,
      marginVertical: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 20,
      width: '100%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 20,
      textAlign: 'center',
    },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: theme.dark ? '#2A2A2A' : '#F5F5F5',
    },
    themeOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    themeOptionText: {
      fontSize: 16,
      color: theme.colors.onSurface,
      marginLeft: 12,
      fontWeight: '500',
    },
    cancelButton: {
      marginTop: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      color: theme.colors.primary,
      fontWeight: '600',
    },
  });

export default SettingsScreen;
