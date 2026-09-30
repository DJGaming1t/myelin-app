# Automatic preview updates

MYELIN can publish compatible source changes to the installed preview app automatically whenever `expo-migration` receives a push.

## One-time setup

1. Sign in to the Expo account that owns `@duckslord/myelin`.
2. Create an Expo access token from the Expo account's access-token settings.
3. In the private GitHub repository, open **Settings → Secrets and variables → Actions**.
4. Add a repository secret named exactly `EXPO_TOKEN`.
5. Paste the Expo access token as the secret value.

Do not put the token in `.env`, source code, chat messages, commits, or screenshots.

## What happens after setup

For a normal TypeScript/UI/logic commit on `expo-migration`:

1. GitHub Actions checks out the commit.
2. It verifies TypeScript and core preview-safe checks.
3. It runs `eas update --channel preview`.
4. Compatible installed MYELIN preview builds receive the update through EAS Update.

## Native-change safety gate

The automation intentionally does **not** publish an OTA update when the commit changes any of these native-sensitive paths:

- `app.json`
- `eas.json`
- `package.json`
- `package-lock.json`
- `google-services.json`
- `android/`
- `ios/`

Those changes may alter the native runtime. Make a new preview build instead:

```bash
npm run eas:preview
```

This gate is conservative on purpose. It may request a new APK for some dependency/config changes that would technically be OTA-safe, but it avoids sending an update that expects native code the installed build does not contain.
