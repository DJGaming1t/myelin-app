# Native Focus Shield B + C test build

Base: `90a39517c86250e301d6113cd6395c8733752198` on `codex/exam-autopilot-capacity-v1`.
Version/runtime: **0.2.16**, Android version code **13**. Runtime policy remains `appVersion`. The 0.2.13 and 0.2.14 preview runtimes cannot receive this native implementation by OTA. Existing EAS preview settings, project ID and Google services are retained.

## Integrated behavior

- Local Android `VpnService` filters selected website domains and companion media/shortlink domains. Only the synthetic DNS address `10.111.222.1/32` enters the tunnel; ordinary IPv4/IPv6 and HTTPS remain outside it. The system's network resolver receives allowed DNS queries. There is no HTTPS inspection, remote VPN server, new paid service, root or accessibility service.
- DNS parsing bounds packet lengths and questions, verifies upstream transaction/question identity, uses connected protected sockets, retries resolvers with bounded workers/queue, supports DNS over TCP, and discards replies from a superseded owner/session/tunnel. Responses exceeding the UDP budget trigger TCP retry.
- The VPN is independent of Usage Access/overlay permissions. A conflicting VPN is reported without replacing it. Permission denial, revoke, pause/break/expiry, owner changes and teardown stop or gate the relevant protection. An idle session expires without waiting for another DNS packet.
- Recurring daytime/overnight schedules, custom study-app allowlists, progressive friction and bounded seven-day local analytics are integrated from Argon's cumulative package. The verified Chunk A timer, motion, owner-scoped synchronization, native event handling, PIN safeguards and emergency-app protection are retained.
- Native counts, event writes, break passes and overrides reject stale account/session/enforcement-window snapshots. Queued DNS work and overlays are refreshed or discarded when that identity changes.
- A blocked DNS request is recorded as `blocked`, not as a successful return to studying. This prevents background requests from inflating recovery statistics. Concurrent local log writes are serialized; future-dated records are excluded.

## Corrections to the supplied package

The cumulative package targeted the older 0.2.13 base and reintroduced several already-fixed A defects. It was merged selectively. Correct SHA-256 vectors, durable config subscriptions, provider-owned native synchronization, fresh timer deadlines, scoped event delivery, essential dialer/Settings/IME protection, missing-salt rejection and resource cleanup remain in place.

The supplied 60-second `setWindow` description was incorrect for a target Android 12+ app. Android clips small windows to at least ten minutes and may delay them further in Doze. Inexact alarms also do not generally authorize a cold background foreground-service start. Schedules therefore restore reminders after boot/update/time changes and ask the user to tap a notification when activation from a cold process is needed. Visible MYELIN checks schedules every 30 seconds. Running services evaluate expiry locally. There is no promise of exact or unattended cold-start enforcement.

Schedule boundaries use calendar dates in the current time zone, rather than adding fixed 24-hour milliseconds; native tests cover DST and overnight transitions. Empty custom schedules remain empty after validation. Friction reaches its declared 120-second cap and resets for a new enforcement window.

