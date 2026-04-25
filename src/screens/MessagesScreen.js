import { useLanguage } from '../context/LanguageContext'
import React, { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator
} from 'react-native'
import FastImage from 'react-native-fast-image'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import MessagesManager from '../managers/MessagesManager'
import { SafeAreaView } from 'react-native-safe-area-context'


export default function MessagesScreen({ navigation }) {
  const { t } = useLanguage()
  const [conversations, setConversations] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const uid = auth().currentUser?.uid

  useEffect(() => {
    MessagesManager.setOnline()
    MessagesManager.startListeningConversations(setConversations)
    return () => MessagesManager.stopListening()
  }, [])

  async function search(query) {
    setSearchQuery(query)
    if (!query) { setSearchResults([]); setIsSearching(false); return }

    setIsSearching(true)
    const snap = await firestore().collection('users')
      .where('username', '>=', query.toLowerCase())
      .where('username', '<=', query.toLowerCase() + '\uf8ff')
      .limit(10)
      .get()

    setSearchResults(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setIsSearching(false)
  }

  function timeAgo(date) {
    if (!date) return ''
    const d = date?.toDate?.() || new Date(date)
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  const renderConversation = ({ item }) => {
    const otherUID = item.participantIDs?.find(id => id !== uid)
    const otherName = item.participantNames?.[otherUID] || ''
    const otherAvatar = item.participantAvatars?.[otherUID] || ''
    const unread = item.unreadCount?.[uid] || 0

    return (
      <TouchableOpacity
        style={styles.convRow}
        onPress={() => navigation.navigate('Chat', {
          conversationID: item.id,
          otherUserID: otherUID,
          otherUserName: otherName,
          otherUserAvatar: otherAvatar
        })}
      >
        <FastImage
          style={styles.avatar}
          source={otherAvatar
            ? { uri: otherAvatar }
            : require('../assets/avatar_placeholder.png')
          }
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.convName, unread > 0 && { fontWeight: '700' }]}>
            {otherName}
          </Text>
          <Text style={styles.lastMsg} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={styles.time}>{timeAgo(item.lastMessageAt)}</Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const renderSearchResult = ({ item }) => (
    <TouchableOpacity
      style={styles.convRow}
      onPress={() => {
        setSearchQuery('')
        setSearchResults([])
        navigation.navigate('Chat', {
          conversationID: MessagesManager.conversationID(uid, item.id),
          otherUserID: item.id,
          otherUserName: item.name,
          otherUserAvatar: item.avatarURL || ''
        })
      }}
    >
      <FastImage
        style={styles.avatar}
        source={item.avatarURL
          ? { uri: item.avatarURL }
          : require('../assets/avatar_placeholder.png')
        }
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.convName}>{item.name}</Text>
        <Text style={styles.lastMsg}>@{item.username}</Text>
      </View>
      <Text style={{ fontSize: 20 }}>📨</Text>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.messages.title}</Text>
      </View>

      {/* Barra de busca */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={search}
          placeholder={t.messages.search}
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]) }}>
            <Text style={{ color: '#999', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {isSearching ? (
        <ActivityIndicator style={{ margin: 20 }} color="#4A6FE8" />
      ) : searchQuery.length > 0 ? (
        <FlatList
          data={searchResults}
          renderItem={renderSearchResult}
          keyExtractor={item => item.id}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nenhum usuário encontrado</Text>
            </View>
          )}
        />
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📨</Text>
          <Text style={styles.emptyTitle}>{t.messages.empty}</Text>
          <Text style={styles.emptyText}>{t.messages.emptySub}</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={item => item.id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    padding: 16, backgroundColor: '#fff',
    borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA'
  },
  title: { fontSize: 18, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E5E5EA', borderRadius: 12,
    margin: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },
  convRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, gap: 12
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E5E5EA' },
  convName: { fontSize: 15, fontWeight: '500', marginBottom: 3 },
  lastMsg: { fontSize: 13, color: '#999' },
  time: { fontSize: 11, color: '#999' },
  badge: {
    backgroundColor: '#4A6FE8', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  separator: { height: 0.5, backgroundColor: '#E5E5EA' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center' }
})
