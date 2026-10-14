# MYELIN master checklist

Last audited: 2026-10-07. Continue this checklist; do not replace it on each turn.
Work one bounded chunk at a time. Verify, report Completed / Verified / Remaining / Next, then wait for **Next**.

## Product contract

Plan → Start → Focus → Retrieve → Feedback → Adapt.
Keep navigation centred on Today → Focus → Review → Progress. Evidence, not a score.
Preserve saved data, deterministic domain decisions, Expo/EAS compatibility and reduced motion. AI remains optional.

## Cross-chat reconciliation — 2026-10-07

Current development source: `codex/exam-autopilot-capacity-v1` at `71074af5f1f182854460e8fc661007fff9308b6a`, runtime 0.2.13. Every downloaded file was checked against its Git blob hash. `expo-migration` is still at PR #81 (`fc6362c`); do not publish this older checkout over the newer app. Other-chat release claims are context; branch contents determine implementation status.

The checklist IDs and historical chunk log below are preserved. Their original “complete” statuses refer to the older branch and are not evidence of integration into the newer branch.

| ID | Reconciled state on current development branch | Remaining |
| --- | --- | --- |
| M01 / M02 | Core tours, Library contextual guidance/usability, offline Help and first-open Today/Focus/Review/Progress offers integrated and locally/browser verified on the current branch (2026-10-14), publication pending. | M02i integrated; other advanced contextual coverage remains. Next priority is M04a Today deferral/Undo recovery. |
| M03 | Focus-aware reminder planning, recovered-window intents and expiry fallback now exist. Reminder Studio shows recovered notification previews. | Device delivery checks and multi-reminder collision/cap explanations; no duplicate reminder engine. |
| M04 | Multi-exam capacity planning/reflow, Focus → optional due-only retrieval and visible topic adaptation now exist. | Targeted correctness and evidence/motion audit; M04a Today deferral/Undo recovery is next. |
| M05 | M05a task-only/commitment-only returning-user detection fixed and locally verified (2026-10-14), publication pending. Existing onboarding/account/settings remain. | Device/account audit remains. |
| M06 | Typed assistant action validation, preview/apply sessions and bounded model contracts exist. | Audit and integrate the guide action boundary; do not recreate the executor. |
| M07 | Optional LiteRT-LM adapter/model manager, manual import and MYELIN Mini training/evaluation tooling exist. | Real Android inference/performance remains unverified here; no cloud provider added by this chunk. |

## Baseline audit

Inspected `expo-migration` at `5374a747b92d6e6c8510cd0ec65749ce1d8129ee` (same tree as the local snapshot), including the previous adaptive-learning release.
“Exists” below means found in code and prior verification; it does not imply a fresh physical-device test.

| Area | Current state | Remaining work |
| --- | --- | --- |
| Today | Exists: one main recommendation, compact overdue disclosure, collapsed Adjust, Tasks and Rest; Day Map shortcut. | Test guidance against each state; improve recovery without adding competing panels. |
| Completion / motion | Exists: direct task completion and Focus actions, Undo, achievement feedback, shared motion and reduced-motion preference. | Audit inconsistent open/close/undo transitions; reward recorded learning evidence. |
| Focus | Exists: recoverable timer, five-minute launch, tiny steps, saved task steps, distraction parking, breaks and effort. | Integration audit. Android distraction-blocking setup is a handoff, not enforcement. |
| Review / memory | Exists: per-question FSRS-inspired difficulty/stability/recall estimates, lapses and hint-sensitive scheduling. Legacy due dates remain intact until a new review. | Audit migration and calibration before any scheduler changes; parameters are defaults, not individually fitted. |
| Recommendations | Exists: deterministic deadline, exam, forgetting, postponement, duration and capacity logic; schedule/sleep constraints. | Audit interactions and readable explanations. Do not replace with an LLM. |
| Review quality | Exists: confidence vs correctness, targeted insight practice, explicit confusion-group pairs. | Improve usefulness and authoring when evidence supports it; do not alternate unrelated subjects arbitrarily. |
| Progress / Neural Map | Exists: actionable recall insights, unhinted Good-recall milestones and topic nodes. Local start/completion/recovery outcomes and optional launch comparison exist. | Audit evidence definitions and next actions. Map is a metaphor, not a brain measurement; local trial reports are descriptive. |
| Reminders | Exists: Reminder Studio, uniqueness, quiet/sleep windows, optional habit timing, capped daily delivery. | Confirmed gap: provider does not inspect the current Focus session to suppress reminders. |
| Day Map | Exists: recurring/date exceptions, overnight carry, free slots, moves, unscheduled work and narrow-layout fixes. | Reproduce remaining reports before changing recurrence, Not now or bounds. |
| Guidance / Help | Baseline: generic replay slides; no shared registry, actual-control tour or local help search. | M01–M02 below. |
| Onboarding / account / settings | Existing setup, tutorial replay, persistent auth storage, deletion with reauthentication handling. | Device/account audit pending. Task-only/commitment-only workspace is omitted by `hasMeaningfulWorkspaceData`; verify and fix in M05. |
| Optional AI | No validated assistant action executor or provider abstraction. | M06–M07. No native model dependency/download yet. |

