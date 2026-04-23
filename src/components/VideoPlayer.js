import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native'
import Video from 'react-native-video'

const { width } = Dimensions.get('window')

export function VideoPlayerComponent({ uri, style }) {
  const [error, setError] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!uri) return
    const timer = setTimeout(() => setReady(true), 150)
    return () => clearTimeout(timer)
  }, [uri])

  const videoStyle = style || { width, height: width * 1.25 }

  if (error) {
    return (
      <View style={[videoStyle, styles.errorContainer]}>
        <Text style={styles.errorIcon}>🎬</Text>
        <Text style={styles.errorText}>Erro ao carregar vídeo</Text>
      </View>
    )
  }

  if (!ready || !uri) {
    return <View style={[videoStyle, { backgroundColor: '#000' }]} />
  }

  return (
    <Video
    source={{ uri: "https://www.w3schools.com/html/mov_bbb.mp4" }}
    style={videoStyle}
    controls
    paused={false}
    resizeMode="cover"
    onError={e => {
        console.log('❌ Video error:', e)
    }}
    />
  )
}

export default VideoPlayerComponent