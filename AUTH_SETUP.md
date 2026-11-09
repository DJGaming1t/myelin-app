# Authentication setup

Feature 1 is code-complete and passes automated Expo/Android verification. This file tracks the external Firebase/Google configuration that still affects runtime authentication.

## Already wired
- Firebase project: `myelin-a0ba7`
- Firebase web config for the Firebase JavaScript SDK
- Email/password authentication
- Password reset
- Email verification
- Web Google authentication
- React Native auth persistence with AsyncStorage
- Android package name: `com.djgaming1t.myelin`
- Firebase Android config: `google-services.json`
- Expo Google Services config plugin
- Native Google credential flow using `react-native-nitro-google-signin`
- Automatic Android Web OAuth client detection from `google-services.json`

## Firebase Console checks
Under **Authentication > Sign-in method**:
- Enable Email/Password
- Enable Google

Keep Firebase email-enumeration protection enabled.

The UI currently expects the password policy:
- minimum 10 characters
- lowercase letter
- uppercase letter
- number

## Native Android Google sign-in

The current `google-services.json` contains:
- the correct package: `com.djgaming1t.myelin`
- the Firebase Android app ID
- a Web OAuth client ID

The remaining external requirement is the app-signing **SHA-1**.

Before native Google sign-in can be considered runtime-ready:

1. Create a development or EAS Android build so a signing certificate exists.
2. Obtain that certificate's SHA-1.
3. In Firebase Console > Project settings > Your apps > Android app, add the SHA-1.
4. Download a fresh `google-services.json` and replace the existing file.
5. Rebuild the development app because Google Services/native plugin changes are applied at build time.

When the app later uses Google Play App Signing, add the Play signing SHA-1 as well.

The app uses `webClientId: 'autoDetect'`, so no separate Android environment variable is required when the refreshed Firebase file contains the correct OAuth configuration.

## Security note

Firebase Android/Web configuration files contain client identifiers rather than Firebase Admin credentials. Do **not** add:
- service-account JSON
- Firebase Admin private keys
- OAuth client secrets
- keystore passwords
- signing keys

to the repository.

## Current audit finding

The checked-in `google-services.json` currently has a Web OAuth client (`client_type: 3`) but no Android OAuth client (`client_type: 1`). That is expected until the EAS keystore SHA-1 is registered.

The preview APK can still be used to test local mode and email/password auth. Do not mark native Google sign-in as verified until a refreshed Firebase config contains the Android OAuth client and Google sign-in succeeds on the signed APK.


## Android Google sign-in release gate

Google's account picker opening is not enough to prove authentication is configured. The installed APK's **package name and signing certificate** must match an Android OAuth client in Firebase/Google Cloud.

For the EAS preview/production keystore:

1. Get the Android signing certificate SHA-1 and SHA-256 from EAS credentials.
2. In Firebase Console, open project settings for Android app `com.djgaming1t.myelin`.
3. Add both SHA fingerprints.
4. Download the refreshed `google-services.json`.
5. Replace the repository copy and create a **new native APK**.
6. Run `npm run verify:auth`.

The refreshed file should contain an OAuth client with `client_type: 1` for the Android app in addition to the web OAuth client (`client_type: 3`). Until then, Google sign-in is considered **not runtime-verified**.

Email/password authentication must also be enabled in Firebase Authentication → Sign-in method. MYELIN waits for Firebase's initial auth state before routing, and once Firebase successfully creates an email account, optional profile/verification-email follow-up failures no longer make the UI incorrectly report that account creation itself failed.