Key code: `app/(app)/today/index.tsx`, `src/features/focus/`, `src/features/adaptive/`, `src/features/review/`, `src/features/planning/`, `src/features/notifications/`, `src/features/onboarding/onboarding-engine.ts`, `src/features/auth/`, and `docs/adaptive-learning-v2.md`.

## Prioritized checklist

- [x] **M01 — Guide foundation + Today tour.** Central typed registry with real routes, descriptions, search terms, anchors and currently supported actions. Three-step Today spotlight with dimming, Back/Next/Skip, reduced motion, state-aware copy, scroll restoration and replay. Registry-backed short core-loop explanation. No domain mutations, model, schema migration or native dependency.
- [ ] **M02 — Local Help and contextual coverage.** Today guide, offline Help and M02b Focus/M02c Review/M02d Progress guidance now integrated and locally/browser verified on the current branch, publication pending. M02e first-open Today offer is implemented and locally/browser verified. M02f first-open Focus setup offer is implemented and locally/browser verified. M02g first-open Review attempt offer is implemented and locally/browser verified. M02h first-open Progress offer is implemented and locally/browser verified. M02i contextual Library guidance and search/filter recovery are implemented and locally/browser verified. Other advanced tours remain; next priority is M04a Today deferral/Undo recovery. Local keyword/fuzzy search and useful explanations cover the four requested example questions. Offer Go there, and Show me for implemented tours only. Then extend tours screen by screen, with contextual `?`, replay and owner-scoped first-open guidance. Keep the registry authoritative.
- [ ] **M03 — Reminder / schedule correctness.** Focus-aware suppression/recovery exists on the current development branch; audit delivery while retaining quiet/sleep boundaries and uniqueness. Then reproduce and fix any remaining recurrence, bounds, unscheduled-work, move and Not now bugs with regression checks.
- [ ] **M04 — Recovery and evidence polish.** Unify Make smaller / Find another time / Move / Remove for repeated avoidance; preserve progressive, calm overdue urgency. Audit completion feedback and open/close/undo motion. Audit deterministic recommendations, review calibration/confusion practice, actionable Progress and Neural Map semantics without replacing existing engines. Tie changes to starts, completed blocks, retention and recovery outcomes.
- [ ] **M05 — Onboarding, settings and account audit.** M05a task-only/commitment-only returning-user recovery is implemented and locally verified (2026-10-14); publication pending. Explain only the core loop at setup; advanced guidance stays contextual. Login persistence, account deletion, tutorial replay, layout/chevrons and device/account audit remain.
- [ ] **M06 — Safe optional-assistant boundary.** Validated typed actions for navigation, tutorials, focus, tasks, scheduling and explanation. Route through existing domain logic; no arbitrary state mutation. Small context contract and replaceable providers. The M01 registry action metadata is not this executor.
- [ ] **M07 — Optional AI feasibility, separately.** Investigate Expo/EAS/Android runtime, licensing, storage/RAM, download/removal and performance before native integration. No AI dependency for normal use. Implement only after this investigation establishes a safe approach.

## Chunk log

### M01 — Guide foundation + Today tour

Status: implemented and locally verified. Preview delivery is tracked by the existing GitHub Actions checks for the merged commit.

