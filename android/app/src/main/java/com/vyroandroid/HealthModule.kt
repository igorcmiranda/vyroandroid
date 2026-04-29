package com.vyroandroid

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

class HealthModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "VyroHealth"
        private const val TAG = "VyroHealth"
        private const val PERMISSION_REQUEST_CODE = 9001

        val REQUIRED_PERMISSIONS = setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class),
        )
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var healthConnectClient: HealthConnectClient? = null
    private var pendingPermissionPromise: Promise? = null

    // ─── ActivityEventListener via BaseActivityEventListener ──
    // BaseActivityEventListener é preferível — não precisa implementar onNewIntent
    // As assinaturas são Activity (não-nullable), Intent (não-nullable)

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?
        ) {
            if (requestCode != PERMISSION_REQUEST_CODE) return

            val promise = pendingPermissionPromise ?: return
            pendingPermissionPromise = null

            scope.launch {
                try {
                    val client = healthConnectClient
                    if (client == null) {
                        promise.resolve(false)
                        return@launch
                    }
                    val granted = client.permissionController.getGrantedPermissions()
                    val hasAny = REQUIRED_PERMISSIONS.any { it in granted }
                    Log.d(TAG, "onActivityResult: hasAny=$hasAny, granted=${granted.size}")
                    promise.resolve(hasAny)
                } catch (e: Exception) {
                    Log.e(TAG, "onActivityResult check error", e)
                    promise.resolve(false)
                }
            }
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = MODULE_NAME

    // ─── checkAvailability ────────────────────────────────────

    @ReactMethod
    fun checkAvailability(promise: Promise) {
        try {
            val status = HealthConnectClient.getSdkStatus(reactContext)
            Log.d(TAG, "HealthConnectClient.getSdkStatus = $status")
            
            val result = when (status) {
                HealthConnectClient.SDK_AVAILABLE -> {
                    Log.d(TAG, "SDK_AVAILABLE - trying to getOrCreate")
                    try {
                        healthConnectClient = HealthConnectClient.getOrCreate(reactContext)
                        Log.d(TAG, "HealthConnectClient.getOrCreate SUCCESS")
                    } catch (e: Exception) {
                        Log.e(TAG, "getOrCreate failed", e)
                    }
                    "available"
                }
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needs_update"
                else -> "not_installed"
            }
            Log.d(TAG, "checkAvailability result: $result")
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "checkAvailability error", e)
            promise.resolve("unavailable")
        }
    }

    // ─── checkPermissions ─────────────────────────────────────

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        val client = healthConnectClient ?: run {
            promise.resolve(false)
            return
        }
        scope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val hasAll = REQUIRED_PERMISSIONS.all { it in granted }
                Log.d(TAG, "checkPermissions: hasAll=$hasAll, granted=${granted.size}")
                promise.resolve(hasAll)
            } catch (e: Exception) {
                Log.e(TAG, "checkPermissions error", e)
                promise.resolve(false)
            }
        }
    }

    // ─── requestPermissions ───────────────────────────────────
    // Usa PermissionController.createRequestPermissionResultContract() (método estático)
    // e startActivityForResult para capturar o resultado em onActivityResult

    @ReactMethod
    fun requestPermissions(promise: Promise) {
        Log.d(TAG, "=== requestPermissions called ===")
        
        val client = healthConnectClient ?: run {
            Log.e(TAG, "healthConnectClient is null!")
            promise.reject("NOT_AVAILABLE", "Health Connect não inicializado")
            return
        }
        Log.d(TAG, "healthConnectClient is valid")

        // currentActivity é obtido via reactContext
        val activity = reactContext.currentActivity
        Log.d(TAG, "currentActivity: ${activity?.javaClass?.simpleName}")
        
        if (activity == null) {
            Log.e(TAG, "currentActivity is NULL!")
            promise.reject("NO_ACTIVITY", "Activity não disponível")
            return
        }

        scope.launch {
            try {
                // Verifica se já tem tudo
                val alreadyGranted = client.permissionController.getGrantedPermissions()
                Log.d(TAG, "Already granted permissions: ${alreadyGranted.size}")
                
                if (REQUIRED_PERMISSIONS.all { it in alreadyGranted }) {
                    Log.d(TAG, "requestPermissions: já tem todas as permissões")
                    promise.resolve(true)
                    return@launch
                }

                // Tenta método 1: PermissionController.createRequestPermissionResultContract()
                try {
                    val contract = PermissionController.createRequestPermissionResultContract()
                    Log.d(TAG, "Creating permission intent via contract...")
                    val intent = contract.createIntent(reactContext, REQUIRED_PERMISSIONS)
                    Log.d(TAG, "Intent created: action=${intent.action}, data=${intent.data}")

                    pendingPermissionPromise = promise

                    withContext(Dispatchers.Main) {
                        Log.d(TAG, "Starting activity for result...")
                        activity.startActivityForResult(intent, PERMISSION_REQUEST_CODE)
                        Log.d(TAG, "Activity started successfully")
                    }
                    return@launch
                } catch (e: Exception) {
                    Log.w(TAG, "Contract method failed: ${e.javaClass.simpleName}: ${e.message}")
                    e.printStackTrace()
                }

                // Fallback: Abre as configurações do Health Connect diretamente
                Log.d(TAG, "Trying fallback: open Health Connect settings")
                withContext(Dispatchers.Main) {
                    try {
                        val settingsIntent = Intent("androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS").apply {
                            putExtra("android.intent.extra.PACKAGE_NAME", reactContext.packageName)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        Log.d(TAG, "Starting settings intent...")
                        activity.startActivity(settingsIntent)
                        Log.d(TAG, "Settings intent started - resolving")
                        promise.resolve("SETTINGS_OPENED")
                    } catch (e2: Exception) {
                        Log.e(TAG, "Fallback also failed: ${e2.javaClass.simpleName}: ${e2.message}")
                        e2.printStackTrace()
                        promise.reject("PERMISSION_ERROR", "Não foi possível abrir permissões: ${e2.message}")
                    }
                }

            } catch (e: Exception) {
                Log.e(TAG, "requestPermissions error: ${e.javaClass.simpleName}: ${e.message}")
                e.printStackTrace()
                pendingPermissionPromise = null
                
                // ActivityNotFoundException = Health Connect não instalado
                if (e is android.content.ActivityNotFoundException) {
                    Log.e(TAG, "ActivityNotFoundException - Health Connect not found")
                    promise.reject("NOT_INSTALLED", "Health Connect não está instalado no dispositivo")
                } else {
                    promise.reject("PERMISSION_ERROR", e.message)
                }
            }
        }
    }

    // ─── getTodayData ─────────────────────────────────────────

    @ReactMethod
    fun getTodayData(promise: Promise) {
        val client = healthConnectClient ?: run {
            promise.reject("NOT_AVAILABLE", "Health Connect não inicializado")
            return
        }

        scope.launch {
            try {
                val now = Instant.now()
                val startOfDay = ZonedDateTime.now(ZoneId.systemDefault())
                    .truncatedTo(ChronoUnit.DAYS)
                    .toInstant()

                val timeRange = TimeRangeFilter.between(startOfDay, now)

                var totalSteps = 0L
                try {
                    val r = client.readRecords(ReadRecordsRequest(StepsRecord::class, timeRange))
                    totalSteps = r.records.sumOf { it.count }
                    Log.d(TAG, "Steps: $totalSteps")
                } catch (e: Exception) {
                    Log.w(TAG, "Erro passos: ${e.message}")
                }

                var totalCalories = 0.0
                try {
                    val r = client.readRecords(
                        ReadRecordsRequest(ActiveCaloriesBurnedRecord::class, timeRange)
                    )
                    totalCalories = r.records.sumOf { it.energy.inKilocalories }

                    if (totalCalories == 0.0) {
                        val rt = client.readRecords(
                            ReadRecordsRequest(TotalCaloriesBurnedRecord::class, timeRange)
                        )
                        if (rt.records.isNotEmpty()) {
                            val total = rt.records.sumOf { it.energy.inKilocalories }
                            totalCalories = (total * 0.25).coerceAtLeast(0.0)
                        }
                    }
                    Log.d(TAG, "Calories: $totalCalories kcal")
                } catch (e: Exception) {
                    Log.w(TAG, "Erro calorias: ${e.message}")
                }

                var totalDistance = 0.0
                try {
                    val r = client.readRecords(ReadRecordsRequest(DistanceRecord::class, timeRange))
                    totalDistance = r.records.sumOf { it.distance.inKilometers }
                    Log.d(TAG, "Distance: $totalDistance km")
                } catch (e: Exception) {
                    Log.w(TAG, "Erro distância: ${e.message}")
                }

                val result = Arguments.createMap().apply {
                    putDouble("steps", totalSteps.toDouble())
                    putDouble("calories", Math.round(totalCalories).toDouble())
                    putDouble("distance", Math.round(totalDistance * 100.0) / 100.0)
                    putString("source", "health_connect")
                    putBoolean("success", true)
                }

                promise.resolve(result)

            } catch (e: SecurityException) {
                Log.e(TAG, "SecurityException", e)
                promise.reject("NO_PERMISSION", "Permissões não concedidas")
            } catch (e: Exception) {
                Log.e(TAG, "getTodayData error", e)
                promise.reject("READ_ERROR", e.message)
            }
        }
    }

    // ─── openHealthConnect ────────────────────────────────────

    @ReactMethod
    fun openHealthConnect(promise: Promise) {
        try {
            val intent = Intent("androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS").apply {
                putExtra("android.intent.extra.PACKAGE_NAME", reactContext.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            try {
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    data = android.net.Uri.parse(
                        "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"
                    )
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
            } catch (e2: Exception) {
                promise.reject("OPEN_ERROR", e2.message)
            }
        }
    }

    // ─── checkInstalledHealthApps ─────────────────────────────

    @ReactMethod
    fun checkInstalledHealthApps(promise: Promise) {
        val pm = reactContext.packageManager
        val result = Arguments.createMap()

        mapOf(
            "samsung"       to "com.sec.android.app.shealth",
            "googleFit"     to "com.google.android.apps.fitness",
            "healthConnect" to "com.google.android.apps.healthdata",
            "garmin"        to "com.garmin.android.apps.connectmobile",
            "fitbit"        to "com.fitbit.FitbitMobile",
            "strava"        to "com.strava",
        ).forEach { (key, pkg) ->
            result.putBoolean(key, try {
                pm.getPackageInfo(pkg, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            })
        }

        promise.resolve(result)
    }

    // ─── Cleanup ──────────────────────────────────────────────

    override fun onCatalystInstanceDestroy() {
        scope.cancel()
        pendingPermissionPromise = null
        reactContext.removeActivityEventListener(activityEventListener)
        super.onCatalystInstanceDestroy()
    }
}
