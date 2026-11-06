# Cloud sync activation

Feature 12 is intentionally fail-closed in production until the Firestore rules in this repository are deployed.

## Before enabling uploads

1. Run the repository verification pipeline. It includes Firestore emulator tests for `firestore.rules`.
2. In the Firebase project, create/enable Cloud Firestore if it is not already enabled.
3. Deploy only the verified rules from this repository:
   `firebase deploy --only firestore:rules`
4. Confirm the deployed rules still restrict MYELIN data to:
   - `/users/{uid}/cloud/current`
   - `/users/{uid}/cloud/current/chunks/{chunkId}`
   - only when `request.auth.uid == uid`
5. Build the app with `EXPO_PUBLIC_ENABLE_CLOUD_SYNC=1`.

Until step 5, the app shows Cloud Sync as **Not activated** and will not upload study data.

## Data model

- AsyncStorage remains the offline source of truth.
- Firestore stores one validated manifest plus bounded workspace chunks per authenticated user.
- The client verifies chunk generation, count, size, workspace schema, and fingerprint before applying cloud data.
- Both-side edits produce an explicit conflict. MYELIN does not silently choose a winner.
- Local-only mode never uploads.

## Account/data deletion

The Cloud Sync screen can delete the Firestore study copy separately. The account deletion path first deletes the cloud study copy, then requests Firebase Authentication account deletion, and finally erases that account workspace from this device after successful account deletion.

Firebase may require a recent sign-in before account deletion. In that case, the cloud study copy is already removed, while the account and local workspace remain so the user can sign in again and retry.
