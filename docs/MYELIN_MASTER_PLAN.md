# MYELIN master checklist

Last audited: 2026-10-04. Continue this checklist; do not replace it on each turn.
Work one bounded chunk at a time. Verify, report Completed / Verified / Remaining / Next, then wait for **Next**.

## Product contract

Plan → Start → Focus → Retrieve → Feedback → Adapt.
Keep navigation centred on Today → Focus → Review → Progress. Evidence, not a score.
Preserve saved data, deterministic domain decisions, Expo/EAS compatibility and reduced motion. AI remains optional.

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
- [ ] **M02 — Local Help and contextual coverage.** M02a local Help search is complete; M02b Focus guidance is next. Local keyword/fuzzy search and useful explanations cover the four requested example questions. Offer Go there, and Show me for implemented tours only. Then extend tours screen by screen, with contextual `?`, replay and owner-scoped first-open guidance. Keep the registry authoritative.
- [ ] **M03 — Reminder / schedule correctness.** First suppress or safely reschedule notifications while Focus is active, retaining quiet/sleep boundaries and uniqueness. Then reproduce and fix any remaining recurrence, bounds, unscheduled-work, move and Not now bugs with regression checks.
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
