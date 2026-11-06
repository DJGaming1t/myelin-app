package com.djgaming1t.myelin.focusshield

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Calendar
import java.util.Locale
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

data class ScheduleEvaluationResult(
  val activeNow: Boolean,
  val activeLabel: String,
  val currentWindowEndEpochMs: Long,
  val nextTransitionEpochMs: Long
)

data class ShieldSessionState(
  val active: Boolean,
  val sessionId: String,
  val phase: String,
  val sessionEndEpochMs: Long,
  val topicName: String,
  val tinyStep: String,
  val mode: String,
  val sessionOnly: Boolean,
  val schedulesJson: String,
  val scheduleActiveNow: Boolean,
  val activeScheduleLabel: String,
  val effectiveTopicName: String,
  val effectiveEndEpochMs: Long,
  val nextScheduleTransitionEpochMs: Long,
  val blockedPackages: Set<String>,
  val allowlistedPackages: Set<String>,
  val websiteBlockingEnabled: Boolean,
  val userDomainCount: Int,
  val blockedDomains: Set<String>,
  val wildcardDomains: Set<String>,
  val blockDohCanary: Boolean,
  val unlockDelaySeconds: Int,
  val effectiveUnlockDelaySeconds: Int,
  val attemptCountInSession: Int,
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
) {
  fun isEnforcementActive(nowMs: Long = System.currentTimeMillis()): Boolean {
    if (mode == "off") return false
    val manualFocusRunning = active && phase == "focus" && nowMs < sessionEndEpochMs
    val scheduledRunning = !sessionOnly && scheduleActiveNow && nowMs < effectiveEndEpochMs
    return manualFocusRunning || scheduledRunning
  }
}

object FocusShieldStore {
  private const val PREFS_NAME = "myelin_focus_shield_native"
  private const val MAX_EVENTS = 80

  // Companion media / CDN / shortlink domains automatically paired when a root site is blocked
  private val COMPANION_DOMAIN_MAP: Map<String, List<String>> = mapOf(
    "youtube.com" to listOf("youtu.be", "ytimg.com", "googlevideo.com", "youtube-nocookie.com"),
    "reddit.com" to listOf("redd.it", "redditmedia.com", "redditstatic.com"),
    "instagram.com" to listOf("cdninstagram.com"),
    "tiktok.com" to listOf("tiktokv.com", "tiktokcdn.com", "musical.ly"),
    "x.com" to listOf("twitter.com", "t.co", "twimg.com"),
    "twitter.com" to listOf("x.com", "t.co", "twimg.com"),
    "twitch.tv" to listOf("ttvnw.net", "jtvnw.net"),
    "discord.com" to listOf("discord.gg", "discordapp.com", "discordapp.net")
  )

  private val REVERSE_COMPANION_MAP: Map<String, String> = buildMap {
    for ((primary, companions) in COMPANION_DOMAIN_MAP) {
      for (comp in companions) {
        put(comp, primary)
      }
    }
  }

