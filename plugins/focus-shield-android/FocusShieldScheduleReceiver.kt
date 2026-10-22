package com.djgaming1t.myelin.focusshield

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.net.VpnService
import android.provider.Settings

/** Inexact alarms are reminders, not an exemption from Android's background FGS limits. */
class FocusShieldScheduleReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_EVALUATE = "com.djgaming1t.myelin.focusshield.SCHEDULE_EVALUATE"
    fun evaluateAndScheduleNext(context: Context, allowStart: Boolean = false): Boolean {
      val state = FocusShieldStore.loadState(context)
      val active = state.isEnforcementActive()
      val appIntent = Intent(context, FocusShieldMonitorService::class.java)
      val vpnIntent = Intent(context, FocusShieldDnsVpnService::class.java)
      var ready = true
      val needsApps = active && state.blockedPackages.isNotEmpty()
      val needsWeb = active && state.websiteBlockingEnabled && state.blockedDomains.isNotEmpty()
      if (!needsApps) context.stopService(appIntent)
      else if (allowStart) {
        if (!Settings.canDrawOverlays(context) || !FocusShieldMonitorService.hasUsageStatsPermission(context)) ready = false
        else try { context.startForegroundService(appIntent) } catch (_: Exception) { ready = false }
      }
      if (!needsWeb) context.stopService(vpnIntent)
      else if (allowStart) {
        if (VpnService.prepare(context) != null || FocusShieldDnsVpnService.isOtherVpnActive(context) ||
            FocusShieldDnsVpnService.privateDnsActive(context) || !FocusShieldDnsVpnService.canStart(context, state)) ready = false
        else try { context.startForegroundService(vpnIntent) } catch (_: Exception) { ready = false }
      }
      if (!allowStart && active) notifyScheduled(context, state)
      else if (!active) context.getSystemService(NotificationManager::class.java)?.cancel(4126)
      scheduleNext(context, state)
      return ready
    }
    private fun notifyScheduled(context: Context, state: ShieldSessionState) {
      val manager = context.getSystemService(NotificationManager::class.java) ?: return
      val channel = "myelin_shield_schedules"
      manager.createNotificationChannel(NotificationChannel(channel, "Focus Shield schedules", NotificationManager.IMPORTANCE_DEFAULT))
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
      val pending = PendingIntent.getActivity(context, 4126, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      try {
        manager.notify(4126, Notification.Builder(context, channel).setSmallIcon(context.applicationInfo.icon)
          .setContentTitle("${state.activeScheduleLabel.ifEmpty { "Focus Shield" }} is due")
          .setContentText("Tap to open MYELIN and activate scheduled blocking.")
          .setContentIntent(pending).setAutoCancel(true).build())
      } catch (_: SecurityException) { /* Notifications may be denied; foreground sync still works. */ }
    }
    private fun scheduleNext(context: Context, state: ShieldSessionState) {
      val alarms = context.getSystemService(AlarmManager::class.java) ?: return
      val pending = PendingIntent.getBroadcast(context, 4125, Intent(context, FocusShieldScheduleReceiver::class.java)
        .setAction(ACTION_EVALUATE), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val now = System.currentTimeMillis()
      val next = listOf(if (state.active) state.sessionEndEpochMs else 0,
        if (!state.sessionOnly && state.mode != "off") state.nextScheduleTransitionEpochMs else 0).filter { it > now }.minOrNull()
      if (next == null) alarms.cancel(pending)
      else alarms.setWindow(AlarmManager.RTC_WAKEUP, next, 10 * 60_000L, pending)
    }
  }
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action !in setOf(ACTION_EVALUATE, Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
        Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) return
    if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
      context.getSharedPreferences("myelin_focus_shield_native", Context.MODE_PRIVATE).edit()
        .putBoolean("active", false).putString("phase", "idle").putLong("breakPassExpiresAtMs", 0).apply()
    }
    evaluateAndScheduleNext(context)
  }
}
