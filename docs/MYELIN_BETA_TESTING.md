# MYELIN assistant beta

Target: Android internal preview, EAS project `2171936c-83f9-459f-9bb6-dddc4768484e`, channel/environment `preview`, runtime `0.2.13`. Production is not changed.

The compatible APK is build `877c5749-c608-4d23-bca9-aca66fb2df06`, built from `137eee631edbe582da8c0e64ec89229a86a5aa9a`. The publishing workflow compares native inputs and dependency metadata with this exact commit before publishing. It runs full TypeScript and all existing app regression scripts, then publishes from a fresh checkout of the verified commit. A receipt is uploaded as `myelin-assistant-beta-update` only after EAS succeeds.

Published 2026-10-08 09:34 UTC: update group `13189175-e2b7-4fee-a910-8828facfe65e`, Android update `01a11adc-d079-745b-a8bd-ea71b6da9816`, runtime `0.2.13`, branch `preview`. Full verification and publication: https://github.com/DJGaming1t/myelin-app/actions/runs/37757132256. Receipt: `docs/beta/assistant-update-20261008.json`. Source commit `fafbfeb6f223d44ea4a7538a3c3c4c62aa2d544b`. Automated checks passed; physical-device smoke test is still pending.

Earlier schoolwork update published 2026-10-08 09:53 UTC (15:23 IST): group `73bc7b39-a37b-49d1-a556-fc30143dc79a`, Android update `01a11aee-348b-7bc9-a545-938c07316392`, runtime `0.2.13`, branch `preview`. Full verification and publication: https://github.com/DJGaming1t/myelin-app/actions/runs/37759348032. Receipt: `docs/beta/schoolwork-update-20261008.json`. Source `5c644549305790be1c005eec26a027559fa76e00`. The existing compatible APK receives this OTA; no reinstall or data clearing is required.

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
