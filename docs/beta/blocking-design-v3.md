# Blocking setup design refresh

Base: `aea2655596500de9ce2251551cb8da1b94c984b3` on `codex/exam-autopilot-capacity-v1`.

## Changes

- Warm, restrained status card with selected app/site counts and a direct link to timing rules. Says **rules enabled**, never claims the service is intercepting apps just because the configuration is enabled.
- Segmented navigation stays accessible while scrolling. Layout uses the existing MYELIN theme and a bounded reading width.
- App picker gains a selected-only filter, clear-search action, distinct selected rows, loading/retry/empty states and explicit pagination beyond the first 50 apps. Always-allowed exceptions are labelled.
- Permission setup explains each Android permission separately. Web/missing-native previews clearly explain that saving choices does not activate blocking.
- Weekly schedules use larger time ranges, overnight labels, active/paused styling, day presets and local validation feedback. Independent schedules and optional Focus integration are preserved.
- Website and schedule removal require confirmation, with a Keep it action.
- Advanced settings, break/PIN controls, allowlist and DNS limitations use progressive disclosure. Fingerprint/device-credential behavior is unchanged.
- Save feedback is visible at the bottom of the screen. Failed PIN saves preserve the typed PIN; successful saves clear it.
- Settings/Focus shortcut uses the same visual language and remains accessible.

## Verification

Passed on the changed source:

- Genuine TypeScript: `node node_modules/typescript/bin/tsc --noEmit`.
- `scripts/verify-blocking-design.ts`: executes the actual screen's handlers with mocked platform/storage boundaries, covering app search/pagination/selection, permissions, empty states, independent/overnight schedules, invalid time feedback, day presets, cancel/confirm deletion, website input and failed/successful PIN saves.
- `scripts/verify-blocking-settings.ts`: existing owner/visit/biometric/Strict-mode guard suite.
- `scripts/verify-focus-shield.ts` and `scripts/verify-focus-shield-bc.ts`.
- `scripts/verify-focus.ts`, `scripts/verify-auth.ts`, `scripts/verify-polish.ts`, `scripts/verify-visual-overhaul.ts`, `scripts/verify-guides.ts`, `scripts/verify-release.ts`.
- `scripts/check-beta-ota-compatibility.cjs --self-test` and `git diff --check`.

The isolated checkout's baseline tree was verified identical to the GitHub HEAD tree `e0adb93359fde54423b301ba1fa7f41d0cf97b7c`. The reset environment lacked expo-local-authentication; its official SDK-57 version 57.0.3 JS and declaration files were restored from expo/expo for TypeScript checks. No declarations were fabricated and no project dependency changed.

## Not verified this turn

- `scripts/verify-blocking-ui.cjs` was attempted but could not launch: Chromium headless shell is not installed. No browser screenshots, narrow-screen or large-font rendering pass is claimed.
- Android native files, permissions, plugin, bridge, runtime/version and Expo channel configuration are unchanged. No new Gradle build, APK, EAS build or OTA publication was made for this refresh. The prior 0.2.17 APK does **not** contain these new UI changes.
- Native blocker overlay styling is unchanged from the prior verified implementation. This commit refreshes the React Native setup/configuration experience and its entry points.
- Phone blocking, system biometric prompts, keyboard/insets and TalkBack still require physical-device testing.

## Visual/device follow-up

On a build containing this commit: inspect Apps, Sites, When and Options at 320px and normal phone width, large system fonts, dark mode, keyboard open and screen rotation. Check tab visibility while scrolling, selected-row contrast, search clear/pagination, schedule day presets and overnight labels, deletion cancel, save feedback, permission return and cancellation of device authentication. Re-run the existing Focus browser scenarios and handset interception/emergency-access checklist before treating this as a release-ready APK.
