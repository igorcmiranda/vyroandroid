import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, FlatList, Dimensions,
  Modal, ActivityIndicator, Alert
} from 'react-native'
import FastImage from 'react-native-fast-image'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import FeedManager from '../managers/FeedManager'
import { SafeAreaView } from 'react-native-safe-area-context'

const { width } = Dimensions.get('window')
const THUMB = (width - 4) / 3

export default function PublicProfileScreen({ route, navigation }) {
  const { userID } = route.params
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [trophies, setTrophies] = useState([])
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFollowing, setShowFollowing] = useState(false)
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [loadingFollow, setLoadingFollow] = useState(false)
  const uid = auth().currentUser?.uid

  useEffect(() => {
    if (!userID) return
    loadProfile()
    checkFollowing()
  }, [userID])

  async function loadProfile() {
    // Perfil
    const userDoc = await firestore().collection('users').doc(userID).get()
    setUser({ id: userID, ...userDoc.data() })
    setFollowersCount(userDoc.data()?.followersCount || 0)

    // Posts
    firestore().collection('posts')
      .where('userID', '==', userID)
      .orderBy('createdAt', 'desc')
      .get()
      .then(snap => {
        if (snap?.docs) {
          setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        }
      })
      .catch(() => {
        firestore().collection('posts')
          .where('userID', '==', userID)
          .get()
          .then(snap => {
            if (snap?.docs) {
              const sorted = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
              setPosts(sorted)
            }
          })
      })

    // Seguindo count
    firestore().collection('follows').doc(userID)
      .collection('following').get()
      .then(snap => setFollowingCount(snap.size))

    // Troféus
    firestore().collection('users').doc(userID)
      .collection('trophies')
      .orderBy('earnedAt', 'desc')
      .get()
      .then(snap => setTrophies(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
  }

  async function checkFollowing() {
    const doc = await firestore()
      .collection('follows').doc(uid)
      .collection('following').doc(userID).get()
    setIsFollowing(doc.exists)
  }

  async function toggleFollow() {
    await FeedManager.toggleFollow(userID)
    setIsFollowing(!isFollowing)
    setFollowersCount(prev => isFollowing ? Math.max(0, prev - 1) : prev + 1)
  }

  async function loadFollowers() {
    setLoadingFollow(true)
    const snap = await firestore()
      .collection('users').doc(userID)
      .collection('followers').get()

    if (snap.docs.length > 0) {
      const ids = snap.docs.map(d => d.id)
      const users = await Promise.all(ids.map(async id => {
        const u = await firestore().collection('users').doc(id).get()
        return { id, ...u.data() }
      }))
      setFollowers(users)
    } else {
      const allFollows = await firestore().collection('follows').get()
      const followerUsers = []
      for (const doc of allFollows.docs) {
        if (doc.id === userID) continue
        const followingDoc = await firestore()
          .collection('follows').doc(doc.id)
          .collection('following').doc(userID).get()
        if (followingDoc.exists) {
          const u = await firestore().collection('users').doc(doc.id).get()
          followerUsers.push({ id: doc.id, ...u.data() })
        }
      }
      setFollowers(followerUsers)
    }
    setLoadingFollow(false)
  }

  async function loadFollowing() {
    setLoadingFollow(true)
    const snap = await firestore()
      .collection('follows').doc(userID)
      .collection('following').get()
    const ids = snap.docs.map(d => d.id)
    const users = await Promise.all(ids.map(async id => {
      const u = await firestore().collection('users').doc(id).get()
      return { id, ...u.data() }
    }))
    setFollowing(users)
    setLoadingFollow(false)
  }

  function trophyIcon(type) {
    const icons = {
      challenge_winner: '🏆',
      challenge_participation: '🥈',
      city_first: '🏙️',
      region_first: '🗺️',
      country_first: '🚩',
      global_first: '🌎'
    }
    return icons[type] || '🏅'
  }

  const isOwnProfile = uid === userID

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <FastImage
            style={styles.avatar}
            source={user?.avatarURL
              ? { uri: user.avatarURL }
              : require('../assets/avatar_placeholder.png')
            }
          />
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{posts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <TouchableOpacity
              style={styles.stat}
              onPress={() => { loadFollowers(); setShowFollowers(true) }}
            >
              <Text style={styles.statNum}>{followersCount}</Text>
              <Text style={styles.statLabel}>Seguidores</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stat}
              onPress={() => { loadFollowing(); setShowFollowing(true) }}
            >
              <Text style={styles.statNum}>{followingCount}</Text>
              <Text style={styles.statLabel}>Seguindo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nome */}
        <View style={styles.nameSection}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.name}</Text>
            {user?.isVerified && <Text style={styles.verified}>✦</Text>}
          </View>
          <Text style={styles.username}>@{user?.username}</Text>
        </View>

        {/* Botão seguir */}
        {!isOwnProfile && (
          <TouchableOpacity
            style={[styles.followBtn, isFollowing && styles.followingBtn]}
            onPress={toggleFollow}
          >
            <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
              {isFollowing ? 'Seguindo' : '+ Seguir'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Troféus */}
        {trophies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏆 Troféus</Text>
            <View style={styles.trophyGrid}>
              {trophies.slice(0, 8).map(t => (
                <View key={t.id} style={styles.trophyItem}>
                  <Text style={styles.trophyIcon}>{trophyIcon(t.type)}</Text>
                  <Text style={styles.trophyLabel} numberOfLines={2}>
                    {t.type === 'challenge_winner' ? 'Vencedor' :
                     t.type === 'challenge_participation' ? 'Participante' : 'Troféu'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Grid de posts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Publicações</Text>
          <View style={styles.grid}>
            {posts.map(post => (
              <TouchableOpacity
                key={post.id}
                onPress={() => navigation.navigate('PostDetail', { post })}
              >
                <FastImage
                  style={styles.thumb}
                  source={{ uri: post.mediaURL }}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <View style={styles.thumbOverlay}>
                  <Text style={styles.thumbStat}>❤️ {post.likesCount || 0}</Text>
                  <Text style={styles.thumbStat}>💬 {post.commentsCount || 0}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {posts.length === 0 && (
            <Text style={styles.emptyText}>Nenhuma publicação ainda</Text>
          )}
        </View>
      </ScrollView>

      {/* Modal Seguidores/Seguindo */}
      <Modal
        visible={showFollowers || showFollowing}
        animationType="slide"
        onRequestClose={() => { setShowFollowers(false); setShowFollowing(false) }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {showFollowers ? 'Seguidores' : 'Seguindo'}
            </Text>
            <TouchableOpacity onPress={() => { setShowFollowers(false); setShowFollowing(false) }}>
              <Text style={{ color: '#FF3B30', fontSize: 15 }}>Fechar</Text>
            </TouchableOpacity>
          </View>
          {loadingFollow ? (
            <ActivityIndicator style={{ margin: 20 }} color="#4A6FE8" />
          ) : (
            <FlatList
              data={showFollowers ? followers : following}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.followRow}
                  onPress={() => {
                    setShowFollowers(false)
                    setShowFollowing(false)
                    navigation.push('PublicProfile', { userID: item.id })
                  }}
                >
                  <FastImage
                    style={styles.followAvatar}
                    source={item.avatarURL
                      ? { uri: item.avatarURL }
                      : require('../assets/avatar_placeholder.png')
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.followName}>{item.name}</Text>
                    <Text style={styles.followUsername}>@{item.username}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#999' }}>
                    {showFollowers ? 'Nenhum seguidor ainda' : 'Não segue ninguém ainda'}
                  </Text>
                </View>
              )}
              ItemSeparatorComponent={() => (
                <View style={{ height: 0.5, backgroundColor: '#E5E5EA' }} />
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', padding: 16, gap: 16, backgroundColor: '#fff' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E5E5EA' },
  stats: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  nameSection: { backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700' },
  verified: { color: '#FFD700', fontSize: 14 },
  username: { fontSize: 13, color: '#666', marginTop: 2 },
  followBtn: {
    margin: 16, backgroundColor: '#34C759',
    borderRadius: 12, padding: 12, alignItems: 'center'
  },
  followingBtn: { backgroundColor: '#E5E5EA' },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  followingBtnText: { color: '#666' },
  section: { backgroundColor: '#fff', marginTop: 8, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  trophyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trophyItem: { width: 64, alignItems: 'center' },
  trophyIcon: { fontSize: 32, marginBottom: 4 },
  trophyLabel: { fontSize: 9, color: '#666', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  thumb: { width: THUMB, height: THUMB, backgroundColor: '#E5E5EA' },
  thumbOverlay: {
    position: 'absolute', bottom: 4, left: 4,
    flexDirection: 'row', gap: 6
  },
  thumbStat: { fontSize: 11, color: '#fff', fontWeight: '600' },
  emptyText: { color: '#999', textAlign: 'center', padding: 20 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA'
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  followRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, backgroundColor: '#fff', gap: 12
  },
  followAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E5E5EA' },
  followName: { fontSize: 15, fontWeight: '500' },
  followUsername: { fontSize: 13, color: '#999' }
})