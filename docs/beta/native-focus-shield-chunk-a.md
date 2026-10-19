# Native Focus Shield — Chunk A verification

**Result:** Integrated locally, genuine TypeScript checks passed, and a complete Android debug APK was built with Gradle. Physical-device blocking remains untested. GitHub upload is pending explicit authorization after an automatic approval-review rejection.

Implementation commit: `f1509df903d5f84cbc603c7fa27232b0c7d227f7`  
Base commit: `7298b2b6ff1f261917d7027835019e0a15bcf7b2`  
Branch: `codex/exam-autopilot-capacity-v1`

## What changed

Integrated Argon's five Kotlin files, React Native bridge, Expo config plugin, installed-app picker and session controls. Preserved the Focus dial/motion redesign, timer engine, break transitions and existing navigation/data code.

Repaired the SHA-256 expectation (`s_test:4826` → `525e132336b682d50078955fb377023273d371e9a7e57cbbed34b0223adb8e1b`), serialized durable preference subscriptions between Studio and session control, timer extension synchronization, and stale owner/session/unmount handling while delivering native events. Regression tests exercise actual hooks with mocked platform boundaries.

Native fixes gate enforcement on both permissions, remove overlays for allowed/system apps, lock, revocation and expiry, protect default/OEM dialers, stop unreliable repeated background activity fallback, enforce break-pass limits, reject malformed PIN hash state, clean up lifecycle resources and reduce polling while the screen is off. The plugin fails explicitly for missing Kotlin files or unsupported package-registration templates.

Version/runtime is **0.2.14**, Android version code **11**. The original Expo project ID, update URL, Google services configuration, existing plugins and EAS preview channel rules were retained. Runtime policy remains `appVersion`; runtime 0.2.13 must not receive this native implementation through OTA.

## Actual verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS, exit 0 |
| Focus, Polish, Visual, Guides entrypoints | PASS, exit 0 each |
| SHA-256, owner-scoped durable writes, timer extension/pause/break/account changes | PASS |
| Missing native module, denied permission status, rejected service start, unavailable Settings | PASS at JS bridge boundary |
| Native event batch interrupted by owner change or screen unmount | PASS |
| Plugin idempotency, missing registration failure, generated manifest and five copied Kotlin files | PASS |
| Native runtime boundary, 0.2.13 → 0.2.14 | PASS |
| Direct Kotlin compilation against real API 36 and React Native 0.86.3 | PASS, warnings only |
| Compiled Kotlin SHA-256 executed against JDK SHA-256 | PASS for empty, PIN and Unicode vectors |
| Full app Gradle Kotlin and Java compilation | PASS |
| Full arm64 `:app:assembleDebug` | **BUILD SUCCESSFUL in 11m 27s**; 620 tasks, 98 executed and 522 up-to-date |
| APK signature, ZIP integrity and Focus Shield classes | PASS |
| Physical handset interception and OEM behavior | **NOT TESTED** |

Tests ran through `node --import tsx` because the tsx CLI's IPC socket is restricted here. This changes the launcher, not the verification scripts. Babel was not used as a substitute for TypeScript checking.

The build used Gradle 9.3.1, a full JDK 17, Android API 36, NDK 27.1.12297006 and CMake 3.22.1. Environment failures were repaired using a complete JDK, the environment's trusted certificate store, an isolated Gradle cache and bounded native parallelism. TLS verification remained enabled. The successful retry reused completed tasks. Final Kotlin sources match the compiled snapshot byte-for-byte; debug JavaScript is loaded from the source checkout by Metro.

## APK and running it

File: `MYELIN_Focus_Shield_0.2.14_debug_arm64.apk`  
Package: `com.djgaming1t.myelin`; version `0.2.14` / code `11`  
ABI: arm64-v8a; minimum Android API 26; target API 36  
Size: 119,377,352 bytes  
SHA-256: `cd547e7c9117772dcc15e0ffe6ed92e90286f40038fb21d7eb2d1159114d8c73`

**This is a developer APK, with no embedded JS bundle. It needs Metro.** In a clean checkout containing the implementation, run `npm ci`, then `npx expo start --dev-client`, and connect the developer APK to that server. The source bundle can be imported from the existing repository with `git fetch <downloaded-bundle-path> HEAD` followed by `git merge --ff-only FETCH_HEAD`.

The APK uses the local Android debug certificate. An existing preview installation may use a different signing key; if Android reports a signing conflict, back up/export your data before considering a reinstall. Do not treat this APK as an in-place EAS preview update.

## Short device checklist

1. Deny each permission separately: Focus must remain usable without a crash. Grant Usage Access and Display Over Other Apps; verify refreshed status on return.
2. Pick YouTube or another installed app, start Focus immediately, then open it through Home, Recents, a notification and a deep link. Measure latency and remain there for over 10 seconds.
3. Check Home, Settings, Phone, SMS, keyboard, an incoming normal call and lock/unlock remain accessible. Do not place a test emergency call.
4. Pause/resume, extend a five-minute launch, leave the Focus route, enter/end/skip a break, finish/discard and let a session expire in the background. Verify blocking/service lifecycle matches the timer.
5. Test parked-thought persistence, wrong/correct PIN, the no-PIN phrase, break-pass limits, five-minute override expiry, account switching and signing out.
6. Revoke each permission mid-session, regrant and return to MYELIN. Test battery saver, process reclamation, split-screen, floating windows and PiP on the actual phone.

## Remaining limits

UsageStats and overlays cannot reliably protect every active multi-window interaction or passive PiP pane. Protected windows can suppress overlays. Force-stop, safe mode, permission revocation and OEM process restrictions remain possible. The 400 ms interval is a poll interval, not guaranteed interception latency. Short hashed PINs provide friction, not device security. The bounded native event queue can lose a thought if the app crashes after draining and before saving it.

**No website/network blocking, Chunk B, Expo publication, paid EAS build or hosted workflow was started.** GitHub push was rejected by automatic approval review because explicit upload authorization was required; no alternative GitHub write route was attempted.
