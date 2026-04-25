import { useLanguage } from '../context/LanguageContext'
import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, FlatList, Dimensions,
  Alert, Modal, ActivityIndicator, TextInput
} from 'react-native'
import FastImage from 'react-native-fast-image'
import firestore from '@react-native-firebase/firestore'
import storage from '@react-native-firebase/storage'
import auth from '@react-native-firebase/auth'
import AuthManager from '../managers/AuthManager'
import { SafeAreaView } from 'react-native-safe-area-context'
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'
import { PermissionsAndroid, Platform } from 'react-native'

const { width } = Dimensions.get('window')
const THUMB = (width - 4) / 3

const GOALS = ["Perder peso", "Manter peso", "Ganhar massa"]
const SEX_OPTIONS = ["Masculino", "Feminino"]

export default function ProfileScreen({ navigation }) {
  const { t } = useLanguage()
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [trophies, setTrophies] = useState([])
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFollowing, setShowFollowing] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Campos do perfil
  const [editName, setEditName] = useState('')
  const [editWeight, setEditWeight] = useState('')
  const [editHeight, setEditHeight] = useState('')
  const [editAge, setEditAge] = useState('')
  const [editSex, setEditSex] = useState('Masculino')
  const [editGoal, setEditGoal] = useState('Manter peso')
  const [savingProfile, setSavingProfile] = useState(false)

  const uid = auth().currentUser?.uid

  // Calcula meta calórica (Harris-Benedict)
  function calculateDailyCalories(weight, height, age, sex, goal) {
    const w = parseFloat(weight) || 0
    const h = parseFloat(height) || 0
    const a = parseInt(age) || 0
    if (!w || !h || !a) return 0

    let bmr = sex === 'Masculino'
      ? 88.36 + (13.4 * w) + (4.8 * h) - (5.7 * a)
      : 447.6 + (9.2 * w) + (3.1 * h) - (4.3 * a)

    const tdee = bmr * 1.55 // atividade moderada

    if (goal === 'Perder peso') return Math.round(tdee - 500)
    if (goal === 'Ganhar massa') return Math.round(tdee + 300)
    return Math.round(tdee)
  }

  const dailyCalories = calculateDailyCalories(
    user?.weight, user?.height, user?.age, user?.sex, user?.goal
  )

  useEffect(() => {
    if (!uid) return

    const unsubUser = firestore().collection('users').doc(uid)
      .onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data()
          setUser({ uid, ...data })
          setFollowersCount(data?.followersCount || 0)
        }
      })

    const unsubPosts = firestore().collection('posts')
      .where('userID', '==', uid)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        snap => {
          if (snap?.docs) setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        },
        () => {
          firestore().collection('posts').where('userID', '==', uid).get()
            .then(s => {
              if (s?.docs) {
                setPosts(s.docs.map(d => ({ id: d.id, ...d.data() }))
                  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
              }
            })
        }
      )

    firestore().collection('follows').doc(uid)
      .collection('following').get()
      .then(snap => setFollowingCount(snap.size))

    firestore().collection('users').doc(uid)
      .collection('trophies').get()
      .then(snap => {
        if (snap?.docs) setTrophies(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      })
      .catch(() => setTrophies([]))

    return () => { unsubUser(); unsubPosts() }
  }, [uid])

  function openEditProfile() {
    setEditName(user?.name || '')
    setEditWeight(String(user?.weight || ''))
    setEditHeight(String(user?.height || ''))
    setEditAge(String(user?.age || ''))
    setEditSex(user?.sex || 'Masculino')
    setEditGoal(user?.goal || 'Manter peso')
    setShowEditProfile(true)
  }

  async function saveProfile() {
    setSavingProfile(true)
    try {
      await firestore().collection('users').doc(uid).update({
        name: editName,
        weight: parseFloat(editWeight) || 0,
        height: parseFloat(editHeight) || 0,
        age: parseInt(editAge) || 0,
        sex: editSex,
        goal: editGoal
      })
      setShowEditProfile(false)
      Alert.alert('✅ Perfil atualizado!')
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar.')
    }
    setSavingProfile(false)
  }

  async function changeAvatar() {
    Alert.alert('Foto de perfil', 'Escolha uma opção', [
      {
        text: '📷 Câmera',
        onPress: () => pickImage(true)
      },
      {
        text: '🖼️ Galeria',
        onPress: () => pickImage(false)
      },
      { text: 'Cancelar', style: 'cancel' }
    ])
  }

  async function pickImage(fromCamera) {
    if (fromCamera && Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA
      )
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permissão negada', 'Ative a câmera nas configurações.')
        return
      }
    }

    const options = { mediaType: 'photo', quality: 0.8 }
    const launch = fromCamera ? launchCamera : launchImageLibrary

    launch(options, async response => {
      if (response.didCancel || response.errorCode) return
      const asset = response.assets?.[0]
      if (!asset) return

      setUploadingAvatar(true)
      try {
        const ref = storage().ref(`avatars/${uid}/avatar.jpg`)
        await ref.putFile(asset.uri)
        const url = await ref.getDownloadURL()
        await firestore().collection('users').doc(uid).update({ avatarURL: url })
        Alert.alert('✅ Foto atualizada!')
      } catch (e) {
        Alert.alert('Erro', 'Não foi possível atualizar a foto.')
      }
      setUploadingAvatar(false)
    })
  }

  async function loadFollowers() {
    setLoadingFollow(true)
    const snap = await firestore().collection('users').doc(uid)
      .collection('followers').get()
    if (snap.docs.length > 0) {
      const users = await Promise.all(snap.docs.map(async d => {
        const u = await firestore().collection('users').doc(d.id).get()
        return { id: d.id, ...u.data() }
      }))
      setFollowers(users)
    } else {
      const allFollows = await firestore().collection('follows').get()
      const result = []
      for (const doc of allFollows.docs) {
        if (doc.id === uid) continue
        const f = await firestore().collection('follows').doc(doc.id)
          .collection('following').doc(uid).get()
        if (f.exists) {
          const u = await firestore().collection('users').doc(doc.id).get()
          result.push({ id: doc.id, ...u.data() })
        }
      }
      setFollowers(result)
    }
    setLoadingFollow(false)
  }

  async function loadFollowing() {
    setLoadingFollow(true)
    const snap = await firestore().collection('follows').doc(uid)
      .collection('following').get()
    const users = await Promise.all(snap.docs.map(async d => {
      const u = await firestore().collection('users').doc(d.id).get()
      return { id: d.id, ...u.data() }
    }))
    setFollowing(users)
    setLoadingFollow(false)
  }

  function trophyIcon(type) {
    const icons = {
      challenge_winner: '🏆', challenge_participation: '🥈',
      city_first: '🏙️', region_first: '🗺️',
      country_first: '🚩', global_first: '🌎'
    }
    return icons[type] || '🏅'
  }

  const displayTrophies = trophies.slice(0, 7)
  const extraCount = trophies.length - 7

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={changeAvatar} style={styles.avatarContainer}>
            {uploadingAvatar ? (
              <View style={[styles.avatar, styles.avatarLoading]}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <FastImage
                style={styles.avatar}
                source={user?.avatarURL
                  ? { uri: user.avatarURL }
                  : require('../assets/avatar_placeholder.png')
                }
              />
            )}
            <View style={styles.cameraIcon}>
              <Text style={{ fontSize: 14 }}>📷</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.stats}>
            <TouchableOpacity style={styles.stat}>
              <Text style={styles.statNum}>{posts.length}</Text>
              <Text style={styles.statLabel}>{t.profile.posts}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stat}
              onPress={() => { loadFollowers(); setShowFollowers(true) }}
            >
              <Text style={styles.statNum}>{followersCount}</Text>
              <Text style={styles.statLabel}>{t.profile.followers}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stat}
              onPress={() => { loadFollowing(); setShowFollowing(true) }}
            >
              <Text style={styles.statNum}>{followingCount}</Text>
              <Text style={styles.statLabel}>{t.profile.following}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nome e username */}
        <View style={styles.nameSection}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.name}</Text>
            {user?.isVerified && <Text style={styles.verified}>✦</Text>}
          </View>
          <Text style={styles.username}>@{user?.username}</Text>
          <TouchableOpacity style={styles.editBtn} onPress={openEditProfile}>
          <Text style={styles.editBtnText}>{t.profile.editProfile}</Text>
          </TouchableOpacity>
        </View>

        {/* Meta calórica */}
        {dailyCalories > 0 && (
          <View style={styles.calorieCard}>
            <Text style={styles.calorieIcon}>🔥</Text>
            <View>
              <Text style={styles.calorieValue}>{dailyCalories} kcal/dia</Text>
              <Text style={styles.calorieLabel}>{t.profile.dailyCalories} • {user?.goal}</Text>
            </View>
          </View>
        )}

        {/* Dados do perfil */}
        {(user?.weight || user?.height || user?.age) ? (
          <View style={styles.dataCard}>
            {user?.weight > 0 && (
              <View style={styles.dataItem}>
                <Text style={styles.dataIcon}>⚖️</Text>
                <Text style={styles.dataValue}>{user.weight} kg</Text>
                <Text style={styles.dataLabel}>Peso</Text>
              </View>
            )}
            {user?.height > 0 && (
              <View style={styles.dataItem}>
                <Text style={styles.dataIcon}>📏</Text>
                <Text style={styles.dataValue}>{user.height} cm</Text>
                <Text style={styles.dataLabel}>Altura</Text>
              </View>
            )}
            {user?.age > 0 && (
              <View style={styles.dataItem}>
                <Text style={styles.dataIcon}>🎂</Text>
                <Text style={styles.dataValue}>{user.age} anos</Text>
                <Text style={styles.dataLabel}>Idade</Text>
              </View>
            )}
            {user?.sex && (
              <View style={styles.dataItem}>
                <Text style={styles.dataIcon}>{user.sex === 'Masculino' ? '👨' : '👩'}</Text>
                <Text style={styles.dataValue}>{user.sex}</Text>
                <Text style={styles.dataLabel}>Sexo</Text>
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.setupCard} onPress={openEditProfile}>
            <Text style={styles.setupText}>
              ➕ Complete seu perfil para calcular sua meta calórica
            </Text>
          </TouchableOpacity>
        )}

        {/* Botões de ação rápida */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickNav}>
          {[
            { label: 'Dieta', icon: '📋', screen: 'Diet' },
            { label: 'Corpo', icon: '💪', screen: 'Body' },
            { label: 'Água', icon: '💧', screen: 'Water' },
            { label: 'Meu uso', icon: '📊', screen: 'Usage' },
          ].map(item => (
            <TouchableOpacity
              key={item.label}
              style={styles.quickNavBtn}
              onPress={() => navigation.navigate(item.screen)}
            >
              <Text style={styles.quickNavIcon}>{item.icon}</Text>
              <Text style={styles.quickNavLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Troféus */}
        {trophies.length > 0 && (
          <View style={styles.section}>
           <Text style={styles.calorieLabel}>{t.profile.dailyCalories} • {user?.goal}</Text>
            <View style={styles.trophyGrid}>
              {displayTrophies.map(t => (
                <View key={t.id} style={styles.trophyItem}>
                  <Text style={styles.trophyIcon}>{trophyIcon(t.type)}</Text>
                  <Text style={styles.trophyLabel} numberOfLines={2}>
                    {t.type === 'challenge_winner' ? 'Vencedor' :
                     t.type === 'challenge_participation' ? 'Participante' :
                     t.type === 'city_first' ? 'Campeão Cidade' :
                     t.type === 'region_first' ? 'Campeão Estado' :
                     t.type === 'country_first' ? 'Campeão País' : 'Campeão Global'}
                  </Text>
                </View>
              ))}
              {extraCount > 0 && (
                <View style={styles.trophyItem}>
                  <View style={styles.moreBox}>
                    <Text style={styles.moreText}>+{extraCount}</Text>
                  </View>
                  <Text style={styles.trophyLabel}>ver mais</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Grid de posts */}
        <View style={styles.section}>
         <Text style={styles.sectionTitle}>{t.profile.publications}</Text>
          <View style={styles.grid}>
            {posts.map(post => (
              <TouchableOpacity
                key={post.id}
                onPress={() => navigation.navigate('PostDetail', { post })}
              >
                <FastImage
                  style={styles.thumb}
                  source={{ uri: post.mediaURL }}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <View style={styles.thumbOverlay}>
                  <Text style={styles.thumbLikes}>❤️ {post.likesCount || 0}</Text>
                  <Text style={styles.thumbLikes}>💬 {post.commentsCount || 0}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {posts.length === 0 && (
            <Text style={styles.emptyText}>{t.profile.noPublications}</Text>
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => Alert.alert(t.profile.logout, t.profile.logoutConfirm, [
            { text: t.profile.cancel, style: 'cancel' },
            { text: t.profile.confirm, style: 'destructive', onPress: () => AuthManager.logout() }
          ])}
        >
          <Text style={styles.logoutText}>{t.profile.logout}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal Editar Perfil */}
      <Modal
        visible={showEditProfile}
        animationType="slide"
        onRequestClose={() => setShowEditProfile(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditProfile(false)}>
              <Text style={{ color: '#FF3B30', fontSize: 15 }}>{t.common.cancel}</Text>
            </TouchableOpacity>
              <Text style={styles.modalTitle}>{t.profile.editProfile}</Text>
            <TouchableOpacity onPress={saveProfile} disabled={savingProfile}>
              {savingProfile
                ? <ActivityIndicator size="small" color="#4A6FE8" />
                : <Text style={{ color: '#4A6FE8', fontWeight: '700' }}>{t.common.save}</Text>

              }
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }}>
            {/* Nome */}
            <Text style={{ color: '#4A6FE8', fontWeight: '700' }}>{t.common.save}</Text>
            <TextInput
              style={styles.fieldInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Seu nome"
              placeholderTextColor="#999"
            />

            {/* Sexo */}
            <Text style={styles.fieldLabel}>{t.profile.sex}</Text>
            <View style={styles.optionRow}>
              {SEX_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.optionBtn, editSex === opt && styles.optionBtnActive]}
                  onPress={() => setEditSex(opt)}
                >
                  <Text style={[styles.optionText, editSex === opt && styles.optionTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Idade */}
            <Text style={styles.fieldLabel}>{t.profile.age}</Text>
            <TextInput
              style={styles.fieldInput}
              value={editAge}
              onChangeText={setEditAge}
              placeholder="Anos"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />

            {/* Peso */}
            <Text style={styles.fieldLabel}>{t.profile.weight}</Text>
            <TextInput
              style={styles.fieldInput}
              value={editWeight}
              onChangeText={setEditWeight}
              placeholder="Ex: 70"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
            />

            {/* Altura */}
            <Text style={styles.fieldLabel}>{t.profile.height}</Text>
            <TextInput
              style={styles.fieldInput}
              value={editHeight}
              onChangeText={setEditHeight}
              placeholder="Ex: 175"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
            />

            {/* Objetivo */}
            <Text style={styles.fieldLabel}>{t.profile.goal}</Text>
            {GOALS.map(goal => (
              <TouchableOpacity
                key={goal}
                style={[styles.goalBtn, editGoal === goal && styles.goalBtnActive]}
                onPress={() => setEditGoal(goal)}
              >
                <Text style={[styles.goalText, editGoal === goal && styles.goalTextActive]}>
                  {goal === 'Perder peso' ? '⬇️ ' : goal === 'Ganhar massa' ? '⬆️ ' : '➡️ '}{goal}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Preview da meta */}
            {editWeight && editHeight && editAge && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>🔥 Meta calórica calculada</Text>
                <Text style={styles.previewValue}>
                  {calculateDailyCalories(editWeight, editHeight, editAge, editSex, editGoal)} kcal/dia
                </Text>
                <Text style={styles.previewSub}>Baseada no método Harris-Benedict</Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal Seguidores/Seguindo */}
      <Modal
        visible={showFollowers || showFollowing}
        animationType="slide"
        onRequestClose={() => { setShowFollowers(false); setShowFollowing(false) }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {showFollowers ? t.profile.followers : t.profile.following}
            </Text>
            <TouchableOpacity onPress={() => { setShowFollowers(false); setShowFollowing(false) }}>
              <Text style={{ color: '#FF3B30', fontSize: 15 }}>{t.common.close}</Text>
            </TouchableOpacity>
          </View>
          {loadingFollow ? (
            <ActivityIndicator style={{ margin: 20 }} color="#4A6FE8" />
          ) : (
            <FlatList
              data={showFollowers ? followers : following}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.followRow}>
                  <FastImage
                    style={styles.followAvatar}
                    source={item.avatarURL
                      ? { uri: item.avatarURL }
                      : require('../assets/avatar_placeholder.png')
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.followName}>{item.name}</Text>
                    <Text style={styles.followUsername}>@{item.username}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={() => (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#999' }}>
                    {showFollowers ? 'Nenhum seguidor ainda' : 'Não segue ninguém ainda'}
                  </Text>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: '#E5E5EA' }} />}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', padding: 16, gap: 16, backgroundColor: '#fff' },
  avatarContainer: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E5E5EA' },
  avatarLoading: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ccc' },
  cameraIcon: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#fff', borderRadius: 12,
    padding: 3, borderWidth: 1, borderColor: '#E5E5EA'
  },
  stats: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  nameSection: { backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700' },
  verified: { color: '#FFD700', fontSize: 14 },
  username: { fontSize: 13, color: '#666', marginTop: 2 },
  editBtn: {
    backgroundColor: '#F2F2F7', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6,
    alignSelf: 'flex-start', marginTop: 8
  },
  editBtnText: { fontSize: 13, fontWeight: '500', color: '#333' },
  calorieCard: {
    backgroundColor: '#FFF3E0', margin: 12, borderRadius: 16,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12
  },
  calorieIcon: { fontSize: 32 },
  calorieValue: { fontSize: 18, fontWeight: '800', color: '#FF6B00' },
  calorieLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  dataCard: {
    backgroundColor: '#fff', marginHorizontal: 12,
    borderRadius: 16, padding: 16,
    flexDirection: 'row', flexWrap: 'wrap', gap: 12
  },
  dataItem: { alignItems: 'center', minWidth: 70 },
  dataIcon: { fontSize: 22, marginBottom: 4 },
  dataValue: { fontSize: 14, fontWeight: '700' },
  dataLabel: { fontSize: 11, color: '#999' },
  setupCard: {
    backgroundColor: '#EEF2FF', margin: 12,
    borderRadius: 16, padding: 16, alignItems: 'center'
  },
  setupText: { color: '#4A6FE8', fontWeight: '500', textAlign: 'center' },
  quickNav: { backgroundColor: '#fff', marginTop: 8 },
  quickNavBtn: { alignItems: 'center', padding: 16, minWidth: 80 },
  quickNavIcon: { fontSize: 24, marginBottom: 4 },
  quickNavLabel: { fontSize: 11, fontWeight: '600', color: '#444' },
  section: { backgroundColor: '#fff', marginTop: 8, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  trophyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trophyItem: { width: 64, alignItems: 'center' },
  trophyIcon: { fontSize: 32, marginBottom: 4 },
  trophyLabel: { fontSize: 9, color: '#666', textAlign: 'center' },
  moreBox: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center'
  },
  moreText: { fontSize: 16, fontWeight: '700', color: '#444' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  thumb: { width: THUMB, height: THUMB, backgroundColor: '#E5E5EA' },
  thumbOverlay: {
    position: 'absolute', bottom: 4, left: 4,
    flexDirection: 'row', gap: 6
  },
  thumbLikes: { fontSize: 11, color: '#fff', fontWeight: '600' },
  emptyText: { color: '#999', textAlign: 'center', padding: 20 },
  logoutBtn: {
    margin: 16, padding: 16, backgroundColor: '#fff',
    borderRadius: 14, alignItems: 'center'
  },
  logoutText: { color: '#FF3B30', fontWeight: '600' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA'
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  followRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, backgroundColor: '#fff', gap: 12
  },
  followAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E5E5EA' },
  followName: { fontSize: 15, fontWeight: '500' },
  followUsername: { fontSize: 13, color: '#999' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 12 },
  fieldInput: {
    backgroundColor: '#fff', borderRadius: 12,
    padding: 14, fontSize: 15, color: '#000',
    borderWidth: 0.5, borderColor: '#E5E5EA'
  },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionBtn: {
    flex: 1, backgroundColor: '#F2F2F7', borderRadius: 12,
    padding: 12, alignItems: 'center'
  },
  optionBtnActive: { backgroundColor: '#4A6FE8' },
  optionText: { fontSize: 14, fontWeight: '600', color: '#666' },
  optionTextActive: { color: '#fff' },
  goalBtn: {
    backgroundColor: '#F2F2F7', borderRadius: 12,
    padding: 14, marginBottom: 8
  },
  goalBtnActive: { backgroundColor: '#4A6FE8' },
  goalText: { fontSize: 14, fontWeight: '500', color: '#333' },
  goalTextActive: { color: '#fff' },
  previewCard: {
    backgroundColor: '#FFF3E0', borderRadius: 16,
    padding: 16, alignItems: 'center', marginTop: 16, gap: 4
  },
  previewTitle: { fontSize: 14, fontWeight: '700', color: '#FF6B00' },
  previewValue: { fontSize: 28, fontWeight: '900', color: '#FF6B00' },
  previewSub: { fontSize: 12, color: '#999' }
})