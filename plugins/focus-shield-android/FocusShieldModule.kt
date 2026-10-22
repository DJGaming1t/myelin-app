package com.djgaming1t.myelin.focusshield

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

class FocusShieldModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val REQ_CODE_PREPARE_VPN = 4119
  }

  private val bgExecutor = Executors.newSingleThreadExecutor()
  private val iconCache = mutableMapOf<String, String>()
  private var pendingVpnPromise: Promise? = null

  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?
    ) {
      if (requestCode != REQ_CODE_PREPARE_VPN) return
      val promise = pendingVpnPromise ?: return
      pendingVpnPromise = null
      try {
        val context = reactContext.applicationContext
        val prepared = VpnService.prepare(context) == null
        val otherVpn = FocusShieldDnsVpnService.isOtherVpnActive(context)
        val map = Arguments.createMap().apply {
          putBoolean("granted", resultCode == Activity.RESULT_OK && prepared)
          putBoolean("vpnPrepared", prepared)
          putBoolean("otherVpnActive", otherVpn)
        }
        promise.resolve(map)
      } catch (e: Exception) {
        promise.reject("ERR_VPN_RESULT", e)
      }
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "MyelinFocusShield"

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val usageGranted = FocusShieldMonitorService.hasUsageStatsPermission(context)
      val overlayGranted = Settings.canDrawOverlays(context)
      val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
      val batteryIgnored = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false

      val vpnPrepared = try {
        VpnService.prepare(context) == null
      } catch (_: Exception) {
        false
      }
      val vpnActive = FocusShieldDnsVpnService.isRunning
      val otherVpnActive = FocusShieldDnsVpnService.isOtherVpnActive(context)
      val state = FocusShieldStore.loadState(context)

      val act = reactContext.currentActivity
      val isMultiWindow = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && act != null) {
        act.isInMultiWindowMode
      } else {
        false
      }
      val isPip = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && act != null) {
        act.isInPictureInPictureMode
      } else {
        false
      }

      val map = Arguments.createMap().apply {
        putBoolean("nativeModuleInstalled", true)
        putBoolean("usageStatsGranted", usageGranted)
        putBoolean("overlayGranted", overlayGranted)
        putBoolean("batteryOptimizationIgnored", batteryIgnored)
        putBoolean("vpnPrepared", vpnPrepared)
        putBoolean("vpnActive", vpnActive)
        putBoolean("privateDnsActive", FocusShieldDnsVpnService.privateDnsActive(context))
        putString("vpnError", if (!FocusShieldDnsVpnService.canStart(context, state))
          "Website filter paused after a DNS failure. App blocking is still available. Tap Retry website filter when ready."
          else FocusShieldDnsVpnService.lastError)
        putBoolean("otherVpnActive", otherVpnActive)
        putBoolean("scheduleActiveNow", state.scheduleActiveNow)
        putString("activeScheduleLabel", state.activeScheduleLabel)
        putBoolean("isInMultiWindowMode", isMultiWindow)
        putBoolean("isInPictureInPictureMode", isPip)
      }
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("ERR_PERMISSION_STATUS", e)
    }
  }

  @ReactMethod
  fun prepareWebsiteVpn(promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val otherVpn = FocusShieldDnsVpnService.isOtherVpnActive(context)
      if (otherVpn) {
        promise.resolve(Arguments.createMap().apply { putBoolean("granted", false); putBoolean("vpnPrepared", false); putBoolean("otherVpnActive", true) })
        return
      }
      val prepIntent = VpnService.prepare(context)
      if (prepIntent == null) {
        // This method is invoked by an explicit tap, so it is safe to retry a paused filter.
        FocusShieldDnsVpnService.retryAfterFailure(context)
        FocusShieldScheduleReceiver.evaluateAndScheduleNext(context, allowStart = true)
        val map = Arguments.createMap().apply {
          putBoolean("granted", true)
          putBoolean("vpnPrepared", true)
          putBoolean("otherVpnActive", otherVpn)
        }
        promise.resolve(map)
        return
      }

      val activity = reactContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "Open MYELIN in the foreground to authorize the local DNS VPN.")
        return
      }

      activity.runOnUiThread {
        if (pendingVpnPromise != null) promise.reject("ERR_VPN_PENDING", "A VPN authorization request is already open.")
        else try { pendingVpnPromise = promise; activity.startActivityForResult(prepIntent, REQ_CODE_PREPARE_VPN) }
        catch (e: Exception) { pendingVpnPromise = null; promise.reject("ERR_PREPARE_VPN", e) }
      }
    } catch (e: Exception) {
      pendingVpnPromise = null
      promise.reject("ERR_PREPARE_VPN", e)
    }
  }

  @ReactMethod
  fun openPermissionSettings(kind: String, promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val pkgUri = Uri.parse("package:${context.packageName}")
      val primaryIntent = when (kind) {
        "usage-access" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
          data = pkgUri
        }
        "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri)
        "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        "vpn" -> Intent(Settings.ACTION_VPN_SETTINGS)
        else -> Intent("android.settings.ZEN_MODE_SETTINGS")
      }
      primaryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(primaryIntent)
        promise.resolve(true)
        return
      } catch (_: Exception) {
        val fallbackAction = when (kind) {
          "usage-access" -> Settings.ACTION_USAGE_ACCESS_SETTINGS
          "overlay" -> Settings.ACTION_MANAGE_OVERLAY_PERMISSION
          "battery" -> Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
          "vpn" -> Settings.ACTION_VPN_SETTINGS
          else -> Settings.ACTION_SETTINGS
        }
        val fallbackIntent = Intent(fallbackAction).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
          context.startActivity(fallbackIntent)
          promise.resolve(true)
          return
        } catch (_: Exception) {
          context.startActivity(
            Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
          promise.resolve(true)
        }
      }
    } catch (e: Exception) {
      promise.reject("ERR_OPEN_SETTINGS", e)
    }
  }

  @ReactMethod
  fun getInstalledApps(promise: Promise) {
    bgExecutor.execute {
      try {
        val pm = reactContext.packageManager
        val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
          addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val resolveList = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          pm.queryIntentActivities(mainIntent, PackageManager.ResolveInfoFlags.of(0L))
        } else {
          @Suppress("DEPRECATION")
          pm.queryIntentActivities(mainIntent, 0)
        }

        val seenPackages = mutableSetOf<String>()
        val items = mutableListOf<Triple<String, String, ApplicationInfo?>>()

        for (resolveInfo in resolveList) {
          val activityInfo = resolveInfo.activityInfo ?: continue
          val pkg = activityInfo.packageName ?: continue
          if (pkg == reactContext.packageName || !seenPackages.add(pkg)) continue
          val label = resolveInfo.loadLabel(pm)?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: pkg
          items.add(Triple(pkg, label, activityInfo.applicationInfo))
        }

        items.sortBy { it.second.lowercase() }

        val array = Arguments.createArray()
        for ((pkg, label, appInfo) in items) {
          val category = classifyPackage(pkg, label, appInfo)
          val isEmergency = pkg in setOf(
            "com.google.android.dialer",
            "com.android.dialer",
            "com.google.android.apps.messaging",
            "com.android.mms",
            "com.google.android.deskclock",
            "com.android.deskclock",
            "com.android.settings"
          )
          val iconUri = iconCache.getOrPut(pkg) {
            try {
              drawableToBase64Uri(pm.getApplicationIcon(pkg))
            } catch (_: Exception) {
              ""
            }
          }

          val map = Arguments.createMap().apply {
            putString("packageName", pkg)
            putString("label", label)
            putString("category", category)
            putBoolean("isSystemEmergency", isEmergency)
            if (iconUri.isNotEmpty()) {
              putString("iconUri", iconUri)
            }
          }
          array.pushMap(map)
        }
        promise.resolve(array)
      } catch (e: Exception) {
        promise.reject("ERR_GET_INSTALLED_APPS", e)
      }
    }
  }

  @ReactMethod
  fun syncSessionState(payloadJson: String, promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val state = FocusShieldStore.saveSessionPayload(context, payloadJson)
      val enforcementActive = state.isEnforcementActive()

      // Apply Android 12+ HIDE_OVERLAY_WINDOWS on MYELIN's own activity while active
      val act = reactContext.currentActivity
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && act != null) {
        act.runOnUiThread {
          try {
            act.window.setHideOverlayWindows(enforcementActive && state.blockFloatingWindows)
          } catch (_: Exception) {}
        }
      }

      // Delegate service start/stop and AlarmManager.setWindow boundary scheduling to FocusShieldScheduleReceiver
      val ready = FocusShieldScheduleReceiver.evaluateAndScheduleNext(context, allowStart = true)

      promise.resolve(ready)
    } catch (e: Exception) {
      promise.reject("ERR_SYNC_SESSION", e)
    }
  }

  @ReactMethod
  fun consumeInterceptEvents(promise: Promise) {
    try {
      val json = FocusShieldStore.consumeInterceptEvents(reactContext.applicationContext)
      promise.resolve(json)
    } catch (e: Exception) {
      promise.reject("ERR_CONSUME_EVENTS", e)
    }
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(activityEventListener)
    pendingVpnPromise?.reject("ERR_MODULE_CLOSED", "VPN request closed with the app.")
    pendingVpnPromise = null
    bgExecutor.shutdownNow()
    super.invalidate()
  }

  private fun classifyPackage(pkg: String, label: String, appInfo: ApplicationInfo?): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && appInfo != null) {
      when (appInfo.category) {
        ApplicationInfo.CATEGORY_GAME -> return "gaming"
        ApplicationInfo.CATEGORY_SOCIAL -> return "social"
        ApplicationInfo.CATEGORY_VIDEO -> return "video"
      }
    }
    val combined = "$pkg $label".lowercase()
    return when {
      Regex("youtube|tiktok|musically|twitch|netflix|primevideo|hotstar|iqiyi|viki").containsMatchIn(combined) -> "video"
      Regex("instagram|reddit|twitter|x\\.com|snapchat|facebook|threads|pinterest").containsMatchIn(combined) -> "social"
      Regex("discord|whatsapp|telegram|messenger|signal").containsMatchIn(combined) -> "messaging"
      Regex("minecraft|genshin|mihoyo|hoyoverse|starrail|zenless|roblox|game").containsMatchIn(combined) -> "gaming"
      else -> "custom"
    }
  }

  private fun drawableToBase64Uri(drawable: Drawable): String {
    val sizePx = 72
    val bitmap = if (drawable is BitmapDrawable && drawable.bitmap != null) {
      Bitmap.createScaledBitmap(drawable.bitmap, sizePx, sizePx, true)
    } else {
      val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bmp)
      drawable.setBounds(0, 0, canvas.width, canvas.height)
      drawable.draw(canvas)
      bmp
    }
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 85, out)
    val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    return "data:image/png;base64,$b64"
  }
}
