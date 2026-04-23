
import React, { useState, useEffect, useCallback } from 'react'
import {
  View, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, Text, ActivityIndicator
} from 'react-native'
import FastImage from 'react-native-fast-image'
import FeedManager from '../managers/FeedManager'
import PostCard from '../components/PostCard'
import Icon from 'react-native-vector-icons/Ionicons'
import { SafeAreaView } from 'react-native-safe-area-context'



export default function FeedScreen({ navigation }) {

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)


  useEffect(() => {
    checkFirstLogin()

    FeedManager.loadFollowing().then(() => {
      FeedManager.startListening((newPosts) => {
        setPosts(newPosts)
        setLoading(false)
      })
    })
    return () => FeedManager.stopListening()
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await FeedManager.loadFollowing()
    setRefreshing(false)
  }, [])

  const renderPost = ({ item }) => (
    <PostCard
      post={item}
      onLike={() => FeedManager.toggleLike(item)}
      onFollow={() => FeedManager.toggleFollow(item.userID)}
      isFollowing={followingIDs.has(item.userID)}
      onPressProfile={() => navigation.navigate('PublicProfile', { userID: item.userID })}
    />
)


async function checkFirstLogin() {
  try {
    const key = `first_login_${uid}`
    const seen = await AsyncStorage.getItem(key)
    if (seen) return

    // Busca o post de boas-vindas
    const welcomeDoc = await firestore()
      .collection('posts').doc('welcome_post').get()

    if (welcomeDoc.exists) {
      const welcomePost = { id: welcomeDoc.id, ...welcomeDoc.data(), isWelcome: true }
      setPosts(prev => [welcomePost, ...prev])
    }

    await AsyncStorage.setItem(key, 'true')
  } catch (e) {
    console.log('Welcome post error:', e)
  }
}

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A6FE8" />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.feed.title}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Messages')}>
          <Icon name="paper-plane-outline" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={() => FeedManager.loadMorePosts?.()}
        onEndReachedThreshold={0.3}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={10}
      />

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
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA'
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  separator: { height: 8, backgroundColor: '#F2F2F7' },
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
    elevation: 6,
    shadowColor: '#4A6FE8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8
  }
})

