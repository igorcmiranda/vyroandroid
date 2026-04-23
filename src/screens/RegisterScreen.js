import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform
} from 'react-native'
import firestore from '@react-native-firebase/firestore'
import AuthManager from '../managers/AuthManager'
import { SafeAreaView } from 'react-native-safe-area-context'


export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [loading, setLoading] = useState(false)

  const [usernameStatus, setUsernameStatus] = useState('idle')
  const [emailStatus, setEmailStatus] = useState('idle')
  const [referralStatus, setReferralStatus] = useState('idle')

  const usernameTimer = useRef(null)
  const emailTimer = useRef(null)

  const canRegister =
    name && email && password && confirmPassword &&
    usernameStatus === 'available' &&
    emailStatus === 'available' &&
    !loading

  function handleUsernameChange(value) {
    const filtered = value.toLowerCase()
      .replace(/[^a-z0-9_.&]/g, '')
      .slice(0, 12)
    setUsername(filtered)

    clearTimeout(usernameTimer.current)
    if (!filtered) { setUsernameStatus('idle'); return }

    const valid = /^[a-z0-9_.&]{1,12}$/.test(filtered)
    if (!valid) { setUsernameStatus('invalid'); return }

    setUsernameStatus('checking')
    usernameTimer.current = setTimeout(async () => {
      const available = await AuthManager.checkUsernameAvailable(filtered)
      setUsernameStatus(available ? 'available' : 'taken')
    }, 600)
  }

  function handleEmailChange(value) {
    setEmail(value)
    clearTimeout(emailTimer.current)
    if (!value.includes('@')) { setEmailStatus('idle'); return }

    setEmailStatus('checking')
    emailTimer.current = setTimeout(async () => {
      try {
        const available = await AuthManager.checkEmailAvailable(value)
        setEmailStatus(available ? 'available' : 'taken')
      } catch { setEmailStatus('idle') }
    }, 600)
  }

  async function handleReferralChange(value) {
    setReferralCode(value)
    if (!value) { setReferralStatus('idle'); return }
    setReferralStatus('checking')
    const doc = await firestore().collection('referralCodes')
      .doc(value.toLowerCase()).get()
    setReferralStatus(doc.exists ? 'valid' : 'invalid')
  }

  async function handleRegister() {
    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas não coincidem')
      return
    }
    setLoading(true)
    try {
      await AuthManager.register({
        name, email, password, username,
        referralCode: referralStatus === 'valid' ? referralCode : null
      })
    } catch (e) {
      Alert.alert('Erro no cadastro', e.message)
    }
    setLoading(false)
  }

  const statusColor = (s) =>
    s === 'available' || s === 'valid' ? '#34C759' :
    s === 'taken' || s === 'invalid' ? '#FF3B30' : '#8B9CC8'

  const statusIcon = (s) =>
    s === 'available' || s === 'valid' ? '✓' :
    s === 'taken' || s === 'invalid' ? '✗' :
    s === 'checking' ? '...' : ''

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t.register.title}</Text>
        <Text style={styles.subtitle}>{t.register.subtitle}</Text>

        {/* Nome */}
        <Text style={styles.label}>Nome completo</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t.register.namePlaceholder}
          placeholderTextColor="#555"
        />

        {/* Username */}
        <Text style={styles.label}>Nome de usuário (@)</Text>
        <View style={styles.inputRow}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={[styles.input, styles.inputFlex,
              usernameStatus === 'available' && styles.inputValid,
              (usernameStatus === 'taken' || usernameStatus === 'invalid') && styles.inputError
            ]}
            value={username}
            onChangeText={handleUsernameChange}
            placeholder={t.register.usernamePlaceholder}
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.statusIcon, { color: statusColor(usernameStatus) }]}>
            {statusIcon(usernameStatus)}
          </Text>
        </View>
        {usernameStatus !== 'idle' && (
          <Text style={[styles.statusText, { color: statusColor(usernameStatus) }]}>
            {usernameStatus === 'available' ? '@ disponível!' :
             usernameStatus === 'taken' ? '@ já está em uso' :
             usernameStatus === 'invalid' ? 'Apenas letras minúsculas, números, _, & e .' :
             'Verificando...'}
          </Text>
        )}
        <Text style={styles.hint}>{t.register.hint}</Text>

        {/* Email */}
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputFlex,
              emailStatus === 'available' && styles.inputValid,
              emailStatus === 'taken' && styles.inputError
            ]}
            value={email}
            onChangeText={handleEmailChange}
            placeholder={t.register.emailPlaceholder}
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={[styles.statusIcon, { color: statusColor(emailStatus) }]}>
            {statusIcon(emailStatus)}
          </Text>
        </View>
        {emailStatus === 'taken' && (
          <Text style={[styles.statusText, { color: '#FF3B30' }]}>
            Conta já existente, não é possível usar esse email novamente.
          </Text>
        )}

        {/* Senha */}
        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={t.register.passwordPlaceholder}
          placeholderTextColor="#555"
          secureTextEntry
        />

        {/* Confirmar senha */}
        <Text style={styles.label}>Confirmar senha</Text>
        <TextInput
          style={[styles.input,
            confirmPassword && password !== confirmPassword && styles.inputError
          ]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t.register.confirmPlaceholder}
          placeholderTextColor="#555"
          secureTextEntry
        />
        {confirmPassword && password !== confirmPassword && (
          <Text style={[styles.statusText, { color: '#FF3B30' }]}>
            As senhas não coincidem
          </Text>
        )}

        {/* Indicação */}
        <Text style={styles.label}>Código de indicação (opcional)</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputFlex,
              referralStatus === 'valid' && styles.inputValid,
              referralStatus === 'invalid' && styles.inputError
            ]}
            value={referralCode}
            onChangeText={handleReferralChange}
            placeholder={t.register.referralPlaceholder}
            placeholderTextColor="#555"
            autoCapitalize="none"
          />
          <Text style={[styles.statusIcon, { color: statusColor(referralStatus) }]}>
            {statusIcon(referralStatus)}
          </Text>
        </View>

        {/* Botão */}
        <TouchableOpacity
          style={[styles.button, !canRegister && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={!canRegister}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{t.register.createBtn}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.loginLinkText}>
            {t.register.hasAccount}<Text style={{ color: '#4A6FE8' }}>{t.register.loginLink}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>

  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  scroll: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '500', color: '#666', marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
    color: '#000'
  },
  inputValid: { borderColor: '#34C759', borderWidth: 1 },
  inputError: { borderColor: '#FF3B30', borderWidth: 1 },
  inputFlex: { flex: 1, marginBottom: 0 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  atSign: { fontSize: 16, color: '#666', fontWeight: '600' },
  statusIcon: { fontSize: 18, fontWeight: '700', width: 24, textAlign: 'center' },
  statusText: { fontSize: 12, marginTop: -8, marginBottom: 8 },
  hint: { fontSize: 11, color: '#999', marginTop: -8, marginBottom: 12 },
  button: {
    backgroundColor: '#4A6FE8',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginLink: { alignItems: 'center', marginTop: 20 },
  loginLinkText: { fontSize: 14, color: '#666' }
})