- Scope: three real Today anchors; manual `?` entry; Settings → View tutorial again → Show me Today; central core-loop copy.
- Validation: TypeScript passed; all 21 verification scripts passed. Six browser scenarios passed (normal/reduced motion at 320×740, 390×844 and 320×568; ready, empty, rest, active Focus and active Review). Checked actual spotlight coordinates, Back/Next/Skip/Done, card bounds, replay, consumed route parameters, restored scroll and unchanged workspace/session storage. Final GitHub checks and Android preview export/publication passed in PR #80 (runtime 0.2.7).
- Fixed during verification: cap the card to the free area beside the spotlight and scroll its copy on compact screens; return to the existing Today route from replay rather than pushing duplicate Today screens.
- Device boundary: browser checks cannot establish Android TalkBack, status-bar/inset behavior or native Back behavior; physical Android verification remains necessary.
- Next chunk: **M02a — local Help search from the registry**, with Explain / Go there and Show me for the completed Today tour. Other screen tours remain later M02 chunks.


### M02a — Local Help search

Status: implemented and locally verified; delivery follows the existing preview pipeline.

- Entry: Settings → Help & tutorial → Search help. Four example questions, a search field, and optional Browse all guides keep the screen small.
- Retrieval: local deterministic keyword, prefix and limited typo/transposition matching. Bounded queries, up to five ranked results, honest no-match state. No new dependency, model, network request, query persistence or study-data mutation.
- Content: descriptions, example questions, detailed instructions and supported navigation/tutorial actions come from the shared registry. Instructions distinguish scheduling study from moving a deadline.
- Actions: Explain expands the instructions; Go there navigates to the existing screen; Show me is offered only for the completed Today tour. Opening Focus from Help does not start a timer.
- Verification: TypeScript and all 22 verification scripts passed. Browser checks at 320×568 passed with normal/reduced motion: Settings entry, the four questions while offline, typo matching, no-match/browse/clear, explanations, Back preserving the query, real Mistakes/Focus navigation, Today tutorial launch, and unchanged saved data. Native keyboard/TalkBack behavior remains a device check.
- Next chunk: **M02b — contextual Focus tutorial**, reachable through Focus’s contextual help and Help’s Show me action. Explain the existing setup/session states without creating another timer. Other advanced tours and first-open guidance remain later M02 chunks.


### F01 — Focus completion and recovery controls on current development branch

Status: implemented and locally verified against the current development snapshot.

- Fixed five-minute launch completion: selecting Finish after five minutes now reaches effort rating and Complete focus instead of remaining trapped at the continuation prompt.
- Break content scrolls on compact screens, including parked thoughts and the newer optional retrieval cue. Break action rows retain a usable full width; nested thought scrolling is enabled on Android.
- Focus and Break header status distinguishes running, paused and complete timers.
- Found a web startup crash caused by importing the optional native local-AI runtime globally. A web-specific unavailable adapter keeps native Nitro imports out of the browser bundle; Android implementation and model storage are unchanged.
- No schema, scheduler, planner, notification, native dependency, runtime-version or model changes. Existing Focus → Retrieve handoff remains intact.
- Verification: TypeScript, all 26 existing verification scripts and 12 browser scenarios at 320×568 passed (normal/reduced motion). Browser checks cover five-minute finish/extend, single-record persistence after reload, paused status, reachable break controls with eight parked thoughts, due-only retrieval handoff and skipping recall. The optional repeatable browser regression is `scripts/verify-focus-ui.cjs`; it requires a separately available Playwright browser and a running Expo web server. Physical Android scrolling/TalkBack and inference remain unverified.
- Next chunk: **M05a — task-only and commitment-only workspace onboarding recovery**, followed by reconciling M01/M02 with the current branch. Preserve the same checklist.


### F02 — Execute pending app checks and repair stale release assertions — 2026-10-14 IST

Status: implemented and locally verified on current development source `ad9fc2a9e3a60116b2e128d424fb0628e722bbd7`; publication pending.

