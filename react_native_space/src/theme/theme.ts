import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

// Brand colors (same in both themes)
const brandColors = {
  primary: '#2196F3',
  secondary: '#03A9F4', // Muted blue-cyan instead of bright cyan
  error: '#F44336',
  success: '#4CAF50',
  warning: '#FF9800',
};

// Dark theme colors
export const darkTheme = {
  ...MD3DarkTheme,
  dark: true,
  colors: {
    ...MD3DarkTheme.colors,
    ...brandColors,
    
    // Backgrounds
    background: '#121212',
    surface: '#1E1E1E',
    surfaceVariant: '#2E2E2E',
    
    // Text
    text: '#FFFFFF', // Primary text color
    onBackground: '#FFFFFF',
    onSurface: '#FFFFFF',
    onSurfaceVariant: '#9E9E9E',
    onPrimary: '#FFFFFF', // White text on primary color
    
    // Borders
    outline: '#424242',
    outlineVariant: '#2E2E2E',
    
    // Status
    error: brandColors.error,
    errorContainer: '#5D1F1A',
    onError: '#FFFFFF',
    onErrorContainer: '#F9DEDC',
    
    // Disabled
    onSurfaceDisabled: '#616161',
    surfaceDisabled: '#1E1E1E',
  },
};

// Light theme colors
export const lightTheme = {
  ...MD3LightTheme,
  dark: false,
  colors: {
    ...MD3LightTheme.colors,
    ...brandColors,
    
    // Backgrounds - cleaner white
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F5',
    
    // Text
    text: '#000000', // Primary text color
    onBackground: '#000000',
    onSurface: '#000000',
    onSurfaceVariant: '#5F6368',
    onPrimary: '#FFFFFF', // White text on primary color
    
    // Borders
    outline: '#E0E0E0',
    outlineVariant: '#EBEBEB',
    
    // Status
    error: brandColors.error,
    errorContainer: '#FDECEA',
    onError: '#FFFFFF',
    onErrorContainer: '#5D1F1A',
    
    // Disabled
    onSurfaceDisabled: '#BDBDBD',
    surfaceDisabled: '#F5F5F5',
  },
};

// Export type for TypeScript
export type AppTheme = typeof darkTheme;
