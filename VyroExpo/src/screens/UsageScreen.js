import { useLanguage } from '../context/LanguageContext'
import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Switch, Alert
} from 'react-native'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'

const LIMITS = {
  meals: 6,
  diet: 1,
  body: 2
}

export default function UsageScreen({ navigation }) {
  const { t } = useLanguage()
  const [usage, setUsage] = useState({ mealAnalysesToday: 0, dietPlansThisMonth: 0, bodyAnalysesThisMonth: 0 })
  const [plan, setPlan] = useState('none')
  const uid = auth().currentUser?.uid

  useEffect(() => {
  if (!uid) return

  const unsubUsage = firestore().collection('usage').doc(uid)
    .onSnapshot(doc => {
      if (doc && doc.exists) {
        setUsage(doc.data() || {})
      } else {
        setUsage({})
      }
    }, error => {
      console.log('Usage error:', error)
      setUsage({})
    })

  const unsubPlan = firestore().collection('subscriptions').doc(uid)
    .onSnapshot(doc => {
      if (doc && doc.exists) {
        setPlan(doc.data()?.plan || 'none')
      } else {
        setPlan('none')
      }
    }, error => {
      console.log('Plan error:', error)
      setPlan('none')
    })

  return () => {
    unsubUsage()
    unsubPlan()
  }
}, [uid])

  const planName = { none: 'Sem plano', starter: 'Starter', standard: 'Standard', premium: 'Premium' }
  const planColor = { none: '#999', starter: '#4A6FE8', standard: '#34C759', premium: '#AF52DE' }

  const usageItems = [
    {
      icon: '🍽️',
      title: 'Análises de refeição',
      subtitle: 'Limite diário — reseta à meia-noite',
      used: usage.mealAnalysesToday || 0,
      total: LIMITS.meals,
      color: '#34C759'
    },
    {
      icon: '🧬',
      title: 'Geração de dieta por IA',
      subtitle: 'Limite mensal — reseta todo mês',
      used: usage.dietPlansThisMonth || 0,
      total: LIMITS.diet,
      color: '#FF9500'
    },
    {
      icon: '💪',
      title: 'Análises corporais',
      subtitle: 'Limite mensal — reseta todo mês',
      used: usage.bodyAnalysesThisMonth || 0,
      total: LIMITS.body,
      color: '#AF52DE'
    }
  ]

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meu uso</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView>
        {/* Plano atual */}
        <View style={styles.planCard}>
          <Text style={styles.planLabel}>Plano atual</Text>
          <View style={[styles.planBadge, { backgroundColor: planColor[plan] + '22' }]}>
            <Text style={[styles.planName, { color: planColor[plan] }]}>
              {planName[plan]}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => navigation.navigate('Subscription')}
          >
            <Text style={styles.upgradeText}>
              ⬆️ Deseja fazer um upgrade no plano? Toque aqui!
            </Text>
          </TouchableOpacity>
        </View>

        {/* Cards de uso */}
        {usageItems.map((item, i) => {
          const remaining = Math.max(item.total - item.used, 0)
          const progress = item.used / item.total
          return (
            <View key={i} style={styles.usageCard}>
              <View style={styles.usageHeader}>
                <View style={[styles.usageIconBg, { backgroundColor: item.color + '22' }]}>
                  <Text style={styles.usageIcon}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.usageTitle}>{item.title}</Text>
                  <Text style={styles.usageSub}>{item.subtitle}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.usageRemaining, remaining === 0 && styles.usageEmpty]}>
                    {remaining}
                  </Text>
                  <Text style={styles.usageOf}>de {item.total}</Text>
                </View>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, {
                  width: `${Math.min(progress, 1) * 100}%`,
                  backgroundColor: remaining === 0 ? '#FF3B30' : item.color
                }]} />
              </View>
            </View>
          )
        })}

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ Sobre os limites</Text>
          <Text style={styles.infoText}>
            Os limites existem para garantir uma experiência de qualidade para todos os usuários.
            Cada análise consome créditos de IA pagos pela plataforma.
          </Text>
        </View>

        {/* Cancelar assinatura */}
        {plan !== 'none' && (
  <TouchableOpacity
    style={styles.cancelBtn}
    onPress={() => {
      Alert.alert(
        'Cancelar assinatura',
        'Tem certeza que deseja cancelar seu plano? Você perderá acesso às funcionalidades premium.',
        [
          { text: 'Não, manter plano', style: 'cancel' },
          {
            text: 'Sim, cancelar',
            style: 'destructive',
            onPress: async () => {
              try {
                await firestore().collection('subscriptions').doc(uid).update({
                  plan: 'none',
                  cancelledAt: firestore.Timestamp.now()
                })
                setPlan('none')
                Alert.alert('Assinatura cancelada', 'Seu plano foi cancelado com sucesso.')
              } catch (error) {
                Alert.alert('Erro', 'Não foi possível cancelar. Tente novamente.')
              }
            }
          }
        ]
      )
    }}
  >
    <Text style={styles.cancelText}>
      Quer desistir da vida saudável? Cancele sua assinatura aqui.
    </Text>
  </TouchableOpacity>
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
  planCard: {
    backgroundColor: '#fff', margin: 12,
    borderRadius: 16, padding: 16, alignItems: 'center', gap: 8
  },
  planLabel: { fontSize: 13, color: '#666' },
  planBadge: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  planName: { fontSize: 16, fontWeight: '700' },
  upgradeBtn: {
    backgroundColor: '#EEF2FF', borderRadius: 12,
    padding: 12, width: '100%', alignItems: 'center'
  },
  upgradeText: { color: '#4A6FE8', fontSize: 13, fontWeight: '500', textAlign: 'center' },
  usageCard: {
    backgroundColor: '#fff', marginHorizontal: 12,
    marginBottom: 8, borderRadius: 16, padding: 16
  },
  usageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  usageIconBg: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  usageIcon: { fontSize: 20 },
  usageTitle: { fontSize: 14, fontWeight: '600' },
  usageSub: { fontSize: 12, color: '#999', marginTop: 2 },
  usageRemaining: { fontSize: 24, fontWeight: '800', color: '#34C759' },
  usageEmpty: { color: '#FF3B30' },
  usageOf: { fontSize: 11, color: '#999' },
  progressBg: { height: 8, backgroundColor: '#F2F2F7', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  infoCard: {
    backgroundColor: '#EEF2FF', margin: 12,
    borderRadius: 14, padding: 14
  },
  infoTitle: { fontSize: 14, fontWeight: '600', color: '#4A6FE8', marginBottom: 6 },
  infoText: { fontSize: 13, color: '#555', lineHeight: 20 },
  cancelBtn: { margin: 12, padding: 16, alignItems: 'center' },
  cancelText: { fontSize: 12, color: '#999', textDecoration: 'underline', textAlign: 'center' }
})
