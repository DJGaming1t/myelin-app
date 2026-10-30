package com.djgaming1t.myelin.focusshield

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager
import android.widget.Toast

/** Reads the address field in supported browsers only. No network traffic is routed. */
class FocusShieldBrowserService : AccessibilityService() {
  companion object {
    private val supported = setOf("com.android.chrome", "com.chrome.beta", "com.brave.browser", "com.microsoft.emmx")

    fun isEnabled(context: Context): Boolean {
      return try {
        val manager = context.getSystemService(AccessibilityManager::class.java) ?: return false
        val own = ComponentName(context, FocusShieldBrowserService::class.java)
        manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK).any { info ->
          val service = info.resolveInfo?.serviceInfo ?: return@any false
          ComponentName(service.packageName, service.name) == own
        }
      } catch (_: Exception) { false }
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var pending: Runnable? = null
  private var lastBlockAt = 0L
  private var lastEventAt = 0L

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val pkg = event?.packageName?.toString() ?: return
    if (pkg !in supported) return
    val elapsed = SystemClock.elapsedRealtime()
    if (pending != null || elapsed - lastEventAt < 250L) return
    lastEventAt = elapsed
    val state = FocusShieldStore.loadState(this)
    if (!state.isEnforcementActive() || !state.websiteBlockingEnabled || state.blockedDomains.isEmpty() ||
        System.currentTimeMillis() < state.breakPassExpiresAtMs) return
    pending = Runnable { pending = null; checkAddress(pkg) }.also { handler.postDelayed(it, 250L) }
  }

  private fun checkAddress(pkg: String) {
    if (SystemClock.elapsedRealtime() - lastBlockAt < 1000L) return
    val root = try { rootInActiveWindow } catch (_: Exception) { null } ?: return
    val address: String
    try {
      if (root.packageName?.toString() != pkg) return
      val nodes = root.findAccessibilityNodeInfosByViewId("$pkg:id/url_bar")
      try {
        val field = nodes.firstOrNull { !it.isFocused } ?: return
        address = field.text?.toString()?.trim() ?: return
      } finally {
        @Suppress("DEPRECATION")
        nodes.forEach { it.recycle() }
      }
    } catch (_: Exception) { return } finally {
      @Suppress("DEPRECATION")
      root.recycle()
    }
    val host = FocusShieldBrowserAddress.host(address) ?: return
    // Reload after reading the UI: a paused timer, changed owner or break pass must take effect immediately.
    val state = FocusShieldStore.loadState(this)
    if (!state.isEnforcementActive() || !state.websiteBlockingEnabled || System.currentTimeMillis() < state.breakPassExpiresAtMs) return
    val matched = state.blockedDomains.firstOrNull { domain ->
      FocusShieldDns.blocked(host, listOf(FocusShieldDns.Rule(domain, domain in state.wildcardDomains)))
    } ?: return
    if (performGlobalAction(GLOBAL_ACTION_HOME)) {
      lastBlockAt = SystemClock.elapsedRealtime()
      FocusShieldStore.recordDomainInterception(this, state, FocusShieldStore.canonicalDisplayDomain(matched))
      Toast.makeText(this, "This website is paused for your study time.", Toast.LENGTH_SHORT).show()
    }
  }

  override fun onInterrupt() { pending?.let(handler::removeCallbacks); pending = null }
  override fun onDestroy() { onInterrupt(); super.onDestroy() }
}
