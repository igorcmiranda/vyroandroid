import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, FlatList,
  ActivityIndicator, Alert, Dimensions, Image
} from 'react-native'
import { VideoView, useVideoPlayer } from 'react-native-video'
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'
import { PermissionsAndroid, Platform } from 'react-native'
import storage from '@react-native-firebase/storage'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'
import { VideoPlayerComponent } from '../components/VideoPlayer'

const { width } = Dimensions.get('window')

export default function NewPostScreen({ navigation }) {
  const [medias, setMedias] = useState([]) // array de {uri, type: 'image'|'video'}
  const [caption, setCaption] = useState('')
  const [posting, setPosting] = useState(false)
  const uid = auth().currentUser?.uid

  async function pickMedia(fromCamera) {
    if (medias.length >= 10) {
      Alert.alert('Limite', 'Máximo de 10 itens por post.')
      return
    }

    if (fromCamera && Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA
      )
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return
    }

    const options = {
      mediaType: 'mixed',
      quality: 0.8,
      videoQuality: 'medium',
      durationLimit: 60,
      selectionLimit: 10 - medias.length, // permite múltiplos
    }

    const launch = fromCamera ? launchCamera : launchImageLibrary

    launch(options, response => {
      if (response.didCancel || response.errorCode) return
      if (response.assets) {
        const newItems = response.assets.map(asset => ({
          uri: asset.uri,
          type: asset.type?.includes('video') ? 'video' : 'image',
          name: asset.fileName || `media_${Date.now()}`
        }))
        setMedias(prev => [...prev, ...newItems].slice(0, 10))
      }
    })
  }

  function removeMedia(index) {
    setMedias(prev => prev.filter((_, i) => i !== index))
  }

  async function post() {
    if (medias.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos uma foto ou vídeo.')
      return
    }

    setPosting(true)
    try {
      const userDoc = await firestore().collection('users').doc(uid).get()
      const userData = userDoc.data()

      // Upload de todos os arquivos
      const uploadedMedia = await Promise.all(
        medias.map(async (media, index) => {
          const ext = media.type === 'video' ? 'mp4' : 'jpg'
          const ref = storage().ref(`posts/${uid}/${Date.now()}_${index}.${ext}`)
          await ref.putFile(media.uri)
          const url = await ref.getDownloadURL()
          return { url, type: media.type }
        })
      )

      // Salva o post com array de mídias
      await firestore().collection('posts').add({
        userID: uid,
        userName: userData.name,
        username: userData.username,
        userAvatarURL: userData.avatarURL || '',
        isVerified: userData.isVerified || false,
        caption,
        // Compatibilidade com posts antigos
        mediaURL: uploadedMedia[0].url,
        mediaType: uploadedMedia[0].type,
        // Novo: array de mídias para carrossel
        mediaItems: uploadedMedia,
        mediaCount: uploadedMedia.length,
        likesCount: 0,
        commentsCount: 0,
        createdAt: firestore.Timestamp.now()
      })

      navigation.goBack()
    } catch (e) {
      console.log('Post error:', e)
      Alert.alert('Erro', 'Não foi possível publicar. Tente novamente.')
    }
    setPosting(false)
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nova publicação</Text>
        <TouchableOpacity
          onPress={post}
          disabled={posting || medias.length === 0}
        >
          {posting
            ? <ActivityIndicator size="small" color="#4A6FE8" />
            : <Text style={[styles.postBtn, medias.length === 0 && { color: '#ccc' }]}>
                Publicar
              </Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView>
        {/* Preview das mídias selecionadas */}
        {medias.length > 0 && (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.previewScroll}
            >
              {medias.map((media, index) => (
                <View key={index} style={styles.previewItem}>
                  {media.type === 'video' ? (
                    <VideoPlayerComponent
                      uri={media.uri}
                      style={styles.preview}
                    />
                  ) : (
                    <Image
                      source={{ uri: media.uri }}
                      style={styles.preview}
                      resizeMode="cover"
                    />
                  )}
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeMedia(index)}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                  <View style={styles.mediaTypeBadge}>
                    <Text style={styles.mediaTypeBadgeText}>
                      {media.type === 'video' ? '🎬' : '📷'} {index + 1}/{medias.length}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Bolinhas indicadoras */}
            {medias.length > 1 && (
              <View style={styles.dots}>
                {medias.map((_, i) => (
                  <View key={i} style={[styles.dot, { opacity: 1 }]} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Botões de adicionar mídia */}
        <View style={styles.addButtons}>
          <TouchableOpacity style={styles.addBtn} onPress={() => pickMedia(true)}>
            <Text style={styles.addBtnIcon}>📷</Text>
            <Text style={styles.addBtnText}>Câmera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => pickMedia(false)}>
            <Text style={styles.addBtnIcon}>🖼️</Text>
            <Text style={styles.addBtnText}>Galeria</Text>
          </TouchableOpacity>
        </View>

        {medias.length > 0 && (
          <Text style={styles.mediaCount}>
            {medias.length}/10 {medias.length === 10 ? '(máximo atingido)' : 'itens'}
          </Text>
        )}

        {/* Caption */}
        <View style={styles.captionContainer}>
          <TextInput
            style={styles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Escreva uma legenda..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
          <Text style={styles.captionCount}>{caption.length}/500</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA'
  },
  cancel: { color: '#FF3B30', fontSize: 15 },
  title: { fontSize: 16, fontWeight: '700' },
  postBtn: { color: '#4A6FE8', fontSize: 15, fontWeight: '700' },
  previewScroll: { width },
  previewItem: { width, position: 'relative' },
  preview: { width, height: width },
  removeBtn: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center'
  },
  removeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  mediaTypeBadge: {
    position: 'absolute', bottom: 12, left: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3
  },
  mediaTypeBadgeText: { color: '#fff', fontSize: 11 },
  dots: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 6, paddingVertical: 8, backgroundColor: '#fff'
  },
  dot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#4A6FE8'
  },
  addButtons: {
    flexDirection: 'row', gap: 12, padding: 16,
    backgroundColor: '#fff', marginTop: 8
  },
  addBtn: {
    flex: 1, backgroundColor: '#F2F2F7', borderRadius: 14,
    padding: 16, alignItems: 'center', gap: 6
  },
  addBtnIcon: { fontSize: 28 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#333' },
  mediaCount: {
    textAlign: 'center', fontSize: 12,
    color: '#999', paddingBottom: 8, backgroundColor: '#fff'
  },
  captionContainer: {
    backgroundColor: '#fff', marginTop: 8, padding: 16
  },
  captionInput: {
    fontSize: 15, color: '#000', minHeight: 100,
    textAlignVertical: 'top'
  },
  captionCount: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4 }
})