import React, { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator
} from 'react-native'
import FastImage from 'react-native-fast-image'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function NewChallengeScreen({ navigation }) {
  const [isGroup, setIsGroup] = useState(false)
  const [followingUsers, setFollowingUsers] = useState([])
  const [selected, setSelected] = useState([])
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const uid = auth().currentUser?.uid
  useEffect(() => {
    loadFollowing()
  }, [])

  async function loadFollowing() {
    const followSnap = await firestore()
      .collection('follows').doc(uid)
      .collection('following').get()

    const followingIDs = followSnap.docs.map(d => d.id)
    if (followingIDs.length === 0) return

    // Busca posts para pegar dados dos usuários seguidos
    const postsSnap = await firestore().collection('posts')
      .where('userID', 'in', followingIDs.slice(0, 10))
      .get()

    const seen = new Set()
    const users = []
    for (const doc of postsSnap.docs) {
      const d = doc.data()
      if (!seen.has(d.userID) && d.userID !== uid) {
        seen.add(d.userID)
        users.push({
          id: d.userID,
          name: d.userName,
          username: d.username || d.userName,
          avatar: d.userAvatarURL,
          isVerified: d.isVerified || false
        })
      }
    }
    setFollowingUsers(users)
  }

  function toggleSelect(user) {
    if (isGroup) {
      if (selected.find(u => u.id === user.id)) {
        setSelected(selected.filter(u => u.id !== user.id))
      } else if (selected.length < 19) {
        setSelected([...selected, user])
      } else {
        Alert.alert('Limite', 'Máximo de 19 pessoas selecionadas')
      }
    } else {
      setSelected([user])
    }
  }

  async function send() {
    if (selected.length === 0) return
    setSending(true)

    try {
      const userDoc = await firestore().collection('users').doc(uid).get()
      const userData = userDoc.data()
      const now = firestore.Timestamp.now()
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + 1)

      const challengeRef = firestore().collection('challenges').doc()
      const challengeID = challengeRef.id

      if (isGroup) {
        const targetIDs = selected.map(u => u.id)
        await challengeRef.set({
          challengerID: uid,
          challengerName: userData.name,
          challengerAvatarURL: userData.avatarURL || '',
          challengedID: '',
          challengedName: '',
          challengedAvatarURL: '',
          status: 'active',
          startDate: now,
          endDate: firestore.Timestamp.fromDate(endDate),
          createdAt: now,
          isGroup: true,
          maxParticipants: 20,
          invitedIDs: targetIDs,
          acceptedIDs: [uid]
        })

        // Criador entra como participante
        await firestore().collection('challenges').doc(challengeID)
          .collection('participants').doc(uid).set({
            userName: userData.name,
            avatarURL: userData.avatarURL || '',
            totalPoints: 0,
            todayPoints: 0
          })

        // Notifica todos
        for (const user of selected) {
          await sendNotification(user.id, uid, userData.name, userData.avatarURL, challengeID, true)
        }
      } else {
        const target = selected[0]
        await challengeRef.set({
          challengerID: uid,
          challengerName: userData.name,
          challengerAvatarURL: userData.avatarURL || '',
          challengedID: target.id,
          challengedName: target.name,
          challengedAvatarURL: target.avatar || '',
          status: 'pending',
          startDate: now,
          endDate: firestore.Timestamp.fromDate(endDate),
          createdAt: now,
          isGroup: false,
          maxParticipants: 2,
          invitedIDs: [target.id],
          acceptedIDs: [uid]
        })

        await firestore().collection('challenges').doc(challengeID)
          .collection('participants').doc(uid).set({
            userName: userData.name,
            avatarURL: userData.avatarURL || '',
            totalPoints: 0,
            todayPoints: 0
          })

        await sendNotification(target.id, uid, userData.name, userData.avatarURL, challengeID, false)
      }

      setSuccess(true)
      setTimeout(() => navigation.goBack(), 1500)
    } catch (e) {
      Alert.alert('Erro', e.message)
    }
    setSending(false)
  }

  async function sendNotification(toUID, fromUID, fromName, fromAvatar, challengeID, isGroup) {
    await firestore().collection('notifications').doc(toUID)
      .collection('items').add({
        type: 'challenge_received',
        fromUserID: fromUID,
        fromUserName: fromName,
        fromUserAvatar: fromAvatar || '',
        challengeID,
        message: isGroup
          ? `${fromName} te convidou para uma competição em grupo! 🏆`
          : `${fromName} te desafiou para um duelo de 1 mês! 🏆`,
        read: false,
        createdAt: firestore.Timestamp.now()
      })
  }

  if (success) {
    return (
    <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.successIcon}>🏆</Text>
        <Text style={styles.successText}>
          {isGroup ? 'Competição criada!' : 'Desafio enviado!'}
        </Text>
        <Text style={styles.successSub}>
          {isGroup
            ? 'Os convidados receberão uma notificação'
            : `${selected[0]?.name} receberá uma notificação`}
        </Text>
    </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {isGroup ? 'Nova competição' : 'Novo desafio'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Toggle tipo */}
      <View style={styles.typeToggle}>
        <TouchableOpacity
          style={[styles.typeBtn, !isGroup && styles.typeBtnActive]}
          onPress={() => { setIsGroup(false); setSelected([]) }}
        >
          <Text style={[styles.typeBtnText, !isGroup && styles.typeBtnTextActive]}>
            Duelo 1x1
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeBtn, isGroup && styles.typeBtnActive]}
          onPress={() => { setIsGroup(true); setSelected([]) }}
        >
          <Text style={[styles.typeBtnText, isGroup && styles.typeBtnTextActive]}>
            Competição em grupo
          </Text>
        </TouchableOpacity>
      </View>

      {isGroup && (
        <Text style={styles.groupHint}>
          Selecione até 19 pessoas ({selected.length}/19)
        </Text>
      )}

      {followingUsers.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>Você não segue ninguém ainda</Text>
          <Text style={styles.emptySub}>Siga outras pessoas no feed para desafiá-las</Text>
        </View>
      ) : (
        <FlatList
          data={followingUsers}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const isSelected = selected.find(u => u.id === item.id)
            return (
              <TouchableOpacity
                style={[styles.userRow, isSelected && styles.userRowSelected]}
                onPress={() => toggleSelect(item)}
              >
                <FastImage
                  style={styles.avatar}
                  source={item.avatar
                    ? { uri: item.avatar }
                    : require('../assets/avatar_placeholder.png')
                  }
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.isVerified && <Text style={styles.verified}>✦</Text>}
                  </View>
                  <Text style={styles.username}>@{item.username}</Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            )
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {selected.length > 0 && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isGroup
              ? `${selected.length} pessoa(s) selecionada(s)`
              : `Desafiar ${selected[0]?.name} por 1 mês`}
          </Text>
          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={send}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.sendText}>
                  {isGroup ? 'Criar competição' : 'Enviar desafio'} 🏆
                </Text>
            }
          </TouchableOpacity>
        </View>
      )}
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
  cancel: { color: '#FF3B30', fontSize: 15 },
  title: { fontSize: 16, fontWeight: '700' },
  typeToggle: { flexDirection: 'row', margin: 12, gap: 8 },
  typeBtn: {
    flex: 1, padding: 10, borderRadius: 10,
    backgroundColor: '#E5E5EA', alignItems: 'center'
  },
  typeBtnActive: { backgroundColor: '#4A6FE8' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#666' },
  typeBtnTextActive: { color: '#fff' },
  groupHint: { fontSize: 12, color: '#666', marginHorizontal: 16, marginBottom: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#999', textAlign: 'center' },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, backgroundColor: '#fff', gap: 12
  },
  userRowSelected: { backgroundColor: '#EEF2FF' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E5E5EA' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  verified: { color: '#FFD700', fontSize: 12 },
  username: { fontSize: 13, color: '#999', marginTop: 2 },
  checkbox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#E5E5EA',
    justifyContent: 'center', alignItems: 'center'
  },
  checkboxSelected: { backgroundColor: '#4A6FE8', borderColor: '#4A6FE8' },
  checkmark: { color: '#fff', fontWeight: '700', fontSize: 14 },
  separator: { height: 0.5, backgroundColor: '#E5E5EA' },
  footer: {
    backgroundColor: '#fff', padding: 16,
    borderTopWidth: 0.5, borderTopColor: '#E5E5EA'
  },
  footerText: { fontSize: 13, color: '#666', marginBottom: 10, textAlign: 'center' },
  sendBtn: { backgroundColor: '#4A6FE8', borderRadius: 14, padding: 16, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successIcon: { fontSize: 64, marginBottom: 16 },
  successText: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  successSub: { fontSize: 15, color: '#666', textAlign: 'center', paddingHorizontal: 32 }
})
