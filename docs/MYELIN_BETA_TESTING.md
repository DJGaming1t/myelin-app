# MYELIN assistant beta

## Guides, recovery and guarded Focus starts — published 2026-10-15 IST

**Latest Android preview:** source `db6bd026fd8b33cdccfeb0fb68925ac6900240a8`, channel/branch `preview`, runtime `0.2.13`. Update `01a13c1e-bd41-7ebc-925b-756e31ec79ea`, group `2088f71e-b024-4838-b861-bfd6c6b36422`, published at `2026-10-14T20:33:29.921Z` (2026-10-15 02:03:29 IST). [Expo update group](https://expo.dev/accounts/duckslord/projects/myelin/updates/2088f71e-b024-4838-b861-bfd6c6b36422). CLI returned Published and the signed-in dashboard confirms the source, Android/runtime and preview deployment. Raw receipt: `docs/beta/guides-recovery-update-20261015.json`; local verification: `docs/beta/guides-recovery-verification-20261015.json`.

**Included:** accumulated returning-user recovery, contextual/core guides, offline Help and first-open offers, guarded task editing/scheduling/Day Map rebuild/Skip/Undo/save recovery, repeated-postponement Get unstuck and guarded Focus first-step/start persistence. A delayed Focus start cannot record an outcome for a new owner/session or a changed invalid target. Storage failure creates no started outcome and retry remains explicit. Existing timer, memory/planning engines, saved formats, native inputs and runtime remain unchanged. This publication contains app changes; it does not publish a new phone model or live AI endpoint.

**Verification:** TypeScript, 27 non-Firestore package verify scripts, Worker security/assistant/India-US regressions, Focus/Workspace VM in three timezones and 53 distinct browser scenarios passed. Unchanged Firestore rules tests also pass locally with Temurin Java21 via node --import tsx. All 609 tracked files matched the exact release tree; the existing native compatibility checker passes against installed preview build source `137eee631edbe582da8c0e64ec89229a86a5aa9a`. Local checkout is shallow, with authentic exact baseline/current commit and complete tree objects; parent history was not downloaded. Expo export/upload succeeded. Hosted verification did not run: GitHub’s account payment/spending gate and EAS’s exhausted Free workflow-minute allowance blocked their jobs. Direct local verification and official EAS CLI publication succeeded without billing or permission changes.

**Physical Android QA pending:** open the existing runtime-0.2.13 preview online, then fully close/reopen to fetch/apply the update. Replay the real-control guides from contextual help/Settings and test Help search. On an open repeatedly postponed task, test Get unstuck → existing Focus/edit/scheduler actions and cancellation. Check task notes/editing preserve precise deadlines/logged work; exercise Day Map refresh/Skip/Undo. Start a five-minute and full Focus block, pause/resume and force-close/reopen; check one session/start and correct completion minutes. Check TalkBack, keyboard, Back, insets, font scaling, background and account transitions. No phone test or successful download/launch is claimed by the server receipt.

**Next improvement:** M04i wrong-answer review feedback, using existing saved material/Mistakes; preserve the scheduler and avoid invented authoritative explanations. Existing checklist and historical beta sections below are retained.

## Reminders Studio device cancellation safety — 2026-10-10

**Scenario:** MYELIN previously swallowed Android cancellation errors, so rescheduling could add a new alert while the old one remained, and switching reminders off could incorrectly claim the old alerts were gone. The new cancellation helper deduplicates IDs and reports a failure if **any** OS cancellation fails, preserving known prior IDs/plan signature for retry. There is no automatic replacement when cancellation fails. The provider also requires an actual owner-specific OS notification audit to claim "verified" and the Studio shows **SCHEDULE NEEDS CHECK** on failed or unknown confirmation.

**Automated verification:** `scripts/verify-notifications.ts` now simulates one failed cancellation and another still running, asserts it waits for both without exposing internal OS diagnostics, verifies subsequent retry succeeds with no duplicate IDs, and checks provider/Studio error paths. Full TypeScript, app regressions, owner-switch routing and hybrid safety checks succeeded in [run 38046581004](https://github.com/DJGaming1t/myelin-app/actions/runs/38046581004). Initial checks failed on outdated source assertions only; no initial failed run published.

**Physical Android QA pending:** with compatible preview installed, enable reminders and schedule a due review / exam / Day Map study block, then verify device-delivered copy matches Studio. Move or complete the task and confirm its old alert disappears. Turn reminders off and confirm no prior MYELIN alert fires. Under controlled fault injection or device notification service failure, verify Studio shows a warning rather than claiming success, preserves settings and previous device registrations, and allows a safe Refresh schedule retry. With notification permissions denied, no falsely verified alerts should show. Check owner switching and local mode; do not send stale private owner notifications to a different user. No actual on-phone OS notification-fire/fault-injection validation was performed during this code chunk.

[Android beta release gate 38046581004](https://github.com/DJGaming1t/myelin-app/actions/runs/38046581004), source `dc978a0736b2b804a1fa57150c23008843a69237`, runtime `0.2.13`; **Android preview published and receipt verified**: [run 38046581004](https://github.com/DJGaming1t/myelin-app/actions/runs/38046581004), both verify and publish SUCCESS; Expo logged `✔ Published!`. Update `01a12577-099d-739f-8971-806a90728249`, group `ffd1481c-a88d-49ce-8d81-b42561dc8779`, runtime `0.2.13`, source `dc978a0736b2b804a1fa57150c23008843a69237`, created `2026-10-10T10:58:40.669Z` (16:28:40 IST), OTA artifact `11666769392`, scenario artifact `11668060411`. Phone-side notification-fire, permission, owner-switch and cancellation-fault tests remain pending.


## Focus timer save-error recovery — verified 2026-10-10

This one-chunk product improvement addresses **silent Focus session persistence failures**. The old provider swallowed AsyncStorage errors and could show an active, paused or completed session that would disappear on an app restart. Its parked-distraction input was cleared before its text was actually saved. MYELIN now reports session-storage errors, reverts unpersisted timer changes to the previous in-memory state when still current, and allows a later storage write to retry. Parking preserves text until the save succeeds, and failed break/discard storage operations keep the user on Focus instead of navigating away.

**Verified in automated app tests:** failed Focus writes reject rather than silently resolving; a subsequent retry and clear succeed; concurrent writes retain their order; source checks confirm visible error banners, preserved distraction text, and break/discard navigation only following successful persistence. No schema migration or native dependency changes.

**Physical Android QA still pending:** with a compatible preview APK, start and resume Focus, park a thought, finish early, finish a full session, complete/skip a break and discard a session. Confirm ordinary successful behavior remains smooth across force close and reopen. On a test device or controlled fault-injection harness, simulate AsyncStorage save failure at each transition: confirm the app shows an accessible warning, does not claim the failed state was persisted, preserves an uncommitted parked-thought input, does not leave the break/finish screen on unsuccessful save/clear, and lets users retry after storage recovers. Check that recorded study/history is not duplicated after retry. The app screen cannot practically simulate storage failure via ordinary tapping alone; automated regression is not a substitute for this fault-injection QA.

[Full verification and Android preview publication run 38038542122](https://github.com/DJGaming1t/myelin-app/actions/runs/38038542122) verifies `preview` runtime `0.2.13` at commit `85861d006a9c868f35468ac6bc742f9fbe24fbd8`. **Release confirmed**: both jobs SUCCESS in [run 38038542122](https://github.com/DJGaming1t/myelin-app/actions/runs/38038542122), Expo printed `✔ Published!` for Android update `01a124f9-453e-7245-acfb-41bb32c0b9f8`, group `0635a487-2aca-4154-855f-56b3c62e1312`, runtime `0.2.13`, source commit `85861d006a9c868f35468ac6bc742f9fbe24fbd8`, published UTC `2026-10-10T08:41:18.398Z` (14:11:18 IST). Receipt artifact `11664787064` and app-scenario artifact `11665320011`. Physical Android QA is still pending.


Target: Android internal preview, EAS project `2171936c-83f9-459f-9bb6-dddc4768484e`, channel/environment `preview`, runtime `0.2.13`. Production is not changed.

The compatible APK is build `877c5749-c608-4d23-bca9-aca66fb2df06`, built from `137eee631edbe582da8c0e64ec89229a86a5aa9a`. The publishing workflow compares native inputs and dependency metadata with this exact commit before publishing. It runs full TypeScript and all existing app regression scripts, then publishes from a fresh checkout of the verified commit. A receipt is uploaded as `myelin-assistant-beta-update` only after EAS succeeds.

Published 2026-10-08 09:34 UTC: update group `13189175-e2b7-4fee-a910-8828facfe65e`, Android update `01a11adc-d079-745b-a8bd-ea71b6da9816`, runtime `0.2.13`, branch `preview`. Full verification and publication: https://github.com/DJGaming1t/myelin-app/actions/runs/37757132256. Receipt: `docs/beta/assistant-update-20261008.json`. Source commit `fafbfeb6f223d44ea4a7538a3c3c4c62aa2d544b`. Automated checks passed; physical-device smoke test is still pending.

Earlier schoolwork update published 2026-10-08 09:53 UTC (15:23 IST): group `73bc7b39-a37b-49d1-a556-fc30143dc79a`, Android update `01a11aee-348b-7bc9-a545-938c07316392`, runtime `0.2.13`, branch `preview`. Full verification and publication: https://github.com/DJGaming1t/myelin-app/actions/runs/37759348032. Receipt: `docs/beta/schoolwork-update-20261008.json`. Source `5c644549305790be1c005eec26a027559fa76e00`. The existing compatible APK receives this OTA; no reinstall or data clearing is required.

## Opt-in hosted chat with live workload counts — 2026-10-10

**Behavior:** In an Android preview with an eligible deployed and tested Qwen `/chat` endpoint, after the user explicitly enables the Cloud conversation switch, typing `Analyse my current workflow` now routes to **hosted text inference** rather than the deterministic local audit. An aggregate snapshot is generated with active/open work, known remaining minutes, missing estimates, overdue and due-soon counts, repeat postponements, fully logged tasks awaiting review, seven-day recorded minutes and days, review/mistake counts, number and nearest day of exams within 14 days, and daily study budget. No raw task names, task notes, subject labels, user IDs, individual exam names, study prompts, study responses or full workspace documents are automatically included. Subsequent consented conversation turns receive refreshed aggregates for follow-ups. The opt-in confirmation describes precisely what is sent; user-typed previous chat messages can still contain personal details.

**Fail-safe:** With no valid verified endpoint or consent, local `Analyse my current workflow` remains an offline deterministic report; no aggregate is sent. The hosted model only returns text. No task mutation happens through conversation. Very long questions preserve the full input and omit the optional aggregate rather than trimming the question. Backend authentication, quotas and chat protocol are unchanged. Pre-publication automated tests checked numerical correctness, lack of private content in aggregate payload, read-only behavior, consent controls, follow-up routing and full app regression suite.

**Physical Android QA pending:** Confirm local/offline workflow analysis without cloud; after a real owner-authorized HTTPS deployment, verify the explicit cloud consent dialog shows workload-count sharing, inspect outbound request locally for absence of raw saved notes or study answers, check multi-turn hosted analysis changes with workspace data, and confirm that declining consent never sends a request. Never interpret successful Expo OTA publication as proof hosted inference has been deployed or tested.

[Android beta publication run 38037012724](https://github.com/DJGaming1t/myelin-app/actions/runs/38037012724) initiated for compatible runtime `0.2.13`. **Verified and published**: [run 38037012724](https://github.com/DJGaming1t/myelin-app/actions/runs/38037012724) both verify/publish SUCCESS, Expo `✔ Published!`, Android update `01a124e1-1be6-7f42-b922-4d4d9e75627d`, group `6c4f8f7d-a926-4d76-894d-d6cdca05538c`, runtime `0.2.13`, source `e1beae6ff6c07f5a95bafbcbc12851e2909948c0`, created UTC `2026-10-10T08:14:54.950Z` (13:44:54 IST), EAS receipt artifact `11664004147` and app scenario artifact `11663669046`. Real hosted Cloudflare Qwen inference remains undeployed and unverified. The deployed Cloudflare Worker/D1 and real-model smoke test are still unavailable.

## Hosted Qwen chat bridge — published 2026-10-10

The code for a **real model-generated, multi-turn conversation** is now shipped to the compatible preview APK. Full source verification and Expo publish both **SUCCESS** in [run 38035051280](https://github.com/DJGaming1t/myelin-app/actions/runs/38035051280); update `01a124c1-7f8f-707f-aa69-c406c43600d0`, group `0fc7da02-2c61-4f44-a54e-fefbfd32d031`, Android channel `preview`, runtime `0.2.13`, source `2a90ac95bcfa7c10d591da1b2c37a9b6de9e575e`, created UTC `2026-10-10T07:40:23.311Z` (13:10:23 IST). Expo `✔ Published!` receipt artifact `11664255626`, app scenario artifact `11663905655`. All `verify:` scripts, TypeScript, chat Worker auth/quotas, integration/safety regressions passed.

**Critically, the actual hosted model is NOT live:** No configured/deployed Cloudflare Worker, D1 database/credentials, or verified live provider request was available in this session. `EXPO_PUBLIC_MYELIN_CHAT_ENDPOINT` remains empty; chat stays explicitly disconnected, local task/workflow tools still work and the app must never pretend an unavailable phone Qwen has answered. Do not classify the successful Expo publication as an inference/deployment smoke test. No APK rebuild or phone model download required.

**Physical Android QA pending:** Open compatible preview online, fully close/reopen after update. In assistant screen, the Cloud conversation section should explain that no live endpoint is connected and must not offer an operable hosted switch. Asking a non-rule, open-ended question should explain the endpoint is missing rather than showing the older "Qwen has no released phone version" message. The grounded local “Analyse my current workflow” and ordinary task action confirmations must still work. Check that no private chat data is sent without opt-in.

**Required before enabling real conversation:** An authorized, eligible Cloudflare account owner must provision Free Workers AI + dedicated D1, complete Firebase ID-token verification and quota-binding smoke checks, run a **real** Qwen conversation/limits/privacy acceptance test, and publish the public HTTPS Worker `/chat` URL via EAS `preview` environment variable `EXPO_PUBLIC_MYELIN_CHAT_ENDPOINT` (never a secret/API key). Run full OTA gate again and verify a signed-in, email-verified user can explicitly opt in, converse in at least two turns, cancel a generation, receive failure/quota messages and keep task data unchanged. Cloudflare identity/deployment is unavailable in this chat; don't claim the model works on phone until these steps succeed. The previous Gemini Firebase route remains paused for school-audience and billing reasons.

## Day Map confirm completion or extend estimate — published 2026-10-10

Verified Android EAS `preview` OTA `01a12485-a255-76cd-9add-e5bb750c3263`, group `9e2380e4-d015-4fb9-ab6c-f10ad7ce62ca`, runtime `0.2.13`, source commit `bbd668d61d9abeb0c69ed9fb7ac9ff477684aa04`, created `2026-10-10T06:35:00.053Z` (12:05 IST). [Release verification and publication 38031244433](https://github.com/DJGaming1t/myelin-app/actions/runs/38031244433): full verify, TypeScript, app regression, hybrid safety and Expo publish SUCCESS; Expo printed `✔ Published!`. Receipt artifact `11662485508`, scenarios artifact `11661894095`. Compatible installed preview APK receives this JavaScript OTA; no native rebuild or local model activation.

**Physical Android QA pending:** Open compatible installed preview APK online, then completely close/reopen after update. In Day Map, find a scheduled **open** task whose `actualMinutes >= estimatedMinutes > 0` (usually a synced/legacy record; normal MYELIN entry auto-completes at its estimate). Confirm its original saved slot remains visible but does not block free study time, with an **ESTIMATE MET · REVIEW TASK** panel. Verify **Mark complete** opens a confirmation, **Keep open** preserves all task state, confirming marks complete and the existing achievement allows Undo. Verify **Extend estimate** opens a choice with **Cancel**, **Edit minutes** (existing task edit screen; user changes Estimated time and taps **Save task**), and **Add 25 min** (30/30 should become 30/55). Ensure the recorded 30 minutes and original scheduled timestamps remain unchanged after the extension; the legitimate remaining 25 minutes should again reserve the saved time. A partially recorded task must continue showing its ordinary Focus and Complete actions, with no stale estimate panel. The quick add must reject 25 minutes above the 720-minute total cap rather than silently truncating. Confirmation dialog taps, focus, layout on narrow phones, accessibility labels, native Alert behavior and undo must still be verified physically.

This UI improvement is a local, user-confirmed MYELIN scheduling action, **not a stronger cloud/on-device AI model**.

## Zero-remaining saved study slot — published 2026-10-10

Android `preview` EAS update `01a1247d-18ba-743c-9018-2c91e55ca3f3`, group `619804ce-e8af-4c8c-b697-7eeb6b110c93`, runtime `0.2.13`, source commit `719edc591dbeaab3c67be713f06a5477df30e51b`, created UTC `2026-10-10T06:25:40.538Z` (11:55:40 IST). [Full verification and publication run 38030734391](https://github.com/DJGaming1t/myelin-app/actions/runs/38030734391): verify job SUCCESS, publish job SUCCESS, Expo printed `✔ Published!`. EAS receipt artifact `11661983204`, app scenarios artifact `11661249835`. First attempt run `38030661866` failed before publication on TypeScript union narrowing in the test; it was corrected and the successful release was rechecked. No new native APK, LLM, or model training.

**Android handset QA still pending:** Open the compatible preview online and fully close/reopen after update. Set up an open task with a known 30-minute estimate and a saved future 4–5 PM slot. With 30 recorded actual minutes while its status is still open (e.g. synced/older state), Day Map should **retain** the 4–5 PM task entry with **“Estimate met · review task”** while free-window capacity can include that same time and planned-study minutes no longer include another phantom 30 minutes. Exam Autopilot and the assistant should not reserve the stale hour; assistant Review my plan should explain why the saved slot needs review without false overload/sleep/overlap alarms. A normal partially completed task (29/30) must **still block** its scheduled window, and an unknown estimate must **not** be assumed complete. Verify the original task status, estimate, actual work, start and end timestamps never change unless the user acts; no auto-completion/unscheduling. After confirming, consider a user-confirmed “Mark complete / Extend estimate” action to reduce confusion. This is deterministic scheduling correctness, not a phone model change.

## Fully logged open-task workload correction — published 2026-10-10

Android `preview` OTA `01a12473-c38f-70b5-9fa9-1aedb705607f`, group `99367cb2-c8dd-4888-b972-56228bf6418b`, runtime `0.2.13`, source `49996450dca5fd6baa686133dfcc82a5060c5968`; created UTC `2026-10-10T06:15:28.911Z` (11:45:28 IST). [GitHub run 38030105917](https://github.com/DJGaming1t/myelin-app/actions/runs/38030105917) full-app verification **SUCCESS** and Android publishing **SUCCESS**, with explicit Expo `Published!` confirmation, receipt artifact `11661787347`, scenario artifact `11661532281`. Existing compatible preview binary can receive the JS-only update.

**Physical Android QA (not yet performed):** With installed compatible preview APK online, fully close/reopen to receive the update. Add a task with 30 minutes estimated; record 30 minutes of actual study and verify the app normally completes it. If a restored or synced older task remains *open* despite `actualMinutes >= estimatedMinutes`, it should not receive a new 30-minute Focus recommendation in Today, should not reappear as 30 additional exam-work minutes in the joint workload ledger, and should not receive new exam-coverage credit. Its saved status and actual minutes must remain unchanged until you explicitly complete it or extend its estimate. Compare a 29/30-minute partially completed task (remaining 1 minute in the ledger, not 30) and one with no estimate (pre-existing provisional 25-minute planning assumption). On-device scheduling and calendar handling should be reviewed separately: this fix does not automatically delete a task's already-saved scheduled slot.

This is a deterministic no-phantom-work correction, not an upgrade to any on-device or cloud LLM. Automated suites passed; physical app verification is still pending.

## Elapsed scheduled Focus capacity — published 2026-10-10

**Latest verified follow-up:** GitHub [run 38029710805](https://github.com/DJGaming1t/myelin-app/actions/runs/38029710805) full app verify and publication both SUCCESS, EAS explicitly `✔ Published!`. Android `preview` update `01a12470-0803-73ad-a701-117d1caf44ad`, group `4054887d-6ba3-4b29-9053-805e8af66281`, runtime `0.2.13`, source `5834026e47d39bbc2308e72d42af9f9ea84f46ff`, created UTC `2026-10-10T06:11:24.291Z` (11:41 IST), JSON receipt `11661238869`, test scenario artifact `11661168779`. This supersedes the earlier OTA listed below; the same capacity correction has now passed the final corrected regression snapshot. Physical phone QA remains pending.

Verified Android `preview` EAS Update `01a1246c-d33c-7102-97cb-66c8939278db`, group `10e5f456-3b1d-4c69-b9e0-f143aba5361e`, runtime `0.2.13`, source `73515ab597aa96185e14c2cb8224b0f92cc0e3bb`. Published 2026-10-10T06:07:54.172Z (11:37:54 IST). [GitHub verification and publication run 38029654765](https://github.com/DJGaming1t/myelin-app/actions/runs/38029654765): both jobs SUCCESS, Expo explicitly printed `Published!`, JSON receipt artifact `11661836671`, scenario artifact `11661806449`. Existing compatible Android preview APK can receive this JS-only OTA. No native model was activated.

**Physical Android QA pending:** Open existing compatible preview APK online and fully close/reopen when appropriate. Schedule an open study task for a 60-minute window. If you open Exams/Autopilot halfway through that window, only the unelapsed 30 minutes should appear as **scheduled** capacity usage. If you've also recorded 30 minutes of actual topic study today, that 30 should separately count as **completed study**, leaving 60 minutes of a 120-minute daily study budget before the usual buffer and other commitments. The future 30 minutes must not appear as **completed preparation**. Before a session starts, all 60 future scheduled minutes remain reserved; after its end, zero minutes of that particular session should remain reserved. A finished standalone Focus session counts against the already-used daily budget. Check that the new preview does not edit stored history/tasks, and that Day map reflects recorded commitments. This is deterministic calculation correction, not a stronger local model.

## Shared-exam task deadline reconciliation — published 2026-10-10

Android `preview` OTA update `01a12464-bf9f-791f-8fd5-97181bc78a02`, group `ff207d8a-9e87-41ef-a1d0-4863e724ef3d`, runtime `0.2.13`, source commit `f9d63861ac128a1763702aebcca73fac0af12a73`. Expo creation `2026-10-10T05:59:04.863Z` (11:29:04 IST); GitHub [run 38029166017](https://github.com/DJGaming1t/myelin-app/actions/runs/38029166017) full app verification and Android preview publication both **SUCCESS**, with explicit `✔ Published!` in logs. JSON update receipt artifact `11661970490`, app scenario artifact `11661157962`. All `verify:` suites and hybrid/two-timezone scenarios passed. No new APK or model download.

**Android smoke test still pending:** With an installed compatible preview APK, open MYELIN online and fully close/reopen after the OTA. Create two future exams sharing one Trigonometry topic, with Maths occurring before Physics. Create a 30-minute task for this topic but explicitly associate it with **Physics**, the *later* exam. Review both Exams/Autopilot and plan feasibility: shared preparation must be represented **once**, the task's deadline should follow the **earlier Maths exam** for shared work, and those 30 task minutes should not appear as a second independent 30-minute load on top of the same topic preparation demand. Repeat with the earlier exam recorded **today** (after its stored noon clock time), and with that exam in the past. The current-day exam remains relevant for date-only hard deadlines; a past exam no longer imposes a future cutoff. Verify the app did not edit any task/exam or automatically launch Focus.

This change is a conservative **unified workload ledger** correction used by joint exam planning, not a new tutoring model or a claim of physical device verification.

## Exam-day Autopilot consistency — published 2026-10-10

Android EAS OTA verified **Published** in [run 38028774621](https://github.com/DJGaming1t/myelin-app/actions/runs/38028774621) with successful full app verification and `publish_preview` jobs. Update `01a1245e-57a7-708a-9122-3a057b22bdae`, group `6f77f518-bb87-4c83-840b-2420ca0781c3`, source `a89855fd0ac61e965ed736add75a6bc6710692e0`, runtime `0.2.13`, Android `preview`, created UTC 2026-10-10T05:52:05.031Z (11:22 IST). Publication receipt artifact `11660764945`; app scenario artifact `11661122382`. Existing compatible preview APK can receive the OTA; no native model download or APK rebuild.

**Physical device smoke test (not yet performed):** Open MYELIN online, fully close/reopen after OTA if needed. In Today, link a task to an exam recorded **today**, then verify it says **“[Exam name] is today”** rather than “in 0 days,” even after noon. In Exam Autopilot, compare a target exam later this week with a separate competing exam recorded for today: the competing exam should be accounted for as current, but **zero additional preparation should be reserved on that exam's date**. With a competing exam tomorrow, future days prior to its exam should retain feasible reserved work. A genuinely past exam should no longer count; an exam seven days beyond the target should respect the documented horizon boundary. Compare with stored exam dates and Day map and confirm no task, exam, or Focus status is changed unexpectedly.

The local deterministic scheduling engine was corrected; **this is not stronger Qwen, a new tutoring model, or physical QA confirmation**.

## Past-exam ranking correction — published 2026-10-10

Verified Android `preview` OTA published from code `348e2f61355b4c4533b0170ea657b6415b26c59a` at UTC `2026-10-10T05:42:57.064Z` (11:12:57 IST): update `01a12455-fb28-7888-a2d5-6e5f5940d3c9`, group `8bb73c5a-b9d1-46d4-8f51-1e4c61aee59c`, runtime `0.2.13`. [GitHub verify + publish run 38028282413](https://github.com/DJGaming1t/myelin-app/actions/runs/38028282413): both jobs SUCCESS, Expo explicitly printed `Published!`. Receipt artifact `11661281750`, app-scenario artifact `11661176716`. Standalone [planning/two-timezone/TypeScript suite 38028215145](https://github.com/DJGaming1t/myelin-app/actions/runs/38028215145) and [hybrid assistant safety suite 38028215066](https://github.com/DJGaming1t/myelin-app/actions/runs/38028215066) SUCCESS. No new APK or model is required for the existing compatible preview binary.

Android smoke checks (physical QA still pending): open installed compatible preview APK online and fully close/reopen after update. In Today, compare two otherwise similar active study tasks: one linked to an exam that happened **yesterday**, the other linked to an exam **today or tomorrow**. Ask in Settings → MYELIN assistant, `What should I start next?`, and inspect `linked exam +` in the explanation; yesterday's exam must not add exam urgency. Ensure Today also does not show the past exam as upcoming, and that an exam stored at local noon remains relevant *for the full calendar day*. A task with an outdated direct exam link but a relevant upcoming subject/topic exam may still receive a valid future-exam boost. Results must match actual recorded exam dates and task priorities, not invented data. Test daylight saving/time-zone edge cases via automated suite; verify physical rendering/touch behavior separately. No task, exam or focus session should be silently created or altered.

This is a deterministic priority correctness fix, not a new LLM, tutoring upgrade or model speed improvement.

## Transparent next-task explanation — published 2026-10-10

Android preview EAS OTA `01a1244f-4f8e-79dd-8db5-88e1fb0abed6` **published** at 2026-10-10T05:35:39.918Z (11:05 IST), group `c4441ee8-3bb1-4a09-a47e-30c1400ff951`, channel `preview`, runtime `0.2.13`, source `ca1ee3d7b42b2c12a451cb96f12999d7a3f2488a`. [Verified GitHub workflow 38027831214](https://github.com/DJGaming1t/myelin-app/actions/runs/38027831214), both jobs SUCCESS and Expo explicitly printed `Published!`. EAS receipt artifact `11660613449`, app scenario artifact `11660538186`. Independent [planning/TypeScript/two-timezone checks](https://github.com/DJGaming1t/myelin-app/actions/runs/38027766832) and [hybrid assistant safety checks](https://github.com/DJGaming1t/myelin-app/actions/runs/38027766833) both succeeded. No new APK or AI model download is required for the already compatible preview binary.

Android physical smoke checks (still pending): open the compatible preview with internet and fully close/reopen if needed; in Settings → MYELIN assistant, select the **What should I start next?** example. With two eligible tasks and a real free window, verify the chosen task's explanation displays its saved priority, Today weighting, deadline urgency, relevant exam proximity, and/or postponement contributions **only when those attributes are recorded**. Check that the alternative shown can begin for at least five minutes in the *same window*, with its own score. If urgency and other points tie, answer must say it is a tie rather than invent a reason. If a higher-ranked task's deadline precedes the next free window, it must explain that skip. With an already-running scheduled block, the app should prioritize the schedule, not claim a higher unrelated ranking. Verify messages remain readable on the actual phone screen, do not overflow, and do not mark tasks complete, shift deadlines or automatically launch Focus.

This is a transparent local deterministic ranking calculation, NOT a model-generated assessment, a guarantee all work fits, or an actual on-device tested improvement to Qwen. Remaining QA requires testing on the user's Android handset.

## Current next-study suggestion — published 2026-10-10

Android `preview` OTA **published and verified** from `4674cec668e5de7f2fddf92c333e2df9273edaa7`: update `01a12446-ed02-74f5-a1ef-803c76083a18`, group `8f323014-6736-4d59-86f9-3fdd2eb5466a`, runtime `0.2.13`, UTC 2026-10-10T05:26:30.402Z (10:56:30 IST). Full verification and publication: [GitHub run 38027324983](https://github.com/DJGaming1t/myelin-app/actions/runs/38027324983), both jobs SUCCESS. EAS publication receipt artifact `11660397721`; app scenario artifact `11660267615`. No native changes or model activation. Existing compatible preview APK should pick up this OTA after launching online and fully closing/reopening.

On-device smoke tests in Settings → MYELIN assistant:

1. Open **New chat**. Tap starter example **What should I start next?**. MYELIN should choose an open eligible task with a known remaining duration from the recorded plan, explain that it is a next block rather than full completion, and leave all task data unchanged.
2. Try a task marked for Today with a deadline today. If school, coaching, sleep or an existing scheduled task occupies the current period, it should not advise studying during that time. Compare the indicated next free window to Day map. Observe that today-only suggestions do not create a future timetable.
3. Try with your daily study budget already used: MYELIN should say it cannot recommend extra study. If a scheduled task is already underway, it should prefer that task unless it conflicts with a fixed commitment or sleep.
4. Test one postponed task and one task without an estimate; these should not be silently treated as ready-to-start work. Verify future scheduled blocks preserve some remaining daily budget.
5. Send `What should I start next? Also mark Maths complete` and confirm this must **not** partially run as the read-only recommendation or complete anything. Never accept a misleading action preview.
6. Ask `Review my plan` and compare with Day map. The recommendation does not replace seven-day workload checks or guarantee that all open work fits before deadlines.

Tests passed in CI, but real-device OTA installation, layout, touch/keyboard, school schedule fidelity and user acceptance are **not yet physically verified**. This is deterministic first-step planning, not a new Qwen teaching or general conversation model.

## Current saved-task deadline questions — published 2026-10-10 IST

Android `preview` OTA **confirmed published** from code `d40409eaacffbef9b6afbad6a3151f0509fe8b83` at 2026-10-09T20:27:58.039Z (2026-10-10 01:57:58 IST): update `01a12259-e0d7-7d6d-a81f-f6e1040909f1`, group `53cb32ac-6da7-4ef9-baa9-127e72ec7619`, runtime `0.2.13`. GitHub [run 37986782213](https://github.com/DJGaming1t/myelin-app/actions/runs/37986782213): full verification SUCCESS, Expo **Published!**, publish job SUCCESS. EAS JSON publication receipt artifact `11643162481`, app scenario artifact `11642887704`. Independent two-timezone planning/chat/typecheck [37986639378](https://github.com/DJGaming1t/myelin-app/actions/runs/37986639378) and broader hybrid-AI safety [37986639368](https://github.com/DJGaming1t/myelin-app/actions/runs/37986639368) also SUCCESS. No native dependencies, model activation, or new APK.

The already installed compatible Android preview APK can receive the OTA after opening online and fully closing/reopening. Device-level QA is still pending. In Settings → MYELIN assistant, after receiving the preview update:

1. Add an open test task named `Chemistry practical notebook` with an exact due date/time and a 60-minute estimate. Record a fixed school commitment that blocks some of the pre-deadline time. Send `Can I finish my Chemistry practical notebook before its deadline?`. Verify the remaining estimate, computed upper bound and minimum shortage against Day map. The reply must say **might fit, not guaranteed** when upper bound is sufficient, never promise all tasks fit.
2. Set the task's estimate to unknown. Send the same question. MYELIN must ask for an estimate rather than invent minutes. Set the due date to absent and check it asks for an actual deadline.
3. Create two tasks with the same title. MYELIN must refuse to choose between them, without a proposal or mutation. Remove the extra test task afterward.
4. After the due time, MYELIN must clearly identify the open task as overdue. Once marked complete, it must report completed instead of assuming remaining work.
5. Send `Can I finish Chemistry practical notebook before its deadline? Also delete Maths`. It must not silently use the read-only match or apply any change. Do not confirm any unintended proposal.
6. Ask `Review my plan`; compare with Day map and previous plan checks. Existing seven-day read-only review remains unchanged. Check accessibility, keyboard, long labels and whether the OTA actually loads on the device.

This is a bounded deterministic assistant capability, not stronger Qwen general reasoning. Optimistic availability intentionally ignores competition from other unscheduled work and new breaks. Full physical-device QA is required separately.

## Current exact-time questions — published 2026-10-10 IST

Published Android `preview` OTA from `f776e97a0492f0f76630421ed50b67f750683e4b` at 2026-10-09 20:14:24 UTC (2026-10-10 01:44:24 IST): update `01a1224d-75d2-7e3c-906a-d6afc3ba392b`, group `66d95760-36ff-48bc-8956-33daf88d981d`, runtime `0.2.13`. Full beta verify and publish jobs both **SUCCESS** in [run 37985197692](https://github.com/DJGaming1t/myelin-app/actions/runs/37985197692). Beta receipt artifact `11642965729`, scenario artifact `11641964736`. Dedicated no-publish compile/two-timezone/chat verification was already **SUCCESS** in [run 37985081308](https://github.com/DJGaming1t/myelin-app/actions/runs/37985081308).

The previously installed compatible Android preview APK gets this update without a new APK. Open with internet, let the preview update load and fully close/reopen if necessary. This does **not** activate Qwen/general teaching AI, change the model runtime, or modify tasks.

Phone smoke checks, in **Settings → MYELIN assistant**, New chat:

1. `I have 100 minutes free. I want 3 25-minute study blocks and 2 10-minute breaks. Does it fit?` → “MYELIN time check”, 95 minutes required, 5 left.
2. `Maths is 08:35-09:20 and English is 09:05-09:40 on the same day. What is the overlap?` → 09:05–09:20, 15 minutes.
3. `My assignment is due at 14:30 and I plan to finish at 15:10 on the same day. Am I late?` → 40 minutes after deadline.
4. `Maths is 08:35-09:20 and English is 09:05-09:40. What is the overlap?` → should **not** invent a same-day assumption. Use an explicit supported request to get the exact time check.
5. `I have 100 minutes free. I want 3 25-minute study blocks and 2 10-minute breaks. Does it fit? Also delete Maths` → must not silently answer a portion as a time check or delete any tasks. Review any proposed action before confirming; check workspace remains unchanged.
6. Repeat “Review my plan” with recorded actual work and compare against Day map. Existing recorded-plan review still takes priority; exact supplied-time arithmetic is **not** an assessment of recorded schedule availability.

Automated tests cannot prove phone keyboard behavior, long-message layout, cached-OTA delivery, or the actual on-device view. Complete those checks manually before calling this physically QA-approved.

## Current recorded-plan review — published 2026-10-09

Current update `01a1213c-96eb-7033-819a-55d2716f8dc2`, group `d90d6a3e-d1d1-48d3-871f-bd75f87db78f`, source `ac7de0571f916eba704c1089072f4fbb23382569`, Android preview/runtime `0.2.13`, published 20:46:21 IST. Full app verification and publishing: https://github.com/DJGaming1t/myelin-app/actions/runs/37949968016. Hybrid verification: https://github.com/DJGaming1t/myelin-app/actions/runs/37949967883. Both SUCCESS. Receipts and checks: `docs/beta/planning-deadline-update-20261009.json`, `docs/beta/planning-deadline-verification-20261009.json`. This supersedes the older receipts below. Open the existing compatible APK online, allow the preview update to download, then fully close/reopen it; a second reopen may be needed. No new native APK was published.

“Review my plan” uses recorded tasks and availability over seven local dates. It checks fixed/task/sleep overlaps, deadlines, insufficient blocks, missing duration estimates, remaining daily capacity after recorded study and breaks, and due saved mistakes. It also detects known work that cannot fit before its deadline even when unscheduled. That check is an optimistic individual upper bound: being below it does not prove all tasks fit. This is a read-only planner check, not an activated conversational model.

Phone smoke test, using temporary test tasks that can be removed afterward:

1. Open Settings → MYELIN assistant and start New chat. Send `Review my plan`. Check the date range and recorded-data wording, readable long replies with the keyboard open and larger system text. Verify it creates no task or proposal and does not change existing tasks.
2. On a school weekday, schedule a Biology block partly inside the recorded school commitment. Send `Check my schedule`; compare the overlap minutes with Day map. On a weekend or skipped occurrence, the same hours should not incorrectly count as school.
3. Create an open task with an exact deadline 30 minutes from now and 60 estimated minutes remaining. Leave it unscheduled. The review should flag insufficient before-deadline capacity of at least 30 minutes, even if the daily budget is large. Mark it completed and review again; its issues should disappear.
4. Record a task with an unknown duration and a deadline tomorrow. Review should ask for an estimate without assigning a duration or guaranteeing completion. A task ending after its deadline should separately report lateness.
5. With a small daily budget, record completed study, then review remaining planned work. The used minutes should reduce capacity. Between-block breaks should also be included. Check that adding an unrelated future task does not consume today's budget.
6. Add an unresolved mistake due for review and one future/resolved mistake. Only the due unresolved item should count. The reply should direct you to Review, without claiming to have checked the written answer or resolved it.
7. Send `Review my plan and delete Maths`. It must not be consumed as a plain review or delete anything. Existing action preview/confirmation rules still apply. While a clarification is pending, use Different request or New chat before starting a review.

Automated app logic, both timezone suites and native compatibility passed. Actual Android interaction QA remains pending. No Qwen or cloud model is enabled by this update; the separately measured model candidates still require quality review and compatible native integration.

## What is testable

- Settings → MYELIN assistant (beta) → Open MYELIN assistant.
- Simple task commands and exam-plan previews through deterministic rules, including missing-detail questions.
- Everyday schoolwork: `I have to complite bio practical nb by tomorrow` previews a Biology homework task due tomorrow without an invented topic or duration. `Need to finish chem homework by tmr, 45 mins` and `Submit phy project in two days 1.5 hours` are also supported.
- Explicit confirmation before workspace changes. Requests for unsupported/model-dependent operations show unavailable messages.
- AI model choices saves Lite (0.8B) or Enhanced (2B) as a preference. Both Qwen mobile downloads remain unavailable.
- Existing experimental FunctionGemma manual import and native test remain separate.

Cloud AI is not connected. Model preferences are not working Qwen inference. A training adapter is not a downloadable phone model.

## Previous weekly school-hours fix — published 2026-10-09

The user's phone screenshot shows the previous conversational update but the exact school-hours fact was unsupported there. This fix connects explicit recurring school/tuition/coaching requests to the existing Day map commitments through the same confirmation layer.

Published 2026-10-09 09:28:44 UTC (14:58:44 IST): group `0fb76097-c38b-471a-8f0a-63bc2d64ce6d`, Android update `01a11ffe-5531-77e9-846a-72ffc82828ec`, runtime `0.2.13`, branch `preview`, source `9928c859ac2fb8224aad6b137fc18f09b84963a7`. Full verification and publication succeeded: https://github.com/DJGaming1t/myelin-app/actions/runs/37911040195. Hybrid verification also SUCCESS: https://github.com/DJGaming1t/myelin-app/actions/runs/37911040180. Checked EAS receipt: `docs/beta/weekly-schedule-update-20261009.json`, artifact `11606986743`. Scenario artifact `11607270573`; evidence `docs/beta/weekly-schedule-verification-20261009.json`. This supersedes all earlier updates below. Open the existing compatible APK online and fully close/reopen after download, up to twice. No reinstall/data clearing needed.

Full app TypeScript, existing app regressions, eight exact schedules and 14 clarification scenarios per timezone, chat checks, 31 task scenarios per timezone, protocol isolation/parity and exact APK compatibility passed. Physical Android QA for this new path remains pending.

After updating the existing preview APK, check:

1. Send `I have school on everyday except sat and sun , from 5:30am to 2pm`. Expect a School proposal showing Monday–Friday and 5:30 AM–2:00 PM every week. Verify no entry before confirmation.
2. Confirm once. Open Today → Day map and inspect a weekday: school blocks those hours. Saturday/Sunday should have no school occurrence. Existing scheduled tasks keep their times; inspect any overlap warnings.
3. Send the same request again. It should say the weekly entry already exists and direct you to Day map rather than duplicating it. Repeated confirmation must not create duplicates either.
4. Send `I have school`. Answer `every day except Sat and Sun`, then `5:30am to 2pm`. Check both answers and the original request survive into the correct proposal.
5. Send `School weekdays from 5:30 to 2pm`. It should ask for both times with AM/PM; reply `5:30 AM to 2 PM`. Send `School weekdays from 10pm to 2am` and verify it requests one same-day interval; use Day map for overnight entries.
6. Send `School and tuition weekdays from 8am to 2pm` or `School weekdays from 8am to 2pm and add bio homework`. It should ask for one clear schedule without applying part of a compound request.
7. Dismiss, edit the workspace, switch accounts or leave/reopen before confirming. Old proposals/questions must not apply. Check keyboard, large text, long overlap labels and navigation on the phone.

This is bounded local schedule understanding. Qwen inference, cloud and general teaching/chat remain unconnected; automated routing/planner tests do not replace Android interaction QA.

## Previous conversational assistant — published 2026-10-09

Published 2026-10-09 09:01:42 UTC (14:31:42 IST): group `9a841170-04a8-4b45-94f6-fd538cdc8af6`, Android update `01a11fe5-9669-7a19-ac68-8709253bb214`, runtime `0.2.13`, branch `preview`, source `789c89e75e9cb836dd97f4aa40269d19e55ef673`. Full verification and publication succeeded: https://github.com/DJGaming1t/myelin-app/actions/runs/37908290974. Hybrid run also SUCCESS: https://github.com/DJGaming1t/myelin-app/actions/runs/37908291086. Actual EAS receipt checked: `docs/beta/conversation-update-20261009.json`, artifact `11605083288`. Scenario artifact `11605607042`; evidence `docs/beta/conversation-verification-20261009.json`. This supersedes all earlier updates below. Open the existing compatible preview APK online, allow download and fully close/reopen up to twice; no reinstall/data clearing needed.

Source uses a chat thread and one bottom message box for both requests and follow-up answers. Local app guidance works without a model. Qwen weights and cloud are still unavailable; this does not establish general AI conversation or tutoring. Full app TypeScript, existing app regressions, conversation checks in both timezones, 31 task scenarios per timezone and exact installed-APK compatibility passed. Physical-device QA remains pending.

After the update, test on the existing Android preview:

1. Send `Hello`, `What can you do?` and `How do I use Focus?`. Each should produce an app-help reply in the thread; no workspace changes.
2. Send `Add practice tomorrow`. Reply with the exact name of one existing topic, then `Make it 1 hour 30 minutes` in the same message box. Check topic, local tomorrow and 90 minutes in the proposal. No task until confirmation; repeated confirmation must not duplicate it.
3. Send `I have to complete practical nb by tomorrow`, then `It's Biology`. Confirm the original request is retained and the task details are correct.
4. Send `Add Elasticity as a Physics topic` without model weights. The reply should explain that Qwen has no released phone version; changing Lite/Enhanced does not activate it. Ask for a subject explanation and verify the teaching-model limitation is visible.
5. While awaiting a reply, use New chat or cancel. Old results must not appear. Switch accounts; previous messages/questions/proposals must disappear. Edit the workspace; pending questions/proposals must invalidate.
6. Dismiss a proposal, send a revised request, and verify only the current proposal can be confirmed. Use Different request to leave a retained clarification instead of accidentally treating a new task as its answer.
7. Check keyboard visibility, multiline input, larger system text, long replies/proposals, back navigation, scroll behavior and update receipt on a phone. Chat is screen-local, capped at 80 messages and clears on leaving/reopening; no permanent chat-history promise.

Automated conversation regressions exercise shared routing and history logic in India and US timezones. They do not render React Native screens or establish physical-device/model quality.

## Previous task-detail update — published 2026-10-09

Published 2026-10-09 01:23:53 UTC (06:53:53 IST): group `950c9fca-525b-4dd0-8532-076259d2cf11`, Android update `01a11e42-70f1-75cf-95a7-2dc0478e1385`, runtime `0.2.13`, branch `preview`, source `05c0c01b1b6215ac6306d4674fd5f3dcda5fdcdd`. Full verification and publication succeeded: https://github.com/DJGaming1t/myelin-app/actions/runs/37869225289. Hybrid verification also passed: https://github.com/DJGaming1t/myelin-app/actions/runs/37869225004. Superseded by the conversational assistant above; retained for task-detail QA coverage.

Source recognizes polite supported action requests and uses the same date/minute/priority checks for topic practice and standalone schoolwork. All 31 app-flow development regressions passed in each of `Asia/Kolkata` (reported by Intl as `Asia/Calcutta`) and `America/Los_Angeles`. Full TypeScript, existing app regression scripts and exact installed-APK compatibility checks also passed. Reports: artifact `11589028753` (`myelin-assistant-app-scenarios`). Checked EAS receipt: `docs/beta/task-details-update-20261009.json`, artifact `11588929572`. Verification evidence: `docs/beta/task-details-verification-20261009.json`. Open the existing preview APK online, allow download and fully close/reopen up to twice; no reinstall/data clearing needed. Physical-device QA is pending.

After receiving the update, exercise these on Android:

| Request/action | Expected behavior |
| --- | --- |
| `Could you please add a task to finish bio practical nb by tomorrow?` | One clean Biology homework preview, local tomorrow, duration unknown, no invented topic. |
| `Can you schedule a task to submit chem project tomorrow for 1.5 hours?` | Chemistry assignment, 90 minutes, local tomorrow; title `Submit Chemistry project`. |
| `Add Trigonometry practice tomorrow for 1 hour 30 minutes` (use an actual topic name) | One linked practice task with 90 minutes; no changes before confirmation. |
| `Add 30 min Trigonometry questions tomorrow, not important` | Low priority, not high. |
| `Add Trigonometry practice 30 min 1 hour tomorrow` | Ask for one duration; do not keep the first number. |
| `Add Trigonometry practice 30-45 minutes by Friday` | Ask for an exact date, then a duration; replying with both separately retains previous answers. |
| `Could you record an exam on Trigonometry?` | Ask for its day before loading a model. A date answer alone does not install an exam-capable model. |
| `Don't add 30 min Trigonometry practice tomorrow` | No mutation/model call; ask for a rewritten instruction if an action is desired. |
| Change workspace after generating a preview | Reject stale confirmation; generate a fresh preview. |
| Tap confirmation repeatedly | Exactly one task; repeated application does not duplicate it. |
| Switch accounts, edit/start a request, leave/reopen, cross midnight or wait over ten minutes | Old retained question/result cannot be reused; verify fields and previews clear. |

Check actual keyboard visibility, larger text, back navigation, slow responses and OTA receipt on a phone. Pure workflow tests call the shared app logic; they do not render React Native screens or test phone performance. Qwen/cloud quality is still unmeasured/unreleased. No paid service is enabled by this update.

## Android smoke test

1. Use the preview 0.2.13 APK. Open online and allow the update to download; fully close and reopen, up to twice if necessary. Do not clear app data.
2. Open Settings, expand MYELIN assistant (beta), then open the assistant. Back should return to Settings.
3. Use an existing topic, e.g. `Add 20 minutes of <exact topic name> practice tomorrow`. Inspect the proposed topic, duration and date. Before confirming, verify no task was added. Confirm once and verify one task was added.
4. Ask `Add 20 minutes of practice tomorrow` without a topic. Check for a clarification rather than an invented topic/task.
5. Request an explanation or a new topic. Check the limitation message; no cloud request or workspace change should occur.
6. In AI model choices, save Enhanced. Close/reopen and verify it remains preferred while download is still unavailable. Repeat with Lite.
7. Try offline mode, a long topic name and larger system text. Verify the request field, preview confirmation and back controls remain reachable with the keyboard open.
8. Try the exact practical-notebook example above. Verify the preview shows Biology, homework, tomorrow's date and duration unset. Check zero tasks are added before confirmation, then one task is added after confirmation. A missing estimate must not be presented as calculated study time.
9. Try `Complete practical nb tomorrow`. In the separate answer field reply `Biology`, then Continue to preview. Verify the original request is retained and the preview has Biology, tomorrow's date and unknown duration. Try `Complete bio practical notebook today tomorrow`, reply `tomorrow`, and verify the chosen date is shown before confirmation.
10. Try `I already completed bio practical notebook yesterday` and `I don't have to complete bio practical nb tomorrow`. Verify no automatic create-task preview.

Automated checks cannot replace these phone interaction tests. Do not label device QA complete until exercised and recorded.

## Previous request-grounding update and QA

Published 2026-10-09 01:39 IST (2026-10-08 20:09 UTC): group `6452e5b5-2dc5-491e-bba5-f5003738b8a9`, Android update `01a11d22-679d-70f2-a989-b6e3b0d4e876`, preview runtime `0.2.13`, source `7680caa3726b1a865d59ac295768ea74f3d965b8`. Full verification and publisher succeeded: https://github.com/DJGaming1t/myelin-app/actions/runs/37836775724. Receipt `docs/beta/grounding-update-20261009.json`, artifact `11575982497`. Existing preview APK receives this OTA; open online and fully close/reopen after downloading, up to twice. No reinstall/data clearing needed. Superseded by the task-detail update above; retained here for earlier QA coverage. Physical-device QA is still pending.

- Ask `Record a Geography viva covering Climate Zones` (use a real topic in your workspace). It should ask for the exam day without loading a model or guessing a date. Reply with `YYYY-MM-DD` or `tomorrow`. Without an installed model/cloud connection, the next step should accurately report unavailability rather than pretend to create an exam.
- Ask `Raise it to high priority`. It should ask which topic. Reply with one existing topic name and inspect the preview when the request is supported; no changes before confirmation.
- For an available experimental FunctionGemma session, try a new-exam request with an explicit ISO day and real topic name. Any model date mismatch or unrequested/ambiguous target must ask a question instead of becoming a preview. Model installation is separate; neither Qwen download nor cloud inference is enabled by this update.
- Check the separate answer field, keyboard, larger text, back navigation and original-request reset. Automated model simulations do not replace this device QA.

## Previous clarification update and QA

Published 2026-10-08 15:11 UTC (20:41 IST): group `8a863ce8-93b1-4188-895f-00c87283e0ac`, Android update `01a11c12-0b62-79ae-a66b-a5f752cf8924`, preview runtime `0.2.13`. Source `a28dfa6bf734208cdce08f2845bc1889f062ba64`; verification and publisher succeeded: https://github.com/DJGaming1t/myelin-app/actions/runs/37798325379. Receipt `docs/beta/clarification-update-20261008.json`, artifact `11559483080`. The existing compatible APK receives this OTA; fully close/reopen after downloading, up to twice. Device interaction is not yet verified.

- Try `Add practice tomorrow`: answer with one existing topic name, then `45 minutes`. Check both answers survive and the preview has the correct topic, date and estimate.
- Reply with an ambiguous topic prefix, `30 or 45 minutes`, or `tomorrow at 8pm`. Verify a retry message, retained question and zero workspace changes.
- Start a new request or edit the original while a question is open. Verify the old answer is cleared. Switch accounts and verify both original request and answers are cleared.
- Leave/reopen the screen or wait over ten minutes; verify the old context cannot apply an action. Repeat with larger text and the keyboard open.
