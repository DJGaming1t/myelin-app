# MYELIN release and preview runbook

This repository is prepared for EAS development, preview and production builds. The first real EAS project link and Android signing credentials are account-specific and must be created while signed in to the Expo account that will own MYELIN.

## What is already configured

- Expo SDK 57 / React Native 0.86 project
- Android package: `com.djgaming1t.myelin`
- Development, preview and production EAS build profiles
- Android preview builds explicitly produce an installable APK
- Preview and production channels are separated
- Runtime compatibility uses the app-version policy
- Production developer-facing build versions are managed remotely and auto-incremented
- `expo-updates` is installed and verified preview OTA publishing is wired through GitHub Actions + EAS CLI
- Signing files and common private key formats are ignored by Git

## First-time EAS link

From a clean checkout on a laptop:

```bash
npm ci
npx expo-doctor
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest update:configure
npm run verify:release
```

`eas init` links this source tree to an Expo/EAS project and writes the account-specific project ID. `eas update:configure` writes the matching update URL and confirms the EAS Update configuration.

Do not invent, copy from another project, or commit a secret in place of the project ID. The EAS project ID itself is project metadata, not a password.

## Build an Android preview

After the project is linked:

```bash
npm run eas:preview
```

The `preview` profile uses internal distribution and an APK. When the build completes, EAS provides a build page/install link that can be opened on an Android phone. The installed preview does not need Metro or a laptop running.

For the very first Android build, EAS can create/manage the signing keystore. Keep the same signing identity for later updates to the installed app and for Play releases.

## Google sign-in verification

The native Google sign-in code is wired and the committed Firebase Android config now contains the Android OAuth client for the EAS preview signing certificate, plus the web OAuth client used for Firebase credential exchange.

Configuration is not the same as runtime verification. Before treating authentication as fully verified:

1. Build the current native runtime.
2. Install it on a real Android device.
3. Test email/password sign-in, persistence and sign-out.
4. Test Google account selection and Firebase sign-in end to end.
5. Add the Play App Signing SHA-1/SHA-256 to Firebase as well before Play-distributed production testing.

Do not mark the auth safety gate complete until these flows are tested on-device.

## Publish code-only preview updates

Pushes to `expo-migration` trigger `.eas/workflows/publish-preview-update.yml`. The workflow publishes to the `preview` update branch only when an existing internal Android preview build matches the current app and runtime version.

That means normal JavaScript/TypeScript, styling and asset changes can reach compatible preview installs without a new APK. Native changes must bump `app.json` version/runtime and create a new preview APK before OTA resumes.

The manual command is still available for deliberate publishing:

```bash
npm run eas:update:preview -- --message "Describe the change"
```

Create a new APK when native dependencies, native configuration, Android permissions, plugins, SDK/runtime inputs or the app-version runtime boundary change.

## Production

Production builds are intentionally separate:

```bash
npm run eas:production
```

Production Android builds are store-oriented AABs by default. Do not submit one until the checklist below is complete.

## Release checklist

### Required before the first preview is trusted

- [x] EAS project linked to the intended Expo account
- [x] EAS Update configured with the generated project ID/update URL
- [ ] GitHub Actions `EXPO_TOKEN` secret configured for automatic preview OTA publishing\n- [x] Native-sensitive changes are blocked unless the app/runtime version advances
- [x] Locked `npm ci` succeeds in GitHub verification
- [x] `npx tsc --noEmit` succeeds
- [x] All repository verification scripts succeed
- [x] `npx expo-doctor` succeeds
- [ ] Preview APK installs on a real Android device
- [ ] Local workspace survives force-close/restart
- [ ] Email/password auth tested on-device
- [ ] Google sign-in tested with the preview signing SHA fingerprints
- [ ] Notifications tested on-device
- [ ] Tutorial replay verified from Settings

### Required before Play testing/production

- [ ] Final app icon and splash assets approved
- [ ] Privacy policy has a real public URL and contact address
- [ ] Store listing copy/screenshots reviewed
- [ ] Cloud-sync production activation/rules deployment deliberately enabled and tested
- [ ] Data deletion/account deletion paths tested
- [ ] Production AAB builds successfully
- [ ] Play Console internal/closed test completed
- [ ] No development secrets, debug endpoints or private signing files are committed
- [ ] Rollback/update procedure tested

## Rollback

For a bad code-only EAS Update, use the EAS dashboard/update tooling to roll back or republish a known-good compatible update. If the native binary itself is bad, publish a new preview/production build; an OTA update cannot replace incompatible native code.
