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
| M01 / M02 | Today guide foundation and offline Help were delivered in PRs #80–81 on `expo-migration`, but are absent from this development branch. Unfinished Focus tutorial is preserved separately, not copied over newer Focus code. | Reconcile the existing registry/Help work into current routes before adding more tutorials. |
| M03 | Focus-aware reminder planning, recovered-window intents and expiry fallback now exist. Reminder Studio shows recovered notification previews. | Device delivery checks and multi-reminder collision/cap explanations; no duplicate reminder engine. |
| M04 | Multi-exam capacity planning/reflow, Focus → optional due-only retrieval and visible topic adaptation now exist. | Targeted correctness and evidence/motion audit; this chunk fixes Focus completion/recovery controls. |
| M05 | Existing onboarding/account/settings remain. `hasMeaningfulWorkspaceData` still omits tasks and commitments. | Fix that confirmed omission next; device/account audit remains. |
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
- [ ] **M02 — Local Help and contextual coverage.** M02a local Help search is complete on the older branch; integration into the current development branch is pending before M02b Focus guidance. Local keyword/fuzzy search and useful explanations cover the four requested example questions. Offer Go there, and Show me for implemented tours only. Then extend tours screen by screen, with contextual `?`, replay and owner-scoped first-open guidance. Keep the registry authoritative.
- [ ] **M03 — Reminder / schedule correctness.** Focus-aware suppression/recovery exists on the current development branch; audit delivery while retaining quiet/sleep boundaries and uniqueness. Then reproduce and fix any remaining recurrence, bounds, unscheduled-work, move and Not now bugs with regression checks.
- [ ] **M04 — Recovery and evidence polish.** Unify Make smaller / Find another time / Move / Remove for repeated avoidance; preserve progressive, calm overdue urgency. Audit completion feedback and open/close/undo motion. Audit deterministic recommendations, review calibration/confusion practice, actionable Progress and Neural Map semantics without replacing existing engines. Tie changes to starts, completed blocks, retention and recovery outcomes.
- [ ] **M05 — Onboarding, settings and account audit.** Explain only the core loop at setup; advanced guidance stays contextual. Check task-only existing users, login persistence, account deletion, tutorial replay, layout/chevrons and dead controls. Report anything needing a real device/account.
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