- Recovered the exact current 548-file snapshot and validated Git blob hashes; installed the committed npm lockfile. Preserved all M01–M07 IDs and the historical reconciliation above.
- Reproduced and fixed two verification blockers: the Focus test expected the removed individual retrieval handler; the release test expected the replaced Windows `npm.cmd` initializer. Existing safety assertions remain; initialization checks also reject missing declarations.
- Added execution-based coverage of the actual Break exit handler: pending saves, conflicting rapid taps, bounded captured recall, storage rejection and retry, missing recall, skip and wrong phase.
- Passed full TypeScript, 25 app verification scripts excluding Firestore, 13 additional assistant/scenario checks across India/US timezones, eight conversation Worker tests, publisher offline behavior tests and Expo prebuild config. Scripts used `node --import tsx` because this executor rejects the CLI IPC socket.
- Still pending: Java 21+ Firestore emulator, Git-history/APK compatibility preflight, real Windows/Android QA and OTA publication. Last confirmed preview remains runtime 0.2.13, update `01a1263a-9ff6-700e-96f6-a05d3589d664`. No new model or UI is claimed shipped.
- **Next chunk: M05a — task-only and commitment-only onboarding recovery.** Current `hasMeaningfulWorkspaceData` still omits both existing collections (confirmed in source this turn). Fix that bounded omission and verify onboarding before stopping for Next. M01/M02 reconciliation follows afterward; reuse prior guide work and preserve newer Focus code. Publishing remains pending an authorized verified execution path.


### M05a — Task-only and commitment-only onboarding recovery — 2026-10-14 IST

Status: implemented and locally verified on current development branch; publication pending.

- Returning users with no onboarding record and only tasks or commitments now reuse the existing `existing-data` path. Open/completed tasks and one-off/recurring commitments are recognised.
- Reused the existing provider, owner-scoped onboarding storage and routing. Fresh/settings-only users still enter setup; detection leaves saved work and daily capacity unchanged.
- Added four regressions and saved JSON/migration round-trip coverage. Reproduced failure before the fix; onboarding/auth/settings checks and full TypeScript passed after it.
- No schema, native dependencies, runtime, assistant, timer or animation changes. Physical Android and OTA publication remain pending; broader M05 account/device audit stays open.
- **Next chunk: M01/M02 reconciliation.** Inspect and reuse the older guide registry, then integrate only the foundation and Today entry into current routes with verified anchors. Preserve newer Focus code and stop after that one bounded integration.


### M01 reconciliation — Current Today guide — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Reused the committed earlier registry, geometry, measurement, overlay and Today hook. Adapted current Today controls rather than copying an older Today/Focus screen.
- Header `?` teaches next action → Adjust → Day Map with actual highlights and state-aware copy. Back/Next/Skip/Done restore scroll; the tour closes on owner/navigation/loading changes and cannot start during recommendation transition.
- Existing tutorial replay uses shared Plan → Start → Focus → Retrieve → Feedback → Adapt copy and `Show me Today`; its route request is consumed and does not reopen on reload.
- Passed TypeScript, guide/Today/onboarding/settings/polish/visual checks, OTA guard self-test and final Android export. Ten 320×568 browser scenarios (five states × normal/reduced motion) passed actual coordinate/card bounds, navigation, replay, scroll and saved-data preservation with no page errors/overflow.
- Optional reusable browser harness: `scripts/verify-guides-ui.cjs`; it needs external Playwright/browser and Expo web. No native dependency, lockfile, runtime, planner, model or Focus changes. Physical Android and publication remain pending.
- **Next chunk: M02a reconciliation — offline Help search.** Reuse the earlier search/Help implementation and current registry. Offer Explain, Go there and Show me Today only; Focus/other tours remain later chunks.


### M02a reconciliation — Current offline Help — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Reused the earlier bounded search and Help screen; Settings → Help & tutorial → Search help now opens it. Current registry supplies examples, descriptions, steps and permitted navigation/tutorial actions.
- Four questions work offline, including typo/prefix matching and honest no-match/Browse/Clear. Explain expands instructions; Go there navigates; Show me is available for Today only. Search is ephemeral and never edits saved study data or starts Focus/Review.
- Passed Help/guide/settings/onboarding/polish/visual checks, full TypeScript, OTA guard self-test and Android export. New route types regenerated through Expo, with no casts or generated files committed.
- Both 320×568 browser flows (normal/reduced motion) passed offline questions and explanations, typo/no-match/browse/clear, real navigation/Back preserving query, Focus idle, Today tour and workspace/session preservation, with no page errors or horizontal overflow. Optional harness: `scripts/verify-help-ui.cjs`.
- Physical Android keyboard/TalkBack/Back and publication remain pending. No native dependency, lockfile, runtime, model, planner or timer change.
- **Next chunk: M02b — contextual Focus guidance.** Inspect/reuse preserved earlier guide work and adapt one bounded chunk to current Focus setup/session controls. Offer Show me Focus only when the implemented states are verified; the guide must leave the timer and saved work intact.


