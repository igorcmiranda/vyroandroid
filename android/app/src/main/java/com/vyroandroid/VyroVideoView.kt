package com.vyroandroid

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.media3.common.util.UnstableApi
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

/**
 * VyroVideoView — View nativa Android para player de vídeo no feed
 *
 * Usa ExoPlayer (Media3) diretamente, mais estável que react-native-video
 * na New Architecture do React Native.
 *
 * Funcionalidades:
 * - Autoplay quando visível
 * - Loop automático
 * - Mute/Unmute
 * - Pause/Play ao tocar
 * - SurfaceView (melhor performance no Android)
 */
@UnstableApi
class VyroVideoView(context: Context) : FrameLayout(context) {

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var isMuted: Boolean = true
    private var isPaused: Boolean = false
    private var videoUri: String? = null
    private var isVisible: Boolean = false

    // Overlay de mute/unmute no canto inferior direito
    private val muteButton: android.widget.ImageView
    // Overlay de play/pause que aparece brevemente ao tocar
    private val pauseOverlay: android.widget.TextView

    init {
        setBackgroundColor(Color.BLACK)

        // PlayerView ocupa toda a área
        playerView = PlayerView(context).apply {
            useController = false  // sem controles nativos do ExoPlayer
            layoutParams = LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
            )
        }
        addView(playerView)

        // Overlay de pause (aparece por 700ms ao tocar)
        pauseOverlay = android.widget.TextView(context).apply {
            text = "▶"
            textSize = 28f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            visibility = View.GONE
            setBackgroundColor(Color.parseColor("#44000000"))
            layoutParams = LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
            )
        }
        addView(pauseOverlay)

        // Botão mute — 40x40dp no canto inferior direito
        val dp = context.resources.displayMetrics.density
        val btnSize = (40 * dp).toInt()
        val margin = (14 * dp).toInt()

        muteButton = android.widget.ImageView(context).apply {
            setImageResource(android.R.drawable.ic_lock_silent_mode)
            setPadding(8, 8, 8, 8)
            setBackgroundResource(0)
            background = context.getDrawable(android.R.drawable.dialog_holo_dark_frame)?.apply {
                alpha = 160
            }
            contentDescription = "Mute"
            layoutParams = LayoutParams(btnSize, btnSize).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                bottomMargin = margin
                rightMargin = margin
            }
            setOnClickListener { toggleMute() }
        }
        addView(muteButton)

        // Toque na tela = pause/play
        setOnClickListener { togglePlayPause() }
    }

    // ─── API pública (chamada pelo ViewManager) ─────────────────────

    fun setVideoUri(uri: String) {
        videoUri = uri
        initPlayerIfNeeded()
        loadVideo(uri)
    }

    fun setMuted(muted: Boolean) {
        isMuted = muted
        player?.volume = if (muted) 0f else 1f
        updateMuteIcon()
    }

    fun setIsVisible(visible: Boolean) {
        isVisible = visible
        if (visible) {
            player?.play()
            isPaused = false
        } else {
            player?.pause()
        }
    }

    // ─── Player ────────────────────────────────────────────────────

    private fun initPlayerIfNeeded() {
        if (player != null) return

        player = ExoPlayer.Builder(context).build().apply {
            repeatMode = Player.REPEAT_MODE_ONE  // loop
            volume = if (isMuted) 0f else 1f
            playWhenReady = isVisible

            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && isVisible && !isPaused) {
                        play()
                    }
                }
            })
        }

        playerView?.player = player
    }

    private fun loadVideo(uri: String) {
        val mediaItem = MediaItem.fromUri(uri)
        player?.run {
            setMediaItem(mediaItem)
            prepare()
            if (isVisible && !isPaused) play()
        }
    }

    private fun togglePlayPause() {
        isPaused = !isPaused
        if (isPaused) {
            player?.pause()
            showPauseOverlay("⏸")
        } else {
            player?.play()
            showPauseOverlay("▶")
        }
    }

    private fun toggleMute() {
        isMuted = !isMuted
        player?.volume = if (isMuted) 0f else 1f
        updateMuteIcon()

        // Emite evento para o JS saber do novo estado
        val reactContext = context as? ReactContext
        reactContext?.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(
            id,
            "onMuteChange",
            null
        )
    }

    private fun updateMuteIcon() {
        if (isMuted) {
            muteButton.setImageResource(android.R.drawable.ic_lock_silent_mode)
            muteButton.contentDescription = "Ativar som"
        } else {
            muteButton.setImageResource(android.R.drawable.ic_lock_silent_mode_off)
            muteButton.contentDescription = "Silenciar"
        }
    }

    private fun showPauseOverlay(symbol: String) {
        pauseOverlay.text = symbol
        pauseOverlay.visibility = View.VISIBLE
        postDelayed({ pauseOverlay.visibility = View.GONE }, 700)
    }

    // ─── Lifecycle ─────────────────────────────────────────────────

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        initPlayerIfNeeded()
        videoUri?.let { if (player?.mediaItemCount == 0) loadVideo(it) }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        releasePlayer()
    }

    fun releasePlayer() {
        player?.release()
        player = null
        playerView?.player = null
    }
}