  private fun prefs(context: Context): SharedPreferences {
    return context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  fun canonicalDisplayDomain(matchedDomain: String): String {
    val clean = matchedDomain.lowercase(Locale.US).trimEnd('.').removePrefix("www.")
    return REVERSE_COMPANION_MAP[clean] ?: clean
  }

  private fun normalizeDomain(raw: String): String {
    return raw.trim().lowercase(Locale.US).trimEnd('.').removePrefix("*.").removePrefix("www.")
  }

  fun computeEscalatedDelaySeconds(mode: String, baseDelaySec: Int, attemptCount: Int): Int {
    if (mode != "hard" && mode != "strict") return 0
    val clampedBase = baseDelaySec.coerceIn(5, 120)
    if (attemptCount <= 1) return clampedBase
    val mult = min(4.0, 1.5.pow((attemptCount - 1).toDouble()))
    return min(120, (clampedBase * mult).roundToInt())
  }

  fun evaluateScheduleWindows(
    schedulesJson: String,
    sessionOnly: Boolean,
    nowMs: Long = System.currentTimeMillis()
  ): ScheduleEvaluationResult {
    if (sessionOnly || schedulesJson.isBlank()) {
      return ScheduleEvaluationResult(
        activeNow = false,
        activeLabel = "",
        currentWindowEndEpochMs = 0L,
        nextTransitionEpochMs = 0L
      )
    }

    val arr = try {
      JSONArray(schedulesJson)
    } catch (_: Exception) {
      return ScheduleEvaluationResult(false, "", 0L, 0L)
    }

    val cal = Calendar.getInstance().apply { timeInMillis = nowMs }
    // Convert Calendar.SUNDAY (1)..Calendar.SATURDAY (7) to JS 0..6 (0 = Sun .. 6 = Sat)
    val currentDay = cal.get(Calendar.DAY_OF_WEEK) - 1
    val prevDay = (currentDay + 6) % 7
    val minuteOfDay = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)

    val startOfTodayMs = (cal.clone() as Calendar).apply {
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    var activeLabel = ""
    var activeEndMs = 0L
    var earliestNextStartMs = Long.MAX_VALUE

    for (i in 0 until arr.length()) {
      val item = arr.optJSONObject(i) ?: continue
      if (!item.optBoolean("enabled", false)) continue
      val label = item.optString("label", "Scheduled Shield").trim().ifEmpty { "Scheduled Shield" }
      val startMin = item.optInt("startMinuteOfDay", 0).coerceIn(0, 1439)
      val endMin = item.optInt("endMinuteOfDay", 0).coerceIn(0, 1439)
      val daysArr = item.optJSONArray("days") ?: continue
      val days = mutableSetOf<Int>()
      for (d in 0 until daysArr.length()) {
        val dayVal = daysArr.optInt(d, -1)
        if (dayVal in 0..6) days.add(dayVal)
      }
      if (days.isEmpty()) continue

      if (startMin <= endMin) {
        // Same-day schedule window
        if (currentDay in days && minuteOfDay in startMin until endMin) {
          val endEpoch = startOfTodayMs + endMin * 60_000L
          if (endEpoch > activeEndMs) {
            activeEndMs = endEpoch
            activeLabel = label
          }
        }
      } else {
        // Overnight schedule window (e.g., 22:30 -> 06:00)
        if (currentDay in days && minuteOfDay >= startMin) {
          val endEpoch = startOfTodayMs + (1440L + endMin) * 60_000L
          if (endEpoch > activeEndMs) {
            activeEndMs = endEpoch
            activeLabel = label
          }
        } else if (prevDay in days && minuteOfDay < endMin) {
          val endEpoch = startOfTodayMs + endMin * 60_000L
          if (endEpoch > activeEndMs) {
            activeEndMs = endEpoch
            activeLabel = label
          }
        }
      }

      // Compute next upcoming start within the next 7 days
      for (dayOffset in 0..7) {
        val candidateDay = (currentDay + dayOffset) % 7
        if (candidateDay !in days) continue
        val candidateStartMs = startOfTodayMs + (dayOffset * 1440L + startMin) * 60_000L
        if (candidateStartMs > nowMs + 5_000L && candidateStartMs < earliestNextStartMs) {
          earliestNextStartMs = candidateStartMs
          break
        }
      }
    }

    val isActive = activeEndMs > nowMs
    val nextTransition = if (isActive) {
      activeEndMs
    } else if (earliestNextStartMs != Long.MAX_VALUE) {
      earliestNextStartMs
    } else {
      0L
    }

    return ScheduleEvaluationResult(
      activeNow = isActive,
      activeLabel = activeLabel,
      currentWindowEndEpochMs = activeEndMs,
      nextTransitionEpochMs = nextTransition
    )
  }

  @Synchronized
  fun saveSessionPayload(context: Context, payloadJson: String): ShieldSessionState {
    val p = prefs(context)
    val obj = JSONObject(payloadJson)

    val incomingSessionId = obj.optString("sessionId", "")
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
    val sessionOnly = obj.optBoolean("sessionOnly", true)
    val schedulesArr = obj.optJSONArray("schedules") ?: JSONArray()
    val schedulesJson = schedulesArr.toString()

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

    val websiteBlockingEnabled = obj.optBoolean("websiteBlockingEnabled", true)
    val blockDohCanary = obj.optBoolean("blockDohCanary", true)

    val domainSet = mutableSetOf<String>()
    val domainArr = obj.optJSONArray("blockedDomains") ?: JSONArray()
    var userDomainCount = 0
    for (i in 0 until domainArr.length()) {
      val dom = normalizeDomain(domainArr.optString(i, ""))
      if (dom.isNotEmpty() && dom.contains('.')) {
        if (domainSet.add(dom)) {
          userDomainCount++
        }
        COMPANION_DOMAIN_MAP[dom]?.forEach { comp ->
          domainSet.add(comp)
        }
      }
    }

    val wildcardSet = mutableSetOf<String>()
    val wildcardArr = obj.optJSONArray("wildcardDomains") ?: JSONArray()
    for (i in 0 until wildcardArr.length()) {
      val dom = normalizeDomain(wildcardArr.optString(i, ""))
      if (dom.isNotEmpty() && dom.contains('.')) {
        wildcardSet.add(dom)
        COMPANION_DOMAIN_MAP[dom]?.forEach { comp ->
          wildcardSet.add(comp)
        }
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
    val attemptCountInSession = if (sameSession) p.getInt("attemptCountInSession", 0) else 0

    p.edit()
      .putBoolean("active", active)
      .putString("sessionId", incomingSessionId)
      .putString("phase", phase)
      .putLong("sessionEndEpochMs", sessionEndEpochMs)
      .putString("topicName", topicName)
      .putString("tinyStep", tinyStep)
      .putString("mode", mode)
      .putBoolean("sessionOnly", sessionOnly)
      .putString("schedulesJson", schedulesJson)
      .putStringSet("blockedPackages", blockedSet)
      .putStringSet("allowlistedPackages", allowSet)
      .putBoolean("websiteBlockingEnabled", websiteBlockingEnabled)
      .putInt("userDomainCount", userDomainCount)
      .putStringSet("blockedDomains", domainSet)
      .putStringSet("wildcardDomains", wildcardSet)
      .putBoolean("blockDohCanary", blockDohCanary)
      .putInt("unlockDelaySeconds", unlockDelaySeconds)
      .putInt("attemptCountInSession", attemptCountInSession)
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
    val now = System.currentTimeMillis()
    val active = p.getBoolean("active", false)
    val phase = p.getString("phase", "idle") ?: "idle"
    val sessionEndEpochMs = p.getLong("sessionEndEpochMs", 0L)
    val topicName = p.getString("topicName", "Focus Session") ?: "Focus Session"
    val mode = p.getString("mode", "off") ?: "off"
    val sessionOnly = p.getBoolean("sessionOnly", true)
    val schedulesJson = p.getString("schedulesJson", "[]") ?: "[]"

    val schedEval = evaluateScheduleWindows(schedulesJson, sessionOnly, now)
    val manualFocusRunning = active && phase == "focus" && now < sessionEndEpochMs

    val effectiveTopicName = if (manualFocusRunning) {
      topicName
    } else if (schedEval.activeNow) {
      "${schedEval.activeLabel} (Scheduled)"
    } else {
      topicName
    }

    val effectiveEndEpochMs = if (manualFocusRunning && schedEval.activeNow) {
      maxOf(sessionEndEpochMs, schedEval.currentWindowEndEpochMs)
    } else if (manualFocusRunning) {
      sessionEndEpochMs
    } else if (schedEval.activeNow) {
      schedEval.currentWindowEndEpochMs
    } else {
      sessionEndEpochMs
    }

    val blockedDomains = p.getStringSet("blockedDomains", emptySet())?.toSet() ?: emptySet()
    val unlockDelaySeconds = p.getInt("unlockDelaySeconds", 10)
    val attemptCountInSession = p.getInt("attemptCountInSession", 0).coerceAtLeast(0)
    val effectiveUnlockDelaySeconds = computeEscalatedDelaySeconds(
      mode = mode,
      baseDelaySec = unlockDelaySeconds,
      attemptCount = attemptCountInSession + 1
    )

    return ShieldSessionState(
      active = active,
      sessionId = p.getString("sessionId", "") ?: "",
      phase = phase,
      sessionEndEpochMs = sessionEndEpochMs,
      topicName = topicName,
      tinyStep = p.getString("tinyStep", "") ?: "",
      mode = mode,
      sessionOnly = sessionOnly,
      schedulesJson = schedulesJson,
      scheduleActiveNow = schedEval.activeNow,
      activeScheduleLabel = schedEval.activeLabel,
      effectiveTopicName = effectiveTopicName,
      effectiveEndEpochMs = effectiveEndEpochMs,
      nextScheduleTransitionEpochMs = schedEval.nextTransitionEpochMs,
      blockedPackages = p.getStringSet("blockedPackages", emptySet())?.toSet() ?: emptySet(),
      allowlistedPackages = p.getStringSet("allowlistedPackages", emptySet())?.toSet() ?: emptySet(),
      websiteBlockingEnabled = p.getBoolean("websiteBlockingEnabled", true),
      userDomainCount = p.getInt("userDomainCount", blockedDomains.size).coerceAtLeast(0),
      blockedDomains = blockedDomains,
      wildcardDomains = p.getStringSet("wildcardDomains", emptySet())?.toSet() ?: emptySet(),
      blockDohCanary = p.getBoolean("blockDohCanary", true),
      unlockDelaySeconds = unlockDelaySeconds,
      effectiveUnlockDelaySeconds = effectiveUnlockDelaySeconds,
      attemptCountInSession = attemptCountInSession,
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
  fun recordInterceptionAttempt(context: Context): ShieldSessionState {
    val p = prefs(context)
    val nextCount = p.getInt("attemptCountInSession", 0).coerceAtLeast(0) + 1
    p.edit().putInt("attemptCountInSession", nextCount).apply()
    return loadState(context)
  }

  @Synchronized
  fun grantTemporaryBreakPass(context: Context, packageName: String, appLabel: String): Boolean {
    val p = prefs(context)
    val state = loadState(context)
    val remaining = state.maxBreakAllowances - state.breakPassesUsed
    if (remaining <= 0 && state.mode == "strict") {
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
    if (state.pinHash.isEmpty() || state.pinSalt.isEmpty()) return true
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
