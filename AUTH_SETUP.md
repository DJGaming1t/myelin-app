# Authentication setup

Most of Feature 1 is implemented in code. This file tracks the external Firebase/Google configuration needed to test it fully.

## Already wired
- Firebase project: `myelin-a0ba7`
- Firebase web config
- Email/password auth
- Password reset
- Email verification
- Web Google auth
- React Native auth persistence with AsyncStorage
- Android package name: `com.djgaming1t.myelin`

## Firebase Console checks
Under **Authentication > Sign-in method**:
- Enable Email/Password
- Enable Google

Keep Firebase email-enumeration protection enabled.

The UI currently expects the recommended password policy:
- minimum 10 characters
- lowercase letter
- uppercase letter
- number

## Native Android Google sign-in

The app code is prepared to exchange a Google ID token for a Firebase credential using the modern Credential Manager-compatible sign-in package.

Before the native Google button can work:

1. Register an **Android app** in Firebase using package:
   `com.djgaming1t.myelin`
2. Add the SHA-1 fingerprint for the development/release signing certificate.
3. Ensure the project has a **Web OAuth client ID**.
4. Set it locally as:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

This client ID is public client configuration, not a private client secret.

5. Build a development build. Native Google sign-in requires native code and does not run inside ordinary Expo Go.

Do **not** put service-account JSON, Firebase Admin credentials, private keys, or OAuth client secrets in this repository.
