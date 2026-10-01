# Automatic preview updates

MYELIN publishes compatible source changes to the Android preview app with EAS Workflows whenever `expo-migration` receives a push.

## What happens

1. GitHub verification remains the source-quality gate for changes before they are merged.
2. EAS looks for an existing internal Android `preview` build on the `preview` channel whose app version and runtime version match the current `app.json` version.
3. If that compatible build exists, EAS publishes the current JavaScript/TypeScript/assets to the `preview` update branch using the `preview` environment.
4. If no compatible build exists, the OTA publish job is skipped. A new preview APK is required first.

The workflow deliberately does not use the EAS fingerprint job because that worker was not progressing reliably for this project. Runtime compatibility is enforced by the existing `runtimeVersion.policy = appVersion` boundary plus an exact version/runtime match in the build lookup.

## Native changes still require a new APK

Before merging a native dependency or native configuration change:

- bump the user-facing app version in `app.json`
- update the preview workflow's `app_version` and `runtime_version` to the same value
- create a new preview APK

Typical native-boundary changes include:

- adding/upgrading a native dependency
- changing Expo config that affects Android native output
- changing config plugins or Android permissions
- upgrading Expo SDK / React Native
- changing Google/Firebase native configuration

Run:

```bash
npm run eas:preview
```

The release verifier intentionally fails if the preview workflow version/runtime no longer matches `app.json`.

## Manual preview update

The existing manual command remains available:

```bash
npm run eas:update:preview -- --message "Describe the change"
```

Use it only when you deliberately want to publish outside the automatic workflow and the installed preview build has the same runtime version.

## Preview activation on device

A preview build may need up to two cold launches after a newly published update:

1. one launch discovers/downloads the update in the background;
2. the next launch starts the downloaded update.

Fully terminate the app between those launches. Backgrounding alone is not the same as a cold launch.
