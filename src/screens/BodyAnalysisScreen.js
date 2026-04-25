import { useLanguage } from '../context/LanguageContext'
import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, ActivityIndicator,
  Alert, FlatList, Modal
} from 'react-native'
import FastImage from 'react-native-fast-image'
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'
import { PermissionsAndroid, Platform } from 'react-native'
import firestore from '@react-native-firebase/firestore'
import storage from '@react-native-firebase/storage'
import auth from '@react-native-firebase/auth'
import ClaudeManager from '../managers/ClaudeManager'
import { SafeAreaView } from 'react-native-safe-area-context'

const DAYS_PT = {
  segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta',
  quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo'
}

export default function BodyAnalysisScreen({ navigation, route }) {
  const { t } = useLanguage()
  const { userProfile } = route?.params || {}
  const [tab, setTab] = useState(0)
  const [image, setImage] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [selectedHistory, setSelectedHistory] = useState(null)
  const [workoutPlan, setWorkoutPlan] = useState(null)
  const [generatingWorkout, setGeneratingWorkout] = useState(false)
  const uid = auth().currentUser?.uid

  useEffect(() => {
    loadHistory()
    loadWorkoutPlan()
  }, [])

  async function loadHistory() {
    try {
      const snap = await firestore()
        .collection('users').doc(uid)
        .collection('bodyAnalyses')
        .orderBy('createdAt', 'desc')
        .get()
      if (snap?.docs) {
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
    } catch (e) {
      console.log('Erro histórico:', e)
    }
    setLoadingHistory(false)
  }

  async function loadWorkoutPlan() {
    try {
      const doc = await firestore()
        .collection('users').doc(uid)
        .collection('workoutPlans').doc('current').get()
      if (doc.exists) setWorkoutPlan(doc.data())
    } catch (e) {
      console.log('Erro treino:', e)
    }
  }

  async function selectImage(fromCamera) {
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
    launch(options, response => {
      if (response.didCancel || response.errorCode) return
      if (response.assets?.[0]) {
        setImage(response.assets[0])
        setResult(null)
      }
    })
  }

  async function analyze() {
    if (!image || !uid) return

    // Verifica limite
    const usageDoc = await firestore().collection('usage').doc(uid).get()
    const usage = usageDoc.data() || {}
    const now = new Date()
    const lastReset = usage.lastMonthlyReset?.toDate?.()
    const sameMonth = lastReset &&
      lastReset.getMonth() === now.getMonth() &&
      lastReset.getFullYear() === now.getFullYear()
    const bodyAnalyses = sameMonth ? (usage.bodyAnalysesThisMonth || 0) : 0

    if (bodyAnalyses >= 2) {
      Alert.alert('Limite atingido', 'Você atingiu o limite de 2 análises corporais este mês.')
      return
    }

    setAnalyzing(true)
    try {
      const analysisResult = await ClaudeManager.analyzeBody(image.uri, userProfile)
      setResult(analysisResult)

      // Salva a análise com a foto
      let photoURL = ''
      try {
        const ref = storage().ref(`bodyAnalyses/${uid}/${Date.now()}.jpg`)
        await ref.putFile(image.uri)
        photoURL = await ref.getDownloadURL()
      } catch (e) {
        console.log('Erro upload foto:', e)
      }

      const analysisData = {
        ...analysisResult,
        photoURL,
        createdAt: firestore.Timestamp.now()
      }

      await firestore()
        .collection('users').doc(uid)
        .collection('bodyAnalyses')
        .add(analysisData)

      // Atualiza histórico
      setHistory(prev => [{ id: Date.now().toString(), ...analysisData }, ...prev])

      // Atualiza uso
      await firestore().collection('usage').doc(uid).set({
        ...usage,
        bodyAnalysesThisMonth: bodyAnalyses + 1,
        lastMonthlyReset: firestore.Timestamp.now()
      })
    } catch (e) {
      Alert.alert('Erro na análise', 'Não foi possível analisar a imagem.')
    }
    setAnalyzing(false)
  }

  async function generateWorkout() {
    if (!result && history.length === 0) {
      Alert.alert('Atenção', 'Faça uma análise corporal primeiro.')
      return
    }

    setGeneratingWorkout(true)
    try {
      const lastAnalysis = result || history[0]
      const workout = await ClaudeManager.generateWorkoutPlan(lastAnalysis, userProfile)

      await firestore()
        .collection('users').doc(uid)
        .collection('workoutPlans').doc('current')
        .set({ ...workout, createdAt: firestore.Timestamp.now() })

      setWorkoutPlan(workout)
      setTab(2)
      Alert.alert('✅ Treino gerado!', 'Seu plano de treino foi criado com sucesso.')
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível gerar o treino.')
    }
    setGeneratingWorkout(false)
  }

  const fatColor = (category) => {
    if (category === 'Atlético' || category === 'Fitness') return '#34C759'
    if (category === 'Normal') return '#4A6FE8'
    if (category === 'Acima do peso') return '#FF9500'
    return '#FF3B30'
  }

  if (!acceptedDisclaimer) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.disclaimerContainer}>
          <Text style={styles.disclaimerIcon}>⚠️</Text>
          <Text style={styles.disclaimerTitle}>Aviso importante</Text>
          <Text style={styles.disclaimerText}>
            Esta análise é uma estimativa visual educacional baseada em IA.
            Não substitui avaliação médica profissional.
          </Text>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => setAcceptedDisclaimer(true)}
          >
            <Text style={styles.acceptBtnText}>Entendo, continuar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {['Análise', 'Histórico', 'Treino'].map((t, i) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === i && styles.activeTab]}
            onPress={() => setTab(i)}
          >
            <Text style={[styles.tabText, tab === i && styles.activeTabText]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab 0 — Análise */}
      {tab === 0 && (
        <ScrollView>
          {image ? (
            <View>
              <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" />
              <TouchableOpacity style={styles.changeBtn} onPress={() => { setImage(null); setResult(null) }}>
                <Text style={styles.changeBtnText}>Trocar imagem</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>💪</Text>
              <Text style={styles.placeholderTitle}>Foto corporal</Text>
              <Text style={styles.placeholderSub}>
                Use uma foto de corpo inteiro em boa iluminação
              </Text>
              <View style={styles.imageButtons}>
                <TouchableOpacity style={styles.imageBtn} onPress={() => selectImage(true)}>
                  <Text style={styles.imageBtnIcon}>📷</Text>
                  <Text style={styles.imageBtnText}>Câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.imageBtn} onPress={() => selectImage(false)}>
                  <Text style={styles.imageBtnIcon}>🖼️</Text>
                  <Text style={styles.imageBtnText}>Galeria</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {image && !result && (
            <TouchableOpacity
              style={[styles.analyzeBtn, analyzing && { opacity: 0.7 }]}
              onPress={analyze}
              disabled={analyzing}
            >
              {analyzing ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.analyzeBtnText}>Analisando...</Text>
                </View>
              ) : (
                <Text style={styles.analyzeBtnText}>🔬 Analisar composição corporal</Text>
              )}
            </TouchableOpacity>
          )}

          {result && (
            <View style={styles.resultContainer}>
              <View style={[styles.fatCard, { backgroundColor: fatColor(result.fatCategory) }]}>
                <Text style={styles.fatRange}>
                  {result.fatPercentageLow}% — {result.fatPercentageHigh}%
                </Text>
                <Text style={styles.fatLabel}>gordura corporal estimada</Text>
                <View style={styles.fatBadge}>
                  <Text style={styles.fatBadgeText}>{result.fatCategory}</Text>
                </View>
              </View>

              <View style={styles.detailsCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Definição muscular</Text>
                  <Text style={styles.detailValue}>{result.muscleDefinition}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tipo corporal</Text>
                  <Text style={styles.detailValue}>{result.bodyType}</Text>
                </View>
              </View>

              <View style={styles.recommendCard}>
                <Text style={styles.recommendTitle}>💡 Recomendação</Text>
                <Text style={styles.recommendText}>{result.recommendation}</Text>
              </View>

              <TouchableOpacity
                style={styles.generateWorkoutBtn}
                onPress={generateWorkout}
                disabled={generatingWorkout}
              >
                {generatingWorkout ? (
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.generateWorkoutBtnText}>Gerando treino...</Text>
                  </View>
                ) : (
                  <Text style={styles.generateWorkoutBtnText}>🏋️ Gerar plano de treino</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => { setImage(null); setResult(null) }}
              >
                <Text style={styles.retakeBtnText}>📷 Nova análise</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Tab 1 — Histórico */}
      {tab === 1 && (
        <View style={{ flex: 1 }}>
          {loadingHistory ? (
            <ActivityIndicator style={{ margin: 20 }} color="#4A6FE8" />
          ) : history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyIcon}>📷</Text>
              <Text style={styles.emptyTitle}>Nenhuma análise ainda</Text>
              <Text style={styles.emptySub}>Faça sua primeira análise corporal</Text>
              <TouchableOpacity style={styles.goToAnalysis} onPress={() => setTab(0)}>
                <Text style={styles.goToAnalysisText}>Fazer análise</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={history}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 12, gap: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.historyCard}
                  onPress={() => setSelectedHistory(item)}
                >
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    {item.photoURL ? (
                      <FastImage
                        style={styles.historyThumb}
                        source={{ uri: item.photoURL }}
                        resizeMode={FastImage.resizeMode.cover}
                      />
                    ) : (
                      <View style={[styles.historyThumb, { backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ fontSize: 24 }}>💪</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyDate}>
                        {item.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || 'Data desconhecida'}
                      </Text>
                      <Text style={styles.historyFat}>
                        {item.fatPercentageLow}% — {item.fatPercentageHigh}% gordura
                      </Text>
                      <View style={[styles.historyBadge, { backgroundColor: fatColor(item.fatCategory) + '22' }]}>
                        <Text style={[styles.historyBadgeText, { color: fatColor(item.fatCategory) }]}>
                          {item.fatCategory}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 20 }}>›</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Tab 2 — Treino */}
      {tab === 2 && (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          {!workoutPlan ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyIcon}>🏋️</Text>
              <Text style={styles.emptyTitle}>Nenhum treino gerado</Text>
              <Text style={styles.emptySub}>
                Faça uma análise corporal e gere seu treino personalizado
              </Text>
              <TouchableOpacity style={styles.goToAnalysis} onPress={() => setTab(0)}>
                <Text style={styles.goToAnalysisText}>Ir para análise</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.workoutHeader}>
                <Text style={styles.workoutTitle}>🏋️ Seu plano de treino</Text>
                <Text style={styles.workoutSub}>
                  Gerado em {workoutPlan.createdAt?.toDate?.()?.toLocaleDateString('pt-BR')}
                </Text>
              </View>

              {workoutPlan.objetivo && (
                <View style={styles.workoutObjective}>
                  <Text style={styles.workoutObjectiveTitle}>🎯 Objetivo</Text>
                  <Text style={styles.workoutObjectiveText}>{workoutPlan.objetivo}</Text>
                </View>
              )}

              {Object.entries(workoutPlan.weeklyPlan || {}).map(([day, workout]) => (
                <View key={day} style={styles.workoutDayCard}>
                  <View style={styles.workoutDayHeader}>
                    <Text style={styles.workoutDayName}>{DAYS_PT[day] || day}</Text>
                    <Text style={styles.workoutDayFocus}>{workout.focus}</Text>
                    <Text style={styles.workoutDayDuration}>{workout.duration}</Text>
                  </View>
                  {workout.exercises?.map((ex, i) => (
                    <View key={i} style={styles.exerciseRow}>
                      <Text style={styles.exerciseNum}>{i + 1}.</Text>
                      <Text style={styles.exerciseName}>{ex}</Text>
                    </View>
                  ))}
                  {workout.exercises?.length === 0 && (
                    <Text style={styles.restDay}>😴 Descanso</Text>
                  )}
                </View>
              ))}

              {workoutPlan.tips?.length > 0 && (
                <View style={styles.workoutTips}>
                  <Text style={styles.workoutTipsTitle}>💡 Dicas</Text>
                  {workoutPlan.tips.map((tip, i) => (
                    <Text key={i} style={styles.workoutTip}>• {tip}</Text>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.regenerateBtn}
                onPress={generateWorkout}
                disabled={generatingWorkout}
              >
                {generatingWorkout
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.regenerateBtnText}>🔄 Regenerar treino</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      {/* Modal histórico detalhado */}
      <Modal
        visible={!!selectedHistory}
        animationType="slide"
        onRequestClose={() => setSelectedHistory(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedHistory?.createdAt?.toDate?.()?.toLocaleDateString('pt-BR')}
            </Text>
            <TouchableOpacity onPress={() => setSelectedHistory(null)}>
              <Text style={{ color: '#FF3B30', fontSize: 15 }}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {selectedHistory?.photoURL && (
              <FastImage
                style={{ width: '100%', height: 300, borderRadius: 16 }}
                source={{ uri: selectedHistory.photoURL }}
                resizeMode={FastImage.resizeMode.cover}
              />
            )}
            <View style={[styles.fatCard, { backgroundColor: fatColor(selectedHistory?.fatCategory) }]}>
              <Text style={styles.fatRange}>
                {selectedHistory?.fatPercentageLow}% — {selectedHistory?.fatPercentageHigh}%
              </Text>
              <Text style={styles.fatLabel}>gordura corporal</Text>
              <View style={styles.fatBadge}>
                <Text style={styles.fatBadgeText}>{selectedHistory?.fatCategory}</Text>
              </View>
            </View>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Definição muscular</Text>
                <Text style={styles.detailValue}>{selectedHistory?.muscleDefinition}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Tipo corporal</Text>
                <Text style={styles.detailValue}>{selectedHistory?.bodyType}</Text>
              </View>
            </View>
            {selectedHistory?.recommendation && (
              <View style={styles.recommendCard}>
                <Text style={styles.recommendTitle}>💡 Recomendação</Text>
                <Text style={styles.recommendText}>{selectedHistory.recommendation}</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#AF52DE' },
  tabText: { fontSize: 13, color: '#999' },
  activeTabText: { color: '#AF52DE', fontWeight: '600' },
  disclaimerContainer: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', gap: 16 },
  disclaimerIcon: { fontSize: 48 },
  disclaimerTitle: { fontSize: 20, fontWeight: '800' },
  disclaimerText: { fontSize: 15, color: '#444', textAlign: 'center', lineHeight: 24 },
  acceptBtn: { backgroundColor: '#4A6FE8', borderRadius: 14, padding: 16, width: '100%', alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelText: { color: '#FF3B30', fontSize: 15 },
  preview: { width: '100%', height: 350 },
  changeBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center' },
  changeBtnText: { color: '#4A6FE8', fontWeight: '500' },
  placeholder: { backgroundColor: '#fff', margin: 16, borderRadius: 20, padding: 32, alignItems: 'center', gap: 8 },
  placeholderIcon: { fontSize: 52 },
  placeholderTitle: { fontSize: 18, fontWeight: '700' },
  placeholderSub: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 16 },
  imageButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  imageBtn: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 14, padding: 16, alignItems: 'center' },
  imageBtnIcon: { fontSize: 28, marginBottom: 6 },
  imageBtnText: { fontSize: 13, fontWeight: '600' },
  analyzeBtn: { margin: 16, backgroundColor: '#AF52DE', borderRadius: 16, padding: 18, alignItems: 'center' },
  analyzeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resultContainer: { padding: 12, gap: 8 },
  fatCard: { borderRadius: 20, padding: 28, alignItems: 'center', gap: 6 },
  fatRange: { fontSize: 42, fontWeight: '900', color: '#fff' },
  fatLabel: { fontSize: 14, color: '#fff', opacity: 0.9 },
  fatBadge: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  fatBadgeText: { color: '#fff', fontWeight: '700' },
  detailsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F2F2F7' },
  detailLabel: { fontSize: 14, color: '#666' },
  detailValue: { fontSize: 14, fontWeight: '700' },
  recommendCard: { backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16 },
  recommendTitle: { fontSize: 14, fontWeight: '700', color: '#4A6FE8', marginBottom: 6 },
  recommendText: { fontSize: 14, color: '#333', lineHeight: 22 },
  generateWorkoutBtn: { backgroundColor: '#FF9500', borderRadius: 16, padding: 16, alignItems: 'center' },
  generateWorkoutBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  retakeBtn: { backgroundColor: '#F2F2F7', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 32 },
  retakeBtnText: { color: '#333', fontWeight: '600', fontSize: 15 },
  emptyHistory: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, color: '#999', textAlign: 'center' },
  goToAnalysis: { backgroundColor: '#4A6FE8', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  goToAnalysisText: { color: '#fff', fontWeight: '700' },
  historyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14 },
  historyThumb: { width: 70, height: 70, borderRadius: 12 },
  historyDate: { fontSize: 13, color: '#999', marginBottom: 4 },
  historyFat: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  historyBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  historyBadgeText: { fontSize: 12, fontWeight: '600' },
  workoutHeader: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  workoutTitle: { fontSize: 17, fontWeight: '700' },
  workoutSub: { fontSize: 12, color: '#999', marginTop: 4 },
  workoutObjective: { backgroundColor: '#FFF3E0', borderRadius: 16, padding: 16 },
  workoutObjectiveTitle: { fontSize: 14, fontWeight: '700', color: '#FF6B00', marginBottom: 6 },
  workoutObjectiveText: { fontSize: 14, color: '#333', lineHeight: 22 },
  workoutDayCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  workoutDayHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  workoutDayName: { fontSize: 14, fontWeight: '800', width: 70 },
  workoutDayFocus: { flex: 1, fontSize: 13, color: '#AF52DE', fontWeight: '600' },
  workoutDayDuration: { fontSize: 11, color: '#999' },
  exerciseRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  exerciseNum: { fontSize: 13, color: '#999', width: 20 },
  exerciseName: { flex: 1, fontSize: 13, color: '#333' },
  restDay: { fontSize: 14, color: '#999', fontStyle: 'italic' },
  workoutTips: { backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16 },
  workoutTipsTitle: { fontSize: 14, fontWeight: '700', color: '#4A6FE8', marginBottom: 8 },
  workoutTip: { fontSize: 13, color: '#444', marginBottom: 4, lineHeight: 20 },
  regenerateBtn: { backgroundColor: '#4A6FE8', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 32 },
  regenerateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA'
  },
  modalTitle: { fontSize: 17, fontWeight: '700' }
})