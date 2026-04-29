import firestore from '@react-native-firebase/firestore'
import storage from '@react-native-firebase/storage'
import auth from '@react-native-firebase/auth'

class FeedManager {
  constructor() {
    this.posts = []
    this.followingIDs = new Set()
    this.listener = null
    this.pinnedListener = null
    this.lastDocument = null
    this.hasMore = true
    this.pageSize = 15
    this._pinnedPostID = null
    this._pinnedExpiresAt = null
  }

  async loadFollowing() {
    const uid = auth().currentUser?.uid
    if (!uid) return
    const snapshot = await firestore()
      .collection('follows').doc(uid)
      .collection('following').get()
    this.followingIDs = new Set(snapshot.docs.map(d => d.id))
  }

  // Observa qual post está fixado (admin configura isso)
  startPinnedListener(onUpdate) {
    this.pinnedListener?.()
    this.pinnedListener = firestore()
      .collection('appConfig').doc('feedPinnedPost')
      .onSnapshot(doc => {
        if (!doc.exists) {
          this._pinnedPostID = null
          return
        }
        const data = doc.data()
        const expiresAt = data?.expiresAt?.toDate?.()
        if (expiresAt && expiresAt > new Date()) {
          this._pinnedPostID = data.postID
          this._pinnedExpiresAt = expiresAt
        } else {
          this._pinnedPostID = null
        }
        onUpdate?.()
      })
  }

  startListening(onUpdate) {
    this.listener?.()
    this.posts = []
    this.lastDocument = null

    this.listener = firestore()
      .collection('posts')
      .orderBy('createdAt', 'desc')
      .limit(this.pageSize)
      .onSnapshot(
        async snapshot => {
          if (!snapshot || !snapshot.docs) return

          this.lastDocument = snapshot.docs[snapshot.docs.length - 1]
          this.hasMore = snapshot.docs.length === this.pageSize

          const uid = auth().currentUser?.uid

          let posts = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(post =>
              post.mediaURL || (post.mediaItems && post.mediaItems.length > 0)
            )

          // Marca likes
          if (uid) {
            posts = await Promise.all(posts.map(async post => {
              const likeDoc = await firestore()
                .collection('posts').doc(post.id)
                .collection('likes').doc(uid).get()
              return { ...post, isLiked: likeDoc.exists }
            }))
          }

          // Aplica pin
          posts = await this._applyPinnedPost(posts)

          this.posts = this.sortPosts(posts)
          onUpdate(this.posts)
        },
        error => {
          console.log('Feed listener error:', error)
        }
      )
  }

  async _applyPinnedPost(posts) {
    if (!this._pinnedPostID) {
      return posts.map(p => ({ ...p, isPinned: false }))
    }

    // Verifica expiração
    if (this._pinnedExpiresAt && this._pinnedExpiresAt <= new Date()) {
      this._pinnedPostID = null
      return posts.map(p => ({ ...p, isPinned: false }))
    }

    const pinnedID = this._pinnedPostID
    let pinnedPost = posts.find(p => p.id === pinnedID)

    // Se não está nos posts carregados, busca do Firestore
    if (!pinnedPost) {
      try {
        const doc = await firestore().collection('posts').doc(pinnedID).get()
        if (doc.exists) {
          pinnedPost = { id: doc.id, ...doc.data(), isPinned: true }
        }
      } catch {
        return posts.map(p => ({ ...p, isPinned: false }))
      }
    } else {
      pinnedPost = { ...pinnedPost, isPinned: true }
    }

    // Remove da lista normal e coloca no topo
    const rest = posts
      .filter(p => p.id !== pinnedID)
      .map(p => ({ ...p, isPinned: false }))

    return [pinnedPost, ...rest]
  }

  sortPosts(posts) {
    const following = this.followingIDs
    // Posts normais (não fixados) são ordenados por seguidos primeiro, depois data
    const pinned = posts.filter(p => p.isPinned)
    const normal = posts.filter(p => !p.isPinned).sort((a, b) => {
      const aF = following.has(a.userID)
      const bF = following.has(b.userID)
      if (aF !== bF) return aF ? -1 : 1
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    })
    return [...pinned, ...normal]
  }

