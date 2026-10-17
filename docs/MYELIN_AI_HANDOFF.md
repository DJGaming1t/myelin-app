# MYELIN AI Handoff

Current checkpoint: **2026-10-17 IST**. GitHub is the source of truth. Update this summary after each implementation; keep detailed evidence in linked records.

## Repository and baseline

- Repository: [DJGaming1t/myelin-app](https://github.com/DJGaming1t/myelin-app).
- Active application branch: `codex/exam-autopilot-capacity-v1`.
- Latest verified application commit: `fa34a232288d03f0d0bfe858309959d27cb765ea` (M04m); remote head and clean local checkout matched on inspection. Tree: `a5fe2ec623ab5f35d1f116d788fd566a13844a44`.
- This synchronization change is documentation only. Its SHA is available in this file's GitHub history and the accompanying sync report; the application baseline above is not a permanent claim about the current branch head.
- Default branch `main` at `c50c72a359feac15dc489e41e006779b4610eab2` contains only README.md. Do not base app work on it. `expo-migration` is an older application branch.
- Open PRs inspected: [#65 native icon](https://github.com/DJGaming1t/myelin-app/pull/65) targets expo-migration; [#83 hosted deployment workflow](https://github.com/DJGaming1t/myelin-app/pull/83) is a draft targeting main. Both remain untouched. No open PR targets the active branch at this checkpoint.
- Preserve the existing [master checklist](MYELIN_MASTER_PLAN.md). The previous handoff is preserved verbatim in [the historical archive](history/MYELIN_AI_HANDOFF_THROUGH_20261015.md). Its old next steps and release claims are dated history.

## Architecture

- Expo 57, React Native 0.86, React 19 and TypeScript; Expo Router routes in app/, domain/UI modules in src/features/, data in src/data/. Android preview runtime: 0.2.13.
- app/_layout.tsx composes auth, workspace, onboarding, Focus, Review, reminders, cloud sync, achievements and optional local-AI providers.
- Core loop: Today → Focus → Review → Progress; Plan → Start → Focus → Retrieve → Feedback → Adapt.
- Local-first, owner-scoped workspace/session storage with Firebase auth and cloud-sync modules. WorkspaceProvider is the mutation/persistence boundary: readWorkspace(expectedOwner), guarded updateWorkspace(change, {ownerKey, canApply}), waitForSaves(), and retrySaves(expectedOwner). Retry persists the latest snapshot without repeating a mutation. Preserve live-owner/revision and post-await guards.
- Deterministic planning/capacity and review-memory engines remain authoritative. Review estimates are FSRS-inspired, not individually calibrated measurements. Mistakes use spaced retest rules; progress requires recorded evidence.
- Optional assistant uses validated typed actions/proposals, existing domain APIs and provider boundaries. LiteRT-LM/model tooling and isolated hosted Worker/D1 foundations exist; that does not establish model quality, active hosting or reliable phone inference. Normal study flows work without AI.

## Implemented and recently completed

- Topics/cards, tasks, Today recommendations, Focus, Review, Mistakes, exams/capacity planning, Day Map, Progress/Neural Map, settings, onboarding, import/export, reminders and sync modules exist. This is not a claim of complete device QA.
- Core-loop tours, offline Help, first-open guide offers, Library guidance and task-only returning-user detection.
- M04a–h: guarded task deferral/completion/Undo/edit/scheduling/rebuild/Day Map/Get unstuck and Focus starts with save recovery; included in the last confirmed preview.
- M04i: optional saved-reference correction practice without invented references or automatic grades.
- M04j: Review owner/attempt guards, save failures, idempotent retry and restore recovery.
- M04k–l: Mistakes retest and notebook create/edit/delete/reopen guards; retained drafts/results and nonduplicating save retry.
- M04m: Progress insights validate current evidence identity/time, resolve timestamp ties, explain evidence/practice limits, and navigate only after accepted targeted Review starts. Existing sessions/drafts resume intact. Ambiguous cross-topic card IDs are omitted from actionable targets; schema/queue APIs are unchanged.
- This checkpoint: established Codex/Gemini workflow and shortened the live handoff. No application changes.

## Partial work, limitations and publication

- M04n Neural Map evidence/topic navigation audit is pending. Examine future timestamps, identity, duplicate IDs and stale links while preserving legitimate earned progress. Global Progress aggregates were outside M04m scope.
- Advanced guidance, actual reminder delivery/collisions, remaining scheduling/account/onboarding audits and physical accessibility checks remain incomplete; follow the master checklist.
- Physical Android TalkBack, native Back, keyboard, insets/font scaling, background behavior and real signed-in transitions remain device QA. Browser/VM tests do not prove these.
- Qwen candidates remain release-gated by quality/phone verification. No active general-purpose AI or hosted service is claimed. Preserve the existing zero-spending constraint.
- Last confirmed published Android preview: source `db6bd026fd8b33cdccfeb0fb68925ac6900240a8`, channel/branch preview, runtime 0.2.13, group `2088f71e-b024-4838-b861-bfd6c6b36422`. [Receipt](beta/guides-recovery-update-20261015.json).
- M04i–m are committed/locally verified, **not confirmed published**. Last direct publish stopped before upload because Expo CLI authentication was unavailable. Historical GitHub billing/spending and EAS workflow quota blocks also exist. None was rechecked in this documentation pass. Do not restart sign-in or claim publication without an actual receipt.

## Verification

- Historical M04m: TypeScript; all 27 non-Firestore package verification scripts; actual component VM in UTC/Asia-Kolkata/America-New-York; retained Review/Mistakes/Focus, adaptive/transition and OTA compatibility/self-test passed. All 50 browser cases passed (18 insight, 14 guide, 18 offer); Android export succeeded.
- Exact results/source hashes: [M04m verification](beta/progress-insights-verification-20261015.json). Firestore rules were unchanged and not rerun in M04m; M04i's emulator pass is historical.
- This documentation pass checks remote branches/open PRs/default-branch contents, exact baseline tree, verbatim archive, local Markdown targets and documentation-only diff/whitespace. No app tests, build, auth flow or deployment are claimed rerun.
- Future changes require relevant regression checks. This host uses node --import tsx for TS scripts because the tsx CLI IPC path may be unavailable. Distinguish new execution from historical evidence.

## Codex / Gemini synchronization protocol

1. **Roles:** Codex implements; Gemini supplies research, architecture and review through the user. GitHub source outranks uploaded snapshots and assistant memory.
2. **Before editing:** fetch actual branch head/open PRs, inspect local work and applicable instructions, then read this handoff/master checklist. Reconcile overlapping or moved work; never force-push over another contributor.
3. **Recommendation intake:** record the recommendation, supplied base SHA, affected area, rationale/evidence, acceptance tests and status: needs validation / accepted / deferred / rejected / implemented. Inspect real code first; explain stale assumptions or conflicts. A recommendation is not a completed change.
4. **Implementation:** make one small approved, testable change. Preserve existing engines, data and ownership boundaries. Use a focused branch from the verified application head and PR to the active integration branch when separate review or overlapping work warrants it. Routine authorized continuation may use the established branch with a leased update. Do not merge the whole app into README-only main for this workflow.
5. **Verification/save:** run relevant tests, inspect the final diff, record limitations, recheck remote head, reject mismatched leases and verify committed content/final ref. Distinguish source saved, PR merged and build published.
6. **Handoff:** refresh this summary and the same master checklist when its status changes. Link detailed receipts/history. Name the latest verified application SHA; documentation-only commits do not imply another app test run. Report the exact newly created SHA after saving.
7. **After every completed implementation:** provide a **GEMINI SYNC REPORT** with changes/reasons; exact modified files; branch/commit/PR if applicable; architecture/API changes; tests/results; remaining problems; and research/review questions. Stop after the bounded chunk unless further work is authorized.

## Pending Gemini recommendations and priorities

- No specific Gemini technical recommendation has been supplied for evaluation at this checkpoint. The current request establishes workflow, not completion of M04n.
- Next: **M04n — Neural Map earned-recall evidence and topic navigation**, reusing current map/metrics and preserving legitimate earned progress.
- Useful Gemini review: inspect src/features/adaptive/insight-engine.ts, NeuralMap.tsx, validation and retained adaptive/Progress tests at an exact GitHub SHA. Recommend explicit semantics/tests for deleted or ambiguous card evidence, future timestamps, local-day deduplication and owner-safe links; explain tradeoffs before proposing code.
- Then continue the existing checklist: device/account QA and release recovery, remaining guidance/reminder/scheduling audits. Keep optional model feasibility and quality work separate.
