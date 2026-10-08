# MYELIN assistant beta

Target: Android internal preview, EAS project `2171936c-83f9-459f-9bb6-dddc4768484e`, channel/environment `preview`, runtime `0.2.13`. Production is not changed.

The compatible APK is build `877c5749-c608-4d23-bca9-aca66fb2df06`, built from `137eee631edbe582da8c0e64ec89229a86a5aa9a`. The publishing workflow compares native inputs and dependency metadata with this exact commit before publishing. It runs full TypeScript and all existing app regression scripts, then publishes from a fresh checkout of the verified commit. A receipt is uploaded as `myelin-assistant-beta-update` only after EAS succeeds.

## What is testable

- Settings → MYELIN assistant (beta) → Open MYELIN assistant.
- Simple task commands and exam-plan previews through deterministic rules, including missing-detail questions.
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

Automated checks cannot replace these phone interaction tests. Do not label device QA complete until exercised and recorded.
