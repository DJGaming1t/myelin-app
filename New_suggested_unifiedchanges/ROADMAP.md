# MYELIN native build order

The web app at https://myelin-bydj.web.app remains the reference version until native feature parity is complete.

## 1. Authentication and access
- Welcome / account choice
- Email sign in and sign up
- Password policy feedback
- Forgot-password flow
- Email verification gate
- Google sign in
- Session persistence choice for shared devices
- Local-only workspace option
- Protected routes and sign out

**Done when:** account flows work on a real Android development build and signed-out/unverified users cannot enter protected screens.

## 2. Offline data foundation
- Typed Topic, Question, Session, Mistake, Exam and Settings models
- Durable on-device persistence
- Separate workspace per Firebase user
- Separate anonymous/local workspace
- Safe schema migrations between app versions
- Recovery behavior for damaged local data

**Done when:** data survives restarts and two accounts on one phone cannot see each other's workspace.

## 3. Topics and study material
- Subject/topic creation and editing
- Priority and estimated study time
- Notes
- Recall questions / reference answers / hints
- Search and filters
- Topic detail screen

## 4. Today planner
- Daily time budget
- Energy setting
- Exam-aware prioritization
- Due review prioritization
- Subject interleaving
- Realistic block lengths and breaks
- One clear next action

## 5. Focus mode
- Focus timer
- Break timer
- Five-minute launch
- First tiny step
- Distraction parking lot
- Planned vs actual duration
- Safe recovery if the app backgrounds or closes

## 6. Active recall and review engine
- Answer-before-reference flow
- Hint use
- Confidence check
- Again / Practising / Good grading
- Per-question scheduling
- Mixed review queues
- Interrupted-session recovery

## 7. Mistake notebook
- Capture mistakes from review or manually
- Concept / calculation / recall / application categories
- Corrections
- Re-test mistakes
- Resolution rules
- Open/resolved filtering

## 8. Exams
- Exam date and scope
- Subject/topic coverage
- Exam-aware planning pressure
- Upcoming-exam view
- No fake predictions or mastery claims

## 9. Progress and calibration
- Study time history
- Review results
- Confidence calibration
- Planned-vs-actual time calibration
- Topic-level trends
- Useful charts without vanity metrics

## 10. Settings, account and privacy
- Study-time defaults
- Focus/break defaults
- Account status
- Verification status
- Sign out / switch account
- Local-data controls
- Accessibility and reduced motion

## 11. Import, export and web migration
- Portable backup format
- Import validation
- Export/share backup
- Migration path from the current MYELIN web backup
- Never silently overwrite newer data

## 12. Cloud sync
- Firestore data design
- Per-user Security Rules
- Offline-first conflict handling
- Explicit sync status
- Delete-account/data path
- No cloud upload before rules are tested

## 13. Notifications and review reminders
- Optional due-review reminders
- Quiet hours
- Exam reminders
- Permission requested only when useful
- No manipulative streak notifications

## 14. First-run onboarding
- Fast setup
- Explain active recall briefly
- Create first topic
- Choose realistic daily capacity
- Skip paths for experienced users

## 15. Product polish
- Motion and micro-interactions
- Loading / error / empty states
- Accessibility pass
- Keyboard and screen-reader support
- Performance and battery pass
- Responsive tablet/web behavior

## 16. Release engineering
- EAS project
- Development / preview / production builds
- App icon and splash assets
- Android signing
- Privacy policy and store listing
- Play Store internal/closed testing
- Production release checklist
