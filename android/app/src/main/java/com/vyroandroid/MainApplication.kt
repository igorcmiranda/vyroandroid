package com.vyroandroid

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // ──────────────────────────────────────────────────
          // Player de vídeo nativo com ExoPlayer (Media3)
          // Resolve o problema de vídeo não renderizando no
          // Android com New Architecture habilitada
          // ──────────────────────────────────────────────────
          add(VyroVideoPackage())
          add(HealthPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
