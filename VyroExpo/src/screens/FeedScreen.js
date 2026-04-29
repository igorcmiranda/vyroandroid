import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, Text, ActivityIndicator,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import FeedManager from '../managers/FeedManager'
import PostCard from '../components/PostCard'
import Icon from 'react-native-vector-icons/Ionicons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../context/LanguageContext'

export default function FeedScreen({ navigation }) {
  const { t } = useLanguage()

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState('global')
  const [currentUserData, setCurrentUserData] = useState(null)

  // Índice do vídeo visível — controla qual PostCard recebe isVisible=true
  const [visibleIndex, setVisibleIndex] = useState(0)

  const uid = auth().currentUser?.uid

  // Config de viewability — 70% do item precisa estar visível
  // itemVisiblePercentThreshold funciona melhor que viewAreaCoveragePercentThreshold no Android
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
    minimumViewTime: 200, // evita flicker em scroll rápido
  }).current

  // Precisa ser ref para não recriar a função (causa warning no FlatList)
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      // Pega o item mais visível (primeiro da lista ordenada por percentual)
      const mostVisible = viewableItems.reduce((prev, curr) =>
        (curr.percentVisible || 0) > (prev.percentVisible || 0) ? curr : prev
      )
      setVisibleIndex(mostVisible.index ?? 0)
    }
  }).current

  useEffect(() => {
    loadCurrentUser()
    checkFirstLogin()

    FeedManager.loadFollowing().then(() => {
      FeedManager.startPinnedListener(() => {})
      FeedManager.startListening((newPosts) => {
        setPosts(newPosts)
        setLoading(false)
      })
    })

    return () => FeedManager.stopListening()
  }, [])

  async function loadCurrentUser() {
    if (!uid) return
    const doc = await firestore().collection('users').doc(uid).get()
    if (doc.exists) setCurrentUserData(doc.data())
  }

  async function checkFirstLogin() {
    if (!uid) return
    try {
      const key = `first_login_${uid}`
      const seen = await AsyncStorage.getItem(key)
      if (seen) return

      const welcomeDoc = await firestore().collection('posts').doc('welcome_post').get()
      if (welcomeDoc.exists) {
        const welcomePost = { id: welcomeDoc.id, ...welcomeDoc.data(), isWelcome: true }
        setPosts(prev => [welcomePost, ...prev.filter(p => p.id !== 'welcome_post')])
      }

      await AsyncStorage.setItem(key, 'true')
    } catch (e) {
      console.log('Welcome post error:', e)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await FeedManager.loadFollowing()
    await applyFilter(activeFilter)
    setRefreshing(false)
  }, [activeFilter])

  async function applyFilter(filterKey) {
    setActiveFilter(filterKey)
    setLoading(true)

    try {
      let query = firestore().collection('posts').orderBy('createdAt', 'desc').limit(30)

      if (filterKey !== 'global' && currentUserData) {
        if (filterKey === 'city' && currentUserData.city) {
          query = query.where('city', '==', currentUserData.city)
        } else if (filterKey === 'state' && currentUserData.region) {
          query = query.where('region', '==', currentUserData.region)
        } else if (filterKey === 'country') {
          query = query.where('region', '!=', '')
        }
      }

      const snap = await query.get()
      const currentUid = auth().currentUser?.uid

      const filtered = await Promise.all(
        snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(p => p.mediaURL || (p.mediaItems && p.mediaItems.length > 0))
          .map(async post => {
            if (currentUid) {
              const likeDoc = await firestore()
                .collection('posts').doc(post.id)
                .collection('likes').doc(currentUid).get()
              return { ...post, isLiked: likeDoc.exists }
            }
            return post
          })
      )

      setPosts(filtered)
    } catch (e) {
      console.log('Filter error:', e)
    }

    setLoading(false)
  }

  const renderPost = useCallback(({ item, index }) => (
    <PostCard
      post={item}
      isVisible={visibleIndex === index}
      onLike={() => FeedManager.toggleLike(item)}
      onFollow={() => FeedManager.toggleFollow(item.userID)}
      isFollowing={FeedManager.followingIDs.has(item.userID)}
      onPressProfile={() => navigation.navigate('PublicProfile', { userID: item.userID })}
    />
  ), [visibleIndex, navigation])

  const keyExtractor = useCallback((item) => item.id, [])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Messages')}>
          <Icon name="paper-plane-outline" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4A6FE8" />
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={keyExtractor}

          // ─── Controle de visibilidade para autoplay ───
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}

          // ─── Performance Android ───────────────────────
          windowSize={3}          // renderiza 3 telas (1 acima, atual, 1 abaixo)
          maxToRenderPerBatch={2} // 2 itens por batch no Android
          initialNumToRender={2}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={true}
          // Desativa a otimização que pode quebrar o viewability no Android
          disableIntervalMomentum={false}

          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4A6FE8"
            />
          }

          ItemSeparatorComponent={Separator}
          onEndReached={() => FeedManager.loadMorePosts?.()}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewPost')}
        activeOpacity={0.85}
      >
        <Icon name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  separator: { height: 8 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4A6FE8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#4A6FE8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
})
