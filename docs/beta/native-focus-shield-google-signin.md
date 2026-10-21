# Google account picker returns without sign-in — local testing APK

Investigated 2026-10-21 after the owner selected a Google account repeatedly without signing in.

The delivered 0.2.16 arm64 APK has certificate SHA-1 `5e8f16062ea3cd2c4a0d547876baa6f38cabf625`. The repository's `google-services.json` lists an Android OAuth client for the same package with SHA-1 `05b6971ab92ea4928f71ed56689dda831e5ee724`. This confirms a mismatch with the checked-in configuration; the live Firebase/Google Cloud registration has not been inspected. Missing registration of the local APK certificate is the leading explanation, not a device-confirmed diagnosis.

The installed native dependency documents that Android Credential Manager can return `cancelled` for both dismissal and OAuth misconfiguration after account selection. MYELIN converted that result to `auth/google-cancelled` and displayed an empty message. The feedback now states that sign-in closed before completion and that account selection followed by failure can indicate build setup. It does not label every cancellation as a confirmed configuration failure. Developer errors also accept numeric code 10 and native message-only errors. Web popup dismissal remains quiet; account-enumeration protections remain intact.

## Required project-owner configuration

Open https://console.firebase.google.com/project/myelin-a0ba7/settings/general and select Android app `com.djgaming1t.myelin`. Add these fingerprints **without removing the existing preview/release fingerprints**:

- SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- SHA-256: `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`

Confirm Google is enabled under Authentication → Sign-in method. Download the refreshed `google-services.json` for repository integration. Retry the existing APK after registration has propagated; if the required web client remains the same, server-side fingerprint registration may be sufficient without rebuilding. Do not edit certificate hashes into JSON as a substitute for creating the server-side OAuth registration.

## Validation and delivery boundary

`tsc --noEmit`, `scripts/verify-auth.ts` (including runtime feedback regressions), and `git diff --check` passed. This feedback-only change does not alter native dependencies, Focus Shield code, runtime or preview channel configuration. It has not been rebuilt into the previously delivered APK or published by OTA. The prior successful Gradle assembly applies to the delivered APK, not this subsequent source change. No Firebase settings were changed here; no handset Google login has been verified.

Reference: https://firebase.google.com/docs/auth/android/google-signin
