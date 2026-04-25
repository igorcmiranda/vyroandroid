import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, FlatList, ActivityIndicator,
  Modal, Animated, Easing, Alert
} from 'react-native'
import FastImage from 'react-native-fast-image'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'
import ProgressTab from '../components/ProgressTab'
import { useLanguage } from '../context/LanguageContext'

// ─── Animação de resultado ────────────────────────────────────

function ChallengeResultModal({ result, onClose }) {
  const scaleAnim = useRef(new Animated.Value(0)).current
  const opacityAnim = useRef(new Animated.Value(0)).current
  const trophyBounce = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Bounce do troféu
      Animated.loop(
        Animated.sequence([
          Animated.timing(trophyBounce, { toValue: -12, duration: 400, useNativeDriver: true }),
          Animated.timing(trophyBounce, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        { iterations: 5 }
      ).start()
    })
  }, [])

  if (!result) return null

  const sorted = [...(result.participants || [])].sort((a, b) => (b.points || 0) - (a.points || 0))
  const winner = sorted[0]

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={resStyles.overlay}>
        <Animated.View style={[resStyles.card, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
          {/* Confetes emoji no topo */}
          <Text style={resStyles.confetti}>🎊 🏆 🎊</Text>

          <Text style={resStyles.title}>Desafio encerrado!</Text>
          <Text style={resStyles.subtitle}>
            {result.isGroup ? 'Competição finalizada!' : 'Duelo finalizado!'}
          </Text>

          {/* Troféu animado */}
          <Animated.Text style={[resStyles.trophy, { transform: [{ translateY: trophyBounce }] }]}>
            🏆
          </Animated.Text>

          {/* Vencedor */}
          <View style={resStyles.winnerBanner}>
            <Text style={resStyles.winnerCrown}>👑</Text>
            <Text style={resStyles.winnerName}>{winner?.name} venceu!</Text>
            <Text style={resStyles.winnerPts}>{Math.floor(winner?.points || 0)} pontos</Text>
          </View>

          {/* Ranking completo */}
          <View style={resStyles.rankList}>
            {sorted.map((p, i) => (
              <View key={p.id || i} style={[resStyles.rankRow, i === 0 && resStyles.rankRowWinner]}>
                <Text style={resStyles.rankPos}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </Text>
                <Text style={resStyles.rankName} numberOfLines={1}>{p.name}</Text>
                <Text style={[resStyles.rankPts, i === 0 && { color: '#FFD700' }]}>
                  {Math.floor(p.points || 0)} pts
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={resStyles.closeBtn} onPress={onClose}>
            <Text style={resStyles.closeBtnText}>🎉 Incrível!</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── ChallengeScreen ──────────────────────────────────────────

export default function ChallengeScreen({ navigation }) {
  const { t } = useLanguage()
  const [tab, setTab] = useState(0)
  const [activeChallenges, setActiveChallenges] = useState([])
  const [pendingChallenges, setPendingChallenges] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(false)
  const [loading, setLoading] = useState(true)
  const [challengeResult, setChallengeResult] = useState(null)
  const uid = auth().currentUser?.uid

  useEffect(() => {
    if (!uid) return
    loadChallenges()
    loadLeaderboard()
    loadLeaderboardPreference()
    checkExpiredChallenges()
  }, [uid])

  async function loadChallenges() {
    const [s1, s2, s3] = await Promise.all([
      firestore().collection('challenges').where('challengerID', '==', uid).get(),
      firestore().collection('challenges').where('challengedID', '==', uid).get(),
      firestore().collection('challenges').where('invitedIDs', 'array-contains', uid).get(),
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

  // Verifica se algum desafio expirou e mostra animação
  async function checkExpiredChallenges() {
    try {
      const now = new Date()
      const allSnaps = await Promise.all([
        firestore().collection('challenges').where('challengerID', '==', uid).where('status', '==', 'active').get(),
        firestore().collection('challenges').where('challengedID', '==', uid).where('status', '==', 'active').get(),
        firestore().collection('challenges').where('invitedIDs', 'array-contains', uid).where('status', '==', 'active').get(),
      ])

      const seen = new Set()
      const activeDocs = []
      for (const snap of allSnaps) {
        for (const doc of snap.docs) {
          if (!seen.has(doc.id)) {
            seen.add(doc.id)
            activeDocs.push(doc)
          }
        }
      }

      for (const doc of activeDocs) {
        const data = doc.data()
        const endDate = data.endDate?.toDate?.()
        if (!endDate || endDate > now) continue

        // Desafio expirado — busca participantes e mostra animação
        const participantsSnap = await firestore()
          .collection('challenges').doc(doc.id)
          .collection('participants').get()

        const participants = participantsSnap.docs.map(p => ({
          id: p.id,
          name: p.data().userName || '',
          avatar: p.data().avatarURL || '',
          points: p.data().totalPoints || 0,
        }))

        if (participants.length === 0) continue

        // Marca como completed
        await firestore().collection('challenges').doc(doc.id).update({ status: 'completed' })

        // Dá troféus
        const sorted = [...participants].sort((a, b) => b.points - a.points)
        for (let i = 0; i < sorted.length; i++) {
          const trophyType = i === 0 ? 'challenge_winner' : 'challenge_participation'
          const desc = i === 0
            ? `Venceu com ${Math.floor(sorted[i].points)} pontos!`
            : `Participante. Vencedor: ${sorted[0].name}`

          await firestore().collection('users').doc(sorted[i].id)
            .collection('trophies').add({
              type: trophyType,
              description: desc,
              points: sorted[i].points,
              earnedAt: firestore.Timestamp.now(),
            })

          // Notifica
          await firestore().collection('notifications').doc(sorted[i].id)
            .collection('items').add({
              type: 'challenge_accepted',
              fromUserID: 'system',
              fromUserName: 'Vyro',
              fromUserAvatar: '',
              challengeID: doc.id,
              message: i === 0
                ? `🏆 Você venceu o desafio com ${Math.floor(sorted[i].points)} pontos!`
                : `Desafio encerrado! ${sorted[0].name} venceu com ${Math.floor(sorted[0].points)} pts.`,
              read: false,
              createdAt: firestore.Timestamp.now(),
            })
        }

        // Mostra animação para quem está logado e participou
        if (participants.find(p => p.id === uid)) {
          setChallengeResult({
            isGroup: data.isGroup || false,
            participants: sorted,
          })
          break // Mostra uma animação por vez
        }
      }
    } catch (e) {
      console.log('checkExpiredChallenges error:', e)
    }
  }

  async function loadLeaderboard() {
    const snap = await firestore().collection('leaderboard')
      .where('showOnLeaderboard', '==', true).get()
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
      .update({ status: 'active', acceptedIDs: firestore.FieldValue.arrayUnion(uid) })
    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()
    await firestore().collection('challenges').doc(challenge.id)
      .collection('participants').doc(uid).set({
        userName: userData.name,
        avatarURL: userData.avatarURL || '',
        totalPoints: 0,
        todayPoints: 0,
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
        showOnLeaderboard: true,
      })
    } else {
      await ref.update({ showOnLeaderboard: false })
    }
    await firestore().collection('users').doc(uid).update({ showOnLeaderboard: newValue })
    loadLeaderboard()
  }

  const tabs = [t.challenge.progress, t.challenge.challenges, t.challenge.leaderboard]

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Animação de resultado */}
      <ChallengeResultModal
        result={challengeResult}
        onClose={() => setChallengeResult(null)}
      />

      <View style={styles.header}>
        <Text style={styles.title}>{t.challenge.title}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('NewChallenge')}>
          <Text style={styles.newBtn}>{t.challenge.newChallenge}</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((tabLabel, i) => (
          <TouchableOpacity
            key={tabLabel}
            style={[styles.tab, tab === i && styles.activeTab]}
            onPress={() => setTab(i)}
          >
            <Text style={[styles.tabText, tab === i && styles.activeTabText]}>{tabLabel}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Tab Progresso */}
        {tab === 0 && <ProgressTab />}

        {/* Tab Desafios */}
        {tab === 1 && (
          <View>
            {pendingChallenges.length > 0 && (
              <View style={[styles.section, { backgroundColor: '#FFF8E7' }]}>
                <Text style={styles.sectionTitle}>🔔 {t.challenge.pending}</Text>
                {pendingChallenges.map(c => (
                  <View key={c.id} style={styles.pendingCard}>
                    <Text style={styles.pendingText}>
                      {c.isGroup
                        ? `${c.challengerName} te convidou para uma competição!`
                        : `${c.challengerName} te desafiou por 30 dias!`}
                    </Text>
                    <View style={styles.pendingActions}>
                      <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptChallenge(c)}>
                        <Text style={styles.acceptText}>{t.challenge.accept}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.declineBtn} onPress={() => declineChallenge(c)}>
                        <Text style={styles.declineText}>{t.challenge.decline}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.newChallengeBtn}
              onPress={() => navigation.navigate('NewChallenge')}
            >
              <Text style={styles.newChallengeText}>{t.challenge.challengeBtn}</Text>
            </TouchableOpacity>

            {loading ? (
              <ActivityIndicator style={{ margin: 20 }} color="#4A6FE8" />
            ) : activeChallenges.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🏆</Text>
                <Text style={styles.emptyText}>{t.challenge.noActive}</Text>
                <Text style={styles.emptySubtext}>{t.challenge.noActiveSub}</Text>
              </View>
            ) : (
              activeChallenges.map(c => (
                <ActiveChallengeCard key={c.id} challenge={c} uid={uid} t={t} />
              ))
            )}
          </View>
        )}

        {/* Tab Placar */}
        {tab === 2 && (
          <View>
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleLabel}>{t.challenge.publicLeaderboard}</Text>
                  <Text style={styles.toggleSub}>{t.challenge.leaderboardSub}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggle, showOnLeaderboard && styles.toggleOn]}
                  onPress={toggleLeaderboard}
                >
                  <View style={[styles.toggleThumb, showOnLeaderboard && styles.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
            </View>

            {leaderboard.map((entry, i) => (
              <View key={entry.id} style={styles.leaderRow}>
                <Text style={[
                  styles.rank,
                  i === 0 && { color: '#FFD700' },
                  i === 1 && { color: '#C0C0C0' },
                  i === 2 && { color: '#CD7F32' },
                ]}>#{entry.rank}</Text>
                <FastImage
                  style={styles.leaderAvatar}
                  source={entry.avatarURL
                    ? { uri: entry.avatarURL }
                    : require('../assets/avatar_placeholder.png')
                  }
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.leaderName}>{entry.userName}</Text>
                    {entry.isVerified && <Text style={{ color: '#FFD700', fontSize: 11 }}>✦</Text>}
                  </View>
                  <Text style={styles.leaderCity}>{entry.city || 'Localização desconhecida'}</Text>
                </View>
                <Text style={[styles.leaderPts, i === 0 && { color: '#FFD700' }]}>
                  {Math.floor(entry.totalPoints || 0)} pts
                </Text>
              </View>
            ))}

            {leaderboard.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📊</Text>
                <Text style={styles.emptyText}>Nenhum participante ainda</Text>
                <Text style={styles.emptySubtext}>Ative sua visibilidade para aparecer!</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function ActiveChallengeCard({ challenge, uid, t }) {
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

  const endDate = challenge.endDate?.toDate?.()
  const daysLeft = endDate
    ? Math.max(0, Math.ceil((endDate - Date.now()) / 86400000))
    : 30

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeHeader}>
        <Text style={styles.activeLabel}>
          {challenge.isGroup ? '👥 Competição em grupo' : '🔥 Desafio ativo'}
        </Text>
        <Text style={styles.daysLeft}>{t.challenge.endsIn} {daysLeft} {t.challenge.days}</Text>
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
          {participants.map(p => (
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

// ─── Styles ───────────────────────────────────────────────────

const resStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  confetti: { fontSize: 32, letterSpacing: 8 },
  title: { fontSize: 22, fontWeight: '900', color: '#111', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', marginTop: -6 },
  trophy: { fontSize: 72, marginVertical: 4 },
  winnerBanner: {
    backgroundColor: '#FFF9E6',
    borderRadius: 16,
    padding: 14,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFD700',
  },
  winnerCrown: { fontSize: 24 },
  winnerName: { fontSize: 18, fontWeight: '800', color: '#111', marginTop: 4 },
  winnerPts: { fontSize: 14, color: '#FF9500', fontWeight: '600', marginTop: 2 },
  rankList: { width: '100%', gap: 6 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8F8F8',
  },
  rankRowWinner: { backgroundColor: '#FFF9E6' },
  rankPos: { fontSize: 20, width: 36 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '600' },
  rankPts: { fontSize: 14, fontWeight: '700', color: '#666' },
  closeBtn: {
    backgroundColor: '#4A6FE8',
    borderRadius: 14,
    paddingHorizontal: 36,
    paddingVertical: 14,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA',
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
  pendingCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  pendingText: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  pendingActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 1, backgroundColor: '#34C759', borderRadius: 10, padding: 10, alignItems: 'center' },
  acceptText: { color: '#fff', fontWeight: '600' },
  declineBtn: { flex: 1, backgroundColor: '#E5E5EA', borderRadius: 10, padding: 10, alignItems: 'center' },
  declineText: { color: '#666', fontWeight: '600' },
  newChallengeBtn: { margin: 8, backgroundColor: '#4A6FE8', borderRadius: 14, padding: 16, alignItems: 'center' },
  newChallengeText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyCard: { backgroundColor: '#fff', margin: 8, padding: 40, borderRadius: 16, alignItems: 'center' },
  emptyIcon: { fontSize: 44, marginBottom: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#999', marginTop: 4, textAlign: 'center' },
  activeCard: { backgroundColor: '#fff', margin: 8, borderRadius: 16, padding: 16 },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  activeLabel: { fontSize: 13, fontWeight: '600', color: '#FF9500' },
  daysLeft: { fontSize: 12, color: '#999' },
  participantRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 8, borderRadius: 8, marginBottom: 4,
  },
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
    backgroundColor: '#fff', padding: 12, marginBottom: 1, gap: 10,
  },
  rank: { width: 36, fontSize: 14, fontWeight: '700', color: '#999' },
  leaderAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E5E5EA' },
  leaderName: { fontSize: 14, fontWeight: '500' },
  leaderCity: { fontSize: 12, color: '#999' },
  leaderPts: { fontSize: 14, fontWeight: '800' },
})
