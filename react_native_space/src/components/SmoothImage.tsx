import React, { useState, useRef, useCallback } from 'react';
import { View, Image, ImageStyle, StyleProp, ViewStyle } from 'react-native';

interface SmoothImageProps {
  source: { uri: string };
  style?: StyleProp<ViewStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  onLoad?: () => void;
}

/**
 * Double-buffered image component that smoothly transitions between images.
 * Keeps the old image visible until the new one is fully loaded.
 */
export const SmoothImage: React.FC<SmoothImageProps> = ({ source, style, resizeMode = 'cover', onLoad }) => {
  // Two image layers - current (visible) and next (loading in background)
  const [currentUri, setCurrentUri] = useState(source.uri);
  const [nextUri, setNextUri] = useState<string | null>(null);
  const [currentLoaded, setCurrentLoaded] = useState(false);
  const pendingUri = useRef<string | null>(null);

  // When source changes, start loading in background
  React.useEffect(() => {
    const newUri = source.uri;
    
    // Same URI, skip
    if (newUri === currentUri && !nextUri) return;
    if (newUri === nextUri) return;
    
    // Set as next to load
    pendingUri.current = newUri;
    setNextUri(newUri);
  }, [source.uri, currentUri, nextUri]);

  const handleCurrentLoad = useCallback(() => {
    setCurrentLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleNextLoad = useCallback(() => {
    // Next image loaded - swap it to current
    if (pendingUri.current) {
      setCurrentUri(pendingUri.current);
      setCurrentLoaded(true);
      setNextUri(null);
      pendingUri.current = null;
      onLoad?.();
    }
  }, [onLoad]);

  const imageStyle: ImageStyle = { position: 'absolute', width: '100%', height: '100%' };

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#1a1a1a' }, style]}>
      {/* Current image - always visible */}
      <Image
        source={{ uri: currentUri }}
        style={[imageStyle, { zIndex: 1, opacity: currentLoaded ? 1 : 0 }]}
        resizeMode={resizeMode}
        onLoad={handleCurrentLoad}
      />
      
      {/* Next image - loads in background, hidden until loaded */}
      {nextUri && (
        <Image
          source={{ uri: nextUri }}
          style={[imageStyle, { zIndex: 0, opacity: 0 }]}
          resizeMode={resizeMode}
          onLoad={handleNextLoad}
        />
      )}
    </View>
  );
};
