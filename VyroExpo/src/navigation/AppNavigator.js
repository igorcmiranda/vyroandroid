import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import Icon from 'react-native-vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import FeedScreen from '../screens/FeedScreen'
import ProfileScreen from '../screens/ProfileScreen'
import ChallengeScreen from '../screens/ChallengeScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import NewPostScreen from '../screens/NewPostScreen'
import NewChallengeScreen from '../screens/NewChallengeScreen'
import SubscriptionScreen from '../screens/SubscriptionScreen'
import WaterScreen from '../screens/WaterScreen'
import UsageScreen from '../screens/UsageScreen'
import MealAnalysisScreen from '../screens/MealAnalysisScreen'
import DietPlanScreen from '../screens/DietPlanScreen'
import BodyAnalysisScreen from '../screens/BodyAnalysisScreen'
import MessagesScreen from '../screens/MessagesScreen'
import ChatScreen from '../screens/ChatScreen'
import PublicProfileScreen from '../screens/PublicProfileScreen'
import PostDetailScreen from '../screens/PostDetailScreen'

const Tab = createBottomTabNavigator()
const Stack = createStackNavigator()

// Tela de bloqueio padrão
function LockedScreen({ navigation, planRequired, featureName }) {

  return (
    <View style={styles.lockedContainer}>
      <Text style={styles.lockedIcon}>🔒</Text>
      <Text style={styles.lockedTitle}>{featureName} bloqueado</Text>
      <Text style={styles.lockedText}>
        Esta funcionalidade requer o plano {planRequired} ou superior.
        </Text>
      <TouchableOpacity
        style={styles.lockedBtn}
        onPress={() => navigation.navigate('Subscription')}
      >
        <Text style={styles.lockedBtnText}>⬆️ Ver planos</Text>
      </TouchableOpacity>
    </View>
  )
}

function MainTabs({ unreadCount, plan }) {
  const insets = useSafeAreaInsets()

  // Permissões por plano
  const hasStarter = ['starter', 'standard', 'premium'].includes(plan)
  const hasStandard = ['standard', 'premium'].includes(plan)
  const hasPremium = plan === 'premium'

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Feed: focused ? 'albums' : 'albums-outline',
            Perfil: focused ? 'person' : 'person-outline',
            Desafio: focused ? 'trophy' : 'trophy-outline',
            Avisos: focused ? 'notifications' : 'notifications-outline',
          }
          return <Icon name={icons[route.name]} size={size} color={color} />
        },
        tabBarActiveTintColor: '#4A6FE8',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 4,
        }
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
      <Tab.Screen
        name="Desafio"
        options={{ tabBarBadge: !hasStarter ? '🔒' : undefined }}
      >
        {({ navigation }) => hasStarter
          ? <ChallengeScreen navigation={navigation} plan={plan} />
          : <LockedScreen navigation={navigation} planRequired="Starter" featureName="Desafios" />
        }
      </Tab.Screen>
      <Tab.Screen
        name="Avisos"
        component={NotificationsScreen}
        options={{ tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
    </Tab.Navigator>
  )
}

export default function AppNavigator({ isLoggedIn, unreadCount }) {
  const [plan, setPlan] = useState('none')

  useEffect(() => {
    const uid = auth().currentUser?.uid
    if (!uid) return
    const unsub = firestore().collection('subscriptions').doc(uid)
      .onSnapshot(doc => {
        setPlan(doc.data()?.plan || 'none')
      })
    return unsub
  }, [isLoggedIn])

  // Permissões
  const hasStarter = ['starter', 'standard', 'premium'].includes(plan)
  const hasStandard = ['standard', 'premium'].includes(plan)
  const hasPremium = plan === 'premium'

  return (
    <SafeAreaProvider>
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false,     contentStyle: { backgroundColor: '#F2F2F7' }}}>
        {isLoggedIn ? (
          <>
            <Stack.Screen name="Main">
              {() => <MainTabs unreadCount={unreadCount} plan={plan} />}
            </Stack.Screen>

            {/* Post */}
            <Stack.Screen
              name="NewPost"
              options={{ presentation: 'modal' }}
            >
              {({ navigation }) => hasStarter
                ? <NewPostScreen navigation={navigation} />
                : <LockedScreen navigation={navigation} planRequired="Starter" featureName="Publicar posts" />
              }
            </Stack.Screen>

            {/* Desafio */}
            <Stack.Screen
              name="NewChallenge"
              options={{ presentation: 'modal' }}
            >
              {({ navigation }) => hasStarter
                ? <NewChallengeScreen navigation={navigation} />
                : <LockedScreen navigation={navigation} planRequired="Starter" featureName="Desafios" />
              }
            </Stack.Screen>

            {/* Dieta */}
            <Stack.Screen name="Diet">
              {({ navigation, route }) => hasStarter
                ? <DietPlanScreen navigation={navigation} route={route} />
                : <LockedScreen navigation={navigation} planRequired="Starter" featureName="Dieta" />
              }
            </Stack.Screen>

            {/* Análise de refeição */}
            <Stack.Screen name="MealAnalysis">
              {({ navigation, route }) => hasStarter
                ? <MealAnalysisScreen navigation={navigation} route={route} />
                : <LockedScreen navigation={navigation} planRequired="Starter" featureName="Análise de refeição" />
              }
            </Stack.Screen>

            {/* Água — Standard+ */}
            <Stack.Screen name="Water">
              {({ navigation, route }) => hasStandard
                ? <WaterScreen navigation={navigation} route={route} />
                : <LockedScreen navigation={navigation} planRequired="Standard" featureName="Controle de água" />
              }
            </Stack.Screen>

            {/* Corpo — Premium */}
            <Stack.Screen name="Body">
              {({ navigation, route }) => hasPremium
                ? <BodyAnalysisScreen navigation={navigation} route={route} />
                : <LockedScreen navigation={navigation} planRequired="Premium" featureName="Análise corporal" />
              }
            </Stack.Screen>

            {/* Sem restrição */}
            <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Usage" component={UsageScreen} />
            <Stack.Screen name="Messages" component={MessagesScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true }} />
            <Stack.Screen name="PublicProfile" component={PublicProfileScreen} options={{ headerShown: true, title: 'Perfil' }} />
            <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ headerShown: true, title: 'Publicação' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  lockedContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, backgroundColor: '#F2F2F7', gap: 12
  },
  lockedIcon: { fontSize: 56, marginBottom: 8 },
  lockedTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  lockedText: {
    fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 24
  },
  lockedBtn: {
    backgroundColor: '#4A6FE8', borderRadius: 14,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 8
  },
  lockedBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 }
})