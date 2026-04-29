/**
 * NativeVideoPlayer.js
 *
 * Wrapper JS para o player de vídeo nativo Android (ExoPlayer via Kotlin).
 * Fallback automático para react-native-video no iOS.
 *
 * Uso:
 *   import NativeVideoPlayer from './NativeVideoPlayer'
 *
 *   <NativeVideoPlayer
 *     uri="https://..."
 *     isVisible={true}
 *     style={{ width: 375, height: 470 }}
 *   />
 */

import React, { useEffect, useRef, useState, memo } from 'react'
import {
  requireNativeComponent,
  Platform,
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Text,
  Animated,
  Dimensions,
} from 'react-native'

const { width } = Dimensions.get('window')

// Componente nativo registrado pelo VyroVideoViewManager.kt
let VyroNativeVideo = null
try {
  VyroNativeVideo = requireNativeComponent('VyroVideoView')
} catch (e) {
  console.warn('VyroVideoView não encontrado, usando fallback JS:', e.message)
}

/**
 * Player nativo Android — usa ExoPlayer diretamente via Kotlin
 */
const AndroidNativePlayer = memo(({ uri, isVisible, style }) => {
  if (!VyroNativeVideo) {
    return <FallbackPlayer uri={uri} isVisible={isVisible} style={style} />
  }

  return (
    <VyroNativeVideo
      style={style || { width, height: width * 1.25 }}
      uri={uri}
      muted={true}
      isVisible={isVisible}
    />
  )
})

/**
 * Fallback JS puro com react-native-video (usado no iOS e quando nativo não disponível)
 */
const FallbackPlayer = memo(({ uri, isVisible, style }) => {
  // Import dinâmico para evitar erro quando react-native-video não instalado
  let Video
  try {
    Video = require('react-native-video').default
  } catch (e) {
    return (
      <View style={[style, styles.errorContainer]}>
        <Text style={styles.errorText}>Player indisponível</Text>
      </View>
    )
  }

  const [paused, setPaused] = useState(true)
  const [muted, setMuted] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const pauseOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    setPaused(!isVisible)
  }, [isVisible])

  function handlePress() {
    if (!loaded) return
    const next = !paused
    setPaused(next)

    Animated.sequence([
      Animated.timing(pauseOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(pauseOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start()
  }

  const videoStyle = style || { width, height: width * 1.25 }

  return (
    <TouchableWithoutFeedback onPress={handlePress}>
      <View style={videoStyle}>
        <Video
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          paused={paused}
          muted={muted}
          repeat={true}
          resizeMode="cover"
          onLoad={() => {
            setLoaded(true)
            if (isVisible) setPaused(false)
          }}
          onError={() => {}}
          playInBackground={false}
          playWhenInactive={false}
          controls={false}
          // iOS usa AVFoundation (nativo), sem problemas
          // Android: SurfaceView é mais estável
          useTextureView={false}
          disableFocus={true}
        />

        {/* Indicador pause/play */}
        <Animated.View style={[styles.pauseOverlay, { opacity: pauseOpacity }]} pointerEvents="none">
          <View style={styles.pauseIcon}>
            <Text style={styles.pauseIconText}>{paused ? '▶' : '⏸'}</Text>
          </View>
        </Animated.View>

        {/* Botão mute */}
        {loaded && (
          <TouchableOpacity
            style={styles.muteBtn}
            onPress={() => setMuted(m => !m)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableWithoutFeedback>
  )
})

/**
 * Componente principal — escolhe automaticamente a implementação certa
 */
const NativeVideoPlayer = memo((props) => {
  if (Platform.OS === 'android' && VyroNativeVideo) {
    return <AndroidNativePlayer {...props} />
  }
  return <FallbackPlayer {...props} />
})

export default NativeVideoPlayer
export { NativeVideoPlayer, FallbackPlayer }

const styles = StyleSheet.create({
  errorContainer: {
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: { color: '#666', fontSize: 13 },

  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  pauseIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseIconText: { color: '#fff', fontSize: 22, marginLeft: 2 },

  muteBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteBtnText: { fontSize: 16 },
})
