import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Alert, ScrollView
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'


const INCREMENTS = [
  { label: '100ml', value: 100 },
  { label: '250ml', value: 250 },
  { label: '500ml', value: 500 },
  { label: '1L', value: 1000 }
]

export default function WaterScreen({ route }) {
  const { weight = 70, age = 30 } = route?.params || {}
  const [consumed, setConsumed] = useState(0)
  const [celebrated, setCelebrated] = useState(false)
  const progressAnim = new Animated.Value(0)

  const dailyGoal = Math.min(Math.max(weight * 35 * (age > 55 ? 0.9 : age < 18 ? 1.1 : 1), 1500), 4000)
  const progress = Math.min(consumed / dailyGoal, 1)
  const todayKey = `water_${new Date().toISOString().split('T')[0]}`

  useEffect(() => {
    AsyncStorage.getItem(todayKey).then(val => {
      if (val) setConsumed(Number(val))
    })
  }, [])

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false
    }).start()

    if (progress >= 1 && !celebrated) {
      setCelebrated(true)
      Alert.alert('🎉 Meta atingida!', `Você bebeu ${Math.floor(consumed)}ml hoje. Excelente hidratação!`)
    }
  }, [consumed])

  async function add(ml) {
    const newVal = Math.min(consumed + ml, dailyGoal * 1.5)
    setConsumed(newVal)
    await AsyncStorage.setItem(todayKey, String(newVal))
  }

  async function remove() {
    const newVal = Math.max(consumed - 250, 0)
    setConsumed(newVal)
    await AsyncStorage.setItem(todayKey, String(newVal))
  }

  async function reset() {
    setConsumed(0)
    setCelebrated(false)
    await AsyncStorage.setItem(todayKey, '0')
  }

  const statusMessage = () => {
    if (progress === 0) return 'Vamos começar! Beba água regularmente.'
    if (progress < 0.25) return 'Bom começo! Continue se hidratando.'
    if (progress < 0.5) return 'Indo bem! Você está no caminho certo.'
    if (progress < 0.75) return 'Ótimo progresso! Mais um pouco.'
    if (progress < 1) return 'Quase lá! Falta pouco para a meta.'
    return '🎉 Meta atingida! Excelente hidratação!'
  }

  const barColor = progressAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#4A6FE8', '#4A6FE8', '#34C759']
  })

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Hidratação</Text>
        <TouchableOpacity onPress={reset}>
          <Text style={styles.reset}>Resetar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Meta card */}
        <View style={styles.goalCard}>
          <View>
            <Text style={styles.goalLabel}>Meta diária</Text>
            <Text style={styles.goalValue}>{Math.floor(dailyGoal)}ml</Text>
            <Text style={styles.goalSub}>Baseada no seu perfil</Text>
          </View>
          <Text style={styles.goalIcon}>💧</Text>
        </View>

        {/* Progresso visual */}
        <View style={styles.progressCard}>
          <View style={styles.percentContainer}>
            <Text style={styles.percentValue}>{Math.floor(progress * 100)}%</Text>
            <Text style={styles.consumedText}>{Math.floor(consumed)}ml de {Math.floor(dailyGoal)}ml</Text>
          </View>

          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[styles.progressBar, {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%']
                }),
                backgroundColor: barColor
              }]}
            />
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>0ml</Text>
            <Text style={styles.progressLabel}>Faltam {Math.max(Math.floor(dailyGoal - consumed), 0)}ml</Text>
            <Text style={styles.progressLabel}>{Math.floor(dailyGoal)}ml</Text>
          </View>
        </View>

        {/* Botões de incremento */}
        <View style={styles.incrementCard}>
          <Text style={styles.incrementTitle}>Adicionar água</Text>
          <View style={styles.incrementGrid}>
            {INCREMENTS.map(item => (
              <TouchableOpacity
                key={item.label}
                style={styles.incrementBtn}
                onPress={() => add(item.value)}
              >
                <Text style={styles.incrementIcon}>💧</Text>
                <Text style={styles.incrementLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.removeBtn, consumed === 0 && styles.removeBtnDisabled]}
            onPress={remove}
            disabled={consumed === 0}
          >
            <Text style={styles.removeBtnText}>− Remover 250ml</Text>
          </TouchableOpacity>
        </View>

        {/* Status */}
        <View style={[styles.statusCard, progress >= 1 && styles.statusCardSuccess]}>
          <Text style={styles.statusIcon}>{progress >= 1 ? '✅' : '💙'}</Text>
          <Text style={styles.statusText}>{statusMessage()}</Text>
        </View>

        {/* Dicas */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Dicas de hidratação</Text>
          {[
            { icon: '🌅', tip: 'Beba 500ml logo ao acordar' },
            { icon: '🍽️', tip: 'Beba antes e depois das refeições' },
            { icon: '🏃', tip: 'Aumente 500ml nos dias de treino' },
            { icon: '🌙', tip: 'Evite beber muito antes de dormir' }
          ].map((item, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipIcon}>{item.icon}</Text>
              <Text style={styles.tipText}>{item.tip}</Text>
            </View>
          ))}
        </View>
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
  title: { fontSize: 18, fontWeight: '700' },
  reset: { color: '#FF3B30', fontSize: 14 },
  content: { flex: 1, padding: 12 },
  goalCard: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 16, padding: 16, marginBottom: 8
  },
  goalLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  goalValue: { fontSize: 24, fontWeight: '800', color: '#4A6FE8' },
  goalSub: { fontSize: 11, color: '#999', marginTop: 2 },
  goalIcon: { fontSize: 40 },
  progressCard: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 16, marginBottom: 8, alignItems: 'center'
  },
  percentContainer: { alignItems: 'center', marginBottom: 16 },
  percentValue: { fontSize: 48, fontWeight: '900', color: '#4A6FE8' },
  consumedText: { fontSize: 14, color: '#666' },
  progressBarContainer: {
    width: '100%', height: 16, backgroundColor: '#F2F2F7',
    borderRadius: 8, overflow: 'hidden', marginBottom: 8
  },
  progressBar: { height: '100%', borderRadius: 8 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  progressLabel: { fontSize: 11, color: '#999' },
  incrementCard: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 16, marginBottom: 8
  },
  incrementTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  incrementGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  incrementBtn: {
    flex: 1, backgroundColor: '#EEF2FF', borderRadius: 12,
    padding: 12, alignItems: 'center'
  },
  incrementIcon: { fontSize: 20, marginBottom: 4 },
  incrementLabel: { fontSize: 12, fontWeight: '600', color: '#4A6FE8' },
  removeBtn: {
    backgroundColor: '#FFF0F0', borderRadius: 12,
    padding: 12, alignItems: 'center'
  },
  removeBtnDisabled: { opacity: 0.4 },
  removeBtnText: { color: '#FF3B30', fontWeight: '600' },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EEF2FF', borderRadius: 14,
    padding: 14, marginBottom: 8
  },
  statusCardSuccess: { backgroundColor: '#E8FFF0' },
  statusIcon: { fontSize: 20 },
  statusText: { flex: 1, fontSize: 14, color: '#333' },
  tipsCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16
  },
  tipsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  tipIcon: { fontSize: 16, width: 24 },
  tipText: { fontSize: 13, color: '#666', flex: 1 }
})
