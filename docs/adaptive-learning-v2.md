# MYELIN adaptive learning release

The dashboard keeps its single recommended action. The new behavior lives in the existing Review, Focus, Progress, and Settings flows.

## Memory and recommendations

Per-question stability and difficulty use FSRS-6 default parameters and the published equations:
https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm

MYELIN maps Again / Practising / Good to ratings 1 / 2 / 3. Hinted Good retains its self-reported grade in history but uses rating 2 for spacing. The target retention is 90%, Again retains a ten-minute learning step, and intervals are bounded to 1–3650 days. Same-day practice cannot manufacture the growth of a delayed successful recall. Parameters are defaults, not fitted to the individual. Predicted recall is a model estimate, not a measured cognitive score.

Legacy questions keep their due dates until the next review. On that review, their last interval and grade initialize memory state. New state, elapsed days, and predicted recall survive validation, backups, and cloud snapshots.

The planner combines existing deadlines and exam pressure with estimated forgetting, capped postponement pressure, available windows, and fit. Meaningless subject alternation is removed. Explicit, case-insensitive confusion groups pair due concepts in mixed practice, after which priority ordering resumes. Targeted insights can deliberately practise non-due cards.

## Focus and rest

After two postponements, Focus offers a five-minute start and editable, saved task steps. Productive five-minute work resets postponement pressure. Templates are starting points, not generated subject-specific instruction. Parked thoughts are available during the break; they remain session-local and disappear when the session ends.

Sleep defaults to 22:30–07:00 local time and is adjustable or optional. Planning and rescheduling exclude protected sleep. Slot suggestions cap a block to the configured focus duration, reserve break capacity, and respect the daily budget across scheduled work. Existing calendar commitments continue to block time. Sleep calculations use local calendar dates, including overnight windows.

The optional distraction-blocking setup opens phone settings. Android Digital Wellbeing Focus mode is controlled by the user and OS, not MYELIN. No enforcement, permission grant, or activation is inferred. Native app interception is not included in this OTA.
https://support.google.com/android/answer/9346420

## Progress and outcomes

The Neural Map uses recorded Good recalls without hints, deduplicated per question per local date. Topics are nodes; the connecting layout is a visual metaphor, not an inferred knowledge graph. Earned evidence does not fade when recall becomes due. Deleting study history removes its evidence. Milestones occur at 1, 10, 25, 50, 100, 250, 500, and 1000 earned recalls.

Actionable insights link to the exact questions with recent confidence/grade mismatches or estimated forgetting. Grades are self-reported. Retention counts use first delayed unassisted attempts, excluding immediate retries. No claim of proven causal improvement is made.

Content-free focus outcomes are stored in the existing private workspace: starts, terminal status, planned/actual minutes, launch mode, standalone-task and overdue flags. They sync only through the user's existing opt-in cloud sync, never to a third-party analytics endpoint. Outcomes are idempotent by timer ID and bounded to the latest 2000. Standalone-task focus now appears in Progress; older task-only history cannot be reconstructed from the old last-day aggregate. No screen-time or parked-thought telemetry is added.

Learning lab is opt-in. Stable task-ID hash assignment compares five-minute and standard first-step suggestions for repeatedly postponed tasks. One exposure is recorded per task when the setup is shown; starts within 24 hours are the outcome. Offers younger than 24 hours are excluded. Assignment does not force a timer mode, and neither arm loses five-minute access. Results remain descriptive, with sample sizes and no automatic winner or default change. No claim that this controls all task-level confounding is made.

## Reminders

Notifications remain opt-in and silent by default. Adaptive timing can use the most frequent two-hour band of successful focus starts from the last 30 days once it has three observations. It moves review nudges around commitments, respects sleep and quiet hours, and suppresses review nudges on a day already reviewed. Scheduled-task nudges must remain before the task. Reminders are capped at two per day and separated by at least 90 minutes. Exam lead-time notices remain supported beyond the seven-day review horizon.

## Compatibility and verification

No new native dependency or permission; runtime remains 0.2.7. Schema-2 optional fields preserve legacy content and existing due dates. Earlier clients do not understand these additive adaptive fields, so avoid editing the same workspace from an older client during rollout.

`verify-adaptive.ts` covers reference memory values, elapsed-time effects, hints, bounds, legacy schedules, confusion pairs, targeted queues, postponements, sleep, rescheduling capacity, idempotent outcomes, retention definitions, backup/import, and adaptive reminders. Existing full verification, TypeScript, narrow-screen browser flows with reduced motion, and Android export remain release gates.
