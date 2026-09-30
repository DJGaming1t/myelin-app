# MYELIN Expo migration

The working Firebase/web app remains the reference build until this checklist is complete.

## Foundation
- [x] Private GitHub repository connected
- [x] Stable main branch
- [x] Separate expo-migration branch
- [x] Expo + TypeScript + Expo Router foundation
- [x] Shared MYELIN design tokens
- [ ] Run clean install and Expo Doctor on a development machine
- [ ] Configure EAS project

## Feature parity
- [ ] Authentication shell
- [ ] Email/password authentication
- [ ] Google authentication
- [ ] Verification / password recovery
- [ ] Today planner
- [ ] Topics
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

## Safety gates before replacing the web app
- [ ] Existing web app stays deployable
- [ ] Auth tested on real Android device
- [ ] Local data survives restart
- [ ] Each Firebase user is isolated
- [ ] Firestore is not enabled until per-user security rules are written and tested
- [ ] No private/admin Firebase keys in the client repository
- [ ] Accessibility / reduced-motion pass
- [ ] Android production build passes
