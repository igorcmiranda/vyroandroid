import { useLanguage } from '../context/LanguageContext'
import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, TextInput,
  TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform
} from 'react-native'
import { Image } from 'expo-image'
import auth from '@react-native-firebase/auth'
import MessagesManager from '../managers/MessagesManager'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ChatScreen({ route, navigation }) {
  const { t } = useLanguage()
  const { conversationID, otherUserID, otherUserName, otherUserAvatar } = route.params
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const flatListRef = useRef(null)
  const uid = auth().currentUser?.uid
  const insets = useSafeAreaInsets()

  useEffect(() => {
  MessagesManager.setOnline()
  MessagesManager.startListeningMessages(conversationID, (msgs) => {
    setMessages(msgs)
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    // Marca como lido toda vez que chegam novas mensagens
    MessagesManager.markAsRead(conversationID)
  })
  MessagesManager.observePresence(otherUserID, setIsOnline)
  MessagesManager.markAsRead(conversationID)

  return () => {
    MessagesManager.stopListening()
    MessagesManager.stopObservingPresence()
  }
}, [])

  // Atualiza status online no header
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '700' }}>{otherUserName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: isOnline ? '#34C759' : '#999'
            }} />
            <Text style={{ fontSize: 11, color: isOnline ? '#34C759' : '#999' }}>
              {isOnline ? 'online' : 'offline'}
            </Text>
          </View>
        </View>
      )
    })
  }, [isOnline])

  async function send() {
    const trimmed = text.trim()
    if (!trimmed) return
    setIsSending(true)
    setText('')
    await MessagesManager.sendMessage(otherUserID, otherUserName, otherUserAvatar, trimmed)
    setIsSending(false)
  }

  function timeAgo(date) {
    if (!date) return ''
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  const renderMessage = ({ item, index }) => {
  const isMe = item.senderID === uid
  const isLast = index === messages.length - 1

  return (
    <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text>
      </View>
      <View style={[styles.msgMeta, isMe && styles.msgMetaMe]}>
        <Text style={styles.msgTime}>{timeAgo(item.createdAt)}</Text>
        {isMe && isLast && (
          <Text style={[styles.seen, item.read && styles.seenRead]}>
            {item.read ? '✓✓ visto' : '✓ enviado'}
          </Text>
        )}
      </View>
    </View>
  )
}

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 90 : 0}
      >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Mensagem..."
          placeholderTextColor="#999"
          multiline
        />
        <TouchableOpacity
          onPress={send}
          disabled={!text.trim() || isSending}
        >
          <Text style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}>
            ➤
          </Text>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  messageList: { padding: 12, gap: 8, paddingBottom: 16 },
  msgRow: { alignItems: 'flex-start', marginBottom: 6 },
  msgRowMe: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '75%', borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#E5E5EA'
  },
  bubbleMe: { backgroundColor: '#4A6FE8' },
  msgText: { fontSize: 15, color: '#000' },
  msgTextMe: { color: '#fff' },
  msgMeta: { flexDirection: 'row', gap: 6, marginTop: 3 },
  msgMetaMe: { flexDirection: 'row-reverse' },
  msgTime: { fontSize: 11, color: '#999' },
  seen: { fontSize: 11, color: '#999' },
  seenRead: { color: '#4A6FE8' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#E5E5EA',
    gap: 10
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100
  },
  sendBtn: { fontSize: 24, color: '#4A6FE8' },
  sendBtnDisabled: { color: '#999' }
})