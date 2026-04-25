import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, Text, ActivityIndicator,
  Modal, Pressable
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import FeedManager from '../managers/FeedManager'
import PostCard from '../components/PostCard'
import Icon from 'react-native-vector-icons/Ionicons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../context/LanguageContext'
import Video from 'react-native-video'


const FEED_FILTERS = [
  { key: 'global', label: 'Global', icon: '🌍' },
  { key: 'country', label: 'País', icon: '🇧🇷' },
  { key: 'state', label: 'Estado', icon: '📍' },
  { key: 'city', label: 'Cidade', icon: '🏙️' },
]

export default function FeedScreen({ navigation }) {
  const { t } = useLanguage()

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [activeFilter, setActiveFilter] = useState('global')
  const [currentUserData, setCurrentUserData] = useState(null)

  const [visibleIndex, setVisibleIndex] = useState(0) // 🔥 CONTROLE DO VÍDEO

  const uid = auth().currentUser?.uid

  // 🔥 VIEWABILITY CONFIG (ESSENCIAL)
  const viewabilityConfig = {
    itemVisiblePercentThreshold: 80,
  }

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setVisibleIndex(viewableItems[0].index)
    }
  }).current

  useEffect(() => {
    loadCurrentUser()
    checkFirstLogin()

    FeedManager.loadFollowing().then(() => {
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
    setShowFilterMenu(false)
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
      const uid = auth().currentUser?.uid

      const filtered = await Promise.all(
        snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(p => p.mediaURL || (p.mediaItems && p.mediaItems.length > 0))
          .map(async post => {
            if (uid) {
              const likeDoc = await firestore()
                .collection('posts').doc(post.id)
                .collection('likes').doc(uid).get()
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

  const renderPost = ({ item, index }) => (
    <PostCard
      post={item}
      isVisible={visibleIndex === index} // 🔥 AQUI É O SEGREDO
      onLike={() => FeedManager.toggleLike(item)}
      onFollow={() => FeedManager.toggleFollow(item.userID)}
      isFollowing={FeedManager.followingIDs.has(item.userID)}
      onPressProfile={() => navigation.navigate('PublicProfile', { userID: item.userID })}
    />
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setShowFilterMenu(true)}
        >
          <Text style={styles.filterBtnText}>
            Feed
          </Text>
          <Icon name="chevron-down" size={14} color="#4A6FE8" />
        </TouchableOpacity>

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
          keyExtractor={item => item.id}

          // 🔥 CONTROLE DE VISIBILIDADE
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}

          // 🔥 PERFORMANCE (IMPORTANTE)
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={2}
          removeClippedSubviews={true}

          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4A6FE8" />
          }

          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={() => FeedManager.loadMorePosts?.()}
          onEndReachedThreshold={0.3}

          showsVerticalScrollIndicator={false}
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewPost')}
      >
        <Icon name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff'
  },

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
  },
})