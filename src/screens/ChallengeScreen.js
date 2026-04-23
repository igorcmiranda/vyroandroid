import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, FlatList, ActivityIndicator
} from 'react-native'
import FastImage from 'react-native-fast-image'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeModules, NativeEventEmitter } from 'react-native'
import ProgressTab from '../components/ProgressTab'


export default function ChallengeScreen({ navigation }) {
  const [tab, setTab] = useState(0)
  const [activeChallenges, setActiveChallenges] = useState([])
  const [pendingChallenges, setPendingChallenges] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(false)
  const [loading, setLoading] = useState(true)
  const uid = auth().currentUser?.uid


  useEffect(() => {
    if (!uid) return
    loadChallenges()
    loadLeaderboard()
    loadLeaderboardPreference()
  }, [uid])

  async function loadChallenges() {
    const [s1, s2, s3] = await Promise.all([
      firestore().collection('challenges').where('challengerID', '==', uid).get(),
      firestore().collection('challenges').where('challengedID', '==', uid).get(),
      firestore().collection('challenges').where('invitedIDs', 'array-contains', uid).get()
    ])

    const seen = new Set()
    const all = []
    for (const doc of [...s1.docs, ...s2.docs, ...s3.docs]) {
      if (seen.has(doc.id)) continue
      seen.add(doc.id)
      all.push({ id: doc.id, ...doc.data() })
    }

    setActiveChallenges(all.filter(c => c.status === 'active'))
    setPendingChallenges(all.filter(c =>
      c.status === 'pending' &&
      (c.challengedID === uid || c.invitedIDs?.includes(uid)) &&
      c.challengerID !== uid
    ))
    setLoading(false)
  }

  async function loadLeaderboard() {
    const snap = await firestore().collection('leaderboard')
      .where('showOnLeaderboard', '==', true)
      .get()
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    entries.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
    entries.forEach((e, i) => e.rank = i + 1)
    setLeaderboard(entries)
  }

  async function loadLeaderboardPreference() {
    const doc = await firestore().collection('users').doc(uid).get()
    setShowOnLeaderboard(doc.data()?.showOnLeaderboard || false)
  }

  async function acceptChallenge(challenge) {
    await firestore().collection('challenges').doc(challenge.id)
      .update({
        status: 'active',
        acceptedIDs: firestore.FieldValue.arrayUnion(uid)
      })
    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()
    await firestore().collection('challenges').doc(challenge.id)
      .collection('participants').doc(uid).set({
        userName: userData.name,
        avatarURL: userData.avatarURL || '',
        totalPoints: 0,
        todayPoints: 0
      })
    loadChallenges()
  }

  async function declineChallenge(challenge) {
    if (challenge.isGroup) {
      await firestore().collection('challenges').doc(challenge.id)
        .update({ invitedIDs: firestore.FieldValue.arrayRemove(uid) })
    } else {
      await firestore().collection('challenges').doc(challenge.id)
        .update({ status: 'declined' })
    }
    loadChallenges()
  }

  async function toggleLeaderboard() {
    const newValue = !showOnLeaderboard
    setShowOnLeaderboard(newValue)
    const ref = firestore().collection('leaderboard').doc(uid)
    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()
    if (newValue) {
      await ref.set({
        userName: userData.name,
        avatarURL: userData.avatarURL || '',
        isVerified: userData.isVerified || false,
        totalPoints: 0,
        city: '', region: '', country: 'Brasil',
        showOnLeaderboard: true
      })
    } else {
      await ref.update({ showOnLeaderboard: false })
    }
    await firestore().collection('users').doc(uid)
      .update({ showOnLeaderboard: newValue })
    loadLeaderboard()
  }

  const tabs = ['Progresso', 'Desafios', 'Placar']

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.challenge.title}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('NewChallenge')}>
        <Text style={styles.newBtn}>{t.challenge.newChallenge}</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((t, i) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === i && styles.activeTab]}
            onPress={() => setTab(i)}
          >
            <Text style={[styles.tabText, tab === i && styles.activeTabText]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {tab === 0 && (
          <ProgressTab />
        )}

        {tab === 1 && (
          <View>
            {/* Pendentes */}
            {pendingChallenges.length > 0 && (
              <View style={[styles.section, { backgroundColor: '#FFF8E7' }]}>
                <Text style={styles.sectionTitle}>🔔 Desafios pendentes</Text>
                {pendingChallenges.map(c => (
                  <View key={c.id} style={styles.pendingCard}>
                    <Text style={styles.pendingText}>
                      {c.isGroup
                        ? `${c.challengerName} te convidou para uma competição!`
                        : `${c.challengerName} te desafiou!`}
                    </Text>
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => acceptChallenge(c)}
                      >
                        <Text style={styles.acceptText}>Aceitar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => declineChallenge(c)}
                      >
                        <Text style={styles.declineText}>Recusar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Novo desafio */}
            <TouchableOpacity
              style={styles.newChallengeBtn}
              onPress={() => navigation.navigate('NewChallenge')}
            >
              <Text style={styles.newChallengeText}>🏆 Desafiar outro participante</Text>
            </TouchableOpacity>

            {/* Ativos */}
            {loading
              ? <ActivityIndicator style={{ margin: 20 }} color="#4A6FE8" />
              : activeChallenges.length === 0
              ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>🏆</Text>
                  <Text style={styles.emptyText}>Nenhum desafio ativo</Text>
                  <Text style={styles.emptySubtext}>Desafie alguém que você segue!</Text>
                </View>
              )
              : activeChallenges.map(c => (
                <ActiveChallengeCard key={c.id} challenge={c} uid={uid} />
              ))
            }
          </View>
        )}

        {tab === 2 && (
          <View>
            {/* Toggle visibilidade */}
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleLabel}>Aparecer no placar público</Text>
                  <Text style={styles.toggleSub}>Sua pontuação ficará visível para todos</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggle, showOnLeaderboard && styles.toggleOn]}
                  onPress={toggleLeaderboard}
                >
                  <View style={[styles.toggleThumb, showOnLeaderboard && styles.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Lista */}
            {leaderboard.map((entry, i) => (
              <View key={entry.id} style={styles.leaderRow}>
                <Text style={[styles.rank,
                  i === 0 && { color: '#FFD700' },
                  i === 1 && { color: '#C0C0C0' },
                  i === 2 && { color: '#CD7F32' }
                ]}>#{entry.rank}</Text>
                <FastImage
                  style={styles.leaderAvatar}
                  source={entry.avatarURL
                    ? { uri: entry.avatarURL }
                    : require('../assets/avatar_placeholder.png')
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderName}>{entry.userName}</Text>
                  <Text style={styles.leaderCity}>{entry.city || 'Localização desconhecida'}</Text>
                </View>
                <Text style={[styles.leaderPts,
                  i === 0 && { color: '#FFD700' }
                ]}>{Math.floor(entry.totalPoints || 0)} pts</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>

  )
}

function ActiveChallengeCard({ challenge, uid }) {
  const [participants, setParticipants] = useState([])

  useEffect(() => {
    const unsub = firestore()
      .collection('challenges').doc(challenge.id)
      .collection('participants')
      .onSnapshot(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
        setParticipants(list)
      })
    return unsub
  }, [])

  const daysLeft = Math.max(0, Math.floor(
    (challenge.endDate?.toDate?.() - Date.now()) / 86400000
  ))

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeHeader}>
        <Text style={styles.activeLabel}>
          {challenge.isGroup ? '👥 Competição em grupo' : '🔥 Desafio ativo'}
        </Text>
        <Text style={styles.daysLeft}>Termina em {daysLeft} dias</Text>
      </View>

      {challenge.isGroup ? (
        participants.map((p, i) => (
          <View key={p.id} style={[styles.participantRow, p.id === uid && { backgroundColor: '#EEF2FF' }]}>
            <Text style={styles.participantRank}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
            </Text>
            <FastImage
              style={styles.participantAvatar}
              source={p.avatarURL ? { uri: p.avatarURL } : require('../assets/avatar_placeholder.png')}
            />
            <Text style={[styles.participantName, p.id === uid && { color: '#4A6FE8', fontWeight: '700' }]}>
              {p.id === uid ? 'Eu' : p.userName}
            </Text>
            <Text style={styles.participantPts}>{Math.floor(p.totalPoints || 0)} pts</Text>
          </View>
        ))
      ) : (
        <View style={styles.duelRow}>
          {participants.map((p, i) => (
            <View key={p.id} style={styles.duelPlayer}>
              <FastImage
                style={styles.duelAvatar}
                source={p.avatarURL ? { uri: p.avatarURL } : require('../assets/avatar_placeholder.png')}
              />
              <Text style={styles.duelName} numberOfLines={1}>
                {p.id === uid ? 'Eu' : p.userName}
              </Text>
              <Text style={[styles.duelPts, p.id === uid && { color: '#34C759' }]}>
                {Math.floor(p.totalPoints || 0)} pts
              </Text>
            </View>
          ))}
          {participants.length < 2 && (
            <View style={styles.vsContainer}>
              <Text style={styles.vs}>VS</Text>
              <Text style={styles.vsLabel}>aguardando</Text>
            </View>
          )}
        </View>
      )}
    </View>
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
  newBtn: { color: '#4A6FE8', fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#4A6FE8' },
  tabText: { fontSize: 14, color: '#999' },
  activeTabText: { color: '#4A6FE8', fontWeight: '600' },
  content: { flex: 1 },
  section: { backgroundColor: '#fff', margin: 8, padding: 16, borderRadius: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  placeholder: { color: '#666', fontSize: 14, marginBottom: 12 },
  connectBtn: { backgroundColor: '#4A6FE8', borderRadius: 12, padding: 12, alignItems: 'center' },
  connectText: { color: '#fff', fontWeight: '600' },
  pendingCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  pendingText: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  pendingActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 1, backgroundColor: '#34C759', borderRadius: 10, padding: 10, alignItems: 'center' },
  acceptText: { color: '#fff', fontWeight: '600' },
  declineBtn: { flex: 1, backgroundColor: '#E5E5EA', borderRadius: 10, padding: 10, alignItems: 'center' },
  declineText: { color: '#666', fontWeight: '600' },
  newChallengeBtn: {
    margin: 8, backgroundColor: '#4A6FE8', borderRadius: 14,
    padding: 16, alignItems: 'center'
  },
  newChallengeText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyCard: {
    backgroundColor: '#fff', margin: 8, padding: 40,
    borderRadius: 16, alignItems: 'center'
  },
  emptyIcon: { fontSize: 44, marginBottom: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#999', marginTop: 4 },
  activeCard: { backgroundColor: '#fff', margin: 8, borderRadius: 16, padding: 16 },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  activeLabel: { fontSize: 13, fontWeight: '600', color: '#FF9500' },
  daysLeft: { fontSize: 12, color: '#999' },
  participantRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, marginBottom: 4 },
  participantRank: { width: 28, fontSize: 16 },
  participantAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E5E5EA', marginRight: 8 },
  participantName: { flex: 1, fontSize: 14 },
  participantPts: { fontSize: 14, fontWeight: '700' },
  duelRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 8 },
  duelPlayer: { alignItems: 'center', flex: 1 },
  duelAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E5E5EA', marginBottom: 6 },
  duelName: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
  duelPts: { fontSize: 16, fontWeight: '800', color: '#FF9500' },
  vsContainer: { alignItems: 'center' },
  vs: { fontSize: 20, fontWeight: '900', color: '#999' },
  vsLabel: { fontSize: 10, color: '#999' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleSub: { fontSize: 12, color: '#999', marginTop: 2 },
  toggle: { width: 50, height: 28, borderRadius: 14, backgroundColor: '#E5E5EA', padding: 2 },
  toggleOn: { backgroundColor: '#34C759' },
  toggleThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  toggleThumbOn: { transform: [{ translateX: 22 }] },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 12, marginBottom: 1, gap: 10
  },
  rank: { width: 36, fontSize: 14, fontWeight: '700', color: '#999' },
  leaderAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E5E5EA' },
  leaderName: { fontSize: 14, fontWeight: '500' },
  leaderCity: { fontSize: 12, color: '#999' },
  leaderPts: { fontSize: 14, fontWeight: '800' }
})
