# MYELIN Expo migration

The working Firebase/web app remains the reference build until this checklist is complete.

See `ROADMAP.md` for the fixed one-feature-at-a-time build order.

## Foundation
- [x] Private GitHub repository connected
- [x] Stable main branch
- [x] Separate expo-migration branch
- [x] Expo + TypeScript + Expo Router foundation
- [x] Shared MYELIN design tokens
- [x] Clean install and Expo Doctor completed on Windows development machine (21/21 checks passed)
- [x] EAS build/update profiles and release runbook
- [x] Repository config linked to @duckslord/myelin EAS project and generated project ID/update URL committed

## Feature parity
- [x] Authentication shell
- [x] Email/password authentication
- [ ] Google authentication — web/native flow wired and Android OAuth client for the EAS preview signing certificate is committed; real-device Google sign-in is still required
- [x] Verification / password recovery
- [x] Offline per-user data foundation
- [x] Topics
- [x] Today planner
- [x] Focus timer
- [x] Five-minute launch
- [x] Distraction parking lot
- [x] Active recall
- [x] Review scheduling
- [x] Mistake notebook
- [x] Exams
- [x] Progress
- [x] Time-estimation calibration
- [x] Confidence calibration — confidence is captured during recall and analyzed against recorded grades in Progress
- [x] Settings
- [x] Import/export or migration path from web data
- [x] Firestore sync — offline-first client, conflict handling and emulator-tested rules implemented; production upload remains locked until rules deployment + activation flag
- [x] Notifications — local due-review/exam reminders, quiet hours, permission-on-enable, Calm/Signal/Spark personalities and copy-volume guardrails verified
- [x] Onboarding
- [x] Product polish — shared responsive shell, polished loading/error states, accessibility touch targets, system/user reduced-motion handling and a lower-frequency focus timer
- [x] Release engineering scaffold — development/preview/production profiles, APK preview profile, update channels, runtime/version policy, release/privacy/store runbooks and verification
- [ ] Final app icon and splash assets
- [ ] Real Android preview build + on-device release verification — first EAS APK build started; install/runtime checks still pending

## Safety gates before replacing the web app
- [x] Existing web app stays deployable
- [ ] Auth tested on real Android development build
- [ ] Local data survives restart
- [x] Each Firebase user is isolated — verified by automated storage tests
- [x] Firestore remains fail-closed until per-user security rules are written, emulator-tested and deployed
- [x] No private/admin Firebase keys in the client repository
- [x] Accessibility / reduced-motion pass
- [ ] Android production build passes

## Audit blockers still open
- [x] Commit the generated `package-lock.json` and use `npm ci` for reproducible verification
- [x] Confirm GitHub Actions executes on normal branch pushes — verification runs are now observed and enforced
- [x] Register the EAS preview signing certificate in Firebase and commit refreshed Android OAuth configuration
- [ ] Verify local data survives process kill/restart on a physical Android device
- [ ] Verify notification permission, scheduled delivery and tap routing on Android 13+
- [ ] Verify email/password and Google sign-in on the signed preview APK
- [x] Bump `expo.version` to 0.2.0 for the next native-runtime rebuild; advance the preview baseline only after that APK is verified
