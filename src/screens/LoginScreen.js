import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Image, Modal, FlatList
} from 'react-native'
import AuthManager from '../managers/AuthManager'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LANGUAGES } from '../i18n/translations'

export default function LoginScreen({ navigation }) {
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLanguages, setShowLanguages] = useState(false)


  async function handleLogin() {
    if (!credential || !password) return
    setLoading(true)
    try {
      await AuthManager.login(credential, password)
    } catch (e) {
      Alert.alert('Erro', e.message)
    }
    setLoading(false)
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
        <TouchableOpacity
          style={styles.languageBtn}
          onPress={() => setShowLanguages(true)}
        >
          <Text style={styles.languageBtnText}>
            {LANGUAGES.find(l => l.code === language)?.flag} {LANGUAGES.find(l => l.code === language)?.name}
          </Text>
          <Text style={{ color: '#8B9CC8', fontSize: 12 }}>▼</Text>
        </TouchableOpacity>

        <View style={styles.logoContainer}>
          <Image source={require('../assets/logo.png')} style={styles.logo} />
          <Text style={styles.appName}>{t.login.title}</Text>
          <Text style={styles.tagline}>{t.login.subtitle}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>{t.login.email}</Text>
          <TextInput
            style={styles.input}
            value={credential}
            onChangeText={setCredential}
            placeholder={t.login.emailPlaceholder}
            placeholderTextColor="#8B9CC8"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>{t.login.password}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t.login.passwordPlaceholder}
            placeholderTextColor="#8B9CC8"
            secureTextEntry
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('ResetPassword')}
            style={styles.forgotContainer}
          >
            <Text style={styles.forgotText}>{t.login.forgotPassword}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (!credential || !password) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || !credential || !password}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{t.login.loginBtn}</Text>
            }
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t.login.or}</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerText}>
              {t.login.noAccount} <Text style={styles.registerLink}>{t.login.register}</Text>
            </Text>
          </TouchableOpacity>
          </View>
        

        {/* Modal de seleção de idioma */}
        <Modal
          visible={showLanguages}
          animationType="slide"
          transparent
          onRequestClose={() => setShowLanguages(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            onPress={() => setShowLanguages(false)}
          >
            <View style={styles.languageModal}>
              <Text style={styles.languageModalTitle}>{t.login.selectLanguage}</Text>
              <FlatList
                data={LANGUAGES}
                keyExtractor={item => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.languageItem,
                      language === item.code && styles.languageItemActive
                    ]}
                    onPress={() => {
                      changeLanguage(item.code)
                      setShowLanguages(false)
                    }}
                  >
                    <Text style={styles.languageFlag}>{item.flag}</Text>
                    <Text style={[
                      styles.languageName,
                      language === item.code && styles.languageNameActive
                    ]}>
                      {item.name}
                    </Text>
                    {language === item.code && (
                      <Text style={styles.languageCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: '#E5E5EA' }} />}
              />
            </View>
          </TouchableOpacity>
        </Modal>
        </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080818',
    justifyContent: 'center',
    padding: 24
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 22
  },
  appName: {
    fontSize: 38,
    fontWeight: '900',
    color: '#A78BFA',
    marginTop: 12,
    letterSpacing: 2
  },
  tagline: {
    fontSize: 14,
    color: '#8B9CC8',
    marginTop: 4
  },
  form: {
    gap: 8
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8B9CC8',
    marginBottom: 4
  },
  input: {
    backgroundColor: '#1A1A3E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3D4A8A',
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12
  },
  forgotContainer: {
    alignItems: 'flex-end',
    marginBottom: 20
  },
  forgotText: {
    color: '#60A5FA',
    fontSize: 13
  },
  button: {
    backgroundColor: '#4A6FE8',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 8
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A2A4A'
  },
  dividerText: {
    color: '#8B9CC8',
    fontSize: 12
  },
  registerText: {
    textAlign: 'center',
    color: '#8B9CC8',
    fontSize: 14
  },
  registerLink: {
    color: '#60A5FA',
    fontWeight: '700'
  },

  languageBtn: {
  position: 'absolute',
  top: 60,
  right: 24,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#1A1A3E',
  borderRadius: 20,
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderWidth: 1,
  borderColor: '#3D4A8A'
  },
  languageBtnText: { color: '#fff', fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  languageModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%'
  },
  languageModalTitle: {
    fontSize: 18, fontWeight: '700',
    textAlign: 'center', marginBottom: 16
  },
  languageItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 8, gap: 12
  },
  languageItemActive: { backgroundColor: '#EEF2FF' },
  languageFlag: { fontSize: 28 },
  languageName: { flex: 1, fontSize: 16, color: '#333' },
  languageNameActive: { color: '#4A6FE8', fontWeight: '700' },
  languageCheck: { color: '#4A6FE8', fontSize: 18, fontWeight: '700' }
})
