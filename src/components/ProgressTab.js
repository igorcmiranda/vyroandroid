import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Linking, TextInput, Alert
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'

export default function ProgressTab() {
  const [steps, setSteps] = useState(0)
  const [calories, setCalories] = useState(0)
  const [distance, setDistance] = useState(0)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('idle')
  const [inputCalories, setInputCalories] = useState('')
  const [inputSteps, setInputSteps] = useState('')
  const [saved, setSaved] = useState(false)
  const uid = auth().currentUser?.uid
  const today = new Date().toISOString().split('T')[0]

  useFocusEffect(
    useCallback(() => {
      checkSdk()
    }, [])
  )

  async function checkSdk() {
    setLoading(true)
    try {
      const HC = require('react-native-health-connect')
      const sdkStatus = await HC.getSdkStatus()
      console.log('SDK status:', sdkStatus)

      if (sdkStatus === 1) {
        const initialized = await HC.initialize()
        if (initialized) {
          const permissions = await HC.requestPermission([
            { accessType: 'read', recordType: 'Steps' },
            { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
            { accessType: 'read', recordType: 'Distance' },
          ])
          if (permissions && permissions.length > 0) {
            setStatus('ready')
            await loadHealthData(HC)
          } else {
            setStatus('no_permission')
          }
        } else {
          setStatus('manual')
        }
      } else if (sdkStatus === 3) {
        setStatus('needs_update')
      } else {
        setStatus('unavailable')
      }
    } catch (error) {
      console.log('Health Connect error:', error)
      setStatus('manual')
    }
    setLoading(false)
  }

  async function loadHealthData(HC) {
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    const timeRangeFilter = {
      operator: 'between',
      startTime: todayDate.toISOString(),
      endTime: new Date().toISOString()
    }
    try {
      const s = await HC.readRecords('Steps', { timeRangeFilter })
      setSteps(s.records.reduce((sum, r) => sum + (r.count || 0), 0))
    } catch (e) { console.log('Steps:', e.message) }
    try {
      const c = await HC.readRecords('ActiveCaloriesBurned', { timeRangeFilter })
      setCalories(Math.floor(c.records.reduce((sum, r) => sum + (r.energy?.inKilocalories || 0), 0)))
    } catch (e) { console.log('Calories:', e.message) }
    try {
      const d = await HC.readRecords('Distance', { timeRangeFilter })
      setDistance(d.records.reduce((sum, r) => sum + (r.distance?.inKilometers || 0), 0).toFixed(2))
    } catch (e) { console.log('Distance:', e.message) }
  }

  async function loadManualData() {
    try {
      const doc = await firestore()
        .collection('users').doc(uid)
        .collection('dailyProgress').doc(today).get()
      if (doc.exists) {
        setCalories(doc.data().calories || 0)
        setSteps(doc.data().steps || 0)
        setSaved(true)
      }
    } catch (e) { console.log('Load manual:', e) }
  }

  async function saveManual() {
    const cal = parseInt(inputCalories) || 0
    const st = parseInt(inputSteps) || 0
    if (cal === 0 && st === 0) {
      Alert.alert('Atenção', 'Insira pelo menos um valor.')
      return
    }
    try {
      await firestore()
        .collection('users').doc(uid)
        .collection('dailyProgress').doc(today)
        .set({
          calories: cal, steps: st,
          date: today,
          updatedAt: firestore.Timestamp.now()
        })
      setCalories(cal)
      setSteps(st)
      setInputCalories('')
      setInputSteps('')
      setSaved(true)
      Alert.alert('✅ Salvo!', 'Progresso registrado com sucesso.')
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar.')
    }
  }

  function openHealthConnect() {
    Linking.openURL('market://details?id=com.google.android.apps.healthdata')
      .catch(() => Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata'))
  }

  function openSamsungHealth() {
    Linking.openURL('com.sec.android.app.shealth://')
      .catch(() => Linking.openURL('market://details?id=com.sec.android.app.shealth'))
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4A6FE8" size="large" />
        <Text style={styles.loadingText}>Verificando Health Connect...</Text>
      </View>
    )
  }

  if (status === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.grid}>
          <View style={[styles.card, { backgroundColor: '#EEF2FF' }]}>
            <Text style={styles.cardIcon}>👟</Text>
            <Text style={styles.cardValue}>{steps.toLocaleString()}</Text>
            <Text style={styles.cardLabel}>Passos hoje</Text>
          </View>
          <View style={[styles.card, { backgroundColor: '#FFF0E6' }]}>
            <Text style={styles.cardIcon}>🔥</Text>
            <Text style={styles.cardValue}>{calories}</Text>
            <Text style={styles.cardLabel}>Calorias</Text>
          </View>
          <View style={[styles.card, { backgroundColor: '#E8FFF0' }]}>
            <Text style={styles.cardIcon}>📍</Text>
            <Text style={styles.cardValue}>{distance} km</Text>
            <Text style={styles.cardLabel}>Distância</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.retryBtn} onPress={checkSdk}>
          <Text style={styles.retryText}>🔄 Atualizar dados</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (status === 'needs_update') {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>🔄</Text>
        <Text style={styles.title}>Atualização necessária</Text>
        <Text style={styles.text}>
          O Health Connect precisa ser atualizado para funcionar com o Vyro.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={openHealthConnect}>
          <Text style={styles.btnText}>📲 Atualizar Health Connect</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.retryBtn} onPress={checkSdk}>
          <Text style={styles.retryText}>🔄 Já atualizei, verificar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.samsungBtn} onPress={openSamsungHealth}>
          <Text style={styles.samsungBtnText}>📱 Abrir Samsung Health</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (status === 'no_permission') {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Permissão necessária</Text>
        <TouchableOpacity style={styles.btn} onPress={checkSdk}>
          <Text style={styles.btnText}>🔗 Conceder permissão</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // status === 'unavailable', 'manual' ou 'idle' — mostra entrada manual
  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        <View style={[styles.card, { backgroundColor: '#EEF2FF' }]}>
          <Text style={styles.cardIcon}>👟</Text>
          <Text style={styles.cardValue}>{steps.toLocaleString()}</Text>
          <Text style={styles.cardLabel}>Passos hoje</Text>
        </View>
        <View style={[styles.card, { backgroundColor: '#FFF0E6' }]}>
          <Text style={styles.cardIcon}>🔥</Text>
          <Text style={styles.cardValue}>{calories}</Text>
          <Text style={styles.cardLabel}>Calorias</Text>
        </View>
      </View>

      <View style={styles.inputCard}>
        <Text style={styles.inputTitle}>📝 Registrar atividade</Text>
        <Text style={styles.inputSub}>
          Consulte seu app de saúde e insira os valores abaixo.
        </Text>
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>🔥 Calorias</Text>
            <TextInput
              style={styles.input}
              value={inputCalories}
              onChangeText={setInputCalories}
              placeholder="Ex: 450"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>👟 Passos</Text>
            <TextInput
              style={styles.input}
              value={inputSteps}
              onChangeText={setInputSteps}
              placeholder="Ex: 8000"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={saveManual}>
          <Text style={styles.saveBtnText}>💾 Salvar progresso</Text>
        </TouchableOpacity>
        {saved && (
          <Text style={styles.savedText}>
            ✅ Progresso salvo — {new Date().toLocaleDateString('pt-BR')}
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.samsungBtn} onPress={openSamsungHealth}>
        <Text style={styles.samsungBtnText}>📱 Abrir Samsung Health</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.retryBtn} onPress={checkSdk}>
        <Text style={styles.retryText}>🔄 Tentar Health Connect</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 12
  },
  icon: { fontSize: 52 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  loadingText: { color: '#666', fontSize: 14 },
  btn: {
    backgroundColor: '#4A6FE8', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
    width: '100%', alignItems: 'center'
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  retryBtn: {
    backgroundColor: '#F2F2F7', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
    width: '100%', alignItems: 'center'
  },
  retryText: { color: '#4A6FE8', fontWeight: '600', fontSize: 14 },
  grid: { flexDirection: 'row', gap: 8 },
  card: {
    flex: 1, borderRadius: 16,
    padding: 16, alignItems: 'center', gap: 6
  },
  cardIcon: { fontSize: 32 },
  cardValue: { fontSize: 22, fontWeight: '800' },
  cardLabel: { fontSize: 12, color: '#666', textAlign: 'center' },
  inputCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10
  },
  inputTitle: { fontSize: 15, fontWeight: '700' },
  inputSub: { fontSize: 13, color: '#666', lineHeight: 20 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#666' },
  input: {
    backgroundColor: '#F2F2F7', borderRadius: 12,
    padding: 12, fontSize: 15, color: '#000'
  },
  saveBtn: {
    backgroundColor: '#4A6FE8', borderRadius: 12,
    padding: 14, alignItems: 'center'
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  savedText: { fontSize: 13, color: '#34C759', textAlign: 'center', fontWeight: '500' },
  samsungBtn: {
    backgroundColor: '#1428A0', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
    width: '100%', alignItems: 'center'
  },
  samsungBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 }
})