# MYELIN notifications

Feature 13 uses **local device notifications only**. It does not register a device token, an Expo push token, or a remote notification service.

## Reminder style

- **Calm** — quiet, low-pressure language.
- **Signal** — concise, information-first language.
- **Spark** — a little more personality without guilt, streaks, or fake urgency.
- **Brief / Guided / Context** controls how much useful detail the notification includes.

These choices affect wording, subtitle treatment and Android accent tint, not notification frequency or urgency. Review, Exam and Study previews share the same production copy engine.

## Scheduling rules

- Reminders are opt-in.
- Notification permission is requested only after the user explicitly enables reminders.
- Due-review reminders are based on actual recall cards and unresolved mistake retests.
- No due review data means no review notification.
- Review reminders are scheduled over a seven-day horizon and refreshed when study data changes.
- Exam reminders are based only on saved MYELIN exams and selected lead days.
- Quiet hours always win.
- If shifting an exam reminder out of quiet hours would move it onto the exam day, that reminder is skipped rather than showing stale “tomorrow” copy.
- MYELIN caps planned study reminders at two per day and 28 total.
- Switching workspaces cancels scheduled notification IDs belonging to the previous workspace.

## Android delivery

MYELIN creates two channels:

1. **Gentle study nudges** — low importance, silent, no vibration.
2. **Study reminders with sound** — default importance with the normal system notification sound.

The app explicitly blocks:

- `android.permission.SCHEDULE_EXACT_ALARM`
- `android.permission.USE_EXACT_ALARM`

Study reminders are therefore not treated like alarm-clock or medication-alarm events.

## Privacy

Reminder preferences and scheduled notification IDs are stored locally per workspace/device.

Feature 13 does not call:

- `getExpoPushTokenAsync`
- `getDevicePushTokenAsync`

Tapping a MYELIN notification opens either Review or Exams, depending on the reminder kind.


## Verification gate

Feature 13 is merged only after the notification planner tests, TypeScript, Expo Doctor, native config generation, and Android prebuild all pass on the current pull-request head.
