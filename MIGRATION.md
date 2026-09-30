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
- [ ] Configure EAS project

## Feature parity
- [x] Authentication shell
- [x] Email/password authentication
- [ ] Google authentication — web flow wired; native code prepared; Android OAuth/SHA setup still required
- [x] Verification / password recovery
- [ ] Offline per-user data foundation
- [ ] Topics
- [ ] Today planner
- [ ] Focus timer
- [ ] Five-minute launch
- [ ] Distraction parking lot
- [ ] Active recall
- [ ] Review scheduling
- [ ] Mistake notebook
- [ ] Exams
- [ ] Progress
- [ ] Time-estimation calibration
- [ ] Confidence calibration
- [ ] Settings
- [ ] Import/export or migration path from web data
- [ ] Firestore sync
- [ ] Notifications
- [ ] Onboarding

## Safety gates before replacing the web app
- [x] Existing web app stays deployable
- [ ] Auth tested on real Android development build
- [ ] Local data survives restart
- [ ] Each Firebase user is isolated
- [ ] Firestore is not enabled until per-user security rules are written and tested
- [x] No private/admin Firebase keys in the client repository
- [ ] Accessibility / reduced-motion pass
- [ ] Android production build passes
