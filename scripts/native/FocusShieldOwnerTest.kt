package com.djgaming1t.myelin.focusshield

import android.content.Context
import android.content.SharedPreferences
import java.lang.reflect.Proxy
import java.time.ZonedDateTime
import org.json.JSONArray
import org.json.JSONObject

private fun preferences(): SharedPreferences {
  val values = mutableMapOf<String, Any?>()
  return Proxy.newProxyInstance(SharedPreferences::class.java.classLoader,
    arrayOf(SharedPreferences::class.java)) { _, method, args ->
    when (method.name) {
      "edit" -> {
        val changes = mutableMapOf<String, Any?>(); var clear = false
        lateinit var editor: SharedPreferences.Editor
        editor = Proxy.newProxyInstance(SharedPreferences.Editor::class.java.classLoader,
          arrayOf(SharedPreferences.Editor::class.java)) { _, call, inputs ->
          when (call.name) {
            "clear" -> { clear = true; editor }
            "remove" -> { changes[inputs[0] as String] = null; editor }
            "apply", "commit" -> {
              if (clear) values.clear()
              changes.forEach { (key, value) -> if (value == null) values.remove(key) else values[key] = value }
              if (call.name == "commit") true else null
            }
            else -> { changes[inputs[0] as String] = inputs[1]; editor }
          }
        } as SharedPreferences.Editor
        editor
      }
      "getAll" -> values.toMap()
      "contains" -> values.containsKey(args[0])
      "registerOnSharedPreferenceChangeListener", "unregisterOnSharedPreferenceChangeListener" -> null
      else -> values[args[0]] ?: args[1]
    }
  } as SharedPreferences
}

fun main() {
  val context = Context(preferences())
  fun payload(owner: String, session: String = "same-id") = JSONObject()
    .put("ownerKey", owner).put("sessionId", session).put("active", true)
    .put("phase", "focus").put("sessionEndEpochMs", System.currentTimeMillis() + 120_000)
    .put("mode", "hard").put("sessionOnly", true).put("maxBreakAllowances", 2)
    .put("breakPassMinutes", 1).put("unlockDelaySeconds", 10)
  fun rejectStale(stale: ShieldSessionState) {
    check(FocusShieldStore.recordInterceptionAttempt(context, stale) == null)
    check(!FocusShieldStore.recordDomainInterception(context, stale, "youtube.com"))
    check(!FocusShieldStore.appendInterceptEvent(context, "app", "App", "blocked-app", "parked", "private thought", stale))
    check(!FocusShieldStore.grantTemporaryBreakPass(context, "app", "App", stale))
    check(!FocusShieldStore.grantEmergencyOverride(context, "app", "App", stale))
    val state = FocusShieldStore.loadState(context)
    check(state.attemptCountInSession == 0 && state.breakPassesUsed == 0 && state.breakPassExpiresAtMs == 0L)
    check(JSONArray(FocusShieldStore.consumeInterceptEvents(context)).length() == 0)
  }
  val oldOwner = FocusShieldStore.saveSessionPayload(context, payload("owner-a").toString())
  FocusShieldStore.saveSessionPayload(context, payload("owner-b").toString())
  rejectStale(oldOwner)
  val current = FocusShieldStore.loadState(context)
  check(FocusShieldStore.recordDomainInterception(context, current, "youtube.com"))
  check(FocusShieldStore.loadState(context).attemptCountInSession == 1)
  val event = JSONArray(FocusShieldStore.consumeInterceptEvents(context)).getJSONObject(0)
  check(event.getString("ownerKey") == "owner-b" && event.getString("outcome") == "blocked")
  check(FocusShieldStore.grantTemporaryBreakPass(context, "app", "App", current))
  FocusShieldStore.consumeInterceptEvents(context)
  FocusShieldStore.saveSessionPayload(context, payload("owner-b", "new-session").toString())
  rejectStale(current)

  val minute = ZonedDateTime.now().let { it.hour * 60 + it.minute }
  fun scheduled(endOffset: Int): JSONObject = payload("owner-b", "scheduled").put("active", false)
    .put("sessionOnly", false).put("schedules", JSONArray().put(JSONObject()
      .put("enabled", true).put("label", "Study").put("days", JSONArray((0..6).toList()))
      .put("startMinuteOfDay", (minute + 1439) % 1440).put("endMinuteOfDay", (minute + endOffset) % 1440)))
  val oldWindow = FocusShieldStore.saveSessionPayload(context, scheduled(1).toString())
  check(oldWindow.isEnforcementActive())
  val newWindow = FocusShieldStore.saveSessionPayload(context, scheduled(2).toString())
  check(newWindow.ownerKey == oldWindow.ownerKey && newWindow.sessionId == oldWindow.sessionId)
  check(newWindow.enforcementRunKey != oldWindow.enforcementRunKey)
  rejectStale(oldWindow)
  check(FocusShieldStore.recordInterceptionAttempt(context, newWindow)?.attemptCountInSession == 1)
  FocusShieldStore.saveSessionPayload(context, payload("").toString())
  check(FocusShieldStore.recordInterceptionAttempt(context) == null)
  check(!FocusShieldStore.appendInterceptEvent(context, "app", "App", "blocked-app", "returned"))
  println("PASS: actual native store rejects stale-owner, stale-session and stale-window counts, events, break passes and overrides")
}
