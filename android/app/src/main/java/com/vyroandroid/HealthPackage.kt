package com.vyroandroid

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * HealthPackage
 *
 * Registra o HealthModule (leitura de dados de saúde) no React Native.
 *
 * ─── Instalação ────────────────────────────────────────────────────
 *
 * 1. Adicione ao MainApplication.kt:
 *    add(HealthPackage())
 *
 * 2. Adicione ao android/app/build.gradle (dentro de dependencies):
 *    implementation("androidx.health.connect:connect-client:1.1.0-rc01")
 *
 * 3. Adicione ao AndroidManifest.xml (dentro de <manifest>):
 *    <!-- Declara que o app lê dados do Health Connect -->
 *    <queries>
 *        <package android:name="com.google.android.apps.healthdata" />
 *    </queries>
 *
 * 4. Adicione ao AndroidManifest.xml (dentro de <application>):
 *    <!-- Permissões de leitura do Health Connect -->
 *    <uses-permission android:name="android.permission.health.READ_STEPS"/>
 *    <uses-permission android:name="android.permission.health.READ_ACTIVE_CALORIES_BURNED"/>
 *    <uses-permission android:name="android.permission.health.READ_TOTAL_CALORIES_BURNED"/>
 *    <uses-permission android:name="android.permission.health.READ_DISTANCE"/>
 *
 *    <!-- Privacy Policy Activity obrigatória para Health Connect -->
 *    <activity
 *        android:name=".HealthConnectPrivacyActivity"
 *        android:exported="true">
 *        <intent-filter>
 *            <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
 *        </intent-filter>
 *    </activity>
 * ─────────────────────────────────────────────────────────────────
 */
class HealthPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(HealthModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
