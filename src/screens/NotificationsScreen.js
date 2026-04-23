import React, { useState, useEffect } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, RefreshControl
} from 'react-native'
import FastImage from 'react-native-fast-image'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'


export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const uid = auth().currentUser?.uid


  useEffect(() => {
    if (!uid) return
    const unsub = firestore()
      .collection('notifications').doc(uid)
      .collection('items')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .onSnapshot(snap => {
        setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      })
    return unsub
  }, [uid])

  async function markAllRead() {
    if (!uid) return
    const batch = firestore().batch()
    notifications.filter(n => !n.read).forEach(n => {
      const ref = firestore().collection('notifications').doc(uid)
        .collection('items').doc(n.id)
      batch.update(ref, { read: true })
    })
    await batch.commit()
  }

  function notifIcon(type) {
    const icons = {
      new_post: '📸',
      new_like: '❤️',
      new_comment: '💬',
      new_follower: '👤',
      challenge_received: '🏆',
      challenge_accepted: '✅',
      new_message: '📨'
    }
    return icons[type] || '🔔'
  }

  function timeAgo(timestamp) {
    if (!timestamp) return ''
    const date = timestamp.toDate?.() || new Date(timestamp)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  async function handleTap(notif) {
    // Marca como lida
    if (!notif.read && uid) {
      await firestore().collection('notifications').doc(uid)
        .collection('items').doc(notif.id)
        .update({ read: true })
    }

    if (notif.type === 'challenge_received' || notif.type === 'challenge_accepted') {
      navigation.navigate('Desafio')
    }
  }

  const renderItem = ({ item: notif }) => (
    <TouchableOpacity
      style={[styles.item, !notif.read && styles.unread]}
      onPress={() => handleTap(notif)}
    >
      <View style={styles.iconContainer}>
        <FastImage
          style={styles.avatar}
          source={notif.fromUserAvatar
            ? { uri: notif.fromUserAvatar }
            : require('../assets/avatar_placeholder.png')
          }
        />
        <Text style={styles.typeIcon}>{notifIcon(notif.type)}</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.message}>{notif.message}</Text>
        <Text style={styles.time}>{timeAgo(notif.createdAt)}</Text>

        {/* Botões para desafio pendente */}
        {notif.type === 'challenge_received' && (
          <View style={styles.challengeActions}>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => navigation.navigate('Desafio')}
            >
              <Text style={styles.acceptText}>Ver desafio</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {notif.postMediaURL && (
        <FastImage
          style={styles.thumb}
          source={{ uri: notif.postMediaURL }}
          resizeMode={FastImage.resizeMode.cover}
        />
      )}

      {!notif.read && <View style={styles.dot} />}
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.notifications.title}</Text>
        {notifications.some(n => !n.read) && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markRead}>{t.notifications.markAllRead}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {}} />
        }
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>{t.notifications.empty}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
  title: { fontSize: 18, fontWeight: '700' },
  markRead: { color: '#4A6FE8', fontSize: 13 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, backgroundColor: '#fff', gap: 12
  },
  unread: { backgroundColor: '#EEF2FF' },
  iconContainer: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E5E5EA' },
  typeIcon: { position: 'absolute', bottom: -2, right: -4, fontSize: 16 },
  content: { flex: 1 },
  message: { fontSize: 14, color: '#000', lineHeight: 20 },
  time: { fontSize: 12, color: '#999', marginTop: 3 },
  challengeActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  acceptBtn: {
    backgroundColor: '#34C759', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6
  },
  acceptText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#4A6FE8'
  },
  separator: { height: 0.5, backgroundColor: '#E5E5EA' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#999' }
})
