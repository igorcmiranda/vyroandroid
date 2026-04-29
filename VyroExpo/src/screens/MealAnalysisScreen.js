import { useLanguage } from '../context/LanguageContext'
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, ActivityIndicator, Alert, Platform, PermissionsAndroid
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import ClaudeManager from '../managers/ClaudeManager'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function MealAnalysisScreen({ navigation, route }) {
  const { t } = useLanguage()
  const { userProfile } = route.params || {}
  const [image, setImage] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const uid = auth().currentUser?.uid

  async function selectImage(fromCamera) {
    if (fromCamera && Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Permissão de câmera',
          message: 'O Vyro precisa acessar sua câmera para analisar refeições.',
          buttonPositive: 'Permitir',
          buttonNegative: 'Cancelar'
        }
      )
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permissão negada', 'Ative a câmera nas configurações do app.')
        return
      }
    }

    const options = {
      mediaType: 'photo',
      quality: 0.8,
      saveToPhotos: false
    }

    const launch = fromCamera ? launchCamera : launchImageLibrary

    launch(options, response => {
      if (response.didCancel) return
      if (response.errorCode) {
        Alert.alert('Erro', response.errorMessage || 'Erro ao abrir câmera')
        return
      }
      if (response.assets?.[0]) {
        setImage(response.assets[0])
        setResult(null)
      }
    })
  }

  async function analyze() {
    if (!image || !uid) return

    // Verifica limite de uso
    const usageDoc = await firestore().collection('usage').doc(uid).get()
    const usage = usageDoc.data() || {}
    const today = new Date().toISOString().split('T')[0]
    const lastReset = usage.lastMealReset?.toDate?.()?.toISOString().split('T')[0]
    const mealsToday = lastReset === today ? (usage.mealAnalysesToday || 0) : 0

    if (mealsToday >= 6) {
      Alert.alert('Limite atingido', 'Você atingiu o limite de 6 análises de refeição hoje. Volte amanhã!')
      return
    }

    setAnalyzing(true)
    try {
      const analysisResult = await ClaudeManager.analyzeMeal(image.uri, userProfile)
      setResult(analysisResult)

      // Incrementa uso
      await firestore().collection('usage').doc(uid).set({
        mealAnalysesToday: mealsToday + 1,
        lastMealReset: firestore.Timestamp.now(),
        dietPlansThisMonth: usage.dietPlansThisMonth || 0,
        bodyAnalysesThisMonth: usage.bodyAnalysesThisMonth || 0,
        lastMonthlyReset: usage.lastMonthlyReset || firestore.Timestamp.now()
      })
    } catch (e) {
      Alert.alert('Erro na análise', 'Não foi possível analisar a imagem. Tente novamente.')
    }
    setAnalyzing(false)
  }

  async function saveMeal() {
  if (!result || !uid) return
  setSaving(true)
  try {
    await firestore()
      .collection('users')
      .doc(uid)
      .collection('meals')
      .add({
        description: result.description || '',
        calories: result.calories || 0,
        protein: result.protein || 0,
        carbs: result.carbs || 0,
        fat: result.fat || 0,
        fiber: result.fiber || 0,
        mealType: result.mealType || 'Refeição',
        quality: result.quality || 'Boa',
        date: firestore.Timestamp.now(),
        createdAt: firestore.Timestamp.now()
      })

    Alert.alert('✅ Salvo!', 'Refeição registrada com sucesso.', [
      { text: 'OK', onPress: () => navigation.goBack() }
    ])
  } catch (error) {
    console.log('Erro ao salvar refeição:', error)
    Alert.alert('Erro', `Não foi possível salvar: ${error.message}`)
  }
  setSaving(false)
}

  const qualityColor = (q) => {
    if (q === 'Ótima' || q === 'Boa') return '#34C759'
    if (q === 'Regular') return '#FF9500'
    return '#FF3B30'
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Analisar refeição</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView>
        {/* Área da imagem */}
        {image ? (
          <View>
            <Image source={{ uri: image.uri }} style={styles.preview} />
            <TouchableOpacity
              style={styles.changeBtn}
              onPress={() => { setImage(null); setResult(null) }}
            >
              <Text style={styles.changeBtnText}>Trocar imagem</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.cameraIcon}>📸</Text>
            <Text style={styles.placeholderTitle}>Fotografe sua refeição</Text>
            <Text style={styles.placeholderSub}>A IA identificará os alimentos e calculará as macros</Text>

            <View style={styles.steps}>
              {[
                { num: '1', text: 'Aponte a câmera' },
                { num: '2', text: 'IA analisa' },
                { num: '3', text: 'Veja as macros' }
              ].map(s => (
                <View key={s.num} style={styles.step}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{s.num}</Text>
                  </View>
                  <Text style={styles.stepText}>{s.text}</Text>
                </View>
              ))}
            </View>

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

        {/* Botão analisar */}
        {image && !result && (
          <TouchableOpacity
            style={[styles.analyzeBtn, analyzing && styles.analyzeBtnDisabled]}
            onPress={analyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <View style={styles.analyzingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.analyzeBtnText}>Claude está analisando...</Text>
              </View>
            ) : (
              <Text style={styles.analyzeBtnText}>🧬 Analisar refeição</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Resultado */}
        {result && (
          <View style={styles.resultContainer}>

            {/* Descrição */}
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>🍽️ {result.description}</Text>
              <View style={[styles.qualityBadge, { backgroundColor: qualityColor(result.quality) + '22' }]}>
                <Text style={[styles.qualityText, { color: qualityColor(result.quality) }]}>
                  Qualidade: {result.quality}
                </Text>
              </View>
            </View>

            {/* Calorias destaque */}
            <View style={styles.caloriesCard}>
              <Text style={styles.caloriesValue}>{result.calories}</Text>
              <Text style={styles.caloriesLabel}>kcal</Text>
            </View>

            {/* Macros */}
            <View style={styles.macrosCard}>
              {[
                { label: 'Proteína', value: result.protein, unit: 'g', color: '#4A6FE8' },
                { label: 'Carbs', value: result.carbs, unit: 'g', color: '#FF9500' },
                { label: 'Gordura', value: result.fat, unit: 'g', color: '#FF3B30' },
                { label: 'Fibras', value: result.fiber, unit: 'g', color: '#34C759' }
              ].map(m => (
                <View key={m.label} style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: m.color }]}>{m.value}{m.unit}</Text>
                  <Text style={styles.macroLabel}>{m.label}</Text>
                </View>
              ))}
            </View>

            {/* Tipo de refeição */}
            <View style={styles.mealTypeCard}>
              <Text style={styles.mealTypeLabel}>Tipo de refeição</Text>
              <Text style={styles.mealTypeValue}>{result.mealType}</Text>
            </View>

            {/* Dica */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 Dica personalizada</Text>
              <Text style={styles.tipsText}>{result.tips}</Text>
            </View>

            {/* Botões */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={saveMeal}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>💾 Salvar refeição</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => { setImage(null); setResult(null) }}
              >
                <Text style={styles.retakeBtnText}>📷 Nova análise</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
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
  back: { fontSize: 22, color: '#4A6FE8' },
  title: { fontSize: 18, fontWeight: '700' },
  preview: { width: '100%', height: 280, resizeMode: 'cover' },
  changeBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center' },
  changeBtnText: { color: '#4A6FE8', fontWeight: '500' },
  imagePlaceholder: {
    backgroundColor: '#fff', margin: 16,
    borderRadius: 20, padding: 32, alignItems: 'center'
  },
  cameraIcon: { fontSize: 56, marginBottom: 12 },
  placeholderTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  placeholderSub: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 24 },
  steps: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  step: { alignItems: 'center', flex: 1 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#4A6FE8', justifyContent: 'center', alignItems: 'center', marginBottom: 6
  },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  stepText: { fontSize: 11, color: '#666', textAlign: 'center' },
  imageButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  imageBtn: {
    flex: 1, backgroundColor: '#F2F2F7', borderRadius: 14,
    padding: 16, alignItems: 'center'
  },
  imageBtnIcon: { fontSize: 28, marginBottom: 6 },
  imageBtnText: { fontSize: 13, fontWeight: '600' },
  analyzeBtn: {
    margin: 16, backgroundColor: '#4A6FE8',
    borderRadius: 16, padding: 18, alignItems: 'center'
  },
  analyzeBtnDisabled: { opacity: 0.7 },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  analyzeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resultContainer: { padding: 12 },
  resultCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 8
  },
  resultTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  qualityBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  qualityText: { fontSize: 13, fontWeight: '600' },
  caloriesCard: {
    backgroundColor: '#FF9500', borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 8
  },
  caloriesValue: { fontSize: 56, fontWeight: '900', color: '#fff' },
  caloriesLabel: { fontSize: 16, color: '#fff', opacity: 0.9 },
  macrosCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', marginBottom: 8
  },
  macroItem: { flex: 1, alignItems: 'center' },
  macroValue: { fontSize: 20, fontWeight: '800' },
  macroLabel: { fontSize: 11, color: '#999', marginTop: 2 },
  mealTypeCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8
  },
  mealTypeLabel: { fontSize: 14, color: '#666' },
  mealTypeValue: { fontSize: 14, fontWeight: '700' },
  tipsCard: { backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginBottom: 8 },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: '#4A6FE8', marginBottom: 6 },
  tipsText: { fontSize: 14, color: '#333', lineHeight: 22 },
  actionButtons: { gap: 8, marginBottom: 32 },
  saveBtn: { backgroundColor: '#34C759', borderRadius: 16, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  retakeBtn: { backgroundColor: '#F2F2F7', borderRadius: 16, padding: 16, alignItems: 'center' },
  retakeBtnText: { color: '#333', fontWeight: '600', fontSize: 15 }
})