### M02b — Contextual Focus guidance — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Reused preserved Focus tour work and generalized existing guide presentation for Today/Focus. Current Focus clock/dial/save/retry/recall behavior remains.
- Focus/Break `?` explains actual setup, active/paused, checkpoint, effort/save and break controls; no-target and active-Review guards also have relevant explanations. Help now offers Show me Focus, with consumed replay request and no automatic task selection/timer start.
- Guide waits for restored sessions and avoids busy saves. It dismisses the keyboard, restores scroll, closes on owner/navigation/loading changes and adapts to timer phase while preserving saved work.
- Passed TypeScript and Focus/guide/Help/Today/settings/onboarding/polish/visual checks, OTA self-test and final Android export. Eleven 320×568 Focus browser scenarios passed, including timer expiry during the tour and exactly-once five-minute completion after reload.
- Rechecked all ten Today and two Help browser flows after sharing hooks: 23 total scenarios passed. Optional new harness: `scripts/verify-focus-guides-ui.cjs`. No native dependency, package/lockfile/runtime, model or domain engine change.
- Physical Android and OTA publication remain pending. Last confirmed preview remains runtime 0.2.13; the new tours are not claimed on the phone.
- **Next chunk: M02c — contextual Review guidance.** Inspect current idle/active recall states and highlight real answer, confidence, reveal and grade controls using the same guide system. Guide itself must not reveal, grade or advance questions.

### M02c — Contextual Review guidance — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Review `?` highlights real queue, answer, confidence, reveal and grade controls. Nine contextual states cover mixed/topic due queues, empty material, future-only questions, optional topic practice, Focus-blocked Review, active attempts and revealed references.
- Help offers Show me Review through the existing registry/hooks/modal. Replay overrides inherited post-Focus auto-start and consumes both conflicting requests; closing/reloading never creates a queue. Regular post-Focus recall still starts normally.
- Tutorial preserves exact workspace, Focus and Review snapshots: drafts, confidence, hints, stage/index, due dates and history. Blank-answer reveal stays disabled. Explicit reveal/Good grading afterward records once, advances one card and stays idempotent after reload.
- Passed full TypeScript, guide/Review/Help/Focus/Today/settings/polish/visual checks, OTA self-test and Android export. All 17 real browser scenarios passed at 320×568, including normal/reduced motion, long references, Back/Next/Done/Skip, Help replay and conflicting/regular auto-start. Inspected confidence and long-reference grading layouts. Optional harness: `scripts/verify-review-guides-ui.cjs`.
- No domain/provider/session-shape, dependency/native/runtime/package/lockfile change. Physical Android keyboard/TalkBack/Back/insets/font scaling and publication remain pending; no OTA/APK or AI deployment occurred.
- **Next chunk: M02d — contextual Progress guidance.** Inspect current evidence, calibration and Neural Map actions, explain actual controls using the shared guide system, and preserve the map's metaphor and evidence definitions. First-open prompts remain a later chunk. Stop here.

### M02d — Contextual Progress guidance — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Progress `?` explains three real anchors: Neural Map topic/empty action, the first insight practice action or recorded summary, and deeper-evidence disclosure or confidence summary/sample count. Copy follows available material, active Focus/Review and expanded/sparse evidence.
- Help offers Show me Progress and Neural Map through the existing registry/modal/hooks, with consumed replay and no reopening after reload. Tours preserve map selection/page, disclosure state and scroll; they do not start practice, create material/evidence, change dates or enroll users in experiments.
- Shared insight selector is calculated once in the screen and passed to LearningInsights; all existing selectors, evidence definitions, providers and practice/resume handlers remain. Unhinted Good recalls count once per question/day; the map remains a metaphor and minutes are not mastery.
- Passed full TypeScript, guide/Progress/Help/polish/visual checks, OTA self-test and final Android export. Fourteen distinct 320×568 browser scenarios passed, including normal/reduced motion, empty/topics/insights, expanded sparse/enough evidence, active Focus/Review, map paging/selection and Help replay. Four expanded cases were rerun after bounding the highlight to the summary/sample, with readable copy and visible controls.
- Exact workspace/Focus/Review snapshots stay unchanged. Explicit future-card practice still opens only the requested question without grading; active-session actions resume saved sessions; selected-topic/empty-map actions still navigate correctly. Optional harness: `scripts/verify-progress-guides-ui.cjs`, with schema-validated fixtures and external browser dependencies only.
- Physical Android TalkBack/Back/insets/font scaling/background behavior and publication remain pending. No native/dependency/runtime/package/lockfile/domain-engine change, OTA/APK or AI deployment.
- **Next chunk: M02e — owner-scoped first-open Today offer.** Inspect onboarding and owner storage, then offer Show me/Later for the existing Today tour, remembering dismissal per owner without forcing an overlay or changing study data. Keep other screens' first-open offers and advanced tours for later. Stop here.

