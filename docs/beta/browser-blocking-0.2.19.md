# Browser blocking without a VPN — 0.2.19

This change replaces MYELIN's local DNS VPN with a narrow, event-driven Android accessibility service. It observes the address-bar field in Chrome, Chrome Beta, Brave and Edge during an active website-blocking window. It compares the host against the person's selected rules and sends the browser to Home when a match is found. The VPN service is disabled in the manifest and the schedule receiver stops an older tunnel instead of starting one. App blocking remains a separate feature.

The service does not periodically poll or route internet traffic. It ignores an address field being edited, does not save full URLs or page content, and records only the matched blocked domain locally. The app shows a separate in-app explanation and asks for confirmation before opening Android accessibility settings. A denied or revoked permission leaves website blocking unavailable while the Focus timer and app-blocking permissions remain independent.

Browser UI IDs can change: support is best effort and must be tested on the user's phone and browser versions. Other browsers, in-app WebViews, pages without a readable address bar, browser changes and already visible content may bypass this method. Android may restrict accessibility settings for sideloaded apps; check the phone's system instructions. A schedule alarm remains inexact and may require the person to tap a reminder or open MYELIN before app blocking starts. Home, phone, emergency calls, keyboard and Settings must remain accessible.

## Comparison

- [Mindful](https://github.com/akaMrNagar/Mindful) uses a local VPN for cutting off internet access to selected apps. Its [browser manager](https://github.com/akaMrNagar/Mindful/blob/main/android/app/src/main/java/com/mindful/android/services/accessibility/BrowserManager.kt) separately observes browser accessibility information for website restrictions; its [reminder manager](https://github.com/akaMrNagar/Mindful/blob/main/android/app/src/main/java/com/mindful/android/services/tracking/ReminderManager.kt) has reminder presentation logic. The exact popup the user means needs confirmation. No Mindful source code was copied.
- [AppBlock](https://github.com/SadeekFarhan21/AppBlock) describes checking supported browser address bars and notes that unsupported browsers and in-app WebViews bypass this approach.
- [Google Play's accessibility policy](https://support.google.com/googleplay/android-developer/answer/10964491) requires a declaration and, for apps that are not accessibility tools, a prominent disclosure and affirmative consent. This document and the in-app disclosure are not a substitute for review of the final release and its declaration.

The JavaScript tests, isolated Expo prebuild and direct Kotlin compilation do not establish that blocking works on a device. A complete Gradle build and physical-device checks are required before describing the new implementation as verified.
