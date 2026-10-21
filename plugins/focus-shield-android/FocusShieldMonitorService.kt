package com.djgaming1t.myelin.focusshield

import android.app.KeyguardManager
import android.os.PowerManager
import android.telecom.TelecomManager
import android.app.AppOpsManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.Process
import android.provider.Settings
import android.provider.Telephony
import android.view.Gravity
import android.view.View
import android.view.WindowManager

class FocusShieldMonitorService : Service() {
  companion object {
    const val CHANNEL_ID = "myelin_focus_shield_channel"
    const val NOTIFICATION_ID = 4109
    const val ACTION_START_OR_SYNC = "com.djgaming1t.myelin.focusshield.START_OR_SYNC"
    const val ACTION_STOP = "com.djgaming1t.myelin.focusshield.STOP"
    private const val POLL_INTERVAL_MS = 400L

    private val HARDCODED_SAFE_PACKAGES = setOf(
      "android",
      "com.android.settings",
      "com.google.android.deskclock",
      "com.android.deskclock",
      "com.android.systemui",
      "com.android.incallui",
      "com.google.android.dialer",
      "com.android.dialer",
      "com.android.server.telecom",
      "com.android.phone",
      "com.android.emergency",
      "com.google.android.permissioncontroller",
      "com.android.permissioncontroller",
      "com.android.packageinstaller",
      "com.google.android.packageinstaller"
    )

    fun hasUsageStatsPermission(context: Context): Boolean {
      val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          context.packageName
        )
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          context.packageName
        )
      }
      return mode == AppOpsManager.MODE_ALLOWED
    }
  }

  private var monitorThread: HandlerThread? = null
  private var monitorHandler: Handler? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var overlayCleanup: (() -> Unit)? = null
  private var currentlyInterceptedPkg: String? = null
  private var interceptedState: ShieldSessionState? = null
  private var lastKnownForegroundPkg: String? = null
  @Volatile private var destroyed = false
  private var hasScannedEvents = false
  private var permissionWarningLogged: Boolean = false

  private val pollRunnable = object : Runnable {
    override fun run() {
      try {
        evaluateForegroundTick()
      } catch (_: Exception) {
        removeOverlayOnMain()
        stopSelf()
      } finally {
        if (!destroyed) {
          val interactive = (getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isInteractive == true
          monitorHandler?.postDelayed(this, if (interactive) POLL_INTERVAL_MS else 2000L)
        }
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    createNotificationChannel()
    val thread = HandlerThread("MyelinFocusShieldMonitor", Process.THREAD_PRIORITY_BACKGROUND)
    thread.start()
    monitorThread = thread
    monitorHandler = Handler(thread.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      removeOverlayOnMain()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    val state = FocusShieldStore.loadState(this)
    val now = System.currentTimeMillis()
    if (!state.isEnforcementActive(now)) {
      removeOverlayOnMain()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    if (!hasUsageStatsPermission(this) || !Settings.canDrawOverlays(this)) {
      removeOverlayOnMain()
      stopSelf()
      return START_NOT_STICKY
    }
    try { startMonitorForeground(state) } catch (_: Exception) {
      stopSelf()
      return START_NOT_STICKY
    }
    monitorHandler?.removeCallbacks(pollRunnable)
    monitorHandler?.post(pollRunnable)
    return START_STICKY
  }

  private fun startMonitorForeground(state: ShieldSessionState) {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    val notification = builder
      .setContentTitle("Focus Shield active · ${state.effectiveTopicName}")
      .setContentText("Guarding ${state.blockedPackages.size} selected apps · Tap to return to MYELIN")
      .setSmallIcon(applicationInfo.icon)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
      val channel = NotificationChannel(
        CHANNEL_ID,
        "MYELIN Focus Shield",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Shows when MYELIN Focus Shield is actively guarding your study block."
        setShowBadge(false)
      }
      mgr.createNotificationChannel(channel)
    }
  }

  private fun isSystemOrEssentialPackage(pkg: String): Boolean {
    if (pkg == packageName || pkg in HARDCODED_SAFE_PACKAGES) return true

    try {
      val telecom = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
      if (pkg == telecom?.defaultDialerPackage || pkg == telecom?.systemDialerPackage) return true
      val dialers = packageManager.queryIntentActivities(Intent(Intent.ACTION_DIAL), PackageManager.MATCH_DEFAULT_ONLY)
      if (dialers.any { it.activityInfo?.packageName == pkg }) return true
    } catch (_: Exception) {}
    // Never block default SMS app
    try {
      val defaultSms = Telephony.Sms.getDefaultSmsPackage(this)
      if (!defaultSms.isNullOrEmpty() && pkg == defaultSms) return true
    } catch (_: Exception) {}

    // Never block active input method / keyboard
    try {
      val defaultIme = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
      if (!defaultIme.isNullOrEmpty() && defaultIme.startsWith("$pkg/")) return true
    } catch (_: Exception) {}

    // Never block default Home launcher
    try {
      val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      val homeInfo = packageManager.resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY)
      val launcherPkg = homeInfo?.activityInfo?.packageName
      if (!launcherPkg.isNullOrEmpty() && pkg == launcherPkg) return true
    } catch (_: Exception) {}

    return false
  }

  private fun detectForegroundPackage(now: Long): String? {
    val usm = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return null
    val events = usm.queryEvents(if (hasScannedEvents) now - 5000L else now - 24L * 60L * 60_000L, now) ?: return null
    hasScannedEvents = true
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      when (event.eventType) {
        UsageEvents.Event.ACTIVITY_RESUMED -> lastKnownForegroundPkg = event.packageName
        UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> {
          if (event.packageName == lastKnownForegroundPkg) lastKnownForegroundPkg = null
        }
      }
    }
    return lastKnownForegroundPkg
  }

  private fun evaluateForegroundTick() {
    val state = FocusShieldStore.loadState(this)
    val now = System.currentTimeMillis()

    if (!state.isEnforcementActive(now)) {
      removeOverlayOnMain()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return
    }

    if (!hasUsageStatsPermission(this) || !Settings.canDrawOverlays(this)) {
      if (!permissionWarningLogged) {
        permissionWarningLogged = true
        FocusShieldStore.appendInterceptEvent(
          context = this,
          packageName = packageName,
          appLabel = "Focus Shield permission revoked",
          vector = "permission-revoked",
          outcome = "bypassed",
          expected = state
        )
      }
      removeOverlayOnMain()
      stopSelf()
      return
    }
    permissionWarningLogged = false

    val power = getSystemService(Context.POWER_SERVICE) as? PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    if (power?.isInteractive != true || keyguard?.isKeyguardLocked == true) {
      lastKnownForegroundPkg = null
      removeOverlayOnMain()
      return
    }
    // Temporary break pass active
    if (now < state.breakPassExpiresAtMs) {
      removeOverlayOnMain()
      return
    }

    val fgPkg = detectForegroundPackage(now)
    if (fgPkg == null) { removeOverlayOnMain(); return }

    if (fgPkg !in state.blockedPackages || fgPkg == packageName || isSystemOrEssentialPackage(fgPkg) || fgPkg in state.allowlistedPackages) {
      removeOverlayOnMain()
      return
    }

    if (fgPkg in state.blockedPackages) {
      val appLabel = resolveAppLabel(fgPkg)
      showInterceptionOnMain(state, fgPkg, appLabel)
    } else {
      removeOverlayOnMain()
    }
  }

  private fun resolveAppLabel(pkg: String): String {
    return try {
      val info = packageManager.getApplicationInfo(pkg, 0)
      packageManager.getApplicationLabel(info).toString()
    } catch (_: PackageManager.NameNotFoundException) {
      pkg.substringAfterLast('.')
    }
  }

  private fun showInterceptionOnMain(state: ShieldSessionState, blockedPkg: String, blockedLabel: String) {
    mainHandler.post {
      val latest = FocusShieldStore.loadState(this)
      if (destroyed || !latest.isEnforcementActive() || !latest.sameIdentity(state) ||
          System.currentTimeMillis() < latest.breakPassExpiresAtMs ||
          blockedPkg !in latest.blockedPackages || blockedPkg in latest.allowlistedPackages ||
          isSystemOrEssentialPackage(blockedPkg) || !Settings.canDrawOverlays(this) ||
          !hasUsageStatsPermission(this)) return@post
      if (currentlyInterceptedPkg == blockedPkg && overlayView != null && interceptedState?.sameIdentity(latest) == true) {
        return@post
      }
      removeOverlayImmediate()
      currentlyInterceptedPkg = blockedPkg

      if (Settings.canDrawOverlays(this) && windowManager != null) {
        val countedState = FocusShieldStore.recordInterceptionAttempt(this, latest) ?: return@post
        interceptedState = countedState
        val (view, cleanup) = FocusShieldUiFactory.buildBlockingView(
          context = this,
          state = countedState,
          blockedPackage = blockedPkg,
          blockedLabel = blockedLabel,
          onReturnToMyelin = returnToMyelin@ { parkedThought ->
            if (interceptedState?.sameIdentity(countedState) != true) return@returnToMyelin
            val recorded = FocusShieldStore.appendInterceptEvent(
              context = this,
              packageName = blockedPkg,
              appLabel = blockedLabel,
              vector = "blocked-app",
              outcome = if (parkedThought.isNullOrBlank()) "returned" else "parked",
              parkedThought = parkedThought,
              expected = countedState
            )
            removeOverlayImmediate()
            if (recorded) FocusShieldUiFactory.bringMyelinToFront(this)
          },
          onGrantBreakPass = grantBreak@ {
            if (interceptedState?.sameIdentity(countedState) != true) return@grantBreak
            FocusShieldStore.grantTemporaryBreakPass(this, blockedPkg, blockedLabel, countedState)
            removeOverlayImmediate()
          },
          onEmergencyOverride = emergencyOverride@ {
            if (interceptedState?.sameIdentity(countedState) != true) return@emergencyOverride
            FocusShieldStore.grantEmergencyOverride(this, blockedPkg, blockedLabel, countedState)
            removeOverlayImmediate()
          }
        )

        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.MATCH_PARENT,
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
          } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
          },
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
          PixelFormat.TRANSLUCENT
        ).apply {
          gravity = Gravity.CENTER
        }

        try {
          windowManager?.addView(view, params)
          overlayView = view
          overlayCleanup = cleanup
          return@post
        } catch (_: Exception) {
          cleanup()
        }
      }

      // Overlay failure must not cause unreliable repeated background launches.
      FocusShieldStore.appendInterceptEvent(this, blockedPkg, blockedLabel, "permission-revoked", "bypassed", expected = latest)
      stopSelf()
    }
  }

  private fun removeOverlayOnMain() {
    mainHandler.post {
      removeOverlayImmediate()
    }
  }

  private fun removeOverlayImmediate() {
    overlayCleanup?.invoke()
    overlayCleanup = null
    val view = overlayView
    overlayView = null
    currentlyInterceptedPkg = null
    interceptedState = null
    if (view != null) {
      try {
        windowManager?.removeViewImmediate(view)
      } catch (_: Exception) {}
    }
  }

  override fun onDestroy() {
    destroyed = true
    mainHandler.removeCallbacksAndMessages(null)
    monitorHandler?.removeCallbacksAndMessages(null)
    monitorThread?.quitSafely()
    removeOverlayImmediate()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