### M02e — First-open Today offer — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Optional Show me/Later card sits below Today’s main action. It waits for workspace, Focus/Review and onboarding restoration, the completed entry transition and recommendation stability. It stays hidden during active Focus/Review and an open tour; opening Today never forces an overlay.
- Choice is remembered per encoded workspace owner/tutorial on this device, independently of study/onboarding data and cloud sync. Explicit header/Help replay also dismisses the unseen offer. Later suppresses future automatic offers; manual `?` and Help replay remain available. A study reset does not erase this separate learned preference or force a tutorial.
- Read failure hides the optional prompt without blocking Today/manual replay. Dismissal is immediate and single-flight; write failure offers Retry while leaving the prompt dismissed and tutorial usable. Stale loads/saves and actions cannot affect a different owner.
- Passed full TypeScript, guide preference/state/geometry, onboarding, Today, Help, polish, visual and transition checks, OTA self-test and final Android export. Six preference regression groups cover validation, encoded owner/tutorial isolation, delayed reads, old-owner writes, duplicate taps, read/write failures/retry and unmount cancellation.
- Fifteen new 320×568 browser scenarios passed: Later/Show me normal/reduced motion, stored choices, active Focus/Review, manual replay, read/write failures, other-owner preference, corrupt record and fresh onboarding normal/reduced motion. Exact workspace/session/onboarding records stay unchanged through offer actions. Rechecked all ten Today tours for ready/empty/rest/Focus/Review normal/reduced motion: 25 browser scenarios total, with real anchors, scroll restoration and replay intact. Inspected the offer screenshot. Optional harness: `scripts/verify-guide-offers-ui.cjs`.
- No domain/provider/session-format, dependency/native/runtime/package/lockfile change. Physical Android TalkBack/Back/insets/font scaling, real account/device checks and publication remain pending; no OTA/APK or AI deployment in this chunk.
- **Next chunk: M02f — first-open Focus setup offer.** Reuse this preference controller/storage, inspect current Focus setup eligibility, then offer the existing Focus tour only after real work is selected and sessions are restored. Suppress while Focus/Review is active; never select work or start a timer. Other first-open offers remain later. Stop here.

### M02f — First-open Focus setup offer — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Optional Show me/Later offer sits below the Focus setup start/launch controls, only with real open task/topic selection, restored sessions, finished onboarding/entry and no active Focus/Review. Opening Focus never chooses work or starts a tutorial/timer automatically.
- Extracted the existing offer hook/card into shared useGuideOffer/GuideOffer, retaining Today wrappers, copy, labels, IDs and appearance. Existing owner/tutorial storage/controller and record format are unchanged; Today and Focus choices are independent on this device.
- Focus choice persists per owner/screen across tasks/topics. Explicit setup `?` also marks it shown. Empty, completed-task, active timer/break and Review-guard tours do not consume an unseen setup offer. Saved choices suppress later offers while manual/Help tours remain available.
- Passed full TypeScript, guide/persistence/Focus/onboarding/polish/visual checks, OTA self-test and Android export. New simultaneous Today/Focus controller regression proves independent choices for one owner; previous owner-race, cancellation and storage-error regressions remain passing.
- Seventeen new 320×568 Focus offer scenarios passed: Later/Show me normal/reduced motion, topic setup, saved choices, no target/completed task, active Focus/break/Review, manual setup guide, empty Help replay then valid setup, read/write failure/retry and other-owner preference. Choices/tours preserve duration, tiny step, workspace, sessions, onboarding and Today choice. Explicit Start afterward creates exactly one start outcome with the selected duration/tiny step and no logged completion minutes.
- Re-ran all fifteen Today offer scenarios and eleven Focus tour scenarios after sharing components: 43 total browser scenarios passed. Existing clock expiry, five-minute exactly-once completion/reload, break/recall and all guide anchors/navigation remain. Inspected Focus offer screenshot. Optional harness: `scripts/verify-focus-offers-ui.cjs`.
- No domain/provider/session-format, dependency/native/runtime/package/lockfile change. Physical Android, signed-in device/owner tests and publication remain pending; no OTA/APK or AI deployment.
- **Next chunk: M02g — first-open Review attempt offer.** Inspect current attempt/restore/busy guards, then offer the existing answer/confidence/reveal tour only with a real saved question, preserving draft, hint/confidence, stage and queue position. Suppress under active Focus/busy transitions; never reveal, grade or advance a card. Reuse this offer system. Stop here.

