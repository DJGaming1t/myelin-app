# MYELIN reminders

Feature 13 uses local notifications only. It does not register an Expo/FCM/APNs push token or send reminder content to a notification server.

## Reminder personalities

- **Calm** — quiet, low-pressure copy.
- **Signal** — compact, information-first copy.
- **Spark** — warmer/playful copy without streaks, guilt or fake urgency.

The Reminder Studio shows live notification previews before the user enables anything.

## Scheduling rules

- Review reminders are created only when the current workspace has due recall cards or unresolved due mistakes.
- At most one due-review digest is planned per day.
- Exam check-ins use only exams already stored in MYELIN.
- Default exam lead times are 7, 3 and 1 days before the exam.
- MYELIN caps its planned reminders at two per day and 28 total scheduled reminders.
- Quiet hours always win; a reminder landing inside quiet hours is moved to the quiet-end boundary.
- Changing topics, reviews, exams or reminder settings rebuilds the schedule.
- Switching accounts/workspaces cancels the old workspace's scheduled notification IDs so private topic/exam names do not appear later.

## Permission behavior

MYELIN does not ask for notification permission at launch.

The native permission prompt is requested only after the user presses **Enable my reminders**. Android notification channels are created first so the Android 13 permission flow can work correctly.

If permission is denied, the user's reminder preferences remain stored and the screen can direct them to system settings.

## Android channels

MYELIN intentionally avoids alarm-style channels:

- **Gentle study nudges** — low importance, silent, non-vibrating.
- **Study reminders with sound** — normal/default importance and system sound.

No `SCHEDULE_EXACT_ALARM` permission is added. Study reminders do not need second-perfect alarm delivery.

## Copy guardrails

Automated tests reject reminder language containing manipulative patterns such as:

- streak-loss threats
- "falling behind"
- fake urgency
- failure/guilt framing

Reminder copy is allowed to state factual information such as how many reviews are due or how many days remain before an exam.
