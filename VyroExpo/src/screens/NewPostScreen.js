import { useLanguage } from '../context/LanguageContext'
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
  Alert, Dimensions, Image, Platform
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { PermissionsAndroid } from 'react-native'
import storage from '@react-native-firebase/storage'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'
import Video from 'react-native-video'

const { width } = Dimensions.get('window')

// Limite de tamanho de vídeo: 100MB
const MAX_VIDEO_SIZE_MB = 100
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024

export default function NewPostScreen({ navigation }) {
  const { t } = useLanguage()
  const [medias, setMedias] = useState([])
  const [caption, setCaption] = useState('')
  const [posting, setPosting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({}) // { index: percent }
  const [currentIndex, setCurrentIndex] = useState(0)
  const uid = auth().currentUser?.uid

  // ─── Permissões ────────────────────────────────────────────

  async function requestCameraPermission() {
    if (Platform.OS !== 'android') return true
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA
    )
    return granted === PermissionsAndroid.RESULTS.GRANTED
  }

  async function requestStoragePermission() {
    if (Platform.OS !== 'android') return true
    // Android 13+ usa READ_MEDIA_VIDEO/READ_MEDIA_IMAGES
    if (Platform.Version >= 33) {
      const [imgGranted, vidGranted] = await Promise.all([
        PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES),
        PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO),
      ])
      return (
        imgGranted === PermissionsAndroid.RESULTS.GRANTED ||
        vidGranted === PermissionsAndroid.RESULTS.GRANTED
      )
    }
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
    )
    return granted === PermissionsAndroid.RESULTS.GRANTED
  }

  // ─── Picker de mídia ───────────────────────────────────────

  async function pickFromCamera() {
    if (medias.length >= 10) {
      Alert.alert('Limite', 'Máximo de 10 itens por post.')
      return
    }
    const ok = await requestCameraPermission()
    if (!ok) {
      Alert.alert('Permissão negada', 'Ative a câmera nas configurações do app.')
      return
    }

    // Câmera: só foto (vídeo da câmera pode ser muito pesado)
    launchCamera(
      { mediaType: 'photo', quality: 0.85, saveToPhotos: false },
      response => handlePickerResponse(response)
    )
  }

  async function pickPhotosFromGallery() {
    if (medias.length >= 10) {
      Alert.alert('Limite', 'Máximo de 10 itens por post.')
      return
    }
    const ok = await requestStoragePermission()
    if (!ok) {
      Alert.alert('Permissão negada', 'Ative o acesso à galeria nas configurações.')
      return
    }

    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.85,
        selectionLimit: 10 - medias.length,
      },
      response => handlePickerResponse(response)
    )
  }

  async function pickVideoFromGallery() {
    if (medias.length >= 10) {
      Alert.alert('Limite', 'Máximo de 10 itens por post.')
      return
    }
    const ok = await requestStoragePermission()
    if (!ok) {
      Alert.alert('Permissão negada', 'Ative o acesso à galeria nas configurações.')
      return
    }

    launchImageLibrary(
      {
        mediaType: 'video',
        // Sem limite de duração — validamos pelo tamanho
        videoQuality: 'medium',
        selectionLimit: 1, // 1 vídeo por vez para controle de tamanho
      },
      response => handlePickerResponse(response, true)
    )
  }

  function handlePickerResponse(response, isVideo = false) {
    if (response.didCancel) return
    if (response.errorCode) {
      Alert.alert('Erro', response.errorMessage || 'Erro ao abrir galeria')
      return
    }
    if (!response.assets || response.assets.length === 0) return

    const newItems = []
    for (const asset of response.assets) {
      const assetIsVideo = asset.type?.startsWith('video') || isVideo

      // Valida tamanho do vídeo
      if (assetIsVideo && asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert(
          'Vídeo muito grande',
          `O vídeo selecionado tem ${(asset.fileSize / (1024 * 1024)).toFixed(0)}MB.\nO limite é ${MAX_VIDEO_SIZE_MB}MB.\n\nTente um vídeo mais curto ou com menor qualidade.`
        )
        continue
      }

      newItems.push({
        uri: asset.uri,
        type: assetIsVideo ? 'video' : 'image',
        name: asset.fileName || `media_${Date.now()}`,
        fileSize: asset.fileSize || 0,
        duration: asset.duration || 0, // segundos (só vídeos)
      })
    }

    if (newItems.length > 0) {
      setMedias(prev => [...prev, ...newItems].slice(0, 10))
    }
  }

  function removeMedia(index) {
    setMedias(prev => prev.filter((_, i) => i !== index))
    setCurrentIndex(prev => (prev >= medias.length - 1 ? Math.max(0, medias.length - 2) : prev))
  }

  // ─── Upload e post ─────────────────────────────────────────

  async function post() {
    if (medias.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos uma foto ou vídeo.')
      return
    }

    setPosting(true)
    setUploadProgress({})

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
          // Upload com progresso
          const task = ref.putFile(media.uri)

          task.on('state_changed', snapshot => {
            const percent = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            )
            setUploadProgress(prev => ({ ...prev, [index]: percent }))
          })

          await task
          const url = await ref.getDownloadURL()
          uploadedMedia.push({ url, type: media.type })
          setUploadProgress(prev => ({ ...prev, [index]: 100 }))
        } catch (uploadError) {
          console.log(`Erro upload item ${index}:`, uploadError)
          Alert.alert('Erro no upload', `Não foi possível enviar o item ${index + 1}.`)
          setPosting(false)
          setUploadProgress({})
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
    setUploadProgress({})
  }

  // ─── Helpers ───────────────────────────────────────────────

  function formatFileSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  function formatDuration(seconds) {
    if (!seconds) return ''
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Progresso total do upload
  const totalProgress = medias.length > 0
    ? Math.round(
        Object.values(uploadProgress).reduce((a, b) => a + b, 0) / medias.length
      )
    : 0

  const currentMedia = medias[currentIndex]

  // ─── Render ────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} disabled={posting}>
          <Text style={[styles.cancel, posting && { opacity: 0.4 }]}>Cancelar</Text>
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

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Preview principal */}
        {medias.length > 0 && (
          <View>
            <View style={styles.previewMain}>
              {currentMedia?.type === 'video' ? (
                <View style={styles.videoPreviewContainer}>
                  {/* Preview real do vídeo */}
                  <Video
                    source={{ uri: currentMedia.uri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    paused={true}
                    muted={true}
                    repeat={false}
                  />
                  {/* Overlay com ícone de play e infos */}
                  <View style={styles.videoOverlay}>
                    <View style={styles.videoPlayIcon}>
                      <Text style={styles.videoPlayText}>▶</Text>
                    </View>
                    <View style={styles.videoInfoBadge}>
                      <Text style={styles.videoInfoText}>
                        🎬 Vídeo
                        {currentMedia.duration > 0 && ` • ${formatDuration(currentMedia.duration)}`}
                        {currentMedia.fileSize > 0 && ` • ${formatFileSize(currentMedia.fileSize)}`}
                      </Text>
                    </View>
                  </View>
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

            {/* Barra de progresso do upload */}
            {posting && (
              <View style={styles.uploadBar}>
                <View style={[styles.uploadBarFill, { width: `${totalProgress}%` }]} />
                <Text style={styles.uploadBarText}>
                  Enviando... {totalProgress}%
                </Text>
              </View>
            )}

            {/* Miniaturas horizontais */}
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
                    style={[
                      styles.thumbItem,
                      index === currentIndex && styles.thumbItemActive,
                    ]}
                  >
                    {media.type === 'video' ? (
                      <View style={[styles.thumb, styles.thumbVideo]}>
                        {/* Mini preview do vídeo */}
                        <Video
                          source={{ uri: media.uri }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                          paused={true}
                          muted={true}
                        />
                        <View style={styles.thumbVideoOverlay}>
                          <Text style={styles.thumbVideoIcon}>▶</Text>
                        </View>
                        {/* Progress individual do item */}
                        {posting && uploadProgress[index] !== undefined && uploadProgress[index] < 100 && (
                          <View style={styles.thumbProgress}>
                            <Text style={styles.thumbProgressText}>{uploadProgress[index]}%</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.thumb}>
                        <Image
                          source={{ uri: media.uri }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                        {posting && uploadProgress[index] !== undefined && uploadProgress[index] < 100 && (
                          <View style={styles.thumbProgress}>
                            <Text style={styles.thumbProgressText}>{uploadProgress[index]}%</Text>
                          </View>
                        )}
                      </View>
                    )}
                    {!posting && (
                      <TouchableOpacity
                        style={styles.removeThumb}
                        onPress={() => removeMedia(index)}
                      >
                        <Text style={styles.removeThumbText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Botão remover item único */}
            {medias.length === 1 && !posting && (
              <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(0)}>
                <Text style={styles.removeBtnText}>✕ Remover</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Botões de adicionar mídia */}
        {!posting && (
          <View style={styles.addSection}>
            <Text style={styles.addSectionTitle}>
              {medias.length === 0 ? 'Adicionar mídia' : `Adicionar mais (${medias.length}/10)`}
            </Text>
            <View style={styles.addButtons}>
              {/* Câmera — só foto */}
              <TouchableOpacity style={styles.addBtn} onPress={pickFromCamera}>
                <Text style={styles.addBtnIcon}>📷</Text>
                <Text style={styles.addBtnText}>Câmera</Text>
                <Text style={styles.addBtnSub}>Foto</Text>
              </TouchableOpacity>

              {/* Galeria — fotos */}
              <TouchableOpacity style={styles.addBtn} onPress={pickPhotosFromGallery}>
                <Text style={styles.addBtnIcon}>🖼️</Text>
                <Text style={styles.addBtnText}>Galeria</Text>
                <Text style={styles.addBtnSub}>Fotos</Text>
              </TouchableOpacity>

              {/* Galeria — vídeo */}
              <TouchableOpacity
                style={[styles.addBtn, styles.addBtnVideo]}
                onPress={pickVideoFromGallery}
              >
                <Text style={styles.addBtnIcon}>🎬</Text>
                <Text style={styles.addBtnText}>Galeria</Text>
                <Text style={styles.addBtnSub}>Vídeo</Text>
                <View style={styles.videoBadge}>
                  <Text style={styles.videoBadgeText}>até {MAX_VIDEO_SIZE_MB}MB</Text>
                </View>
              </TouchableOpacity>
            </View>

            {medias.length > 0 && (
              <Text style={styles.mediaCount}>
                {medias.length}/10 {medias.length === 10 ? '— limite atingido' : ''}
                {medias.some(m => m.type === 'video') && ' • contém vídeo'}
              </Text>
            )}
          </View>
        )}

        {/* Caption */}
        {!posting && (
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
        )}

        {/* Tela de upload em progresso */}
        {posting && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator color="#4A6FE8" size="large" />
            <Text style={styles.uploadingTitle}>Publicando...</Text>
            <Text style={styles.uploadingText}>
              {Object.keys(uploadProgress).length}/{medias.length} {medias.length === 1 ? 'arquivo' : 'arquivos'}
            </Text>
            <Text style={styles.uploadingHint}>
              Não feche o app durante o envio
            </Text>
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

  previewMain: {
    width, height: width, backgroundColor: '#000', position: 'relative',
  },
  previewImage: { width, height: width },

  videoPreviewContainer: {
    width, height: width, backgroundColor: '#0a0a14', position: 'relative',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoPlayIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  videoPlayText: { color: '#fff', fontSize: 26, marginLeft: 4 },
  videoInfoBadge: {
    position: 'absolute', bottom: 16, left: 0, right: 0,
    alignItems: 'center',
  },
  videoInfoText: {
    color: '#fff', fontSize: 13, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },

  counter: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Barra de progresso de upload
  uploadBar: {
    height: 36, backgroundColor: '#EEF2FF',
    justifyContent: 'center', overflow: 'hidden',
  },
  uploadBarFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: '#4A6FE8', opacity: 0.2,
  },
  uploadBarText: {
    textAlign: 'center', fontSize: 13,
    fontWeight: '600', color: '#4A6FE8',
  },

  // Miniaturas
  thumbsScroll: { backgroundColor: '#fff' },
  thumbsContent: { padding: 10, gap: 8 },
  thumbItem: {
    position: 'relative', borderRadius: 8, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
  },
  thumbItemActive: { borderColor: '#4A6FE8' },
  thumb: {
    width: 64, height: 64, borderRadius: 6,
    backgroundColor: '#E5E5EA', overflow: 'hidden',
  },
  thumbVideo: { backgroundColor: '#0a0a14' },
  thumbVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  thumbVideoIcon: { color: '#fff', fontSize: 18 },
  thumbProgress: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  thumbProgressText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  removeThumb: {
    position: 'absolute', top: 2, right: 2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  removeThumbText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  removeBtn: { backgroundColor: '#fff', padding: 12, alignItems: 'center' },
  removeBtnText: { color: '#FF3B30', fontWeight: '600', fontSize: 14 },

  // Seção de adicionar
  addSection: {
    backgroundColor: '#fff', marginTop: 8, padding: 16,
  },
  addSectionTitle: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 12 },
  addButtons: { flexDirection: 'row', gap: 10 },
  addBtn: {
    flex: 1, backgroundColor: '#F2F2F7', borderRadius: 14,
    padding: 14, alignItems: 'center', gap: 4,
  },
  addBtnVideo: { backgroundColor: '#F0ECFF' },
  addBtnIcon: { fontSize: 26 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#333' },
  addBtnSub: { fontSize: 11, color: '#999' },
  videoBadge: {
    backgroundColor: '#7B52E8', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, marginTop: 2,
  },
  videoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  mediaCount: {
    textAlign: 'center', fontSize: 12,
    color: '#999', marginTop: 10,
  },

  captionContainer: { backgroundColor: '#fff', marginTop: 8, padding: 16 },
  captionInput: { fontSize: 15, color: '#000', minHeight: 100, textAlignVertical: 'top' },
  captionCount: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4 },

  uploadingContainer: {
    alignItems: 'center', justifyContent: 'center',
    padding: 40, gap: 10,
  },
  uploadingTitle: { fontSize: 18, fontWeight: '700', color: '#4A6FE8' },
  uploadingText: { fontSize: 14, color: '#666' },
  uploadingHint: { fontSize: 12, color: '#999', marginTop: 4 },
})
