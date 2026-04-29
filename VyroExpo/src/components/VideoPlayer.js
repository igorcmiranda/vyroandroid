import React, { useState, useRef, useEffect, memo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native'
import Video from 'react-native-video'

const { width } = Dimensions.get('window')

export const VideoPlayerComponent = memo(
  ({ uri, style, isVisible = true }) => {
    const [paused, setPaused] = useState(true)
    const [muted, setMuted] = useState(true)
    const [error, setError] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [loading, setLoading] = useState(true)
    const [showPauseIcon, setShowPauseIcon] = useState(false)

    const playerRef = useRef(null)
    const pauseIconOpacity = useRef(new Animated.Value(0)).current
    const pauseIconTimer = useRef(null)
    const mountedRef = useRef(true)

    // Autoplay quando visível, pausa quando sai da tela
    useEffect(() => {
      if (!mountedRef.current) return
      if (isVisible) {
        setPaused(false)
      } else {
        setPaused(true)
      }
    }, [isVisible])

    // Cleanup ao desmontar
    useEffect(() => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        if (pauseIconTimer.current) {
          clearTimeout(pauseIconTimer.current)
        }
      }
    }, [])

    const videoStyle = style || { width, height: width * 1.25 }

    function showPauseIndicator(isPaused) {
      if (pauseIconTimer.current) clearTimeout(pauseIconTimer.current)

      Animated.sequence([
        Animated.timing(pauseIconOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(600),
        Animated.timing(pauseIconOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start()
    }

    function handlePress() {
      if (!loaded) return
      const newPaused = !paused
      setPaused(newPaused)
      showPauseIndicator(newPaused)
    }

    function toggleMute() {
      setMuted(prev => !prev)
    }

    function handleLoad(data) {
      if (!mountedRef.current) return
      setLoading(false)
      setLoaded(true)
      // Autoplay imediato após carregar se visível
      if (isVisible) {
        setPaused(false)
      }
    }

    function handleError(e) {
      if (!mountedRef.current) return
      console.log('❌ Video error:', JSON.stringify(e?.error || e, null, 2))
      setLoading(false)
      setError(true)
    }

    function handleBuffer({ isBuffering }) {
      if (!mountedRef.current) return
      if (isBuffering) {
        setLoading(true)
      } else {
        setLoading(false)
      }
    }

    function handleReadyForDisplay() {
      if (!mountedRef.current) return
      setLoading(false)
      setLoaded(true)
    }

    if (error || !uri) {
      return (
        <View style={[videoStyle, styles.errorContainer]}>
          <Text style={styles.errorIcon}>🎬</Text>
          <Text style={styles.errorText}>Vídeo indisponível</Text>
        </View>
      )
    }

    return (
      <TouchableWithoutFeedback onPress={handlePress}>
        <View style={videoStyle}>
          <Video
            ref={playerRef}
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            paused={paused}
            muted={muted}
            repeat={true}
            resizeMode="cover"
            onLoad={handleLoad}
            onError={handleError}
            onBuffer={handleBuffer}
            onReadyForDisplay={handleReadyForDisplay}
            playInBackground={false}
            playWhenInactive={false}
            ignoreSilentSwitch="obey"
            controls={false}
            // Android: prefira SurfaceView (mais estável que TextureView na New Architecture)
            useTextureView={false}
            // Importante para Android
            disableFocus={true}
            // Reduz overhead de rendering
            renderToHardwareTextureAndroid={false}
          />

          {/* Loading Spinner */}
          {loading && !error && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <View style={styles.loadingSpinner}>
                <Text style={styles.loadingEmoji}>⏳</Text>
              </View>
            </View>
          )}

          {/* Pause/Play indicator animado */}
          <Animated.View
            style={[styles.pauseOverlay, { opacity: pauseIconOpacity }]}
            pointerEvents="none"
          >
            <View style={styles.pauseIcon}>
              <Text style={styles.pauseIconText}>
                {paused ? '▶' : '⏸'}
              </Text>
            </View>
          </Animated.View>

          {/* Botão de Mute/Unmute — canto inferior direito */}
          {loaded && (
            <TouchableOpacity
              style={styles.muteBtn}
              onPress={toggleMute}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <View style={styles.muteBtnInner}>
                {muted ? (
                  // Ícone speaker muted
                  <MutedIcon />
                ) : (
                  // Ícone speaker com som
                  <UnmutedIcon />
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
      </TouchableWithoutFeedback>
    )
  },
  // Função de comparação personalizada para evitar re-renders desnecessários
  (prevProps, nextProps) => {
    return (
      prevProps.uri === nextProps.uri &&
      prevProps.isVisible === nextProps.isVisible
    )
  }
)

// Ícone SVG-like de speaker muted usando View/Text
function MutedIcon() {
  return (
    <View style={styles.iconWrapper}>
      {/* Speaker body */}
      <View style={styles.speakerBody}>
        <View style={styles.speakerCone} />
        <View style={styles.speakerMouth} />
      </View>
      {/* X cross */}
      <View style={[styles.crossLine, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.crossLine, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  )
}

function UnmutedIcon() {
  return (
    <View style={styles.iconWrapper}>
      {/* Speaker body */}
      <View style={styles.speakerBody}>
        <View style={styles.speakerCone} />
        <View style={styles.speakerMouth} />
      </View>
      {/* Sound waves */}
      <View style={styles.waveContainer}>
        <View style={[styles.wave, styles.wave1]} />
        <View style={[styles.wave, styles.wave2]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  errorContainer: {
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  errorIcon: { fontSize: 40 },
  errorText: { color: '#fff', fontSize: 13, opacity: 0.8 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  loadingSpinner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingEmoji: { fontSize: 22 },

  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  pauseIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseIconText: { color: '#fff', fontSize: 24, marginLeft: 2 },

  // Botão mute — canto inferior direito
  muteBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
  },
  muteBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Ícone speaker construído com Views
  iconWrapper: {
    width: 20,
    height: 20,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  speakerBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  speakerCone: {
    width: 5,
    height: 10,
    backgroundColor: '#fff',
    borderTopLeftRadius: 1,
    borderBottomLeftRadius: 1,
  },
  speakerMouth: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
  },
  waveContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
    marginLeft: 2,
  },
  wave: {
    borderRightWidth: 2,
    borderColor: '#fff',
    borderRadius: 4,
  },
  wave1: { width: 5, height: 7, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  wave2: { width: 8, height: 12, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  crossLine: {
    position: 'absolute',
    right: 0,
    top: 9,
    width: 10,
    height: 2,
    backgroundColor: '#FF4444',
    borderRadius: 1,
  },
})

export default VideoPlayerComponent
