import { useLanguage } from '../context/LanguageContext'
import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, ActivityIndicator
} from 'react-native'
import { WebView } from 'react-native-webview'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaView } from 'react-native-safe-area-context'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'R$ 19,97/mês',
    color: '#4A6FE8',
    url: 'https://buy.stripe.com/test_aFa3cvg6R3hL0zs9JN7ok02',
    features: [
      { text: 'Análise de refeição por foto', included: true },
      { text: 'Dieta personalizada por IA', included: false },
      { text: 'Análise corporal por IA', included: false },
      { text: 'Plano de treino personalizado', included: false },
    ]
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 'R$ 29,97/mês',
    color: '#34C759',
    url: 'https://buy.stripe.com/test_6oU6oH8Ep05z0zs8FJ7ok01',
    features: [
      { text: 'Análise de refeição por foto', included: true },
      { text: 'Dieta personalizada por IA', included: true },
      { text: 'Análise corporal por IA', included: false },
      { text: 'Plano de treino personalizado', included: false },
    ]
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'R$ 49,97/mês',
    color: '#AF52DE',
    url: 'https://buy.stripe.com/test_28E9AT4o905z1Dw9JN7ok00',
    features: [
      { text: 'Análise de refeição por foto', included: true },
      { text: 'Dieta personalizada por IA', included: true },
      { text: 'Análise corporal por IA', included: true },
      { text: 'Plano de treino personalizado', included: true },
    ]
  }
]

export default function SubscriptionScreen({ navigation }) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState('standard')
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const plan = PLANS.find(p => p.id === selected)

  async function handleSuccess(sessionID) {
    setShowCheckout(false)
    setCheckoutSuccess(true)
    const uid = auth().currentUser?.uid
    if (!uid) return

    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + 1)

    await firestore().collection('subscriptions').doc(uid).set({
      plan: selected,
      stripeSessionID: sessionID || 'manual',
      startDate: firestore.Timestamp.now(),
      endDate: firestore.Timestamp.fromDate(endDate),
      updatedAt: firestore.Timestamp.now()
    })

    setTimeout(() => navigation.goBack(), 2000)
  }

  function detectSuccess(url) {
    const indicators = ['success', 'confirmation', 'thank', 'complete', 'payment_intent=']
    return indicators.some(i => url.toLowerCase().includes(i))
  }

  if (checkoutSuccess) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.successContainer}>
        <Text style={styles.successIcon}>🎉</Text>
        <Text style={styles.successTitle}>Assinatura ativada!</Text>
        <Text style={styles.successSub}>Bem-vindo ao plano {plan.name}!</Text>
      </View>
      </SafeAreaView>

    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Escolha seu plano</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView>
        <Text style={styles.subtitle}>Desbloqueie todo o potencial do Vyro</Text>

        {PLANS.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.planCard, selected === p.id && { borderColor: p.color, borderWidth: 2 }]}
            onPress={() => setSelected(p.id)}
          >
            <View style={styles.planHeader}>
              <View style={[styles.planBadge, { backgroundColor: p.color }]}>
                <Text style={styles.planName}>{p.name}</Text>
              </View>
              <Text style={styles.planPrice}>{p.price}</Text>
            </View>

            {p.features.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Text style={[styles.featureIcon, { color: f.included ? '#34C759' : '#ccc' }]}>
                  {f.included ? '✓' : '✗'}
                </Text>
                <Text style={[styles.featureText, !f.included && styles.featureDisabled]}>
                  {f.text}
                </Text>
              </View>
            ))}

            {selected === p.id && (
              <View style={[styles.selectedBadge, { backgroundColor: p.color }]}>
                <Text style={styles.selectedText}>Selecionado</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.subscribeBtn, { backgroundColor: plan.color }]}
          onPress={() => setShowCheckout(true)}
        >
          <Text style={styles.subscribeBtnText}>
            Assinar {plan.name} — {plan.price}
          </Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Cancele a qualquer momento. Renovação automática mensal.
        </Text>
      </ScrollView>

      {/* Checkout WebView */}
      <Modal visible={showCheckout} animationType="slide">
        <View style={styles.webviewContainer}>
          <View style={styles.webviewHeader}>
            <TouchableOpacity onPress={() => setShowCheckout(false)}>
              <Text style={styles.webviewClose}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.webviewTitle}>Pagamento seguro</Text>
            <View style={{ width: 60 }} />
          </View>
          <WebView
            source={{ uri: plan.url }}
            onNavigationStateChange={(state) => {
              if (detectSuccess(state.url)) {
                const sessionID = new URL(state.url).searchParams?.get('session_id')
                handleSuccess(sessionID)
              }
            }}
          />
        </View>
      </Modal>
    </View>
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
  close: { fontSize: 18, color: '#666' },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', margin: 16 },
  planCard: {
    backgroundColor: '#fff', margin: 8, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#E5E5EA'
  },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  planBadge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  planName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  planPrice: { fontSize: 15, fontWeight: '700' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  featureIcon: { fontSize: 15, fontWeight: '700', width: 20 },
  featureText: { fontSize: 14, color: '#333' },
  featureDisabled: { color: '#ccc' },
  selectedBadge: { borderRadius: 20, padding: 6, alignItems: 'center', marginTop: 8 },
  selectedText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  subscribeBtn: { margin: 16, borderRadius: 16, padding: 18, alignItems: 'center' },
  subscribeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disclaimer: { textAlign: 'center', color: '#999', fontSize: 12, marginBottom: 32, paddingHorizontal: 32 },
  webviewContainer: { flex: 1 },
  webviewHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16, paddingTop: 56,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA'
  },
  webviewClose: { color: '#FF3B30', fontSize: 15 },
  webviewTitle: { fontSize: 16, fontWeight: '700' },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successIcon: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  successSub: { fontSize: 16, color: '#666' }
})
