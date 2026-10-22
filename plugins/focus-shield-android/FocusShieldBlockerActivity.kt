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
    val current = FocusShieldStore.loadState(context)
    launchIntent.data = Uri.parse(if (current.active && current.phase == "focus") "myelin://focus" else "myelin://blocking")
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
      setBackgroundColor(Color.parseColor("#0D0D10"))
    }

    val root = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_VERTICAL
      val padH = dp(context, 24)
      val padV = dp(context, 28)
      setPadding(padH, padV, padH, padV)
    }

    val card = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = roundedBg("#1A1717", "#4A2B24", 1, 28, context)
      val pad = dp(context, 24)
      setPadding(pad, pad, pad, pad)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      )
    }

    // A calm hierarchy: reason, app, one action. The permission and emergency
    // controls are still reachable in the same scroll view at larger font sizes.
    val eyebrow = TextView(context).apply {
      text = "MYELIN  /  QUIET SPACE"
      setTextColor(Color.parseColor("#FFA27F"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
      setTypeface(typeface, Typeface.BOLD)
      letterSpacing = 0.15f
    }
    card.addView(eyebrow)

    val headline = TextView(context).apply {
      text = "Stay with your plan."
      setTextColor(Color.parseColor("#F8F3EF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 29f)
      setTypeface(typeface, Typeface.BOLD)
      letterSpacing = -0.035f
      setPadding(0, dp(context, 18), 0, dp(context, 6))
    }
    card.addView(headline)

    val explanation = TextView(context).apply {
      text = "You chose to pause distracting apps for now."
      setTextColor(Color.parseColor("#B8ADA7"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setLineSpacing(dp(context, 3).toFloat(), 1f)
    }
    card.addView(explanation)

    val headerRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = roundedBg("#26201F", "#40312D", 1, 18, context)
      setPadding(dp(context, 13), dp(context, 13), dp(context, 13), dp(context, 13))
      val lp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      )
      lp.topMargin = dp(context, 22)
      layoutParams = lp
    }

    if (appIcon != null) {
      val iconView = ImageView(context).apply {
        setImageDrawable(appIcon)
        val size = dp(context, 42)
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
      text = blockedLabel
      setTextColor(Color.parseColor("#F5F2EE"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      setTypeface(typeface, Typeface.BOLD)
    }
    val subView = TextView(context).apply {
      val remainingMin = ((state.effectiveEndEpochMs - System.currentTimeMillis() + 59_999L) / 60_000L).coerceAtLeast(0L)
      text = if (remainingMin > 0) "Paused · about ${remainingMin}m left" else "Paused for this window"
      setTextColor(Color.parseColor("#B8ADA7"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
    }
    titleCol.addView(titleView)
    titleCol.addView(subView)
    headerRow.addView(titleCol)
    card.addView(headerRow)

    // Tiny Step Box if present
    if (state.active && state.tinyStep.isNotBlank()) {
      val stepBox = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        background = roundedBg("#2C2420", "#514038", 1, 16, context)
        val p = dp(context, 14)
        setPadding(p, p, p, p)
        layoutParams = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
          topMargin = dp(context, 18)
        }
      }
      val stepKicker = TextView(context).apply {
        text = "BACK TO YOUR NEXT STEP"
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

    // Return to the existing Focus or scheduled-blocking route.
    val returnBtn = Button(context).apply {
      text = "Back to MYELIN"
      isAllCaps = false
      minimumHeight = dp(context, 48)
      setTextColor(Color.parseColor("#25140E"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      setTypeface(typeface, Typeface.BOLD)
      background = roundedBg("#FF9874", null, 0, 16, context)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(context, 22)
      }
      setOnClickListener {
        onReturnToMyelin(null)
      }
    }
    card.addView(returnBtn)

    // Quick Park Thought Input + Button
    val parkInput = EditText(context).apply {
      hint = "What did you want to check?"
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
    val parkContainer = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      visibility = View.GONE
    }
    parkContainer.addView(parkInput)

    val parkBtn = Button(context).apply {
      text = "Save thought and return"
      isAllCaps = false
      minimumHeight = dp(context, 48)
      setTextColor(Color.parseColor("#FF805B"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
      setTypeface(typeface, Typeface.BOLD)
      background = roundedBg("#1F1613", "#523025", 1, 12, context)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(context, 8)
      }
      setOnClickListener {
        val thought = parkInput.text?.toString()?.trim()
        val finalThought = if (!thought.isNullOrEmpty()) thought else "Wanted to open $blockedLabel"
        onReturnToMyelin(finalThought)
      }
    }
    parkContainer.addView(parkBtn)
    val parkToggle = Button(context).apply {
      text = "Save a thought for later"
      isAllCaps = false
      minimumHeight = dp(context, 48)
      setTextColor(Color.parseColor("#C6C2BC"))
      background = roundedBg("#26201F", "#40312D", 1, 14, context)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { topMargin = dp(context, 10) }
      setOnClickListener {
        parkContainer.visibility = if (parkContainer.visibility == View.VISIBLE) View.GONE else View.VISIBLE
      }
    }
    card.addView(parkToggle)
    card.addView(parkContainer)

    if (state.customMotivation.isNotBlank() || ((state.mode == "hard" || state.mode == "strict") && state.reflectionPrompt.isNotBlank())) {
      val reminder = TextView(context).apply {
        val lines = listOfNotNull(
          state.customMotivation.takeIf { it.isNotBlank() },
          state.reflectionPrompt.takeIf { (state.mode == "hard" || state.mode == "strict") && it.isNotBlank() }
        )
        text = lines.joinToString("\n\n")
        setTextColor(Color.parseColor("#C9BDB6"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setLineSpacing(dp(context, 3).toFloat(), 1f)
        setPadding(dp(context, 12), dp(context, 12), dp(context, 12), dp(context, 12))
        background = roundedBg("#26201F", null, 0, 12, context)
        visibility = View.GONE
      }
      val reminderToggle = TextView(context).apply {
        text = "Your reminder  ·  show"
        contentDescription = "Show your blocking reminder"
        setTextColor(Color.parseColor("#B8ADA7"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        gravity = Gravity.CENTER
        minimumHeight = dp(context, 48)
        isFocusable = true
        setOnClickListener {
          val open = reminder.visibility != View.VISIBLE
          reminder.visibility = if (open) View.VISIBLE else View.GONE
          text = if (open) "Your reminder  ·  hide" else "Your reminder  ·  show"
          contentDescription = if (open) "Hide your blocking reminder" else "Show your blocking reminder"
        }
      }
      card.addView(reminderToggle)
      card.addView(reminder)
    }

    // Break Pass / Delayed Friction / Emergency Override section
    val remainingPasses = (state.maxBreakAllowances - state.breakPassesUsed).coerceAtLeast(0)
    val delaySec = if (state.mode == "hard" || state.mode == "strict") {
      state.effectiveUnlockDelaySeconds.coerceIn(5, 120)
    } else {
      0
    }

    var activeTimer: CountDownTimer? = null

    if (remainingPasses > 0 && state.mode != "strict") {
      val passBtn = Button(context).apply {
        isAllCaps = false
        minimumHeight = dp(context, 48)
        setTextColor(Color.parseColor("#A39C96"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
        background = roundedBg("#26201F", "#40312D", 1, 14, context)
        layoutParams = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          LinearLayout.LayoutParams.WRAP_CONTENT
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

    val confirmationPhrase = if (state.active) "pause focus" else "pause blocking"
    val pinInput = EditText(context).apply {
      hint = if (state.pinHash.isNotEmpty()) "Enter Accountability PIN" else "Type: $confirmationPhrase"
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
      text = "Confirm 5-minute access"
      isAllCaps = false
      minimumHeight = dp(context, 48)
      setTextColor(Color.parseColor("#E06C6C"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
      background = roundedBg("#1F1414", "#4A2424", 1, 10, context)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(context, 8)
      }
      setOnClickListener {
        val candidate = pinInput.text?.toString()?.trim() ?: ""
        val valid = if (state.pinHash.isNotEmpty()) {
          FocusShieldStore.verifyPin(state, candidate)
        } else {
          candidate.equals(confirmationPhrase, ignoreCase = true)
        }
        if (valid) {
          onEmergencyOverride()
        } else {
          emergencyStatus.visibility = View.VISIBLE
          emergencyStatus.text = if (state.pinHash.isNotEmpty()) {
            "Incorrect Accountability PIN."
          } else {
            "Type '$confirmationPhrase' to confirm emergency override."
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
      setTextColor(Color.parseColor("#C6C2BC"))
      minimumHeight = dp(context, 48)
      isFocusable = true
      contentDescription = "Show emergency access confirmation"
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
          parkedThought = parkedThought,
          expected = state
        )
        FocusShieldUiFactory.bringMyelinToFront(this)
        finish()
      },
      onGrantBreakPass = {
        FocusShieldStore.grantTemporaryBreakPass(this, blockedPkg, blockedLabel, state)
        finish()
      },
      onEmergencyOverride = {
        FocusShieldStore.grantEmergencyOverride(this, blockedPkg, blockedLabel, state)
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
