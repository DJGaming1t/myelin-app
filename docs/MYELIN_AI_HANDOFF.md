# MYELIN AI Handoff

Current checkpoint: **2026-10-17 IST**. GitHub is the source of truth. Update this summary after each implementation; keep detailed evidence in linked records.

## Repository and baseline

- Repository: [DJGaming1t/myelin-app](https://github.com/DJGaming1t/myelin-app).
- Active application branch: `codex/exam-autopilot-capacity-v1`.
- Latest verified application commit: `1b9a271ca709685815ed9d8c54f987a45fb40d48` (M04o), based on `8ea8d28d8475aae0c7e27b1d3aac4fcc335081a0`. Application tree: `596856d125a4ed4bf2db92cbbbf85b025779cd9b`.
- The following handoff/receipt commit is documentation only; its exact SHA is reported in the sync report and GitHub history. The verified application source is pinned above. Recheck the live branch head before new work.
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
- M04o: bounded global Progress queries by the supplied clock; validated topic/card attribution while preserving topic-level legacy sessions; deduplicated matching Focus history/outcomes; excluded zero recorded minutes only from timing calibration. Retention keeps first-eligible ordering and its 24-hour threshold, with composite identity and accurate copy. [Policy and deferred semantics decision](progress-integrity.md).
- M04n: preserved unhinted Good wins (including eventual retries), standardized local-day keys, validated topic/card pairs and timestamps, and guarded owner-keyed Neural Map navigation. No M04m logic, schema, scheduler, dependency or native/runtime changes.

## Partial work, limitations and publication

- M04n integrity policy: existing topic/card pairs remain eligible indefinitely, independent of due date or subsequent failures. Cross-topic duplicate card IDs are disambiguated by the saved topic ID. Missing/deleted/mismatched pairs, nonfinite/out-of-range/negative/future timestamps and unresolvable duplicate cards within one topic are excluded. These corrections can lower previously displayed totals/milestones; valid retry wins are preserved. No history is deleted. Calendar-key formatting alone does not change deduplication. M04o now applies related time/identity integrity to global Progress; Neural Map scoring is unchanged.
- Advanced guidance, actual reminder delivery/collisions, remaining scheduling/account/onboarding audits and physical accessibility checks remain incomplete; follow the master checklist.
- Physical Android TalkBack, native Back, keyboard, insets/font scaling, background behavior and real signed-in transitions remain device QA. Browser/VM tests do not prove these.
- Qwen candidates remain release-gated by quality/phone verification. No active general-purpose AI or hosted service is claimed. Preserve the existing zero-spending constraint.
- Last confirmed published Android preview: source `db6bd026fd8b33cdccfeb0fb68925ac6900240a8`, channel/branch preview, runtime 0.2.13, group `2088f71e-b024-4838-b861-bfd6c6b36422`. [Receipt](beta/guides-recovery-update-20261015.json).
- M04i–o are committed/locally verified, **not confirmed published**. Last direct publish stopped before upload because Expo CLI authentication was unavailable. Historical GitHub billing/spending and EAS workflow quota blocks also exist. None was rechecked during M04o. Do not restart sign-in or claim publication without an actual receipt.

## Verification

- Historical M04m: TypeScript; all 27 non-Firestore package verification scripts; actual component VM in UTC/Asia-Kolkata/America-New-York; retained Review/Mistakes/Focus, adaptive/transition and OTA compatibility/self-test passed. All 50 browser cases passed (18 insight, 14 guide, 18 offer); Android export succeeded.
- Exact results/source hashes: [M04m verification](beta/progress-insights-verification-20261015.json). Firestore rules were unchanged and not rerun in M04m; M04i's emulator pass is historical.
- M04n: TypeScript, all 27 non-Firestore verification scripts, actual map/provider VM in three timezones, adaptive/transition and OTA checks passed. All 54 browser cases passed (4 map, 18 insights, 14 guides, 18 offers). See [Neural Map receipt](beta/neural-map-verification-20261017.json) for fresh tests and limitations. Owner switching/loading/unmount/account-cycle races use the actual component + WorkspaceProvider VM; real signed-in account transitions remain device QA. Deleted/orphan/malformed inputs are defensive engine tests because workspace validation already blocks many such records. No authentication, deployment or native build was attempted.
- M04o fresh verification: TypeScript; all 28 package verification scripts (Firestore under Java21 emulator); three-timezone integrity suite; adaptive/transition/Focus-start; 33 Worker tests and OTA compatibility/self-test pass. All 56 browser cases pass (2 new integrity + 4 map + 18 insight + 14 guide + 18 offer). [receipt](beta/progress-integrity-verification-20261017.json). Changes are read-only; timing sample counts/ratios and corrected Progress/retention totals can change as detailed in the policy. No Android preview is claimed.
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

- Argos M04n recommendations, reviewed against base 96245fe and approved by the user on 2026-10-17: implemented with restrictions. First-attempt-only scoring rejected for this chunk; historical retry wins retained. Broader old replacements (M04m, reminders, onboarding, timer, cleanup and silent history trimming) were not applied.
- M04o Argos recommendations: implemented with user safeguards; filter-before-dedup retention semantics retained, ID-only Focus suppression rejected, positive short work and zero-minute historical starts/completions preserved.
- Next recommendation: Gemini/Argos review M04o query boundaries, Focus-match conservatism and the documented retention product decision; then prioritize existing device/account QA or release recovery through the master checklist. Stop after M04o until authorized.
- Deferred: first-attempt-only retention needs separate approval/versioning. Examples and expected historical effects are documented in progress-integrity.md; no filter-order change was made. Do not infer publication from committed source.
- Then continue the existing checklist: device/account QA and release recovery, remaining guidance/reminder/scheduling audits. Keep optional model feasibility and quality work separate.
