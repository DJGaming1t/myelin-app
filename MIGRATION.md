# MYELIN Expo migration

The working Firebase/web app remains the reference build until this checklist is complete.

See `ROADMAP.md` for the fixed one-feature-at-a-time build order.

## Foundation
- [x] Private GitHub repository connected
- [x] Stable main branch
- [x] Separate expo-migration branch
- [x] Expo + TypeScript + Expo Router foundation
- [x] Shared MYELIN design tokens
- [ ] Run clean install and Expo Doctor on a development machine
- [x] EAS build/update profiles and release runbook
- [ ] Link the repository to the owning Expo/EAS project and write its generated project ID/update URL

## Feature parity
- [x] Authentication shell
- [x] Email/password authentication
- [ ] Google authentication — web flow and native Android code wired; signing SHA-1 still required for runtime verification
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
- [ ] Real Android preview build + on-device release verification

## Safety gates before replacing the web app
- [x] Existing web app stays deployable
- [ ] Auth tested on real Android development build
- [ ] Local data survives restart
- [x] Each Firebase user is isolated — verified by automated storage tests
- [x] Firestore remains fail-closed until per-user security rules are written, emulator-tested and deployed
- [x] No private/admin Firebase keys in the client repository
- [x] Accessibility / reduced-motion pass
- [ ] Android production build passes
