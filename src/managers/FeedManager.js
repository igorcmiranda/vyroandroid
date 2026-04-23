import firestore from '@react-native-firebase/firestore'
import storage from '@react-native-firebase/storage'
import auth from '@react-native-firebase/auth'

class FeedManager {
  constructor() {
    this.posts = []
    this.followingIDs = new Set()
    this.listener = null
    this.lastDocument = null
    this.hasMore = true
    this.pageSize = 15
  }

  async loadFollowing() {
    const uid = auth().currentUser?.uid
    if (!uid) return
    const snapshot = await firestore()
      .collection('follows').doc(uid)
      .collection('following').get()
    this.followingIDs = new Set(snapshot.docs.map(d => d.id))
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
      snapshot => {
        if (!snapshot || !snapshot.docs) return

        this.lastDocument = snapshot.docs[snapshot.docs.length - 1]
        this.hasMore = snapshot.docs.length === this.pageSize

        const uid = auth().currentUser?.uid

        const posts = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(post =>
            post.mediaURL || (post.mediaItems && post.mediaItems.length > 0)
          )

        this.posts = this.sortPosts(posts)
        onUpdate(this.posts)
      },
      error => {
        console.log('Feed listener error:', error)
      }
    )
}

  sortPosts(posts) {
    const following = this.followingIDs
    return [...posts].sort((a, b) => {
      const aF = following.has(a.userID)
      const bF = following.has(b.userID)
      if (aF !== bF) return aF ? -1 : 1
      return b.createdAt?.seconds - a.createdAt?.seconds
    })
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
      await postRef.update({
        likesCount: firestore.FieldValue.increment(-1)
      })
    } else {
      await likeRef.set({ likedAt: firestore.Timestamp.now() })
      await postRef.update({
        likesCount: firestore.FieldValue.increment(1)
      })
    }
  }

  async addComment(postID, text) {
    const uid = auth().currentUser?.uid
    if (!uid) return

    const userDoc = await firestore().collection('users').doc(uid).get()
    const userData = userDoc.data()

    const commentRef = firestore()
      .collection('posts').doc(postID)
      .collection('comments').doc()

    await commentRef.set({
      userID: uid,
      userName: userData.name,
      userAvatarURL: userData.avatarURL || '',
      text,
      createdAt: firestore.Timestamp.now()
    })

    await firestore().collection('posts').doc(postID).update({
      commentsCount: firestore.FieldValue.increment(1)
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
      await targetRef.update({
        followersCount: firestore.FieldValue.increment(-1)
      })
    } else {
      this.followingIDs.add(targetID)
      await followRef.set({
        targetID,
        createdAt: firestore.Timestamp.now()
      })
      await targetRef.update({
        followersCount: firestore.FieldValue.increment(1)
      })
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
      createdAt: firestore.Timestamp.now()
    })
  }

  stopListening() {
    this.listener?.()
    this.listener = null
  }
}

export default new FeedManager()