import { useLanguage } from '../context/LanguageContext'
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
  Alert, Dimensions, Image
} from 'react-native'
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'
import { PermissionsAndroid, Platform } from 'react-native'
import storage from '@react-native-firebase/storage'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'

const { width } = Dimensions.get('window')

export default function NewPostScreen({ navigation }) {
  const { t } = useLanguage()
  const [medias, setMedias] = useState([])
  const [caption, setCaption] = useState('')
  const [posting, setPosting] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
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
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 10 - medias.length,
    }

    const launch = fromCamera ? launchCamera : launchImageLibrary

    launch(options, response => {
      if (response.didCancel || response.errorCode) return
      if (response.assets) {
        const newItems = response.assets.map(asset => ({
          uri: asset.uri,
          type: asset.type?.includes('video') ? 'video' : 'image',
          name: asset.fileName || `media_${Date.now()}`,
          thumbnail: asset.type?.includes('video') ? null : asset.uri,
        }))
        setMedias(prev => [...prev, ...newItems].slice(0, 10))
      }
    })
  }

  function removeMedia(index) {
    setMedias(prev => prev.filter((_, i) => i !== index))
    if (currentIndex >= medias.length - 1) setCurrentIndex(Math.max(0, medias.length - 2))
  }

  async function post() {
    if (medias.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos uma foto.')
      return
    }

    setPosting(true)
    try {
      const userDoc = await firestore().collection('users').doc(uid).get()
      const userData = userDoc.data()

      const uploadedMedia = []

      for (let index = 0; index < medias.length; index++) {
        const media = medias[index]
        const ext = media.type === 'video' ? 'mp4' : 'jpg'
        const filename = `posts/${uid}/${Date.now()}_${index}.${ext}`
        const ref = storage().ref(filename)

        try {
          await ref.putFile(media.uri)
          const url = await ref.getDownloadURL()
          uploadedMedia.push({ url, type: media.type })
        } catch (uploadError) {
          console.log(`Erro upload item ${index}:`, uploadError)
          Alert.alert('Erro', `Não foi possível fazer upload do item ${index + 1}.`)
          setPosting(false)
          return
        }
      }

      await firestore().collection('posts').add({
        userID: uid,
        userName: userData.name,
        username: userData.username || '',
        userAvatarURL: userData.avatarURL || '',
        isVerified: userData.isVerified || false,
        caption,
        mediaURL: uploadedMedia[0].url,
        mediaType: uploadedMedia[0].type,
        mediaItems: uploadedMedia,
        mediaCount: uploadedMedia.length,
        isPinned: false,
        likesCount: 0,
        commentsCount: 0,
        createdAt: firestore.Timestamp.now(),
      })

      navigation.goBack()
    } catch (e) {
      console.log('Post error:', e)
      Alert.alert('Erro', 'Não foi possível publicar. Tente novamente.')
    }
    setPosting(false)
  }

  const currentMedia = medias[currentIndex]

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nova publicação</Text>
        <TouchableOpacity onPress={post} disabled={posting || medias.length === 0}>
          {posting
            ? <ActivityIndicator size="small" color="#4A6FE8" />
            : <Text style={[styles.postBtn, medias.length === 0 && { color: '#ccc' }]}>
                Publicar
              </Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Preview da mídia atual */}
        {medias.length > 0 && (
          <View>
            {/* Preview principal */}
            <View style={styles.previewMain}>
              {currentMedia?.type === 'video' ? (
                <View style={styles.videoPreview}>
                  <Text style={styles.videoPreviewIcon}>🎬</Text>
                  <Text style={styles.videoPreviewText}>Vídeo selecionado</Text>
                  <Text style={styles.videoPreviewSub}>O vídeo será reproduzido no feed</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: currentMedia?.uri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              )}

              {/* Contador */}
              {medias.length > 1 && (
                <View style={styles.counter}>
                  <Text style={styles.counterText}>{currentIndex + 1}/{medias.length}</Text>
                </View>
              )}
            </View>

            {/* Miniaturas horizontais para selecionar */}
            {medias.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.thumbsScroll}
                contentContainerStyle={styles.thumbsContent}
              >
                {medias.map((media, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => setCurrentIndex(index)}
                    style={[styles.thumbItem, index === currentIndex && styles.thumbItemActive]}
                  >
                    {media.type === 'video' ? (
                      <View style={[styles.thumb, styles.thumbVideo]}>
                        <Text style={styles.thumbVideoIcon}>🎬</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: media.uri }} style={styles.thumb} resizeMode="cover" />
                    )}
                    <TouchableOpacity
                      style={styles.removeThumb}
                      onPress={() => removeMedia(index)}
                    >
                      <Text style={styles.removeThumbText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Botão remover item único */}
            {medias.length === 1 && (
              <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(0)}>
                <Text style={styles.removeBtnText}>✕ Remover</Text>
              </TouchableOpacity>
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
            {medias.length}/10 itens selecionados{medias.length === 10 ? ' (máximo)' : ''}
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

        {/* Upload progress */}
        {posting && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator color="#4A6FE8" />
            <Text style={styles.uploadingText}>Publicando...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA',
  },
  cancel: { color: '#FF3B30', fontSize: 15 },
  title: { fontSize: 16, fontWeight: '700' },
  postBtn: { color: '#4A6FE8', fontSize: 15, fontWeight: '700' },

  // Preview principal
  previewMain: {
    width,
    height: width,
    backgroundColor: '#000',
    position: 'relative',
  },
  previewImage: { width, height: width },
  videoPreview: {
    width, height: width,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  videoPreviewIcon: { fontSize: 64 },
  videoPreviewText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  videoPreviewSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  counter: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Miniaturas
  thumbsScroll: { backgroundColor: '#fff' },
  thumbsContent: { padding: 10, gap: 8 },
  thumbItem: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbItemActive: { borderColor: '#4A6FE8' },
  thumb: { width: 64, height: 64, borderRadius: 6, backgroundColor: '#E5E5EA' },
  thumbVideo: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  thumbVideoIcon: { fontSize: 24 },
  removeThumb: {
    position: 'absolute', top: 2, right: 2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  removeThumbText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Botão remover único
  removeBtn: {
    backgroundColor: '#fff', padding: 12, alignItems: 'center',
  },
  removeBtnText: { color: '#FF3B30', fontWeight: '600', fontSize: 14 },

  // Botões adicionar
  addButtons: {
    flexDirection: 'row', gap: 12, padding: 16,
    backgroundColor: '#fff', marginTop: 8,
  },
  addBtn: {
    flex: 1, backgroundColor: '#F2F2F7', borderRadius: 14,
    padding: 16, alignItems: 'center', gap: 6,
  },
  addBtnIcon: { fontSize: 28 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#333' },
  mediaCount: {
    textAlign: 'center', fontSize: 12,
    color: '#999', paddingVertical: 8, backgroundColor: '#fff',
  },

  // Caption
  captionContainer: { backgroundColor: '#fff', marginTop: 8, padding: 16 },
  captionInput: {
    fontSize: 15, color: '#000', minHeight: 100, textAlignVertical: 'top',
  },
  captionCount: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4 },

  // Upload
  uploadingContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: 16, backgroundColor: '#EEF2FF', margin: 16, borderRadius: 12,
  },
  uploadingText: { color: '#4A6FE8', fontWeight: '600' },
})