References: [Android alarms](https://developer.android.com/develop/background-work/services/alarms), [foreground-service background restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [VpnService lifecycle](https://developer.android.com/develop/connectivity/vpn).

The existing LiteRT Expo plugin pins Kotlin 2.3.0, while the Expo catalog selected Kotlin/KSP 2.1.20. Prebuild now explicitly aligns Kotlin and KSP2 to 2.3.0, preserving the LiteRT dependency and making clean builds reproducible.

## Verification

TypeScript `npx tsc --noEmit` passes. Existing Focus, Polish, Visual, Guides and release suites pass. New B+C tests cover companion domains, suffix boundaries, invalid domains, deleting schedules, overnight end boundaries, friction escalation, future-date analytics and concurrent owner-scoped logs. Existing A hook/bridge regressions pass.

All native Kotlin sources compile directly against the actual Android API 36 and React Native 0.86.3 classes. JVM tests execute the DNS codec/TCP state machine and native schedule evaluator, including packet checksums, malformed packets, split TCP framing, duplicate segments and DST.

Expo Android prebuild passes. The restored eight-file native implementation compiles directly against Android API 36 and React Native 0.86.3. A native JVM test additionally executes the actual store and rejects stale-owner, stale-session and stale-schedule-window counts, analytics, break passes and overrides.

**Full local Gradle assembly passed on 2026-10-21: `:app:assembleRelease`, `BUILD SUCCESSFUL in 12m 28s`.** This includes actual app Kotlin 2.3.0/Java/C++ compilation, JavaScript bundling and Android release lint. The local environment downloaded original published Android/Gradle artifacts with TLS verification. Dependency versions were preserved. Gradle/native concurrency and Metro workers are bounded to fit the local build environment; Expo CLI telemetry and networking were disabled during bundling. No physical handset or emulator interception test has been performed.

Verified source: `6b65e0f7d4de529142b201ff2f3f97e9ce96d1d0`. The standalone arm64 APK is 74,240,291 bytes; SHA-256 `484253fe141a90bd1014a616e28874e0981a61f9a9750e25e4502159c5189cd9`. Package/version, unexported native components and VPN permission, embedded Hermes bundle, native DEX classes, ZIP integrity, signing certificate, ZIP alignment and all native ELF 16 KB segment alignments were checked. Expo Updates is disabled in this testing binary. The APK uses a local debug certificate. Compilation and these checks do not establish on-device blocking.

## Standalone build

Set `MYELIN_LOCAL_TEST_APK=1` during `npx expo prebuild --platform android --no-install` and the local Gradle build. This disables Expo Updates only for this test binary. Normal builds retain the existing preview/update configuration. `:app:assembleRelease` embeds the JS bundle and uses the generated local debug certificate; it is a testing build, not a production release. No Metro server is required.

This APK uses the existing package ID. It may have a different signing certificate from the installed preview. Export/back up study data first. If Android reports a signing conflict, do not uninstall the existing app until your backup is safe. Google sign-in may require registration of this local signing fingerprint; guest/email testing can be used where available.

## Physical-device checklist

1. Open Focus → Set up distraction blocking. Grant Usage Access, Display Over Other Apps and Local DNS VPN separately. Deny each once and confirm Focus still works. Allow notifications for schedule reminders. Disconnect other VPNs manually; MYELIN must not replace one silently.
2. For DNS testing, turn off Android Private DNS and the browser's Secure DNS. Select `youtube.com` and a custom site; keep a control site such as `example.com` unblocked. Start a Focus session and open fresh/private tabs in two browsers. Blocked domains/subdomains/companions should fail; control pages should load. Already-open streams and cached results may persist.
3. Block the installed YouTube app. Test launching via Home, Recents, notifications and deep links. Check that Home, Settings, keyboard, SMS, an incoming normal call and Phone remain accessible. Do not place a test emergency call.
4. Pause/resume, enter/finish a break, extend, finish/discard and let the timer expire with no web traffic. Verify the overlay and VPN lifecycle. DNS/browser caches can delay restoration; use a fresh tab or wait before retesting.
5. Test a schedule across midnight, overlapping schedules and a clock/time-zone change. Reboot, then tap the due schedule notification. Confirm its reminder can be delayed and that opening MYELIN activates the current window.
6. Repeat attempts in Hard mode: 10 → 15 → 23 → 34 seconds, capped at 120. Verify break-pass count, Strict behavior, wrong/correct PIN and emergency override expiry. Check seven-day app/site totals without counting DNS blocks as recoveries.
7. Revoke VPN/overlay/Usage Access mid-session; switch Wi-Fi/mobile data; switch accounts/sign out; force-stop/reopen; try battery saver, split-screen, floating windows and PiP. Verify no old-owner thought or event appears in the new account.

## Limits requiring handset verification

DNS filtering cannot guarantee blocking of explicit browser DoH, Private DNS, hard-coded resolvers/IPs, existing connections, cached DNS/pages, another VPN or a work profile. One VPN per Android profile means coexistence with another VPN is unavailable. Firefox's canary is voluntary. The app displays these limits and Private DNS status.

Multi-window/PiP and OEM process restrictions remain Chunk A limitations. Inexact scheduled activation is a reminder-based recovery flow when Android cannot start enforcement from a cold background process. Force-stop and denied notifications can prevent that reminder until MYELIN is reopened. Native event queues/history are bounded, so analytics are a local sample, not a complete activity log.

No Expo publication, paid EAS build or hosted workflow is part of this build.
