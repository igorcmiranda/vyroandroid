import React, { useState, useEffect, useCallback, memo } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Modal, FlatList, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Alert
} from 'react-native'
import { Image } from 'expo-image'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../context/LanguageContext'
// Importa o player correto baseado na plataforma
import NativeVideoPlayer from './NativeVideoPlayer'

const { width } = Dimensions.get('window')

// ─── Subcomponentes ────────────────────────────────────────────

const CarouselItem = memo(function CarouselItem({ item, isVisible }) {
  if (item.type === 'video') {
    return (
      <View style={{ width, height: width * 1.25 }}>
        <NativeVideoPlayer
          uri={item.url}
          style={{ width, height: width * 1.25 }}
          isVisible={isVisible}
        />
      </View>
    )
  }
  return (
    <Image
      style={{ width, height: width * 1.25 }}
      source={item.url}
      contentFit="cover"
    />
  )
})

const SimpleMedia = memo(function SimpleMedia({ post, isVisible }) {
  if (post.mediaType === 'video') {
    return (
      <NativeVideoPlayer
        uri={post.mediaURL}
        style={{ width, height: width * 1.25 }}
        isVisible={isVisible}
      />
    )
  }
  return (
    <Image
      style={{ width, height: width * 1.25 }}
      source={item.url}
      contentFit="cover"
    />
  )
})

function Carousel({ items, currentMedia, onScroll, isVisible }) {
  return (
    <View>
      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={width}
        snapToAlignment="center"
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={e => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width)
          onScroll(index)
        }}
        renderItem={({ item, index }) => (
          <CarouselItem item={item} isVisible={isVisible && index === currentMedia} />
        )}
      />
      <View style={styles.mediaCounter}>
        <Text style={styles.mediaCounterText}>{currentMedia + 1}/{items.length}</Text>
      </View>
      <View style={styles.carouselDots}>
        {items.map((_, i) => (
          <View
            key={i}
            style={[styles.carouselDot, i === currentMedia && styles.carouselDotActive]}
          />
        ))}
      </View>
    </View>
  )
}

// ─── PostCard principal ────────────────────────────────────────