### M02g — First-open Review attempt offer — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Optional Show me/Later card follows Review’s answer/reveal controls. It requires a real saved question in a restored attempt, completed onboarding/entry and no active Focus/busy grading. Opening Review never forces a tutorial, reveals an answer, chooses confidence/hints, grades or advances a card.
- Reused shared offer/hook/controller/storage unchanged. Choice is independent of Today/Focus, remembered per owner/screen on this device. Explicit attempt-stage `?` also marks it shown. Idle, revealed-reference and Focus-blocked tours do not consume the unseen attempt offer; manual/Help replay remains available.
- Passed full TypeScript, guide/preference, Review scheduling/storage/idempotence, onboarding, Help, polish and visual checks, OTA self-test and Android export. Expanded the existing preference regression to prove Today/Focus/Review independence.
- Nineteen new 320×568 offer scenarios passed: Later/Show me normal/reduced motion; blank/hinted/saved attempts; remembered choices; active Focus; idle/reference stages; manual/idle Help replay; read/write failure/retry; other owner; pending draft autosave; reference-to-next attempt; post-Focus auto-start. Tours preserve exact domain/session/onboarding/other-preference snapshots; the pending draft case permits only the user-typed draft’s normal autosave. Blank reveal stays disabled.
- Explicit reveal/Good afterward still grades once, advances one card and survives reload without duplicate evidence. An undisplayed offer survives reference-stage viewing and appears at the next actual attempt. Existing seventeen Review guide scenarios also passed: 36 browser scenarios total, including long references and replay/auto-start guards. Inspected offer screenshot. Optional harness: `scripts/verify-review-offers-ui.cjs`.
- No domain/provider/session-format, shared offer implementation, dependency/native/runtime/package/lockfile change. Physical Android keyboard/TalkBack/Back/insets/font scaling, real account/device tests and publication remain pending; no OTA/APK or AI deployment.
- **Next chunk: M02h — first-open Progress offer.** Reuse the shared offer and existing map/practice/calibration tour after workspace/session restoration, suppress during active Focus/Review, preserve disclosure/map selection and saved evidence, and never start practice or manufacture progress. Stop here.


### M02h — First-open Progress offer — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Optional Show me/Later card follows Progress’s primary evidence summary. It waits for restored workspace/Focus/Review, finished onboarding and entry transition; active Focus/Review suppresses the offer and its save-error card. Opening Progress never opens a tutorial or starts practice automatically.
- Reused shared offer/controller/storage unchanged. Progress choice is independent of Today/Focus/Review and remembered per owner/screen on this device. Manual header/Help replay marks an unseen normal Progress offer shown; active-session tours do not consume it. Later suppresses future automatic offers while replay remains available.
- Tours and choices preserve disclosure, map page/selection and exact workspace/session/onboarding/other-guide records. Existing explicit future-question practice and empty-map Add topic actions still work, without manufactured evidence or automatic grading.
- Guarded shared spotlight measurement: wait for modal host layout before scrolling and cancel late scroll requests when a step is superseded or the guide closes. Actual-hook regression verifies normal scrolling, original-offset restoration and stale/closed requests; all core tours passed after the change.
- Passed full TypeScript, guide/preference/scroll, onboarding, Help, polish, visual and OTA compatibility self-tests. Corrected the Progress test fixture to use local calendar timestamps; Progress regressions pass in UTC, Asia/Kolkata and America/New_York. The evidence engine is unchanged. Final Android export: `entry-5edc831b9668f0f7e1d9f94fcbd27d76.hbc`, 1,995 modules, 7.2 MB.
- Eighteen new 320×568 browser cases passed: Show me/Later normal/reduced motion, empty, expanded evidence, map paging/selection, stored choices, active sessions, manual/Help replay, preference read/write errors/retry and other-owner isolation. Rechecked Today 10, Help 2, Focus 11, Review 17 and Progress 14 existing cases: 72 browser scenarios total, with actual highlights, readable controls, preserved records, no page errors or horizontal overflow. Inspected the offer screenshot. Optional harness: `scripts/verify-progress-offers-ui.cjs`.
- No domain/provider/session-format, dependency/native/runtime/package/lockfile change. Physical Android, real account/device checks, Firestore/full Git-history release preflight and publication remain pending; no OTA/APK or AI deployment. Last confirmed preview remains runtime 0.2.13.
- **Next chunk: M02i — contextual Library guidance.** Inspect current empty/populated/filtered Library, search/filter controls and material navigation; extend the existing registry and contextual header/Help replay using real anchors. Preserve query/filter/disclosure and saved work; never create topics/questions or start practice through the guide. Keep first-open Library and other advanced-screen guidance for later. Stop here.


