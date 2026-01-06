import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

// Brand colors (same in both themes)
const brandColors = {
  primary: '#2196F3',
  secondary: '#00BCD4',
  error: '#F44336',
  success: '#4CAF50',
  warning: '#FF9800',
};

// Dark theme colors
export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...brandColors,
    
    // Backgrounds
    background: '#121212',
    surface: '#1E1E1E',
    surfaceVariant: '#2E2E2E',
    
    // Text
    onBackground: '#FFFFFF',
    onSurface: '#FFFFFF',
    onSurfaceVariant: '#9E9E9E',
    
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
  colors: {
    ...MD3LightTheme.colors,
    ...brandColors,
    
    // Backgrounds
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceVariant: '#F0F0F0',
    
    // Text
    onBackground: '#000000',
    onSurface: '#000000',
    onSurfaceVariant: '#5F6368',
    
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
