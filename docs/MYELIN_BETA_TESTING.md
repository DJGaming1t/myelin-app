# MYELIN assistant beta

Target: Android internal preview, EAS project `2171936c-83f9-459f-9bb6-dddc4768484e`, channel/environment `preview`, runtime `0.2.13`. Production is not changed.

The compatible APK is build `877c5749-c608-4d23-bca9-aca66fb2df06`, built from `137eee631edbe582da8c0e64ec89229a86a5aa9a`. The publishing workflow compares native inputs and dependency metadata with this exact commit before publishing. It runs full TypeScript and all existing app regression scripts, then publishes from a fresh checkout of the verified commit. A receipt is uploaded as `myelin-assistant-beta-update` only after EAS succeeds.

Published 2026-10-08 09:34 UTC: update group `13189175-e2b7-4fee-a910-8828facfe65e`, Android update `01a11adc-d079-745b-a8bd-ea71b6da9816`, runtime `0.2.13`, branch `preview`. Full verification and publication: https://github.com/DJGaming1t/myelin-app/actions/runs/37757132256. Receipt: `docs/beta/assistant-update-20261008.json`. Source commit `fafbfeb6f223d44ea4a7538a3c3c4c62aa2d544b`. Automated checks passed; physical-device smoke test is still pending.

Latest schoolwork update published 2026-10-08 09:53 UTC (15:23 IST): group `73bc7b39-a37b-49d1-a556-fc30143dc79a`, Android update `01a11aee-348b-7bc9-a545-938c07316392`, runtime `0.2.13`, branch `preview`. Full verification and publication: https://github.com/DJGaming1t/myelin-app/actions/runs/37759348032. Receipt: `docs/beta/schoolwork-update-20261008.json`. Source `5c644549305790be1c005eec26a027559fa76e00`. The existing compatible APK receives this OTA; no reinstall or data clearing is required.

## What is testable

- Settings → MYELIN assistant (beta) → Open MYELIN assistant.
- Simple task commands and exam-plan previews through deterministic rules, including missing-detail questions.
- Everyday schoolwork: `I have to complite bio practical nb by tomorrow` previews a Biology homework task due tomorrow without an invented topic or duration. `Need to finish chem homework by tmr, 45 mins` and `Submit phy project in two days 1.5 hours` are also supported.
- Explicit confirmation before workspace changes. Requests for unsupported/model-dependent operations show unavailable messages.
- AI model choices saves Lite (0.8B) or Enhanced (2B) as a preference. Both Qwen mobile downloads remain unavailable.
- Existing experimental FunctionGemma manual import and native test remain separate.

Cloud AI is not connected. Model preferences are not working Qwen inference. A training adapter is not a downloadable phone model.

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

## Latest request-grounding update and QA

Published 2026-10-09 01:39 IST (2026-10-08 20:09 UTC): group `6452e5b5-2dc5-491e-bba5-f5003738b8a9`, Android update `01a11d22-679d-70f2-a989-b6e3b0d4e876`, preview runtime `0.2.13`, source `7680caa3726b1a865d59ac295768ea74f3d965b8`. Full verification and publisher succeeded: https://github.com/DJGaming1t/myelin-app/actions/runs/37836775724. Receipt `docs/beta/grounding-update-20261009.json`, artifact `11575982497`. Existing preview APK receives this OTA; open online and fully close/reopen after downloading, up to twice. No reinstall/data clearing needed. This is the latest update and supersedes the earlier clarification beta below. Physical-device QA is still pending.

- Ask `Record a Geography viva covering Climate Zones` (use a real topic in your workspace). It should ask for the exam day without loading a model or guessing a date. Reply with `YYYY-MM-DD` or `tomorrow`. Without an installed model/cloud connection, the next step should accurately report unavailability rather than pretend to create an exam.
- Ask `Raise it to high priority`. It should ask which topic. Reply with one existing topic name and inspect the preview when the request is supported; no changes before confirmation.
- For an available experimental FunctionGemma session, try a new-exam request with an explicit ISO day and real topic name. Any model date mismatch or unrequested/ambiguous target must ask a question instead of becoming a preview. Model installation is separate; neither Qwen download nor cloud inference is enabled by this update.
- Check the separate answer field, keyboard, larger text, back navigation and original-request reset. Automated model simulations do not replace this device QA.

## Latest clarification update and QA

Published 2026-10-08 15:11 UTC (20:41 IST): group `8a863ce8-93b1-4188-895f-00c87283e0ac`, Android update `01a11c12-0b62-79ae-a66b-a5f752cf8924`, preview runtime `0.2.13`. Source `a28dfa6bf734208cdce08f2845bc1889f062ba64`; verification and publisher succeeded: https://github.com/DJGaming1t/myelin-app/actions/runs/37798325379. Receipt `docs/beta/clarification-update-20261008.json`, artifact `11559483080`. The existing compatible APK receives this OTA; fully close/reopen after downloading, up to twice. Device interaction is not yet verified.

- Try `Add practice tomorrow`: answer with one existing topic name, then `45 minutes`. Check both answers survive and the preview has the correct topic, date and estimate.
- Reply with an ambiguous topic prefix, `30 or 45 minutes`, or `tomorrow at 8pm`. Verify a retry message, retained question and zero workspace changes.
- Start a new request or edit the original while a question is open. Verify the old answer is cleared. Switch accounts and verify both original request and answers are cleared.
- Leave/reopen the screen or wait over ten minutes; verify the old context cannot apply an action. Repeat with larger text and the keyboard open.
