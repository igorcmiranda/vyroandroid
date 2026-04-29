package com.vyroandroid

import android.view.View
import androidx.media3.common.util.UnstableApi
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * VyroVideoViewManager
 *
 * Registra VyroVideoView como componente nativo acessível pelo React Native.
 *
 * Props expostas ao JS:
 * - uri: String       — URL do vídeo
 * - muted: Boolean    — inicia mutado (default: true)
 * - isVisible: Boolean — controla autoplay
 */
@UnstableApi
@ReactModule(name = VyroVideoViewManager.REACT_CLASS)
class VyroVideoViewManager : SimpleViewManager<VyroVideoView>() {

    companion object {
        const val REACT_CLASS = "VyroVideoView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): VyroVideoView {
        return VyroVideoView(context)
    }

    @ReactProp(name = "uri")
    fun setUri(view: VyroVideoView, uri: String?) {
        uri?.let { view.setVideoUri(it) }
    }

    @ReactProp(name = "muted", defaultBoolean = true)
    fun setMuted(view: VyroVideoView, muted: Boolean) {
        view.setMuted(muted)
    }

    @ReactProp(name = "isVisible", defaultBoolean = false)
    fun setIsVisible(view: VyroVideoView, isVisible: Boolean) {
        view.setIsVisible(isVisible)
    }

    override fun onDropViewInstance(view: VyroVideoView) {
        view.releasePlayer()
        super.onDropViewInstance(view)
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return mapOf(
            "onMuteChange" to mapOf(
                "phasedRegistrationNames" to mapOf(
                    "bubbled" to "onMuteChange"
                )
            )
        )
    }
}
