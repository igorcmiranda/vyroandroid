import React, { useState, useRef, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Video from 'react-native-video';

const { width } = Dimensions.get('window');

export const VideoPlayerComponent = memo(
  ({ uri, style, isVisible = true }) => {
    const [paused, setPaused] = useState(true);
    const [muted, setMuted] = useState(true);
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(true);

    const playerRef = useRef(null);

    // Pausa quando sai da tela (muito importante no feed)
    useEffect(() => {
      setPaused(!isVisible);
    }, [isVisible]);

    // Cleanup ao desmontar
    useEffect(() => {
      return () => {
        if (playerRef.current) {
          console.log('🧹 VideoPlayer unmounting');
          playerRef.current = null;
        }
      };
    }, []);

    const videoStyle = style || { width, height: width * 1.25 };

    if (error || !uri) {
      return (
        <View style={[videoStyle, styles.errorContainer]}>
          <Text style={styles.errorIcon}>🎬</Text>
          <Text style={styles.errorText}>Erro ao carregar vídeo</Text>
        </View>
      );
    }

    const handleLoad = () => {
      setLoading(false);
      setLoaded(true);
      console.log('✅ Video loaded:', uri);
    };

    const handleError = (e) => {
      console.log('❌ Video error:', JSON.stringify(e, null, 2));
      setLoading(false);
      setError(true);
    };

    const handleBuffer = ({ isBuffering }) => {
      if (!isBuffering) console.log('✅ Buffer complete');
    };

    return (
      <TouchableWithoutFeedback onPress={() => setPaused((prev) => !prev)}>
        <View style={videoStyle}>
          <Video
            ref={playerRef}
            source={{ uri }}
            style={StyleSheet.absoluteFill}

            paused={paused}
            muted={muted}
            repeat

            resizeMode="cover"

            onLoad={handleLoad}
            onError={handleError}
            onBuffer={handleBuffer}

            playInBackground={false}
            playWhenInactive={false}
            controls={false}

            // 🔥 ANDROID FIX
            useTextureView={true}
            renderToHardwareTextureAndroid={true}
          />

          {/* Loading */}
          {loading && !error && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingSpinner}>
                <Text style={styles.loadingText}>⏳</Text>
              </View>
            </View>
          )}

          {/* Pause Overlay */}
          {paused && loaded && (
            <View style={styles.pauseOverlay}>
              <View style={styles.pauseIcon}>
                <Text style={styles.pauseIconText}>▶</Text>
              </View>
            </View>
          )}

          {/* Mute Button */}
          {loaded && (
            <TouchableOpacity
              style={styles.muteBtn}
              onPress={() => setMuted((prev) => !prev)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableWithoutFeedback>
    );
  },
);

const styles = StyleSheet.create({
  errorContainer: {
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  errorIcon: { fontSize: 40 },
  errorText: { color: '#fff', fontSize: 13 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  loadingSpinner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { fontSize: 24 },

  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pauseIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseIconText: { color: '#fff', fontSize: 22, marginLeft: 4 },

  muteBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteBtnText: { fontSize: 16 },
});

export default VideoPlayerComponent;