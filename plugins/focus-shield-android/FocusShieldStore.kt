package com.djgaming1t.myelin.focusshield

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

data class ShieldSessionState(
  val active: Boolean,
  val sessionId: String,
  val phase: String,
  val sessionEndEpochMs: Long,
  val topicName: String,
  val tinyStep: String,
  val mode: String,
  val blockedPackages: Set<String>,
  val allowlistedPackages: Set<String>,
  val unlockDelaySeconds: Int,
  val maxBreakAllowances: Int,
  val breakPassesUsed: Int,
  val breakPassMinutes: Int,
  val breakPassExpiresAtMs: Long,
  val customMotivation: String,
  val reflectionPrompt: String,
  val pinSalt: String,
  val pinHash: String,
  val blockFloatingWindows: Boolean,
  val blockSplitScreen: Boolean
)

object FocusShieldStore {
  private const val PREFS_NAME = "myelin_focus_shield_native"
  private const val MAX_EVENTS = 50

  private fun prefs(context: Context): SharedPreferences {
    return context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  @Synchronized
  fun saveSessionPayload(context: Context, payloadJson: String): ShieldSessionState {
    val p = prefs(context)
    val obj = JSONObject(payloadJson)

    val incomingSessionId = if (obj.isNull("sessionId")) "" else obj.optString("sessionId", "")
    val previousSessionId = p.getString("sessionId", "") ?: ""
    val sameSession = incomingSessionId.isNotEmpty() && incomingSessionId == previousSessionId

    val active = obj.optBoolean("active", false)
    val phase = obj.optString("phase", "idle")
    val sessionEndEpochMs = obj.optLong(
      "sessionEndEpochMs",
      System.currentTimeMillis() + 45L * 60_000L
    )
    val topicName = obj.optString("topicName", "Focus Session")
    val tinyStep = obj.optString("tinyStep", "")
    val mode = obj.optString("mode", "off")

    val blockedSet = mutableSetOf<String>()
    val blockedArr = obj.optJSONArray("blockedPackages") ?: JSONArray()
    for (i in 0 until blockedArr.length()) {
      val pkg = blockedArr.optString(i, "").trim()
      if (pkg.isNotEmpty() && !pkg.startsWith("custom:") && !pkg.startsWith("category:")) {
        blockedSet.add(pkg)
      }
    }

    val allowSet = mutableSetOf<String>()
    val allowArr = obj.optJSONArray("allowlistedPackages") ?: JSONArray()
    for (i in 0 until allowArr.length()) {
      val pkg = allowArr.optString(i, "").trim()
      if (pkg.isNotEmpty()) {
        allowSet.add(pkg)
      }
    }

    val unlockDelaySeconds = obj.optInt("unlockDelaySeconds", 10).coerceIn(0, 120)
    val maxBreakAllowances = obj.optInt("maxBreakAllowances", 1).coerceIn(0, 5)
    val breakPassMinutes = obj.optInt("breakPassMinutes", 2).coerceIn(1, 10)
    val customMotivation = obj.optString(
      "customMotivation",
      "Protect this single block. Everything else can wait in Distraction Parking."
    )
    val reflectionPrompt = obj.optString(
      "reflectionPrompt",
      "Will leaving this block right now help you finish your current tiny step?"
    )
    val pinSalt = obj.optString("pinSalt", "")
    val pinHash = obj.optString("pinHash", "")
    val blockFloatingWindows = obj.optBoolean("blockFloatingWindows", true)
    val blockSplitScreen = obj.optBoolean("blockSplitScreen", true)

    val breakPassesUsed = if (sameSession) p.getInt("breakPassesUsed", 0) else 0
    val breakPassExpiresAtMs = if (sameSession) p.getLong("breakPassExpiresAtMs", 0L) else 0L

    p.edit()
      .putBoolean("active", active)
      .putString("sessionId", incomingSessionId)
      .putString("phase", phase)
      .putLong("sessionEndEpochMs", sessionEndEpochMs)
      .putString("topicName", topicName)
      .putString("tinyStep", tinyStep)
      .putString("mode", mode)
      .putStringSet("blockedPackages", blockedSet)
      .putStringSet("allowlistedPackages", allowSet)
      .putInt("unlockDelaySeconds", unlockDelaySeconds)
      .putInt("maxBreakAllowances", maxBreakAllowances)
      .putInt("breakPassesUsed", breakPassesUsed)
      .putInt("breakPassMinutes", breakPassMinutes)
      .putLong("breakPassExpiresAtMs", breakPassExpiresAtMs)
      .putString("customMotivation", customMotivation)
      .putString("reflectionPrompt", reflectionPrompt)
      .putString("pinSalt", pinSalt)
      .putString("pinHash", pinHash)
      .putBoolean("blockFloatingWindows", blockFloatingWindows)
      .putBoolean("blockSplitScreen", blockSplitScreen)
      .apply()

    return loadState(context)
  }

  @Synchronized
  fun loadState(context: Context): ShieldSessionState {
    val p = prefs(context)
    return ShieldSessionState(
      active = p.getBoolean("active", false),
      sessionId = p.getString("sessionId", "") ?: "",
      phase = p.getString("phase", "idle") ?: "idle",
      sessionEndEpochMs = p.getLong("sessionEndEpochMs", 0L),
      topicName = p.getString("topicName", "Focus Session") ?: "Focus Session",
      tinyStep = p.getString("tinyStep", "") ?: "",
      mode = p.getString("mode", "off") ?: "off",
      blockedPackages = p.getStringSet("blockedPackages", emptySet())?.toSet() ?: emptySet(),
      allowlistedPackages = p.getStringSet("allowlistedPackages", emptySet())?.toSet() ?: emptySet(),
      unlockDelaySeconds = p.getInt("unlockDelaySeconds", 10),
      maxBreakAllowances = p.getInt("maxBreakAllowances", 1),
      breakPassesUsed = p.getInt("breakPassesUsed", 0),
      breakPassMinutes = p.getInt("breakPassMinutes", 2),
      breakPassExpiresAtMs = p.getLong("breakPassExpiresAtMs", 0L),
      customMotivation = p.getString(
        "customMotivation",
        "Protect this single block. Everything else can wait in Distraction Parking."
      ) ?: "",
      reflectionPrompt = p.getString(
        "reflectionPrompt",
        "Will leaving this block right now help you finish your current tiny step?"
      ) ?: "",
      pinSalt = p.getString("pinSalt", "") ?: "",
      pinHash = p.getString("pinHash", "") ?: "",
      blockFloatingWindows = p.getBoolean("blockFloatingWindows", true),
      blockSplitScreen = p.getBoolean("blockSplitScreen", true)
    )
  }

  @Synchronized
  fun grantTemporaryBreakPass(context: Context, packageName: String, appLabel: String): Boolean {
    val p = prefs(context)
    val state = loadState(context)
    val remaining = state.maxBreakAllowances - state.breakPassesUsed
    if (!state.active || state.mode == "strict" || remaining <= 0 || System.currentTimeMillis() >= state.sessionEndEpochMs) {
      return false
    }
    val durationMs = state.breakPassMinutes.coerceAtLeast(1) * 60_000L
    val expiresAt = System.currentTimeMillis() + durationMs
    p.edit()
      .putInt("breakPassesUsed", state.breakPassesUsed + 1)
      .putLong("breakPassExpiresAtMs", expiresAt)
      .apply()
    appendInterceptEvent(
      context = context,
      packageName = packageName,
      appLabel = appLabel,
      vector = "blocked-app",
      outcome = "break-pass",
      parkedThought = null
    )
    return true
  }

  @Synchronized
  fun grantEmergencyOverride(context: Context, packageName: String, appLabel: String) {
    val p = prefs(context)
    val expiresAt = System.currentTimeMillis() + 5L * 60_000L
    p.edit()
      .putLong("breakPassExpiresAtMs", expiresAt)
      .apply()
    appendInterceptEvent(
      context = context,
      packageName = packageName,
      appLabel = appLabel,
      vector = "blocked-app",
      outcome = "bypassed",
      parkedThought = null
    )
  }

  fun verifyPin(state: ShieldSessionState, candidatePin: String): Boolean {
    if (state.pinHash.isEmpty() || state.pinSalt.isEmpty()) return false
    val computed = sha256Hex("${state.pinSalt}:${candidatePin.trim()}")
    return MessageDigest.isEqual(
      computed.toByteArray(Charsets.UTF_8),
      state.pinHash.lowercase().toByteArray(Charsets.UTF_8)
    )
  }

  fun sha256Hex(input: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
    val sb = StringBuilder(digest.size * 2)
    for (b in digest) {
      sb.append(String.format("%02x", b))
    }
    return sb.toString()
  }

  @Synchronized
  fun appendInterceptEvent(
    context: Context,
    packageName: String,
    appLabel: String,
    vector: String,
    outcome: String,
    parkedThought: String? = null
  ) {
    val p = prefs(context)
    val raw = p.getString("interceptEventsJson", "[]") ?: "[]"
    val arr = try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }

    val entry = JSONObject().apply {
      put("id", "native_${System.currentTimeMillis()}_${(1000..9999).random()}")
      put("timestamp", System.currentTimeMillis())
      put("sessionId", p.getString("sessionId", ""))
      put("packageName", packageName)
      put("targetLabel", appLabel)
      put("vector", vector)
      put("outcome", outcome)
      put("awaySeconds", 5)
      if (!parkedThought.isNullOrBlank()) {
        put("parkedThought", parkedThought.trim())
      }
    }
    arr.put(entry)

    val trimmed = JSONArray()
    val startIdx = (arr.length() - MAX_EVENTS).coerceAtLeast(0)
    for (i in startIdx until arr.length()) {
      trimmed.put(arr.get(i))
    }
    p.edit().putString("interceptEventsJson", trimmed.toString()).apply()
  }

  @Synchronized
  fun consumeInterceptEvents(context: Context): String {
    val p = prefs(context)
    val raw = p.getString("interceptEventsJson", "[]") ?: "[]"
    p.edit().putString("interceptEventsJson", "[]").apply()
    return raw
  }
}
