import React, { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { translations } from '../i18n/translations'

const defaultValue = {
  language: 'pt',
  t: translations['pt'],
  changeLanguage: () => {}
}

const LanguageContext = createContext(defaultValue)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('pt')

  useEffect(() => {
    AsyncStorage.getItem('app_language').then(saved => {
      if (saved && translations[saved]) setLanguage(saved)
    }).catch(() => {})
  }, [])

  const t = translations[language] || translations['pt']

  async function changeLanguage(code) {
    if (!translations[code]) return
    setLanguage(code)
    try {
      await AsyncStorage.setItem('app_language', code)
      const { default: auth } = require('@react-native-firebase/auth')
      const { default: firestore } = require('@react-native-firebase/firestore')
      const uid = auth().currentUser?.uid
      if (uid) {
        firestore().collection('users').doc(uid).update({ language: code }).catch(() => {})
      }
    } catch (e) {}
  }

  return (
    <LanguageContext.Provider value={{ language, t, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context || !context.t) {
    return defaultValue
  }
  return context
}