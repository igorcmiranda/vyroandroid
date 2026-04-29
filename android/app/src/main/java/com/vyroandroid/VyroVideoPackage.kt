package com.vyroandroid

import androidx.media3.common.util.UnstableApi
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * VyroVideoPackage
 *
 * Registra VyroVideoViewManager no PackageList do React Native.
 *
 * ─── Como usar ────────────────────────────────────────────────────
 *
 * 1. Adicione ao MainApplication.kt:
 *
 *    override val reactHost: ReactHost by lazy {
 *      getDefaultReactHost(
 *        context = applicationContext,
 *        packageList = PackageList(this).packages.apply {
 *          add(VyroVideoPackage())   // <── adicionar aqui
 *        }
 *      )
 *    }
 *
 * 2. Adicione ao android/app/build.gradle (dependencies):
 *
 *    implementation("androidx.media3:media3-exoplayer:1.3.1")
 *    implementation("androidx.media3:media3-ui:1.3.1")
 *    implementation("androidx.media3:media3-common:1.3.1")
 *
 * 3. Use o componente no React Native via NativeVideoPlayer.js
 * ─────────────────────────────────────────────────────────────────
 */
@UnstableApi
class VyroVideoPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return emptyList()
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(VyroVideoViewManager())
    }
}
