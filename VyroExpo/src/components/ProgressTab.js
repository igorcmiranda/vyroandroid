import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Linking, TextInput, Alert,
  Animated, Platform
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { NativeModules } from 'react-native'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'

// Módulo nativo Kotlin que criamos
const { VyroHealth } = NativeModules

// Estados possíveis do Health Connect
const STATUS = {
  LOADING: 'loading',
  AVAILABLE: 'available',          // dados lidos com sucesso
  NEEDS_PERMISSION: 'needs_permission', // instalado mas sem permissão
  NEEDS_INSTALL: 'needs_install',  // não instalado
  NEEDS_UPDATE: 'needs_update',    // versão antiga
  MANUAL: 'manual',                // fallback entrada manual
  ERROR: 'error',
}

export default function ProgressTab() {
  const [status, setStatus] = useState(STATUS.LOADING)
  const [steps, setSteps] = useState(0)
  const [calories, setCalories] = useState(0)
  const [distance, setDistance] = useState(0)
  const [lastSync, setLastSync] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [installedApps, setInstalledApps] = useState({})

  // Entrada manual (fallback)
  const [inputCalories, setInputCalories] = useState('')
  const [inputSteps, setInputSteps] = useState('')
  const [saved, setSaved] = useState(false)

  const uid = auth().currentUser?.uid
  const today = new Date().toISOString().split('T')[0]

  // Animações dos cards
  const stepsAnim = useRef(new Animated.Value(0)).current
  const calAnim = useRef(new Animated.Value(0)).current
  const distAnim = useRef(new Animated.Value(0)).current

  // Foca na aba → sincroniza
  useFocusEffect(
    useCallback(() => {
      initialize()
    }, [])
  )

  async function initialize() {
    // Se não temos o módulo nativo (ex: iOS ou build antigo), vai direto pro manual
    if (!VyroHealth) {
      console.log('VyroHealth não disponível — usando entrada manual')
      await loadManualData()
      setStatus(STATUS.MANUAL)
      return
    }

    setStatus(STATUS.LOADING)

    try {
      // 1. Verifica apps instalados (para mensagens de ajuda específicas)
      try {
        const apps = await VyroHealth.checkInstalledHealthApps()
        setInstalledApps(apps)
        console.log('Apps de saúde instalados:', apps)
      } catch (e) {
        console.log('checkInstalledHealthApps error:', e)
      }

      // 2. Verifica se Health Connect está disponível
      const availability = await VyroHealth.checkAvailability()
      console.log('Health Connect availability:', availability)

      if (availability === 'not_installed') {
        setStatus(STATUS.NEEDS_INSTALL)
        await loadManualData()
        return
      }

      if (availability === 'needs_update') {
        setStatus(STATUS.NEEDS_UPDATE)
        await loadManualData()
        return
      }

      if (availability !== 'available') {
        setStatus(STATUS.MANUAL)
        await loadManualData()
        return
      }

      // 3. Verifica permissões
      const hasPermissions = await VyroHealth.checkPermissions()
      console.log('Has permissions:', hasPermissions)

      if (!hasPermissions) {
        setStatus(STATUS.NEEDS_PERMISSION)
        await loadManualData()
        return
      }

      // 4. Lê os dados
      await syncData()

    } catch (e) {
      console.log('initialize error:', e)
      setStatus(STATUS.MANUAL)
      await loadManualData()
    }
  }

  async function requestPermissions() {
    if (!VyroHealth) return
    setSyncing(true)
    try {
      const result = await VyroHealth.requestPermissions()
      console.log('requestPermissions result:', result)
      
      if (result === true) {
        await syncData()
      } else if (result === 'SETTINGS_OPENED') {
        // Usuário foi para as configurações - espera um momento e verifica permissões
        Alert.alert(
          'Configure as permissões',
          'Após conceder as permissões no Health Connect, volte ao app.',
          [
            { 
              text: 'Verificar novamente', 
              onPress: async () => {
                const hasPermissions = await VyroHealth.checkPermissions()
                if (hasPermissions) {
                  await syncData()
                } else {
                  setStatus(STATUS.MANUAL)
                }
              }
            },
            { text: 'Usar entrada manual', style: 'cancel', onPress: () => setStatus(STATUS.MANUAL) }
          ]
        )
      } else {
        Alert.alert(
          'Permissão necessária',
          'Para sincronizar automaticamente, conceda acesso ao Health Connect.\n\nVocê pode fazer isso em Configurações > Privacidade > Health Connect > Vyro',
          [
            { text: 'Abrir configurações', onPress: () => VyroHealth.openHealthConnect() },
            { text: 'Usar entrada manual', style: 'cancel', onPress: () => setStatus(STATUS.MANUAL) }
          ]
        )
      }
    } catch (e) {
      console.log('requestPermissions error:', e)
      // Health Connect não instalado - guia usuário para instalar
      Alert.alert(
        'Health Connect não encontrado',
        'O app Health Connect (Google Play Services) precisa estar instalado para solicitar permissões.\n\nInstale pela Play Store e tente novamente.',
        [
          { text: 'Abrir Play Store', onPress: () => VyroHealth.openHealthConnect() },
          { text: 'Usar entrada manual', style: 'cancel', onPress: () => setStatus(STATUS.MANUAL) }
        ]
      )
      setStatus(STATUS.MANUAL)
    }
    setSyncing(false)
  }

  async function syncData() {
    setSyncing(true)
    try {
      const data = await VyroHealth.getTodayData()
      console.log('Health data:', data)

      if (data.success) {
        const newSteps = Math.round(data.steps || 0)
        const newCals = Math.round(data.calories || 0)
        const newDist = parseFloat((data.distance || 0).toFixed(2))

        setSteps(newSteps)
        setCalories(newCals)
        setDistance(newDist)
        setLastSync(new Date())

        // Anima os valores
        animateCards()

        // Salva no Firestore para pontuação nos desafios
        if (uid) {
          await saveToFirestore(newSteps, newCals, newDist)
        }

        setStatus(STATUS.AVAILABLE)
      } else {
        setStatus(STATUS.NEEDS_PERMISSION)
      }
    } catch (e) {
      console.log('syncData error:', e)
      if (e.code === 'NO_PERMISSION') {
        setStatus(STATUS.NEEDS_PERMISSION)
      } else {
        setStatus(STATUS.ERROR)
      }
    }
    setSyncing(false)
  }

  function animateCards() {
    stepsAnim.setValue(0)
    calAnim.setValue(0)
    distAnim.setValue(0)
    Animated.stagger(100, [
      Animated.spring(stepsAnim, { toValue: 1, useNativeDriver: true }),
      Animated.spring(calAnim, { toValue: 1, useNativeDriver: true }),
      Animated.spring(distAnim, { toValue: 1, useNativeDriver: true }),
    ]).start()
  }

  async function saveToFirestore(steps, calories, dist) {
    try {
      await firestore()
        .collection('users').doc(uid)
        .collection('dailyProgress').doc(today)
        .set({
          steps,
          calories,
          distance: dist,
          date: today,
          source: 'health_connect',
          updatedAt: firestore.Timestamp.now(),
        }, { merge: true })
    } catch (e) {
      console.log('saveToFirestore error:', e)
    }
  }

  // ─── Entrada manual ────────────────────────────────────────

  async function loadManualData() {
    try {
      const doc = await firestore()
        .collection('users').doc(uid)
        .collection('dailyProgress').doc(today).get()
      if (doc.exists) {
        const data = doc.data()
        setCalories(data.calories || 0)
        setSteps(data.steps || 0)
        setDistance(data.distance || 0)
        setSaved(true)
      }
    } catch (e) {
      console.log('loadManualData error:', e)
    }
  }

  async function saveManual() {
    const cal = parseInt(inputCalories) || 0
    const st = parseInt(inputSteps) || 0
    if (cal === 0 && st === 0) {
      Alert.alert('Atenção', 'Insira pelo menos calorias ou passos.')
      return
    }
    try {
      await firestore()
        .collection('users').doc(uid)
        .collection('dailyProgress').doc(today)
        .set({
          calories: cal,
          steps: st,
          distance: 0,
          date: today,
          source: 'manual',
          updatedAt: firestore.Timestamp.now(),
        }, { merge: true })
      setCalories(cal)
      setSteps(st)
      setInputCalories('')
      setInputSteps('')
      setSaved(true)
      Alert.alert('✅ Salvo!', 'Progresso registrado com sucesso.')
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar.')
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  function formatTime(date) {
    if (!date) return ''
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function openHealthConnect() {
    if (VyroHealth) {
      VyroHealth.openHealthConnect().catch(() => {
        Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata')
      })
    } else {
      Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata')
    }
  }

  function openSamsungHealth() {
    Linking.openURL('com.sec.android.app.shealth://')
      .catch(() => Linking.openURL('market://details?id=com.sec.android.app.shealth'))
  }

  // ─── Mensagem de ajuda específica por app instalado ────────

  function getSyncHelpText() {
    if (installedApps.samsung) {
      return 'Abra o Samsung Health → Configurações → Conectar a outros apps → Health Connect → Ativar sincronização'
    }
    if (installedApps.garmin) {
      return 'Abra o Garmin Connect → Perfil → Apps conectados → Health Connect → Ativar'
    }
    if (installedApps.fitbit) {
      return 'Abra o Fitbit → Conta → Configurações do app → Health Connect → Ativar'
    }
    return 'Abra seu app de saúde → Configurações → Conectar ao Health Connect'
  }

  // ─── Render das métricas ────────────────────────────────────

  function MetricCard({ anim, icon, value, label, color, unit = '' }) {
    return (
      <Animated.View
        style={[
          styles.metricCard,
          { backgroundColor: color + '18' },
          {
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }]
          }
        ]}
      >
        <Text style={styles.metricIcon}>{icon}</Text>
        <Text style={[styles.metricValue, { color }]}>
          {typeof value === 'number' && value > 0
            ? value.toLocaleString('pt-BR')
            : '—'}
          {unit && value > 0 ? <Text style={styles.metricUnit}>{unit}</Text> : null}
        </Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </Animated.View>
    )
  }

  // ─── Loading ────────────────────────────────────────────────

  if (status === STATUS.LOADING) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4A6FE8" size="large" />
        <Text style={styles.loadingText}>Conectando ao Health Connect...</Text>
      </View>
    )
  }

  // ─── Dados disponíveis ─────────────────────────────────────

  if (status === STATUS.AVAILABLE) {
    return (
      <View style={styles.container}>
        {/* Cards de métricas */}
        <View style={styles.metricsRow}>
          <MetricCard anim={stepsAnim} icon="👟" value={steps} label="Passos" color="#4A6FE8" />
          <MetricCard anim={calAnim} icon="🔥" value={calories} label="Calorias" color="#FF6B35" />
          <MetricCard anim={distAnim} icon="📍" value={distance} label="km" color="#34C759" unit=" km" />
        </View>

        {/* Fonte e última atualização */}
        <View style={styles.syncInfo}>
          <View style={styles.syncDot} />
          <Text style={styles.syncText}>
            Health Connect
            {lastSync && ` • atualizado às ${formatTime(lastSync)}`}
          </Text>
        </View>

        {/* Botão de atualizar */}
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={syncData}
          disabled={syncing}
        >
          {syncing
            ? <ActivityIndicator size="small" color="#4A6FE8" />
            : <Text style={styles.refreshText}>🔄 Atualizar agora</Text>
          }
        </TouchableOpacity>

        {/* Apps detectados */}
        {(installedApps.samsung || installedApps.garmin || installedApps.fitbit) && (
          <View style={styles.appsRow}>
            <Text style={styles.appsLabel}>Sincronizando com:</Text>
            {installedApps.samsung && <AppBadge label="Samsung Health" icon="💙" />}
            {installedApps.garmin && <AppBadge label="Garmin" icon="⌚" />}
            {installedApps.fitbit && <AppBadge label="Fitbit" icon="💚" />}
            {installedApps.googleFit && <AppBadge label="Google Fit" icon="🏃" />}
          </View>
        )}
      </View>
    )
  }

  // ─── Precisa de permissão ──────────────────────────────────

  if (status === STATUS.NEEDS_PERMISSION) {
    return (
      <View style={styles.center}>
        <Text style={styles.stateIcon}>🔒</Text>
        <Text style={styles.stateTitle}>Permissão necessária</Text>
        <Text style={styles.stateText}>
          Permita que o Vyro leia seus dados de saúde para preencher o progresso automaticamente.
        </Text>

        {(installedApps.samsung || installedApps.garmin) && (
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>📱 Dica para seu dispositivo</Text>
            <Text style={styles.hintText}>{getSyncHelpText()}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={requestPermissions}
          disabled={syncing}
        >
          {syncing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>🔗 Conceder permissão</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
          setStatus(STATUS.MANUAL)
          loadManualData()
        }}>
          <Text style={styles.secondaryBtnText}>✏️ Inserir manualmente</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ─── Precisa instalar Health Connect ──────────────────────

  if (status === STATUS.NEEDS_INSTALL) {
    return (
      <View style={styles.center}>
        <Text style={styles.stateIcon}>📲</Text>
        <Text style={styles.stateTitle}>Health Connect necessário</Text>
        <Text style={styles.stateText}>
          O Health Connect é o app do Android que conecta todos os apps de saúde.
          {installedApps.samsung && '\n\nVocê tem o Samsung Health! Instale o Health Connect para sincronizar.'}
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={openHealthConnect}>
          <Text style={styles.primaryBtnText}>📲 Instalar Health Connect</Text>
        </TouchableOpacity>

        {installedApps.samsung && (
          <TouchableOpacity style={styles.samsungBtn} onPress={openSamsungHealth}>
            <Text style={styles.samsungBtnText}>💙 Abrir Samsung Health</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
          setStatus(STATUS.MANUAL)
          loadManualData()
        }}>
          <Text style={styles.secondaryBtnText}>✏️ Inserir manualmente</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ─── Precisa atualizar Health Connect ─────────────────────

  if (status === STATUS.NEEDS_UPDATE) {
    return (
      <View style={styles.center}>
        <Text style={styles.stateIcon}>🔄</Text>
        <Text style={styles.stateTitle}>Atualização necessária</Text>
        <Text style={styles.stateText}>
          Atualize o Health Connect para continuar sincronizando.
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={openHealthConnect}>
          <Text style={styles.primaryBtnText}>📲 Atualizar Health Connect</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={initialize}
        >
          <Text style={styles.secondaryBtnText}>🔄 Já atualizei, verificar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
          setStatus(STATUS.MANUAL)
          loadManualData()
        }}>
          <Text style={styles.secondaryBtnText}>✏️ Inserir manualmente</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ─── Entrada manual (fallback) ─────────────────────────────

  // STATUS.MANUAL ou STATUS.ERROR
  return (
    <View style={styles.container}>
      {/* Se já tem dados salvos hoje, mostra os cards */}
      {(steps > 0 || calories > 0) && (
        <>
          <View style={styles.metricsRow}>
            <MetricCard anim={new Animated.Value(1)} icon="👟" value={steps} label="Passos" color="#4A6FE8" />
            <MetricCard anim={new Animated.Value(1)} icon="🔥" value={calories} label="Calorias" color="#FF6B35" />
          </View>
          <View style={[styles.syncInfo, { marginBottom: 8 }]}>
            <Text style={styles.syncText}>
              ✏️ Inserido manualmente • {new Date().toLocaleDateString('pt-BR')}
            </Text>
          </View>
        </>
      )}

      {/* Formulário de entrada manual */}
      <View style={styles.manualCard}>
        <Text style={styles.manualTitle}>📝 Registrar progresso</Text>

        {/* Botão para tentar Health Connect novamente */}
        {VyroHealth && (
          <TouchableOpacity
            style={styles.tryHealthConnectBtn}
            onPress={initialize}
          >
            <Text style={styles.tryHealthConnectText}>
              ⚡ Tentar sincronizar automaticamente
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.manualSub}>
          Consulte seu app de saúde e insira os valores abaixo.
        </Text>

        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>🔥 Calorias gastas</Text>
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
            ✅ Salvo em {new Date().toLocaleDateString('pt-BR')}
          </Text>
        )}
      </View>

      {installedApps.samsung && (
        <TouchableOpacity style={styles.samsungBtn} onPress={openSamsungHealth}>
          <Text style={styles.samsungBtnText}>💙 Abrir Samsung Health</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// Badge de app sincronizado
function AppBadge({ label, icon }) {
  return (
    <View style={styles.appBadge}>
      <Text style={styles.appBadgeIcon}>{icon}</Text>
      <Text style={styles.appBadgeLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 10 },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 14,
  },

  // Estado vazio / loading
  stateIcon: { fontSize: 52 },
  stateTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  stateText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  loadingText: { color: '#666', fontSize: 14, marginTop: 8 },

  // Hint específico por app
  hintCard: {
    backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14,
    width: '100%', gap: 6,
  },
  hintTitle: { fontSize: 13, fontWeight: '700', color: '#4A6FE8' },
  hintText: { fontSize: 13, color: '#444', lineHeight: 20 },

  // Botões
  primaryBtn: {
    backgroundColor: '#4A6FE8', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
    width: '100%', alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    backgroundColor: '#F2F2F7', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
    width: '100%', alignItems: 'center',
  },
  secondaryBtnText: { color: '#4A6FE8', fontWeight: '600', fontSize: 14 },
  samsungBtn: {
    backgroundColor: '#1428A0', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
    width: '100%', alignItems: 'center',
  },
  samsungBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  refreshBtn: {
    backgroundColor: '#F2F2F7', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  refreshText: { color: '#4A6FE8', fontWeight: '600', fontSize: 14 },

  // Cards de métricas
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1, borderRadius: 16, padding: 14,
    alignItems: 'center', gap: 4,
  },
  metricIcon: { fontSize: 28 },
  metricValue: { fontSize: 22, fontWeight: '800' },
  metricUnit: { fontSize: 14, fontWeight: '500' },
  metricLabel: { fontSize: 12, color: '#666', textAlign: 'center' },

  // Sync info
  syncInfo: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, paddingHorizontal: 4,
  },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  syncText: { fontSize: 12, color: '#666' },

  // Apps row
  appsRow: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 12, gap: 8,
  },
  appsLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  appBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F2F2F7', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  appBadgeIcon: { fontSize: 14 },
  appBadgeLabel: { fontSize: 12, fontWeight: '500', color: '#333' },

  // Card manual
  manualCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12,
  },
  manualTitle: { fontSize: 15, fontWeight: '700' },
  manualSub: { fontSize: 13, color: '#666', lineHeight: 20 },
  tryHealthConnectBtn: {
    backgroundColor: '#EEF2FF', borderRadius: 12,
    padding: 12, alignItems: 'center',
  },
  tryHealthConnectText: { color: '#4A6FE8', fontSize: 13, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#666' },
  input: {
    backgroundColor: '#F2F2F7', borderRadius: 12,
    padding: 12, fontSize: 15, color: '#000',
  },
  saveBtn: {
    backgroundColor: '#4A6FE8', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  savedText: { fontSize: 13, color: '#34C759', textAlign: 'center', fontWeight: '500' },
})
