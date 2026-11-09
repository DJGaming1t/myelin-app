package com.djgaming1t.myelin.focusshield

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build

/**
 * FocusShieldScheduleReceiver (Chunk C)
 *
 * Evaluates active MYELIN Focus sessions and recurring schedule windows across:
 *   - Device reboots (ACTION_BOOT_COMPLETED)
 *   - App updates (ACTION_MY_PACKAGE_REPLACED)
 *   - Clock / timezone changes (ACTION_TIME_CHANGED, ACTION_TIMEZONE_CHANGED)
 *   - Scheduled window transitions (ACTION_EVALUATE)
 *
 * Uses AlarmManager.setWindow(...) (inexact window alarm) so MYELIN never requires
 * SCHEDULE_EXACT_ALARM or USE_EXACT_ALARM (which are blocked in app.json).
 */
class FocusShieldScheduleReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_EVALUATE = "com.djgaming1t.myelin.focusshield.SCHEDULE_EVALUATE"
    private const val ALARM_REQUEST_CODE = 4125
    private const val ALARM_WINDOW_LENGTH_MS = 60_000L

    fun evaluateAndScheduleNext(context: Context) {
      val appContext = context.applicationContext
      val now = System.currentTimeMillis()
      val state = FocusShieldStore.loadState(appContext)
      val enforcementActive = state.isEnforcementActive(now)

      // 1. Start or stop FocusShieldMonitorService (App Blocker)
      val shouldRunAppMonitor = enforcementActive && state.blockedPackages.isNotEmpty()
      val appIntent = Intent(appContext, FocusShieldMonitorService::class.java).apply {
        action = if (shouldRunAppMonitor) {
          FocusShieldMonitorService.ACTION_START_OR_SYNC
        } else {
          FocusShieldMonitorService.ACTION_STOP
        }
      }
      try {
        if (shouldRunAppMonitor) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            appContext.startForegroundService(appIntent)
          } else {
            appContext.startService(appIntent)
          }
        } else {
          appContext.stopService(appIntent)
        }
      } catch (_: Exception) {
        // Android 12+ may restrict background FGS starts on certain OEMs if battery optimization is active
      }

      // 2. Start or stop FocusShieldDnsVpnService (Local DNS Website Filter)
      val vpnPrepared = try {
        VpnService.prepare(appContext) == null
      } catch (_: Exception) {
        false
      }
      val otherVpnActive = FocusShieldDnsVpnService.isOtherVpnActive(appContext)
      val shouldRunDnsVpn =
        enforcementActive &&
          state.websiteBlockingEnabled &&
          state.blockedDomains.isNotEmpty() &&
          vpnPrepared &&
          !otherVpnActive

      val vpnIntent = Intent(appContext, FocusShieldDnsVpnService::class.java).apply {
        action = if (shouldRunDnsVpn) {
          FocusShieldDnsVpnService.ACTION_START_OR_SYNC
        } else {
          FocusShieldDnsVpnService.ACTION_STOP
        }
      }
      try {
        if (shouldRunDnsVpn) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            appContext.startForegroundService(vpnIntent)
          } else {
            appContext.startService(vpnIntent)
          }
        } else {
          appContext.stopService(vpnIntent)
        }
      } catch (_: Exception) {}

      // 3. Schedule next boundary transition alarm via AlarmManager.setWindow (no exact alarm permission required)
      scheduleNextBoundaryAlarm(appContext, state, now)
    }

    private fun scheduleNextBoundaryAlarm(
      context: Context,
      state: ShieldSessionState,
      nowMs: Long
    ) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      val evalIntent = Intent(context, FocusShieldScheduleReceiver::class.java).apply {
        action = ACTION_EVALUATE
      }
      val pendingIntent = PendingIntent.getBroadcast(
        context,
        ALARM_REQUEST_CODE,
        evalIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val candidates = mutableListOf<Long>()
      if (state.active && state.phase == "focus" && state.sessionEndEpochMs > nowMs + 2_000L) {
        candidates.add(state.sessionEndEpochMs)
      }
      if (!state.sessionOnly && state.mode != "off" && state.nextScheduleTransitionEpochMs > nowMs + 2_000L) {
        candidates.add(state.nextScheduleTransitionEpochMs)
      }

      val nextBoundaryMs = candidates.minOrNull()
      if (nextBoundaryMs == null) {
        try {
          alarmManager.cancel(pendingIntent)
        } catch (_: Exception) {}
        return
      }

      try {
        alarmManager.setWindow(
          AlarmManager.RTC_WAKEUP,
          nextBoundaryMs,
          ALARM_WINDOW_LENGTH_MS,
          pendingIntent
        )
      } catch (_: Exception) {}
    }
  }

  override fun onReceive(context: Context?, intent: Intent?) {
    if (context == null) return
    evaluateAndScheduleNext(context)
  }
}
