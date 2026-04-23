import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, FlatList, Alert, ActivityIndicator
} from 'react-native'
import FastImage from 'react-native-fast-image'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'

export default function PostDetailScreen({ route, navigation }) {
  const { post } = route.params
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [isLiked, setIsLiked] = useState(post.isLiked || false)
  const [likesCount, setLikesCount] = useState(post.likesCount || 0)
  const [sending, setSending] = useState(false)
  const uid = auth().currentUser?.uid

  useEffect(() => {
    loadComments()
    checkLike()
  }, [])

  async function checkLike() {
    const doc = await firestore()
      .collection('posts').doc(post.id)
      .collection('likes').doc(uid).get()
    setIsLiked(doc.exists)
  }

  async function loadComments() {
    const snap = await firestore()
      .collection('posts').doc(post.id)
      .collection('comments')
      .orderBy('createdAt', 'asc')
      .get()
    setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  async function toggleLike() {
    const likeRef = firestore().collection('posts').doc(post.id)
      .collection('likes').doc(uid)
    const postRef = firestore().collection('posts').doc(post.id)

    if (isLiked) {
      setIsLiked(false)
      setLikesCount(l => Math.max(0, l - 1))
      await likeRef.delete()
      await postRef.update({
        likesCount: firestore.FieldValue.increment(-1)
      })
    } else {
      setIsLiked(true)
      setLikesCount(l => l + 1)
      await likeRef.set({ likedAt: firestore.Timestamp.now() })
      await postRef.update({
        likesCount: firestore.FieldValue.increment(1)
      })
    }
  }

  async function sendComment() {
    if (!commentText.trim()) return
    setSending(true)
    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()

    const commentRef = firestore()
      .collection('posts').doc(post.id)
      .collection('comments').doc()

    await commentRef.set({
      userID: uid,
      userName: userData.name,
      userAvatarURL: userData.avatarURL || '',
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
    await firestore().collection('posts').doc(post.id)
      .collection('comments').doc(commentID).delete()
    await firestore().collection('posts').doc(post.id).update({
      commentsCount: firestore.FieldValue.increment(-1)
    })
    setComments(prev => prev.filter(c => c.id !== commentID))
  }

  async function deletePost() {
    Alert.alert('Excluir post', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          await firestore().collection('posts').doc(post.id).delete()
          navigation.goBack()
        }
      }
    ])
  }

  function timeAgo(ts) {
    if (!ts) return ''
    const date = ts.toDate?.() || new Date(ts)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        {/* Imagem do post */}
        <FastImage
          style={styles.media}
          source={{ uri: post.mediaURL }}
          resizeMode={FastImage.resizeMode.cover}
        />

        {/* Ações */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={toggleLike}>
            <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
            <Text style={styles.actionCount}>{likesCount}</Text>
          </TouchableOpacity>

          <View style={styles.actionBtn}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionCount}>{comments.length}</Text>
          </View>

          {uid === post.userID && (
            <TouchableOpacity style={[styles.actionBtn, { marginLeft: 'auto' }]} onPress={deletePost}>
              <Text style={{ fontSize: 22 }}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Caption */}
        {post.caption ? (
          <View style={styles.captionContainer}>
            <Text style={styles.caption}>
              <Text style={styles.captionUser}>{post.username || post.userName} </Text>
              {post.caption}
            </Text>
          </View>
        ) : null}

        {/* Comentários */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comentários ({comments.length})</Text>
          {comments.map(comment => (
            <View key={comment.id} style={styles.commentRow}>
              <FastImage
                style={styles.commentAvatar}
                source={comment.userAvatarURL
                  ? { uri: comment.userAvatarURL }
                  : require('../assets/avatar_placeholder.png')
                }
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.commentUser}>{comment.userName}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
                <Text style={styles.commentTime}>{timeAgo(comment.createdAt)}</Text>
              </View>
              {comment.userID === uid && (
                <TouchableOpacity onPress={() => deleteComment(comment.id)}>
                  <Text style={{ color: '#FF3B30', fontSize: 12 }}>Excluir</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Input de comentário */}
      <View style={styles.commentInput}>
        <TextInput
          style={styles.commentField}
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Adicionar comentário..."
          placeholderTextColor="#999"
        />
        <TouchableOpacity onPress={sendComment} disabled={sending || !commentText.trim()}>
          {sending
            ? <ActivityIndicator size="small" color="#4A6FE8" />
            : <Text style={{ color: '#4A6FE8', fontWeight: '700' }}>Enviar</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  media: { width: '100%', height: 400 },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, backgroundColor: '#fff', gap: 16
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionIcon: { fontSize: 24 },
  actionCount: { fontSize: 15, fontWeight: '500' },
  captionContainer: { padding: 12, backgroundColor: '#fff' },
  caption: { fontSize: 14, lineHeight: 20 },
  captionUser: { fontWeight: '700' },
  commentsSection: { backgroundColor: '#fff', marginTop: 8, padding: 16 },
  commentsTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  commentRow: {
    flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'flex-start'
  },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E5EA' },
  commentUser: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  commentText: { fontSize: 14, color: '#333' },
  commentTime: { fontSize: 11, color: '#999', marginTop: 2 },
  commentInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 12,
    borderTopWidth: 0.5, borderTopColor: '#E5E5EA', gap: 10
  },
  commentField: {
    flex: 1, backgroundColor: '#F2F2F7', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 14
  }
})