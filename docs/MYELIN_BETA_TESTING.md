# MYELIN assistant beta

Target: Android internal preview, EAS project `2171936c-83f9-459f-9bb6-dddc4768484e`, channel/environment `preview`, runtime `0.2.13`. Production is not changed.

The compatible APK is build `877c5749-c608-4d23-bca9-aca66fb2df06`, built from `137eee631edbe582da8c0e64ec89229a86a5aa9a`. The publishing workflow compares native inputs and dependency metadata with this exact commit before publishing. It runs full TypeScript and all existing app regression scripts, then publishes from a fresh checkout of the verified commit. A receipt is uploaded as `myelin-assistant-beta-update` only after EAS succeeds.

Published 2026-10-08 09:34 UTC: update group `13189175-e2b7-4fee-a910-8828facfe65e`, Android update `01a11adc-d079-745b-a8bd-ea71b6da9816`, runtime `0.2.13`, branch `preview`. Full verification and publication: https://github.com/DJGaming1t/myelin-app/actions/runs/37757132256. Receipt: `docs/beta/assistant-update-20261008.json`. Source commit `fafbfeb6f223d44ea4a7538a3c3c4c62aa2d544b`. Automated checks passed; physical-device smoke test is still pending.

Earlier schoolwork update published 2026-10-08 09:53 UTC (15:23 IST): group `73bc7b39-a37b-49d1-a556-fc30143dc79a`, Android update `01a11aee-348b-7bc9-a545-938c07316392`, runtime `0.2.13`, branch `preview`. Full verification and publication: https://github.com/DJGaming1t/myelin-app/actions/runs/37759348032. Receipt: `docs/beta/schoolwork-update-20261008.json`. Source `5c644549305790be1c005eec26a027559fa76e00`. The existing compatible APK receives this OTA; no reinstall or data clearing is required.

## What is testable

- Settings → MYELIN assistant (beta) → Open MYELIN assistant.
- Simple task commands and exam-plan previews through deterministic rules, including missing-detail questions.
- Everyday schoolwork: `I have to complite bio practical nb by tomorrow` previews a Biology homework task due tomorrow without an invented topic or duration. `Need to finish chem homework by tmr, 45 mins` and `Submit phy project in two days 1.5 hours` are also supported.
- Explicit confirmation before workspace changes. Requests for unsupported/model-dependent operations show unavailable messages.
- AI model choices saves Lite (0.8B) or Enhanced (2B) as a preference. Both Qwen mobile downloads remain unavailable.
- Existing experimental FunctionGemma manual import and native test remain separate.

Cloud AI is not connected. Model preferences are not working Qwen inference. A training adapter is not a downloadable phone model.

## Weekly school-hours fix — verification/publication pending

The user's phone screenshot shows the conversational update but the exact school-hours fact is unsupported there. New source connects explicit recurring school/tuition/coaching requests to the existing Day map commitments through the same confirmation layer. Full app CI and an EAS receipt must be checked before calling this new fix published.

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
