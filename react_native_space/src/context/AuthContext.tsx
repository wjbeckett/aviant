import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { frigateApi } from '../services/frigateApi';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, localUrl?: string, remoteUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Try to restore session on app start
    const restoreSession = async () => {
      try {
        const restored = await frigateApi.restoreSession();
        setIsAuthenticated(restored);
      } catch (error) {
        console.error('Failed to restore session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (username: string, password: string, localUrl?: string, remoteUrl?: string) => {
    setIsLoading(true);
    try {
      await frigateApi.login(username, password, localUrl, remoteUrl);
      setIsAuthenticated(true);
      
      // Set Sentry user context
      Sentry.setUser({ username });
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'User logged in',
        level: 'info',
        data: { username },
      });
    } catch (error: any) {
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'Login failed',
        level: 'error',
        data: { username, error: error.message },
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await frigateApi.clearSession();
    setIsAuthenticated(false);
    
    // Clear Sentry user context
    Sentry.setUser(null);
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'User logged out',
      level: 'info',
    });
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
