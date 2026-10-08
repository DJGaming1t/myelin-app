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
9. Try `Complete practical nb tomorrow` and `Complete bio practical notebook today tomorrow`. Verify clarification, not an invented subject or chosen deadline. Edit the original request to resolve the question; short standalone follow-up answers are not yet supported.
10. Try `I already completed bio practical notebook yesterday` and `I don't have to complete bio practical nb tomorrow`. Verify no automatic create-task preview.

Automated checks cannot replace these phone interaction tests. Do not label device QA complete until exercised and recorded.
