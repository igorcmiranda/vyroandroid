import { useLanguage } from '../context/LanguageContext'
import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import ClaudeManager from '../managers/ClaudeManager'
import { SafeAreaView } from 'react-native-safe-area-context'


const DAYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']
const DAY_LABELS = {
  segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta',
  quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo'
}

const MEAL_FIELDS = [
  { key: 'cafeDaManha', label: '☀️ Café da manhã', placeholder: 'Ex: pão integral, ovos, café com leite' },
  { key: 'lancheManha', label: '🍎 Lanche da manhã', placeholder: 'Ex: fruta, iogurte' },
  { key: 'almoco', label: '🍽️ Almoço', placeholder: 'Ex: arroz, feijão, frango, salada' },
  { key: 'cafeDaTarde', label: '☕ Café da tarde', placeholder: 'Ex: café, biscoito' },
  { key: 'lancheTarde', label: '🥪 Lanche da tarde', placeholder: 'Ex: sanduíche, fruta' },
  { key: 'janta', label: '🌙 Janta', placeholder: 'Ex: sopa, legumes, proteína' },
  { key: 'ceia', label: '🌛 Ceia', placeholder: 'Ex: iogurte, whey protein' },
]

export default function DietPlanScreen({ navigation, route }) {
  const { t } = useLanguage()
  const { userProfile } = route?.params || {}
  const [tab, setTab] = useState(0)
  const [liked, setLiked] = useState('')
  const [disliked, setDisliked] = useState('')
  const [restrictions, setRestrictions] = useState('')
  const [plan, setPlan] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [selectedDay, setSelectedDay] = useState('segunda')
  const [mealSchedule, setMealSchedule] = useState({
    cafeDaManha: '', lancheManha: '', almoco: '',
    cafeDaTarde: '', lancheTarde: '', janta: '', ceia: '',
    horarioTreino: '', tipoTreino: ''
  })
  const [savingMealSchedule, setSavingMealSchedule] = useState(false)
  const uid = auth().currentUser?.uid

  useEffect(() => {
    loadSavedPlan()
    loadPreferences()
    loadMealSchedule()
  }, [])

  async function loadSavedPlan() {
    try {
      const saved = await AsyncStorage.getItem(`diet_plan_${uid}`)
      if (saved) setPlan(JSON.parse(saved))
    } catch {}
  }

  async function loadPreferences() {
    try {
      const prefs = await AsyncStorage.getItem(`diet_prefs_${uid}`)
      if (prefs) {
        const p = JSON.parse(prefs)
        setLiked(p.liked || '')
        setDisliked(p.disliked || '')
        setRestrictions(p.restrictions || '')
      }
    } catch {}
  }

  async function loadMealSchedule() {
    try {
      const saved = await AsyncStorage.getItem(`meal_schedule_${uid}`)
      if (saved) setMealSchedule(JSON.parse(saved))
    } catch {}
  }

  async function saveMealSchedule() {
    setSavingMealSchedule(true)
    try {
      await AsyncStorage.setItem(`meal_schedule_${uid}`, JSON.stringify(mealSchedule))
      Alert.alert('✅ Salvo!', 'Suas refeições foram salvas.')
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar.')
    }
    setSavingMealSchedule(false)
  }

  async function generate() {
    if (!uid) return

    const usageDoc = await firestore().collection('usage').doc(uid).get()
    const usage = usageDoc.data() || {}
    const now = new Date()
    const lastReset = usage.lastMonthlyReset?.toDate?.()
    const sameMonth = lastReset &&
      lastReset.getMonth() === now.getMonth() &&
      lastReset.getFullYear() === now.getFullYear()
    const dietPlans = sameMonth ? (usage.dietPlansThisMonth || 0) : 0

    if (dietPlans >= 1) {
      Alert.alert('Limite atingido', 'Você já gerou seu plano de dieta este mês.')
      return
    }

    await AsyncStorage.setItem(`diet_prefs_${uid}`, JSON.stringify({ liked, disliked, restrictions }))
    setGenerating(true)

    try {
      const result = await ClaudeManager.generateDietPlan(
        userProfile || {},
        { liked, disliked, restrictions },
        mealSchedule
      )
      setPlan(result)
      await AsyncStorage.setItem(`diet_plan_${uid}`, JSON.stringify(result))

      await firestore().collection('usage').doc(uid).set({
        ...usage,
        dietPlansThisMonth: dietPlans + 1,
        lastMonthlyReset: firestore.Timestamp.now()
      })

      setTab(3)
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível gerar o plano. Tente novamente.')
    }
    setGenerating(false)
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
        {['📊 Dieta', '🍽️ Refeições', '⚙️ Preferências', '🤖 Plano IA'].map((t, i) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === i && styles.activeTab]}
            onPress={() => setTab(i)}
          >
            <Text style={[styles.tabText, tab === i && styles.activeTabText]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab 0 — Progresso do dia */}
      {tab === 0 && (
        <ScrollView style={styles.content}>
          {plan ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Meta calórica diária</Text>
              <Text style={styles.calorieValue}>{plan.dailyCalories} kcal</Text>
              <View style={styles.macrosRow}>
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: '#4A6FE8' }]}>{plan.macros?.protein}g</Text>
                  <Text style={styles.macroLabel}>Proteína</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: '#FF9500' }]}>{plan.macros?.carbs}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: '#FF3B30' }]}>{plan.macros?.fat}g</Text>
                  <Text style={styles.macroLabel}>Gordura</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyPlan}>
              <Text style={styles.emptyIcon}>🥗</Text>
              <Text style={styles.emptyTitle}>Nenhum plano gerado</Text>
              <Text style={styles.emptySub}>Vá em Preferências para gerar seu plano</Text>
              <TouchableOpacity style={styles.goToPrefs} onPress={() => setTab(2)}>
                <Text style={styles.goToPrefsText}>Configurar preferências</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={styles.analyzeBtn}
            onPress={() => navigation.navigate('MealAnalysis', { userProfile })}
          >
            <Text style={styles.analyzeBtnText}>📸 Analisar refeição</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Tab 1 — Minhas Refeições */}
      {tab === 1 && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'android' ? 100 : 0}
        >
          <ScrollView
            style={styles.content}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🍽️ O que você costuma comer</Text>
              <Text style={styles.sectionSub}>
                Informe suas refeições habituais para que a IA monte uma dieta personalizada.
              </Text>

              {MEAL_FIELDS.map(meal => (
                <View key={meal.key} style={styles.mealInputGroup}>
                  <Text style={styles.mealInputLabel}>{meal.label}</Text>
                  <TextInput
                    style={styles.mealInput}
                    value={mealSchedule[meal.key]}
                    onChangeText={val => setMealSchedule(prev => ({ ...prev, [meal.key]: val }))}
                    placeholder={meal.placeholder}
                    placeholderTextColor="#999"
                    multiline
                  />
                </View>
              ))}

              <View style={styles.mealInputGroup}>
                <Text style={styles.mealInputLabel}>⏰ Horário do treino</Text>
                <TextInput
                  style={styles.mealInput}
                  value={mealSchedule.horarioTreino}
                  onChangeText={val => setMealSchedule(prev => ({ ...prev, horarioTreino: val }))}
                  placeholder="Ex: 18:00, manhã, não treino"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.mealInputGroup}>
                <Text style={styles.mealInputLabel}>💪 Tipo de treino</Text>
                <TextInput
                  style={styles.mealInput}
                  value={mealSchedule.tipoTreino}
                  onChangeText={val => setMealSchedule(prev => ({ ...prev, tipoTreino: val }))}
                  placeholder="Ex: musculação, corrida, crossfit"
                  placeholderTextColor="#999"
                />
              </View>

              <TouchableOpacity
                style={styles.saveScheduleBtn}
                onPress={saveMealSchedule}
                disabled={savingMealSchedule}
              >
                {savingMealSchedule
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveScheduleBtnText}>💾 Salvar refeições</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Tab 2 — Preferências */}
      {tab === 2 && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🥗 Preferências alimentares</Text>

              <Text style={styles.label}>Alimentos que gosta</Text>
              <TextInput
                style={styles.input}
                value={liked}
                onChangeText={setLiked}
                placeholder="Ex: frango, arroz, frutas, ovos..."
                placeholderTextColor="#999"
                multiline
              />

              <Text style={styles.label}>Alimentos que não gosta</Text>
              <TextInput
                style={styles.input}
                value={disliked}
                onChangeText={setDisliked}
                placeholder="Ex: fígado, brócolis, peixe..."
                placeholderTextColor="#999"
                multiline
              />

              <Text style={styles.label}>Restrições alimentares</Text>
              <TextInput
                style={styles.input}
                value={restrictions}
                onChangeText={setRestrictions}
                placeholder="Ex: sem glúten, vegetariano..."
                placeholderTextColor="#999"
                multiline
              />

              <TouchableOpacity
                style={[styles.generateBtn, generating && { opacity: 0.6 }]}
                onPress={generate}
                disabled={generating}
              >
                {generating ? (
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.generateBtnText}>Gerando plano...</Text>
                  </View>
                ) : (
                  <Text style={styles.generateBtnText}>
                    🧬 {plan ? 'Regenerar plano' : 'Gerar plano alimentar'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Tab 3 — Plano IA */}
      {tab === 3 && (
        <ScrollView style={styles.content}>
          {plan ? (
            <View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Meta calórica diária</Text>
                <Text style={styles.summaryCalories}>{plan.dailyCalories} kcal</Text>
                <View style={styles.macrosRow}>
                  <View style={styles.macroItem}>
                    <Text style={[styles.macroValue, { color: '#4A6FE8' }]}>{plan.macros?.protein}g</Text>
                    <Text style={styles.macroLabel}>Proteína</Text>
                  </View>
                  <View style={styles.macroItem}>
                    <Text style={[styles.macroValue, { color: '#FF9500' }]}>{plan.macros?.carbs}g</Text>
                    <Text style={styles.macroLabel}>Carbs</Text>
                  </View>
                  <View style={styles.macroItem}>
                    <Text style={[styles.macroValue, { color: '#FF3B30' }]}>{plan.macros?.fat}g</Text>
                    <Text style={styles.macroLabel}>Gordura</Text>
                  </View>
                </View>
              </View>

              {plan.preTreino && (
                <View style={[styles.tipsCard, { backgroundColor: '#E8FFF0', margin: 12 }]}>
                  <Text style={[styles.tipsTitle, { color: '#34C759' }]}>⚡ Pré-treino</Text>
                  <Text style={styles.tipItem}>{plan.preTreino}</Text>
                </View>
              )}

              {plan.posTreino && (
                <View style={[styles.tipsCard, { backgroundColor: '#EEF2FF', margin: 12 }]}>
                  <Text style={[styles.tipsTitle, { color: '#4A6FE8' }]}>🔄 Pós-treino</Text>
                  <Text style={styles.tipItem}>{plan.posTreino}</Text>
                </View>
              )}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daySelector}>
                {DAYS.map(day => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayBtn, selectedDay === day && styles.dayBtnActive]}
                    onPress={() => setSelectedDay(day)}
                  >
                    <Text style={[styles.dayBtnText, selectedDay === day && styles.dayBtnTextActive]}>
                      {DAY_LABELS[day]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {plan.weeklyPlan?.[selectedDay]?.map((meal, i) => (
                <View key={i} style={styles.mealCard}>
                  <Text style={styles.mealText}>• {meal}</Text>
                </View>
              ))}

              {plan.meals?.map((meal, i) => (
                <View key={i} style={styles.mealDetailCard}>
                  <View style={styles.mealDetailHeader}>
                    <Text style={styles.mealDetailName}>{meal.name}</Text>
                    <Text style={styles.mealDetailTime}>{meal.time}</Text>
                    <Text style={styles.mealDetailCal}>{meal.calories} kcal</Text>
                  </View>
                  {meal.foods.map((food, j) => (
                    <Text key={j} style={styles.mealDetailFood}>• {food}</Text>
                  ))}
                  {meal.notes && (
                    <Text style={styles.mealDetailNote}>💡 {meal.notes}</Text>
                  )}
                </View>
              ))}

              {plan.tips?.length > 0 && (
                <View style={styles.tipsCard}>
                  <Text style={styles.tipsTitle}>💡 Dicas nutricionais</Text>
                  {plan.tips.map((tip, i) => (
                    <Text key={i} style={styles.tipItem}>• {tip}</Text>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.generateBtn, { margin: 12, marginBottom: 32 }]}
                onPress={generate}
                disabled={generating}
              >
                {generating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.generateBtnText}>🔄 Regenerar plano</Text>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyPlan}>
              <Text style={styles.emptyIcon}>🥗</Text>
              <Text style={styles.emptyTitle}>Nenhum plano gerado</Text>
              <Text style={styles.emptySub}>Configure suas preferências para gerar seu plano</Text>
              <TouchableOpacity style={styles.goToPrefs} onPress={() => setTab(2)}>
                <Text style={styles.goToPrefsText}>Configurar preferências</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  tabsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
    flexGrow: 0
  },
  tab: { paddingHorizontal: 16, paddingVertical: 12 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#34C759' },
  tabText: { fontSize: 13, color: '#999', whiteSpace: 'nowrap' },
  activeTabText: { color: '#34C759', fontWeight: '600' },
  content: { flex: 1 },
  section: { backgroundColor: '#fff', margin: 12, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  sectionSub: { fontSize: 13, color: '#666', lineHeight: 20, marginBottom: 16 },
  calorieValue: { fontSize: 42, fontWeight: '900', color: '#34C759', textAlign: 'center', marginVertical: 12 },
  macrosRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  macroItem: { alignItems: 'center' },
  macroValue: { fontSize: 20, fontWeight: '800' },
  macroLabel: { fontSize: 11, color: '#999', marginTop: 2 },
  label: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 0.5, borderColor: '#E5E5EA', borderRadius: 12,
    padding: 12, fontSize: 14, minHeight: 80,
    textAlignVertical: 'top', marginBottom: 4,
    backgroundColor: '#F9F9F9', color: '#000'
  },
  generateBtn: {
    backgroundColor: '#34C759', borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 16
  },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  mealInputGroup: { marginBottom: 12 },
  mealInputLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 },
  mealInput: {
    backgroundColor: '#F9F9F9', borderRadius: 12,
    borderWidth: 0.5, borderColor: '#E5E5EA',
    padding: 12, fontSize: 14, minHeight: 60,
    textAlignVertical: 'top', color: '#000'
  },
  saveScheduleBtn: {
    backgroundColor: '#34C759', borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 16
  },
  saveScheduleBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  summaryCard: {
    backgroundColor: '#fff', margin: 12,
    borderRadius: 16, padding: 20, alignItems: 'center'
  },
  summaryTitle: { fontSize: 14, color: '#666', marginBottom: 4 },
  summaryCalories: { fontSize: 42, fontWeight: '900', color: '#34C759', marginBottom: 12 },
  daySelector: { paddingHorizontal: 12, marginBottom: 4 },
  dayBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#E5E5EA', marginRight: 8
  },
  dayBtnActive: { backgroundColor: '#34C759' },
  dayBtnText: { fontSize: 13, fontWeight: '600', color: '#666' },
  dayBtnTextActive: { color: '#fff' },
  mealCard: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 4, borderRadius: 12, padding: 12 },
  mealText: { fontSize: 14, color: '#333' },
  mealDetailCard: { backgroundColor: '#fff', margin: 12, marginBottom: 4, borderRadius: 16, padding: 16 },
  mealDetailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  mealDetailName: { fontSize: 15, fontWeight: '700', flex: 1 },
  mealDetailTime: { fontSize: 12, color: '#999', marginRight: 8 },
  mealDetailCal: { fontSize: 12, color: '#FF9500', fontWeight: '600' },
  mealDetailFood: { fontSize: 13, color: '#444', marginBottom: 3 },
  mealDetailNote: { fontSize: 12, color: '#4A6FE8', marginTop: 6, fontStyle: 'italic' },
  tipsCard: { backgroundColor: '#EEF2FF', margin: 12, borderRadius: 16, padding: 16, marginBottom: 8 },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: '#4A6FE8', marginBottom: 8 },
  tipItem: { fontSize: 13, color: '#444', marginBottom: 4, lineHeight: 20 },
  emptyPlan: { alignItems: 'center', padding: 48 },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#999', textAlign: 'center', marginBottom: 20 },
  goToPrefs: { backgroundColor: '#34C759', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  goToPrefsText: { color: '#fff', fontWeight: '700' },
  analyzeBtn: { margin: 12, backgroundColor: '#4A6FE8', borderRadius: 14, padding: 16, alignItems: 'center' },
  analyzeBtnText: { color: '#fff', fontWeight: '700' }
})