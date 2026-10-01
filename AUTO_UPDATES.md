# Automatic preview updates

MYELIN uses GitHub verification as the quality gate and GitHub Actions as the OTA publisher.

## Automatic flow

1. A change lands on `expo-migration`.
2. `.github/workflows/verify.yml` runs the full TypeScript, product, Firebase, Expo Doctor and Android-generation checks.
3. Only after **Verify Expo app** succeeds, `.github/workflows/publish-preview.yml` is triggered.
4. If the repository secret `EXPO_TOKEN` is configured, GitHub runs:
   ```bash
   npx eas-cli@latest update --channel preview --environment preview --platform android --non-interactive
   ```
5. If `EXPO_TOKEN` is not configured, publishing is skipped cleanly and the Actions log shows an explicit notice.

This avoids relying on the EAS Workflow compute workers that were remaining stuck before their first log line.

## One-time GitHub setup

Create an Expo personal access token in the Expo dashboard, then add it to the GitHub repository as an Actions secret named exactly:

```
EXPO_TOKEN
```

Do not paste the token into source code, commit history, issues or chat.

After the secret exists, future verified merges publish automatically. The publisher also supports **Run workflow** manually from GitHub Actions, which is useful for publishing the current verified commit immediately after the secret is added.

## Native changes still require a new APK

`scripts/check-native-runtime-boundary.cjs` runs in GitHub verification. If native-sensitive inputs change without a new `app.json` version, verification fails.

Native-sensitive inputs include:

- `app.json` / app config
- `package.json` or `package-lock.json`
- Firebase Android config
- config plugins
- committed `android/` or `ios/` files

For a real native change:

1. bump `app.json` `expo.version`;
2. create a new preview APK with `npm run eas:preview`;
3. install/test that runtime;
4. resume OTA updates for normal JS/TS/style/asset changes.

The app uses `runtimeVersion.policy = appVersion`, so each version bump creates a new OTA compatibility boundary.

## Manual local publish

The existing local command remains available:

```bash
npm run eas:update:preview -- --message "Describe the change"
```

The local EAS CLI must be logged into the Expo account that owns the project.

## Preview activation on device

A preview build may need up to two cold launches after a newly published update:

1. one launch discovers/downloads the update;
2. the next launch starts the downloaded update.

Fully terminate the app between those launches. Backgrounding alone is not the same as a cold launch.