### M02i — Library usability and contextual guidance — 2026-10-14 IST

Status: integrated and locally/browser verified on current development branch; publication pending.

- Retained the existing search/filter/sort engine and virtualized topic list. Search hint and guide now accurately explain matching notes and saved questions/answers/hints. Result count and active status/subject/search summary remain available with filters collapsed; Clear all restores the list without modifying data or disclosure state.
- Moved summary, exam context, search and filters into the FlatList header so content scrolls together on compact screens. Header/navigation remain available. Empty Library now offers Add your first topic directly; an empty collection stays distinct from a filtered list with no matches. Filter chips and search/reset actions have 48-point targets. Radio groups expose selected subject/status; the toggle exposes expanded state across native/web accessibility props.
- Library `?` and Help’s Show me Library use three real anchors and state-aware explanations. Preserves query, selected filters, disclosure and original list offset; the guide never creates material, opens a topic or starts practice. Replay requests are consumed on the actual screen; the nested Library waits for its initial commit before consuming a fresh URL request, preventing reopening after reload.
- Shared guide hook accepts a stable measured viewport/scroll adapter for FlatList while existing ScrollView tours retain their behavior. Actual-hook regression covers normal scrolling, restoration and stale/closed measurement rejection for both ports, and verifies an adapter does not use the legacy ScrollView port. Registry retains Today first and advertises only completed tours.
- Passed full TypeScript; guide, Help, topic creation/search/filter/deletion/schema, Settings, polish and visual regressions; OTA compatibility self-test. Final Android export: `entry-8ac40006495ca266510dcb5175d230db.hbc`, 1,996 modules, 7.2 MB. No domain/provider/session-format, dependency/native/runtime/package/lockfile change.
- Seventeen distinct 320×568 Library browser cases passed: empty/populated/combined-filter/no-match normal and reduced motion, expanded filters, long subject, long-list original scroll, active Focus/Review, Help replay, direct URL replay, empty Library with search, and notes/prompt/answer/hint search. Actual highlights/card bounds, Back/Next/Done/Skip, accessible selections, reset, explicit topic/form navigation and exact saved-record preservation passed. Existing Today 10, Help 2, Focus 11, Review 17 and Progress 14 flows also passed: 71 browser scenarios total. Inspected empty, collapsed-filter, long-subject and expanded-guide screenshots. Optional harness: `scripts/verify-library-guides-ui.cjs`.
- Physical Android keyboard/TalkBack/Back/insets/font scaling/virtualized scrolling, real account/device checks, Firestore/full Git-history release preflight and publication remain pending. No OTA/APK or AI deployment. Last confirmed preview remains runtime 0.2.13.
- **Next chunk: M04a — Today deferral/Undo recovery audit and improvement.** Inspect current recommendation transition, Not now, Undo and repeated-avoidance actions against actual saved schedules/deadlines and restored sessions. Fix one verified correctness/usability gap with execution-based coverage and clear feedback, reusing existing engines/motion. Do not add another planner or force a study schedule. Advanced-screen first-open offers and further tours remain later. Stop here.
