import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import storage from '@react-native-firebase/storage'

class MessagesManager {
  constructor() {
    this.conversations = []
    this.messages = []
    this.onlineUsers = new Set()
    this.conversationsListener = null
    this.messagesListener = null
    this.presenceListener = null
  }

  conversationID(uid1, uid2) {
    return [uid1, uid2].sort().join('_')
  }

  // ─── Presença Online ───────────────────────────────────────
  async setOnline() {
    const uid = auth().currentUser?.uid
    if (!uid) return
    await firestore().collection('presence').doc(uid).set({
      online: true,
      lastSeen: firestore.Timestamp.now()
    })
  }

  async setOffline() {
    const uid = auth().currentUser?.uid
    if (!uid) return
    await firestore().collection('presence').doc(uid).update({
      online: false,
      lastSeen: firestore.Timestamp.now()
    })
  }

  observePresence(userID, onUpdate) {
    this.presenceListener?.()
    this.presenceListener = firestore()
      .collection('presence')
      .doc(userID)
      .onSnapshot(snap => {
        const isOnline = snap.data()?.online || false
        onUpdate(isOnline)
      })
  }

  stopObservingPresence() {
    this.presenceListener?.()
    this.presenceListener = null
  }

  // ─── Conversas ─────────────────────────────────────────────
  startListeningConversations(onUpdate) {
    const uid = auth().currentUser?.uid
    if (!uid) return

    this.conversationsListener?.()
    this.conversationsListener = firestore()
      .collection('conversations')
      .where('participantIDs', 'array-contains', uid)
      .orderBy('lastMessageAt', 'desc')
      .onSnapshot(snap => {
        const conversations = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        this.conversations = conversations
        onUpdate(conversations)
      })
  }

  // ─── Mensagens ─────────────────────────────────────────────
  startListeningMessages(conversationID, onUpdate) {
    this.messagesListener?.()

    this.messagesListener = firestore()
      .collection('conversations')
      .doc(conversationID)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .onSnapshot(snap => {
        const messages = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date()
        }))
        onUpdate(messages)
      })
  }

  async sendMessage(toUserID, toUserName, toUserAvatar, text) {
    const uid = auth().currentUser?.uid
    if (!uid) return

    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()
    const myName = userData?.name || ''
    const myAvatar = userData?.avatarURL || ''
    const convID = this.conversationID(uid, toUserID)
    const messageID = firestore().collection('conversations').doc().id
    const now = firestore.Timestamp.now()

    await firestore()
      .collection('conversations')
      .doc(convID)
      .collection('messages')
      .doc(messageID)
      .set({
        senderID: uid,
        senderName: myName,
        text,
        createdAt: now,
        read: false
      })

    await firestore()
      .collection('conversations')
      .doc(convID)
      .set({
        participantIDs: [uid, toUserID],
        participantNames: { [uid]: myName, [toUserID]: toUserName },
        participantAvatars: { [uid]: myAvatar, [toUserID]: toUserAvatar },
        lastMessage: text,
        lastMessageAt: now,
        unreadCount: { [toUserID]: firestore.FieldValue.increment(1) }
      }, { merge: true })

    // Notificação
    await firestore()
      .collection('notifications')
      .doc(toUserID)
      .collection('items')
      .add({
        type: 'new_message',
        fromUserID: uid,
        fromUserName: myName,
        fromUserAvatar: myAvatar,
        message: `${myName}: ${text.substring(0, 50)}`,
        conversationID: convID,
        messageText: text,
        read: false,
        createdAt: now
      })
  }

  async markAsRead(conversationID) {
  const uid = auth().currentUser?.uid
  if (!uid) return

  // Zera contador da conversa
  await firestore()
    .collection('conversations')
    .doc(conversationID)
    .update({ [`unreadCount.${uid}`]: 0 })
    .catch(e => console.log('markAsRead error:', e))

  // Busca mensagens não lidas do outro usuário e marca como lidas
  try {
    const snap = await firestore()
      .collection('conversations')
      .doc(conversationID)
      .collection('messages')
      .get()

    const batch = firestore().batch()
    let hasUpdates = false

    snap.docs.forEach(doc => {
      const data = doc.data()
      if (data.senderID !== uid && !data.read) {
        batch.update(doc.ref, { read: true })
        hasUpdates = true
      }
    })

    if (hasUpdates) await batch.commit()
  } catch (e) {
    console.log('markAsRead batch error:', e)
  }
}

  stopListening() {
    this.conversationsListener?.()
    this.messagesListener?.()
    this.conversationsListener = null
    this.messagesListener = null
  }

  totalUnread(uid) {
    return this.conversations.reduce((total, conv) => {
      return total + (conv.unreadCount?.[uid] || 0)
    }, 0)
  }
}

export default new MessagesManager()
