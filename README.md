# MYELIN

MYELIN is a study-planning and active-recall app.

Active work follows the [MYELIN master checklist](docs/MYELIN_MASTER_PLAN.md), one verified chunk at a time.

## Repository strategy

- `main` stays stable.
- The current Firebase/web app remains the safety/reference version at https://myelin-bydj.web.app.
- The React Native + Expo migration is developed separately on the `expo-migration` branch.
- We only replace the reference app after feature parity and testing.

## Migration stack

- React Native
- Expo
- TypeScript
- Expo Router
- Firebase Authentication
- Local-first study data, with cloud sync added only after security rules are designed and tested

See the migration branch for the active port.