export default function PostCard({
  post, isVisible, onLike, onFollow, isFollowing, onPressProfile
}) {
  const { t } = useLanguage()
  const [showComments, setShowComments] = useState(false)
  const [showFullCaption, setShowFullCaption] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [sending, setSending] = useState(false)
  const [uid, setUid] = useState(null)
  const [currentMedia, setCurrentMedia] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [pinning, setPinning] = useState(false)

  const hasCarousel = post.mediaItems && post.mediaItems.length > 1
  const isPinned = post.isPinned === true

  useEffect(() => {
    const u = auth().currentUser?.uid
    setUid(u)
    if (u) {
      firestore().collection('users').doc(u).get().then(doc => {
        setIsAdmin(doc.data()?.isAdmin || false)
      })
    }
  }, [])

  useEffect(() => {
    setIsLiked(post.isLiked || false)
    setLikesCount(post.likesCount || 0)
    setCurrentMedia(0)
  }, [post.id])

  function timeAgo(timestamp) {
    if (!timestamp) return ''
    const date = timestamp.toDate?.() || new Date(timestamp)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`
    return `${Math.floor(diff / 604800)}sem`
  }

  async function handleLike() {
    if (!uid) return
    const newLiked = !isLiked
    setIsLiked(newLiked)
    setLikesCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1))
    try {
      const likeRef = firestore().collection('posts').doc(post.id).collection('likes').doc(uid)
      const postRef = firestore().collection('posts').doc(post.id)
      if (!newLiked) {
        await likeRef.delete()
        await postRef.update({ likesCount: firestore.FieldValue.increment(-1) })
      } else {
        await likeRef.set({ likedAt: firestore.Timestamp.now() })
        await postRef.update({ likesCount: firestore.FieldValue.increment(1) })
      }
    } catch {
      setIsLiked(!newLiked)
      setLikesCount(prev => !newLiked ? prev + 1 : Math.max(0, prev - 1))
    }
  }

  async function loadComments() {
    setLoadingComments(true)
    try {
      const snap = await firestore()
        .collection('posts').doc(post.id)
        .collection('comments')
        .orderBy('createdAt', 'asc').get()
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      const snap = await firestore()
        .collection('posts').doc(post.id)
        .collection('comments').get()
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    setLoadingComments(false)
  }

  async function sendComment() {
    if (!commentText.trim() || sending) return
    setSending(true)
    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()
    await firestore().collection('posts').doc(post.id).collection('comments').add({
      userID: uid,
      userName: userData?.name || '',
      userAvatarURL: userData?.avatarURL || '',
      text: commentText.trim(),
      createdAt: firestore.Timestamp.now()
    })
    await firestore().collection('posts').doc(post.id).update({
      commentsCount: firestore.FieldValue.increment(1)
    })
    setCommentText('')
    loadComments()
    setSending(false)
  }

  async function deleteComment(commentID) {
    await firestore().collection('posts').doc(post.id).collection('comments').doc(commentID).delete()
    await firestore().collection('posts').doc(post.id).update({
      commentsCount: firestore.FieldValue.increment(-1)
    })
    setComments(prev => prev.filter(c => c.id !== commentID))
  }

  async function handlePinPost() {
    Alert.alert(
      'Fixar publicação',
      'Fixar este post para todos os usuários por 1 hora?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Fixar',
          onPress: async () => {
            setPinning(true)
            try {
              const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
              await firestore().collection('appConfig').doc('feedPinnedPost').set({
                postID: post.id,
                pinnedBy: uid,
                pinnedAt: firestore.Timestamp.now(),
                expiresAt: firestore.Timestamp.fromDate(expiresAt),
              })
              Alert.alert('✅ Fixado!', 'Post fixado por 1 hora para todos os usuários.')
            } catch {
              Alert.alert('Erro', 'Não foi possível fixar o post.')
            }
            setPinning(false)
          }
        }
      ]
    )
  }

  if (!post.mediaURL && (!post.mediaItems || post.mediaItems.length === 0)) return null

  return (
    <View style={[styles.card, isPinned && styles.cardPinned]}>
      {isPinned && (
        <View style={styles.pinnedBanner}>
          <Text style={styles.pinnedBannerText}>📌 Fixado</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.userInfo} onPress={onPressProfile}>
          <Image
            style={[styles.avatar, isPinned && styles.avatarPinned]}
            source={
              post.userAvatarURL
                ? post.userAvatarURL
                : require('../assets/avatar_placeholder.png')
            }
          />
          <View>
            <View style={styles.nameRow}>
              <Text style={[styles.username, isPinned && styles.usernamePinned]}>
                {post.username || post.userName}
              </Text>
              {post.isVerified && <Text style={styles.verified}>✦</Text>}
            </View>
            {post.city ? <Text style={styles.location}>📍 {post.city}</Text> : null}
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          {uid !== post.userID && (
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followingBtn]}
              onPress={onFollow}
            >
              <Text style={[styles.followText, isFollowing && styles.followingText]}>
                {isFollowing ? t.feed.following : t.feed.follow}
              </Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity
              style={styles.pinBtn}
              onPress={handlePinPost}
              disabled={pinning}
            >
              <Text style={styles.pinBtnText}>{pinning ? '⏳' : '📌'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Mídia */}
      <View>
        {hasCarousel ? (
          <Carousel
            items={post.mediaItems}
            currentMedia={currentMedia}
            onScroll={setCurrentMedia}
            isVisible={isVisible}
          />
        ) : (
          <SimpleMedia post={post} isVisible={isVisible} />
        )}
      </View>

      {post.isWelcome && (
        <View style={styles.welcomeBadge}>
          <Text style={styles.welcomeText}>👋 Post de boas-vindas ao Vyro!</Text>
        </View>
      )}

      {/* Ações */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
          <Text style={styles.actionCount}>{likesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => { setShowComments(true); loadComments() }}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{post.commentsCount || 0}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Text style={styles.timeAgo}>{timeAgo(post.createdAt)}</Text>
      </View>

      {/* Caption */}
      {post.caption ? (
        <TouchableOpacity
          style={styles.captionContainer}
          onPress={() => setShowFullCaption(!showFullCaption)}
        >
          <Text style={styles.caption} numberOfLines={showFullCaption ? 0 : 2}>
            <Text style={styles.captionUsername}>{post.username || post.userName}{' '}</Text>
            {post.caption}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Modal de comentários */}
      <Modal
        visible={showComments}
        animationType="slide"
        onRequestClose={() => setShowComments(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }} edges={['bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Comentários</Text>
                <TouchableOpacity onPress={() => setShowComments(false)}>
                  <Text style={{ color: '#FF3B30', fontSize: 15 }}>{t.common.close}</Text>
                </TouchableOpacity>
              </View>

              {loadingComments ? (
                <ActivityIndicator style={{ margin: 20 }} color="#4A6FE8" />
              ) : (
                <FlatList
                  data={comments}
                  keyExtractor={item => item.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.commentRow}
                      onLongPress={() => {
                        if (item.userID === uid) {
                          Alert.alert('Excluir comentário?', '', [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Excluir', style: 'destructive', onPress: () => deleteComment(item.id) }
                          ])
                        }
                      }}
                    >
                      <Image
                        style={styles.commentAvatar}
                        source={item.userAvatarURL
                          ? { uri: item.userAvatarURL }
                          : require('../assets/avatar_placeholder.png')
                        }
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.commentUser}>{item.userName}</Text>
                        <Text style={styles.commentText}>{item.text}</Text>
                      </View>
                      {item.userID === uid && (
                        <TouchableOpacity onPress={() => deleteComment(item.id)}>
                          <Text style={{ color: '#FF3B30', fontSize: 12 }}>{t.common.delete}</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={() => (
                    <View style={styles.emptyComments}>
                      <Text style={{ color: '#999' }}>Nenhum comentário ainda</Text>
                    </View>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: '#E5E5EA' }} />}
                />
              )}

              <View style={styles.commentInput}>
                <TextInput
                  style={styles.commentField}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder={`${t.common.send}...`}
                  placeholderTextColor="#999"
                  multiline
                />
                <TouchableOpacity
                  onPress={sendComment}
                  disabled={!commentText.trim() || sending}
                >
                  {sending
                    ? <ActivityIndicator size="small" color="#4A6FE8" />
                    : <Text style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}>
                        {t.common.send}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

// Estilos (mesmos do original + sem mudanças)
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', marginBottom: 8 },
  cardPinned: { borderWidth: 2, borderColor: '#FFD700' },
  pinnedBanner: { backgroundColor: '#FFD700', paddingVertical: 5, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  pinnedBannerText: { fontSize: 12, fontWeight: '700', color: '#7A5900' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E5EA', borderWidth: 2, borderColor: '#34C75930' },
  avatarPinned: { borderWidth: 2.5, borderColor: '#FFD700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  username: { fontSize: 14, fontWeight: '600' },
  usernamePinned: { color: '#B8860B' },
  verified: { color: '#FFD700', fontSize: 13 },
  location: { fontSize: 11, color: '#888', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  followBtn: { backgroundColor: '#34C759', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  followingBtn: { backgroundColor: '#E5E5EA' },
  followText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  followingText: { color: '#666' },
  pinBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF3CD', justifyContent: 'center', alignItems: 'center' },
  pinBtnText: { fontSize: 15 },
  carouselDots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 8, backgroundColor: '#fff' },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E5E5EA' },
  carouselDotActive: { width: 18, borderRadius: 3, backgroundColor: '#4A6FE8' },
  mediaCounter: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  mediaCounterText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  welcomeBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 12, marginTop: 4, borderRadius: 8 },
  welcomeText: { color: '#4A6FE8', fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionIcon: { fontSize: 22 },
  actionCount: { fontSize: 14, fontWeight: '500' },
  timeAgo: { fontSize: 12, color: '#999' },
  captionContainer: { paddingHorizontal: 12, paddingBottom: 14 },
  caption: { fontSize: 14, color: '#000', lineHeight: 20 },
  captionUsername: { fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: '#F2F2F7', justifyContent: 'space-between' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, backgroundColor: '#fff', gap: 10 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E5EA' },
  commentUser: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  commentText: { fontSize: 14, color: '#333' },
  emptyComments: { padding: 40, alignItems: 'center' },
  commentInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderTopWidth: 0.5, borderTopColor: '#E5E5EA', gap: 10 },
  commentField: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 },
  sendBtn: { color: '#4A6FE8', fontWeight: '700', fontSize: 15 },
  sendBtnDisabled: { color: '#ccc' },
})
