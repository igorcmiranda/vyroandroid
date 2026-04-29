import auth from '@react-native-firebase/auth'
import firestore from '@react-native-firebase/firestore'

class AuthManager {
  constructor() {
    this.currentUser = null
  }

  onUserChanged(callback) {
    return auth().onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const profile = await this.fetchUserProfile(user.uid)
          callback(profile)
        } catch {
          callback({ uid: user.uid, name: '', email: user.email, avatarURL: '', username: '' })
        }
      } else {
        callback(null)
      }
    })
  }

  async fetchUserProfile(uid) {
    const doc = await firestore().collection('users').doc(uid).get()
    if (doc.exists) {
      return { uid, ...doc.data() }
    }
    return null
  }

  async login(emailOrUsername, password) {
    let email = emailOrUsername.trim()

    if (!email.includes('@')) {
      // É um username — busca o email
      const snapshot = await firestore()
        .collection('users')
        .where('username', '==', email.toLowerCase())
        .limit(1)
        .get()

      if (snapshot.empty) {
        throw new Error('Usuário não encontrado')
      }
      email = snapshot.docs[0].data().email
    }

    const result = await auth().signInWithEmailAndPassword(email, password)
    return result.user
  }

  async register({ name, email, password, username, referralCode }) {
    const result = await auth().createUserWithEmailAndPassword(email, password)
    const uid = result.user.uid

    const userData = {
      name,
      email,
      username: username.toLowerCase(),
      isAdmin: false,
      isVerified: false,
      createdAt: firestore.FieldValue.serverTimestamp(),
      weight: 0,
      height: 0,
      age: 0,
      sex: 'Masculino',
      goal: 'Manter peso',
      avatarURL: '',
      followersCount: 0,
      showOnLeaderboard: false
    }

    if (referralCode) userData.referredBy = referralCode

    await firestore().collection('users').doc(uid).set(userData)
    return { uid, ...userData }
  }

  async logout() {
    return auth().signOut()
  }

  async checkUsernameAvailable(username) {
    try {
      const snapshot = await firestore()
        .collection('users')
        .where('username', '==', username.toLowerCase())
        .limit(1)
        .get()
      return snapshot.empty
    } catch {
      return true
    }
  }

  async checkEmailAvailable(email) {
    try {
      const methods = await auth().fetchSignInMethodsForEmail(email)
      return methods.length === 0
    } catch {
      return true
    }
  }

  async resetPassword(email) {
    return auth().sendPasswordResetEmail(email)
  }
}

export default new AuthManager()
