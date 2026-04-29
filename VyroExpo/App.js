import 'react-native-gesture-handler'
import React, { useState, useEffect } from 'react'
import { StatusBar, LogBox, PermissionsAndroid, Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import messaging from '@react-native-firebase/messaging'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import AppNavigator from './src/navigation/AppNavigator'
import AuthManager from './src/managers/AuthManager'
import ErrorLogger from './src/managers/ErrorLogger'
import { LanguageProvider } from './src/context/LanguageContext'

LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'VirtualizedLists should never be nested',
])

async function requestNotificationPermission() {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    )
    return granted === PermissionsAndroid.RESULTS.GRANTED
  }
  return true
}

async function saveFCMToken() {
  const uid = auth().currentUser?.uid
  if (!uid) return
  try {
    const token = await messaging().getToken()
    if (token) {
      await firestore().collection('users').doc(uid).update({
        fcmToken: token
      })
      console.log('✅ FCM Token Android salvo:', token.substring(0, 20) + '...')
    }
  } catch (error) {
    console.log('❌ Erro FCM token:', error)
  }
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    // Listener de auth
    ErrorLogger.setupGlobalHandler()
    scheduleDailyReport()


    const unsubscribe = AuthManager.onUserChanged((user) => {
      setIsLoggedIn(!!user)
      setIsLoading(false)
      if (user) {
        setupNotifications()
      }
    })
    return unsubscribe
  }, [])

  function scheduleDailyReport() {
  const now = new Date()
  const midnight = new Date()
  midnight.setHours(23, 59, 0, 0)
  
  const msUntilMidnight = midnight.getTime() - now.getTime()
  const delay = msUntilMidnight > 0 ? msUntilMidnight : 86400000

  setTimeout(async () => {
    await ErrorLogger.sendDailyReport()
    // Repete todo dia
    setInterval(() => {
      ErrorLogger.sendDailyReport()
    }, 86400000)
  }, delay)
}

  async function setupNotifications() {
    // Pede permissão
    const hasPermission = await requestNotificationPermission()
    if (!hasPermission) return

    // Salva token FCM
    await saveFCMToken()

    // Atualiza token se mudar
    messaging().onTokenRefresh(async (token) => {
      const uid = auth().currentUser?.uid
      if (uid && token) {
        await firestore().collection('users').doc(uid).update({ fcmToken: token })
      }
    })

    // Notificação recebida com app em foreground
    messaging().onMessage(async remoteMessage => {
      console.log('📱 Notificação em foreground:', remoteMessage)
      // Atualiza badge de notificações
      setUnreadCount(prev => prev + 1)
    })

    // Notificação clicada com app em background
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('📱 App aberto por notificação:', remoteMessage)
    })

    // Notificação clicada com app fechado
    messaging().getInitialNotification().then(remoteMessage => {
      if (remoteMessage) {
        console.log('📱 App iniciado por notificação:', remoteMessage)
      }
    })
  }

  if (isLoading) return null

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <AppNavigator isLoggedIn={isLoggedIn} unreadCount={unreadCount} />
      </LanguageProvider>
    </SafeAreaProvider>
  )
}