  async loadMorePosts() {
    if (!this.hasMore || !this.lastDocument) return

    try {
      const snap = await firestore()
        .collection('posts')
        .orderBy('createdAt', 'desc')
        .startAfter(this.lastDocument)
        .limit(this.pageSize)
        .get()

      if (snap.docs.length === 0) {
        this.hasMore = false
        return
      }

      this.lastDocument = snap.docs[snap.docs.length - 1]
      this.hasMore = snap.docs.length === this.pageSize

      const uid = auth().currentUser?.uid
      let newPosts = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(post => post.mediaURL || (post.mediaItems && post.mediaItems.length > 0))

      if (uid) {
        newPosts = await Promise.all(newPosts.map(async post => {
          const likeDoc = await firestore()
            .collection('posts').doc(post.id)
            .collection('likes').doc(uid).get()
          return { ...post, isLiked: likeDoc.exists }
        }))
      }

      // Filtra posts já presentes
      const existingIDs = new Set(this.posts.map(p => p.id))
      const unique = newPosts.filter(p => !existingIDs.has(p.id))
      this.posts = [...this.posts, ...unique]
    } catch (e) {
      console.log('loadMorePosts error:', e)
    }
  }

  async toggleLike(post) {
    const uid = auth().currentUser?.uid
    if (!uid) return

    const likeRef = firestore()
      .collection('posts').doc(post.id)
      .collection('likes').doc(uid)
    const postRef = firestore().collection('posts').doc(post.id)

    if (post.isLiked) {
      await likeRef.delete()
      await postRef.update({ likesCount: firestore.FieldValue.increment(-1) })
    } else {
      await likeRef.set({ likedAt: firestore.Timestamp.now() })
      await postRef.update({ likesCount: firestore.FieldValue.increment(1) })
    }
  }

  async addComment(postID, text) {
    const uid = auth().currentUser?.uid
    if (!uid) return

    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()

    await firestore()
      .collection('posts').doc(postID)
      .collection('comments').doc()
      .set({
        userID: uid,
        userName: userData.name,
        userAvatarURL: userData.avatarURL || '',
        text,
        createdAt: firestore.Timestamp.now(),
      })

    await firestore().collection('posts').doc(postID).update({
      commentsCount: firestore.FieldValue.increment(1),
    })
  }

  async toggleFollow(targetID) {
    const uid = auth().currentUser?.uid
    if (!uid) return

    const followRef = firestore()
      .collection('follows').doc(uid)
      .collection('following').doc(targetID)
    const targetRef = firestore().collection('users').doc(targetID)

    if (this.followingIDs.has(targetID)) {
      this.followingIDs.delete(targetID)
      await followRef.delete()
      await targetRef.update({ followersCount: firestore.FieldValue.increment(-1) })
    } else {
      this.followingIDs.add(targetID)
      await followRef.set({ targetID, createdAt: firestore.Timestamp.now() })
      await targetRef.update({ followersCount: firestore.FieldValue.increment(1) })
    }
  }

  async uploadPost({ mediaUri, mediaType, caption, city, region }) {
    const uid = auth().currentUser?.uid
    if (!uid) return

    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()

    const postID = firestore().collection('posts').doc().id
    const ext = mediaType === 'photo' ? 'jpg' : 'mp4'
    const ref = storage().ref(`posts/${uid}/${postID}.${ext}`)

    await ref.putFile(mediaUri)
    const mediaURL = await ref.getDownloadURL()

    await firestore().collection('posts').doc(postID).set({
      id: postID,
      userID: uid,
      userName: userData.name,
      username: userData.username || '',
      userAvatarURL: userData.avatarURL || '',
      isVerified: userData.isVerified || false,
      mediaURL,
      mediaType,
      caption,
      city: city || '',
      region: region || '',
      latitude: 0,
      longitude: 0,
      likesCount: 0,
      commentsCount: 0,
      isPinned: false,
      createdAt: firestore.Timestamp.now(),
    })
  }

  stopListening() {
    this.listener?.()
    this.listener = null
    this.pinnedListener?.()
    this.pinnedListener = null
  }
}

export default new FeedManager()
