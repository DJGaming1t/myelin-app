# Standalone app blocking — implementation checkpoint

Version/runtime 0.2.17, Android code 14. Based on d9eb48fd003ad773f0ddbba109ed18a7509cced4 on codex/exam-autopilot-capacity-v1. Existing preview channel and appVersion runtime compatibility remain intact. Expo LocalAuthentication adds native code, requiring a new APK.

App blocking has a dedicated route from Settings and Focus. Apps, Sites, When and Options are separated; permission steps and advanced controls are progressively shown. Custom repeat-day schedules and overnight times run independently of the optional Focus switch. The provider owns synchronization across navigation. With Focus disabled for blocking, timer changes do not reset the schedule identity. Existing Focus timer/motion/data/navigation are retained.

Optional system fingerprint/device authentication protects settings changes. Owner, visit, cancellation, stale-config and Strict-session checks gate persistence. Device-credential fallback stays available; settings authentication does not unlock blocked apps or replace native PIN/emergency confirmation. The native blocker uses simpler copy, expandable thought parking, flexible button heights and a route appropriate to a schedule or Focus session. Essential system access remains protected.

Current checkpoint: genuine tsc --noEmit and Focus Shield A/B+C suites passed after restoring the temporary workspace. Full Android assembly and final artifact verification are pending; this checkpoint is not an APK delivery. Earlier browser checks passed at 320/390 px and all 12 existing Focus scenarios before the workspace reset; they will be repeated against this restored source. No physical-device authentication/interception QA has been performed. No Expo publication, EAS build or hosted workflow is authorized or started.

Google sign-in on the earlier test APK still requires project-owner certificate registration as documented in native-focus-shield-google-signin.md. The error-feedback fix is included; certificate registration cannot be replaced by a JS change.
