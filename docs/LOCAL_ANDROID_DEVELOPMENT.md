# Local Android testing and visual iteration

MYELIN uses Expo, including a custom Android module for blocking. There are two useful ways to test it without an EAS build:

1. A standalone APK runs on the phone without a computer. Changes require another native build unless an appropriate Expo update has been published. Local testing APKs made with `MYELIN_LOCAL_TEST_APK=1` deliberately have updates disabled.
2. An Expo development build contains the native modules and connects to Metro on a computer. JavaScript, styles, and many UI changes can refresh over the local network without building another APK. Kotlin, permissions, Expo plugins, and native dependency changes still require a new development build.

## Install a development build

On a computer with Node, a Java 17 JDK, the Android SDK, and this repository checked out at the version you want to test:

```sh
npm ci
npm run android:local
```

Choose the connected Android phone when prompted. Enable USB debugging and accept the computer's debugging prompt on the phone. The command builds and installs the development build locally; it does not start an EAS build.

Then start Metro from the same checkout:

```sh
npm run dev:phone
```

Keep the computer and phone on the same network, open the development build, and connect using the address shown by Expo. USB debugging with `adb reverse tcp:8081 tcp:8081` can help if the network isolates devices. Metro must remain running for the development build to load the current app. A development-build link is a local address, not a public Expo build-progress page.

## Update safely

Export or otherwise back up study data first. Android permits an in-place `adb install -r path/to/app.apk` only when the package, signing certificate, and version rules match. If Android rejects an APK because of its signing certificate, do not uninstall the existing app until a verified backup is safe. A development build with the same package and certificate can replace the standalone app; it then needs Metro until the compatible standalone APK is installed again.

Google sign-in also depends on the signing certificate registered with Firebase. See `docs/beta/native-focus-shield-google-signin.md`. A successful build or installation alone does not verify sign-in or blocking on a phone.
