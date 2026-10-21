# Standalone app blocking — verified local test build

Version/runtime **0.2.17**, Android code **14**. Compiled implementation: `469fea2e2b6ad145d52186430a61158627be858d`; base: `d9eb48fd003ad773f0ddbba109ed18a7509cced4`. Existing preview channel and appVersion native compatibility rules are preserved. Expo LocalAuthentication adds native code and requires a new APK.

App blocking has a dedicated page from Settings and a compact shortcut from Focus. Apps, Sites, When and Options separate selection, permissions and advanced controls. Custom repeat-day and overnight HH:MM schedules work independently of **Block during Focus**. Disabling that switch keeps the native schedule identity stable when a timer changes. Existing Focus timer/dial/motion, data, navigation and retrieval are retained.

Optional system fingerprint/device authentication protects settings changes. Owner, page visit, cancellation, no enrollment, stale config and a Strict session starting during a prompt all gate persistence. Device credential fallback remains available. This protects edits; it does not remove native PIN/emergency confirmation. The native blocker has simpler headings, expandable thought parking, flexible button heights, a schedule-aware return route and no keep-screen-awake request. Essential system access remains protected.

## Verification

Genuine `tsc --noEmit`, Focus Shield A/B+C, auth, Focus, polish, visual, guides, onboarding, release, new lifecycle/schedule tests, native-runtime boundary and preview guard checks pass. Browser checks pass at 320/390 px, including reachable controls, no horizontal overflow, Focus opt-out, custom overnight schedules and durable reload. All 12 existing Focus browser scenarios pass. These web checks do not establish Android rendering or enforcement.

Expo Android prebuild passes. Full local `:app:assembleRelease` passes: **BUILD SUCCESSFUL in 19m 36s**, including actual Kotlin/Java/C++ compilation, bundled Hermes JS and release lint. APK signing, native component/permission declarations, native classes and authentication registration, ZIP integrity and alignment pass. Native sources match generated Android files.

APK SHA-256: `dc18b1aceb0e9a2d7eec7309b69b58508b7b1017cb4eb2e7fc0e411a3659e28b`. Size: 74,361,004 bytes. Standalone arm64-v8a release variant, signed with local debug certificate. Updates are disabled only in this test binary through `MYELIN_LOCAL_TEST_APK=1`. It needs no Metro server. No Expo publication, EAS build or hosted workflow was started.

## Physical-device checks and limits

1. Settings → App blocking: grant/deny/revoke Usage Access, overlay and VPN separately. Confirm the timer stays usable.
2. Disable Focus blocking and verify a current recurring window without a Focus timer, then window end/overnight boundaries. Cold activation can need a delayed notification tap after reboot/process shutdown.
3. Disable schedules to isolate Focus. Start/pause/resume/break/extend/finish/expire; test launches from Home, Recents, notifications and deep links.
4. Verify fingerprint/device credentials, cancellation, re-lock after background/navigation, account change and Strict starting during authentication. A cancelled prompt must leave settings unchanged.
5. Test selected domains and an unblocked control in fresh/private tabs with Private DNS/browser Secure DNS off. DNS filtering cannot guarantee blocking explicit DoH, hard-coded IPs/resolvers, caches or existing connections; another VPN cannot coexist in the same profile.
6. Check large fonts, keyboard/insets, PiP and OEM battery saver. Keep Home, Settings, keyboard, SMS, Phone and an incoming normal call accessible. Do not place a test emergency call.

No physical-device or emulator interception/authentication QA has been performed. Scheduled alarms are inexact and can require user activation; force-stop/denied notifications can prevent reminders until reopening. A schedule can keep blocking after Focus ends. Google sign-in still requires handset verification and project-owner Firebase certificate registration as described in `native-focus-shield-google-signin.md`; clearer error feedback does not create server-side OAuth registration.
