# Automatic preview updates

MYELIN publishes compatible source changes to the Android preview app with EAS Workflows whenever `expo-migration` receives a push.

## What happens

1. EAS installs the locked dependencies and runs the same repository verification gates used before merge.
2. EAS calculates the current Android native fingerprint.
3. It looks for an existing `preview` build with that exact native fingerprint.
4. If a matching build exists, EAS publishes an update to the `preview` branch with the `preview` environment.
5. If no matching build exists, the OTA publish job is skipped. That means a real native change needs a new preview APK.

This replaces the older manual commit-baseline check and does not require a GitHub `EXPO_TOKEN` secret.

## When a new APK is actually required

Create a new preview build when the native fingerprint changes, for example after:

- adding/upgrading a native dependency
- changing Expo config that affects Android native output
- changing config plugins or Android permissions
- upgrading Expo SDK / React Native
- changing the user-facing app version while using the `appVersion` runtime policy

Run:

```bash
npm run eas:preview
```

After that build exists, future JS/TypeScript/style/asset changes with the same native fingerprint can resume OTA delivery automatically.

## Manual preview update

The existing manual command remains available:

```bash
npm run eas:update:preview -- --message "Describe the change"
```

Use it only when you deliberately want to publish outside the automatic workflow and you have confirmed the installed preview build has a compatible runtime.

## Preview activation on device

A preview build may need up to two cold launches after a newly published update:

1. one launch discovers/downloads the update in the background;
2. the next launch starts the downloaded update.

Fully terminate the app between those launches. Backgrounding alone is not the same as a cold launch.
