# MYELIN privacy policy draft

**Status:** draft for testing. Add the final publisher/contact details and host this policy at a stable public URL before a store release.

MYELIN is a study-planning and active-recall app.

## Data stored on the device

MYELIN stores study information such as topics, recall questions, answers, mistakes, exams, study history, focus-session information and settings locally on the device. Local-only mode does not require a MYELIN account.

## Accounts

If a user chooses account mode, Firebase Authentication is used for account identity. Depending on the chosen sign-in method, authentication information is handled by Firebase/Google as needed to sign the user in.

## Optional cloud sync

Cloud sync is optional. When it is explicitly enabled and the production sync gate is active, MYELIN can copy the user's study workspace to Firebase Firestore under that user's account so it can be synchronized across devices. Study data is not silently uploaded from local-only mode.

## Notifications

Study reminders are scheduled locally on the device. MYELIN does not use reminder content for advertising and does not use streak-pressure notifications.

## Analytics and advertising

The current native MYELIN build does not initialize Firebase Analytics and does not contain advertising functionality.

## Data controls

The app includes local workspace reset controls, backup/import/export controls, cloud-data controls and an account deletion path. Some account/cloud operations may require a network connection and reauthentication.

## Security

MYELIN's Firestore design uses per-user access rules and keeps administrative/private credentials out of the client repository. No software can guarantee absolute security.

## Children and school use

MYELIN is a study tool. The final publisher should review the age rating, Play Console data-safety declarations and any child-directed-app obligations that apply to the intended audience and distribution regions before public release.

## Contact

Replace this section before release with the publisher name and a monitored support/privacy email address.
