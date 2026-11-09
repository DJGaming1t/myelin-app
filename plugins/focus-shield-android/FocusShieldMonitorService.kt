package com.djgaming1t.myelin.focusshield

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
  private var lastKnownForegroundPkg: String? = null
  private var lastActivityLaunchAtMs: Long = 0L
  private var permissionWarningLogged: Boolean = false

  private val pollRunnable = object : Runnable {
    override fun run() {
      try {
        evaluateForegroundTick()
      } catch (_: Exception) {
      } finally {
        monitorHandler?.postDelayed(this, POLL_INTERVAL_MS)
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
      stopForeground(true)
      stopSelf()
      return START_NOT_STICKY
    }

    val state = FocusShieldStore.loadState(this)
    val now = System.currentTimeMillis()
    if (!state.isEnforcementActive(now)) {
      removeOverlayOnMain()
      stopForeground(true)
      stopSelf()
      return START_NOT_STICKY
    }

    startMonitorForeground(state)
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
      val defaultSms = Telephony.Sms.getDefaultSmsPackage(this)
      if (!defaultSms.isNullOrEmpty() && pkg == defaultSms) return true
    } catch (_: Exception) {}

    try {
      val defaultIme = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
      if (!defaultIme.isNullOrEmpty() && defaultIme.startsWith("$pkg/")) return true
    } catch (_: Exception) {}

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
    val events = usm.queryEvents(now - 5000L, now)
    val event = UsageEvents.Event()
    var latestResumed: String? = null
    var latestTimestamp = 0L

    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED && event.timeStamp >= latestTimestamp) {
        val pkg = event.packageName
        if (!pkg.isNullOrEmpty()) {
          latestResumed = pkg
          latestTimestamp = event.timeStamp
        }
      }
    }

    if (latestResumed != null) {
      lastKnownForegroundPkg = latestResumed
      return latestResumed
    }

    val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 60_000L, now)
    val recentStat = stats?.maxByOrNull { it.lastTimeUsed }
    if (recentStat != null && now - recentStat.lastTimeUsed <= 15_000L) {
      lastKnownForegroundPkg = recentStat.packageName
    }
    return lastKnownForegroundPkg
  }

  private fun evaluateForegroundTick() {
    val state = FocusShieldStore.loadState(this)
    val now = System.currentTimeMillis()

    if (!state.isEnforcementActive(now)) {
      removeOverlayOnMain()
      stopForeground(true)
      stopSelf()
      return
    }

    if (!hasUsageStatsPermission(this)) {
      if (!permissionWarningLogged) {
        permissionWarningLogged = true
        FocusShieldStore.appendInterceptEvent(
          context = this,
          packageName = packageName,
          appLabel = "Usage Access Revoked",
          vector = "permission-revoked",
          outcome = "bypassed"
        )
      }
      return
    }
    permissionWarningLogged = false

    // Temporary break pass active
    if (now < state.breakPassExpiresAtMs) {
      removeOverlayOnMain()
      return
    }

    val fgPkg = detectForegroundPackage(now) ?: return

    if (fgPkg == packageName || isSystemOrEssentialPackage(fgPkg) || fgPkg in state.allowlistedPackages) {
      if (currentlyInterceptedPkg != null && fgPkg == packageName) {
        removeOverlayOnMain()
      }
      return
    }

    if (fgPkg in state.blockedPackages) {
      val appLabel = resolveAppLabel(fgPkg)
      showInterceptionOnMain(fgPkg, appLabel)
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

  private fun showInterceptionOnMain(blockedPkg: String, blockedLabel: String) {
    mainHandler.post {
      if (currentlyInterceptedPkg == blockedPkg && overlayView != null) {
        return@post
      }
      removeOverlayImmediate()
      currentlyInterceptedPkg = blockedPkg

      val updatedState = FocusShieldStore.recordInterceptionAttempt(this)

      if (Settings.canDrawOverlays(this) && windowManager != null) {
        val (view, cleanup) = FocusShieldUiFactory.buildBlockingView(
          context = this,
          state = updatedState,
          blockedPackage = blockedPkg,
          blockedLabel = blockedLabel,
          onReturnToMyelin = { parkedThought ->
            FocusShieldStore.appendInterceptEvent(
              context = this,
              packageName = blockedPkg,
              appLabel = blockedLabel,
              vector = "blocked-app",
              outcome = if (parkedThought.isNullOrBlank()) "returned" else "parked",
              parkedThought = parkedThought
            )
            removeOverlayImmediate()
            FocusShieldUiFactory.bringMyelinToFront(this)
          },
          onGrantBreakPass = {
            FocusShieldStore.grantTemporaryBreakPass(this, blockedPkg, blockedLabel)
            removeOverlayImmediate()
          },
          onEmergencyOverride = {
            FocusShieldStore.grantEmergencyOverride(this, blockedPkg, blockedLabel)
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
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
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

      // Fallback to full-screen blocker activity if overlay could not be attached
      val now = System.currentTimeMillis()
      if (now - lastActivityLaunchAtMs >= 1500L) {
        lastActivityLaunchAtMs = now
        val blockerIntent = Intent(this, FocusShieldBlockerActivity::class.java).apply {
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_ACTIVITY_CLEAR_TOP
          )
          putExtra("blockedPackage", blockedPkg)
          putExtra("blockedLabel", blockedLabel)
        }
        try {
          startActivity(blockerIntent)
        } catch (_: Exception) {}
      }
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
    if (view != null) {
      try {
        windowManager?.removeViewImmediate(view)
      } catch (_: Exception) {}
    }
  }

  override fun onDestroy() {
    monitorHandler?.removeCallbacksAndMessages(null)
    monitorThread?.quitSafely()
    removeOverlayImmediate()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
