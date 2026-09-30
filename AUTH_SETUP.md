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
