# Blocking visual refresh — 2026-10-21

Refines the standalone app-blocking setup while retaining the existing Focus redesign and blocking behavior. The screen now uses a compact title bar, warm shield emblem, inset counters, icon tabs, app avatars, rounded website rows, weekday strips and strength indicators. Native View primitives avoid new asset or package dependencies. Decorative icons are hidden from accessibility; switches retain enlarged hit targets.

## Verification

- Genuine TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- `verify-blocking-design.ts` and `verify-blocking-settings.ts` passed, including schedule, app selection, PIN failure and biometric guards.
- Expo web export and production Android `export:embed` passed.
- Actual Chromium: blocking interactions and durable reload at 320, 390 and 720 pixels passed; 12 existing Focus scenarios passed with and without reduced motion.
- Screenshots inspected for layout. Browser checks are not physical Android QA.
- Hermes compiler emitted HBC version 98, matching the existing native runtime.

## UI test APK provenance

This is a JavaScript-only repackaging of the previously Gradle-compiled 0.2.17 arm64 test APK, not a fresh Expo prebuild or Gradle compilation. The native build is documented in `standalone-blocking-verification.json`. Version 0.2.17/code 14, runtime, preview-channel configuration, permissions and native code are unchanged. Local APK Expo Updates remains disabled.

Base APK SHA-256: `dc18b1aceb0e9a2d7eec7309b69b58508b7b1017cb4eb2e7fc0e411a3659e28b`.

Refreshed APK SHA-256: `53d0b6332b06c0530868f90c252ffb1d43d91c8480a8c954ea9e95457b8a4dfd` (75,806,259 bytes).

All 26 generated drawable resources and the font match the compiled resources (PNG pixels, XML vector attributes and exact font bytes). Only `assets/index.android.bundle` changes among APK payload entries; all 1,312 other entries are identical, including manifest, resource table, DEX and native libraries. ZIP integrity, 16 KB native-library alignment and APK v2/v3 signatures pass. Signing certificate SHA-256 remains `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, allowing an update over the previous test APK.

## Physical testing still required

1. Install over the earlier test APK and confirm saved rules and Focus data remain.
2. Inspect Apps, Sites, When and Options with normal and enlarged system text; check keyboard and scrolling.
3. Test a blocked app and website, permission denial/revocation, Focus opt-out, and schedule start/end with the app backgrounded.
4. Check biometric cancellation and PIN fallback. Confirm calls and essential system functions remain accessible.
5. Verify Focus start/pause/resume/finish. Google sign-in still requires separate real-device validation and correct Firebase signing-certificate registration.

The native interception overlay itself is unchanged. No Expo publication, EAS build or hosted workflow was started.
