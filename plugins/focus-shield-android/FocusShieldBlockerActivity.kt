package com.djgaming1t.myelin.focusshield

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

object FocusShieldUiFactory {
  fun dp(context: Context, value: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value.toFloat(),
      context.resources.displayMetrics
    ).toInt()
  }

  fun roundedBg(fillHex: String, strokeHex: String? = null, strokeWidthDp: Int = 1, radiusDp: Int = 16, context: Context): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(context, radiusDp).toFloat()
      setColor(Color.parseColor(fillHex))
      if (strokeHex != null) {
        setStroke(dp(context, strokeWidthDp), Color.parseColor(strokeHex))
      }
    }
  }

  fun bringMyelinToFront(context: Context) {
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent().apply {
        setClassName(context.packageName, "${context.packageName}.MainActivity")
      }
    launchIntent.action = Intent.ACTION_VIEW
    launchIntent.data = Uri.parse("myelin://focus")
    launchIntent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    try {
      context.startActivity(launchIntent)
    } catch (_: Exception) {
      // Fallback to Home screen if MainActivity cannot be launched
      val home = Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_HOME)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        context.startActivity(home)
      } catch (_: Exception) {}
    }
  }

  fun buildBlockingView(
    context: Context,
    state: ShieldSessionState,
    blockedPackage: String,
    blockedLabel: String,
    onReturnToMyelin: (parkedThought: String?) -> Unit,
    onGrantBreakPass: () -> Unit,
    onEmergencyOverride: () -> Unit
  ): Pair<View, () -> Unit> {
    val pm = context.packageManager
    val appIcon = try {
      pm.getApplicationIcon(blockedPackage)
    } catch (_: Exception) {
      null
    }

    val scroll = ScrollView(context).apply {
      isFillViewport = true
      setBackgroundColor(Color.parseColor("#F2070707"))
    }

    val root = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      val padH = dp(context, 22)
      val padV = dp(context, 32)
      setPadding(padH, padV, padH, padV)
    }

    val card = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = roundedBg("#121212", "#3D261E", 1, 22, context)
      val pad = dp(context, 22)
      setPadding(pad, pad, pad, pad)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      )
    }

    // Eyebrow badge
    val eyebrow = TextView(context).apply {
      text = "MYELIN FOCUS SHIELD · ${state.mode.uppercase()}"
      setTextColor(Color.parseColor("#FF805B"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setTypeface(typeface, Typeface.BOLD)
      letterSpacing = 0.08f
    }
    card.addView(eyebrow)

    // App Icon + Blocked Title row
    val headerRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      val lp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      )
      lp.topMargin = dp(context, 14)
      layoutParams = lp
    }

    if (appIcon != null) {
      val iconView = ImageView(context).apply {
        setImageDrawable(appIcon)
        val size = dp(context, 44)
        layoutParams = LinearLayout.LayoutParams(size, size).apply {
          rightMargin = dp(context, 14)
        }
      }
      headerRow.addView(iconView)
    }

    val titleCol = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }

    val titleView = TextView(context).apply {
      text = "$blockedLabel is paused during Focus"
      setTextColor(Color.parseColor("#F5F2EE"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      setTypeface(typeface, Typeface.BOLD)
    }
    val subView = TextView(context).apply {
      val remainingMin = ((state.sessionEndEpochMs - System.currentTimeMillis()) / 60_000L).coerceAtLeast(1L)
      text = "Active session: ${state.topicName} · ~${remainingMin}m left"
      setTextColor(Color.parseColor("#A39C96"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    }
    titleCol.addView(titleView)
    titleCol.addView(subView)
    headerRow.addView(titleCol)
    card.addView(headerRow)

    // Tiny Step Box if present
    if (state.tinyStep.isNotBlank()) {
      val stepBox = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        background = roundedBg("#1A1715", "#2E2925", 1, 14, context)
        val p = dp(context, 14)
        setPadding(p, p, p, p)
        layoutParams = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
          topMargin = dp(context, 16)
        }
      }
      val stepKicker = TextView(context).apply {
        text = "YOUR CURRENT TINY STEP"
        setTextColor(Color.parseColor("#FF805B"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
        setTypeface(typeface, Typeface.BOLD)
      }
      val stepBody = TextView(context).apply {
        text = state.tinyStep
        setTextColor(Color.parseColor("#F5F2EE"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        setPadding(0, dp(context, 4), 0, 0)
      }
      stepBox.addView(stepKicker)
      stepBox.addView(stepBody)
      card.addView(stepBox)
    }

    // Motivational cue
    val motivationView = TextView(context).apply {
      text = "“${state.customMotivation}”"
      setTextColor(Color.parseColor("#D6CFC9"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
      setPadding(0, dp(context, 14), 0, 0)
    }
    card.addView(motivationView)

    // Reflection prompt for Hard / Strict modes
    if (state.mode == "hard" || state.mode == "strict") {
      val reflectView = TextView(context).apply {
        text = "Reflection: ${state.reflectionPrompt}"
        setTextColor(Color.parseColor("#A39C96"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
        setPadding(0, dp(context, 8), 0, 0)
      }
      card.addView(reflectView)
    }

    // Primary CTA: Return to MYELIN Focus
    val returnBtn = Button(context).apply {
      text = "Return to MYELIN Focus →"
      isAllCaps = false
      setTextColor(Color.parseColor("#25140E"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      setTypeface(typeface, Typeface.BOLD)
      background = roundedBg("#FF805B", null, 0, 14, context)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(context, 54)
      ).apply {
        topMargin = dp(context, 18)
      }
      setOnClickListener {
        onReturnToMyelin(null)
      }
    }
    card.addView(returnBtn)

    // Quick Park Thought Input + Button
    val parkInput = EditText(context).apply {
      hint = "Or park what you wanted to check for break…"
      setHintTextColor(Color.parseColor("#6E6762"))
      setTextColor(Color.parseColor("#F5F2EE"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
      background = roundedBg("#181818", "#2E2E2E", 1, 12, context)
      val p = dp(context, 12)
      setPadding(p, p, p, p)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(context, 12)
      }
    }
    card.addView(parkInput)

    val parkBtn = Button(context).apply {
      text = "Park thought & return to study"
      isAllCaps = false
      setTextColor(Color.parseColor("#FF805B"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
      setTypeface(typeface, Typeface.BOLD)
      background = roundedBg("#1F1613", "#523025", 1, 12, context)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(context, 46)
      ).apply {
        topMargin = dp(context, 8)
      }
      setOnClickListener {
        val thought = parkInput.text?.toString()?.trim()
        val finalThought = if (!thought.isNullOrEmpty()) thought else "Wanted to open $blockedLabel"
        onReturnToMyelin(finalThought)
      }
    }
    card.addView(parkBtn)

    // Break Pass / Delayed Friction / Emergency Override section
    val remainingPasses = (state.maxBreakAllowances - state.breakPassesUsed).coerceAtLeast(0)
    val delaySec = if (state.mode == "hard" || state.mode == "strict") {
      state.unlockDelaySeconds.coerceIn(5, 60)
    } else {
      0
    }

    var activeTimer: CountDownTimer? = null

    if (remainingPasses > 0 && state.mode != "strict") {
      val passBtn = Button(context).apply {
        isAllCaps = false
        setTextColor(Color.parseColor("#A39C96"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
        background = roundedBg("#171717", "#2B2B2B", 1, 12, context)
        layoutParams = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          dp(context, 44)
        ).apply {
          topMargin = dp(context, 12)
        }
        if (delaySec > 0) {
          isEnabled = false
          text = "Wait ${delaySec}s to use ${state.breakPassMinutes}m break pass ($remainingPasses left)"
          activeTimer = object : CountDownTimer(delaySec * 1000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
              val s = (millisUntilFinished / 1000L) + 1L
              text = "Wait ${s}s to use ${state.breakPassMinutes}m break pass ($remainingPasses left)"
            }
            override fun onFinish() {
              isEnabled = true
              setTextColor(Color.parseColor("#F5F2EE"))
              text = "Use ${state.breakPassMinutes}m break pass ($remainingPasses left)"
            }
          }.start()
        } else {
          text = "Use ${state.breakPassMinutes}m break pass ($remainingPasses left)"
        }
        setOnClickListener {
          onGrantBreakPass()
        }
      }
      card.addView(passBtn)
    }

    // Safe Emergency Override section (PIN or 15s deliberate hold/wait)
    val emergencyContainer = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      visibility = View.GONE
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(context, 10)
      }
    }

    val pinInput = EditText(context).apply {
      hint = if (state.pinHash.isNotEmpty()) "Enter Accountability PIN" else "Type: pause focus"
      setHintTextColor(Color.parseColor("#6E6762"))
      setTextColor(Color.parseColor("#F5F2EE"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      if (state.pinHash.isNotEmpty()) {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
      }
      background = roundedBg("#181818", "#2E2E2E", 1, 10, context)
      val p = dp(context, 10)
      setPadding(p, p, p, p)
    }

    val emergencyStatus = TextView(context).apply {
      setTextColor(Color.parseColor("#E06C6C"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      visibility = View.GONE
    }

    val confirmEmergencyBtn = Button(context).apply {
      text = "Confirm 5-min Emergency Override"
      isAllCaps = false
      setTextColor(Color.parseColor("#E06C6C"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
      background = roundedBg("#1F1414", "#4A2424", 1, 10, context)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(context, 42)
      ).apply {
        topMargin = dp(context, 8)
      }
      setOnClickListener {
        val candidate = pinInput.text?.toString()?.trim() ?: ""
        val valid = if (state.pinHash.isNotEmpty()) {
          FocusShieldStore.verifyPin(state, candidate)
        } else {
          candidate.equals("pause focus", ignoreCase = true)
        }
        if (valid) {
          onEmergencyOverride()
        } else {
          emergencyStatus.visibility = View.VISIBLE
          emergencyStatus.text = if (state.pinHash.isNotEmpty()) {
            "Incorrect Accountability PIN."
          } else {
            "Type 'pause focus' to confirm emergency override."
          }
        }
      }
    }

    emergencyContainer.addView(pinInput)
    emergencyContainer.addView(emergencyStatus)
    emergencyContainer.addView(confirmEmergencyBtn)

    val toggleEmergencyBtn = TextView(context).apply {
      text = "Need emergency access?"
      gravity = Gravity.CENTER
      setTextColor(Color.parseColor("#78706A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      setPadding(0, dp(context, 14), 0, dp(context, 4))
      setOnClickListener {
        emergencyContainer.visibility =
          if (emergencyContainer.visibility == View.VISIBLE) View.GONE else View.VISIBLE
      }
    }

    card.addView(toggleEmergencyBtn)
    card.addView(emergencyContainer)

    root.addView(card)
    scroll.addView(root)

    val cleanup = {
      activeTimer?.cancel()
      activeTimer = null
    }

    return Pair(scroll, cleanup)
  }
}

class FocusShieldBlockerActivity : Activity() {
  private var cleanupTimer: (() -> Unit)? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        window.setHideOverlayWindows(true)
      } catch (_: Exception) {}
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    renderFromIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    if (intent != null) {
      setIntent(intent)
      renderFromIntent(intent)
    }
  }

  private fun renderFromIntent(intent: Intent) {
    cleanupTimer?.invoke()
    val state = FocusShieldStore.loadState(this)
    val blockedPkg = intent.getStringExtra("blockedPackage") ?: "app"
    val blockedLabel = intent.getStringExtra("blockedLabel") ?: "Distracting App"

    val (view, cleanup) = FocusShieldUiFactory.buildBlockingView(
      context = this,
      state = state,
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
        FocusShieldUiFactory.bringMyelinToFront(this)
        finish()
      },
      onGrantBreakPass = {
        FocusShieldStore.grantTemporaryBreakPass(this, blockedPkg, blockedLabel)
        finish()
      },
      onEmergencyOverride = {
        FocusShieldStore.grantEmergencyOverride(this, blockedPkg, blockedLabel)
        finish()
      }
    )
    cleanupTimer = cleanup
    setContentView(view)
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    // Route Back press on the blocker screen back to MYELIN Focus rather than the blocked app
    FocusShieldUiFactory.bringMyelinToFront(this)
    finish()
  }

  override fun onDestroy() {
    cleanupTimer?.invoke()
    super.onDestroy()
  }
}
