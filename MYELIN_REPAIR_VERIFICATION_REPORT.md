# Myelin Stage 1–4 — Type Contract Repair Review

Date: 2026-11-05

## Source and scope

Input: `myelin-stage1-to-4-FIXED-COMPLETE(1).zip` (275 files). This is a **newer archive** than the ZIP that generated the user's 129-error TypeScript log. Comparison against that earlier ZIP found 32 already-modified files addressing provider, theme, workspace, planning, Focus Shield and guide contracts. Original app version is 0.2.19.

The working project preserves the submitted Stage 1–4 design and application code. No GitHub push, EAS Update or APK build was initiated.

## Additional repairs made in this review

1. `src/features/notifications/notification-runtime.ts`: `reminderSubtitle` and `reminderColor` now accept the precise `Pick<ReminderSettings, 'voice'>` contract they actually use. This fixes genuine type incompatibilities when their callers supply preview-only `voice`/`detail` settings; no default values or behavior changed.
2. `src/features/focus/focus-shield.ts`: explicitly types resolved companion domains as `readonly string[]`, addressing a TypeScript inference diagnostic without weakening types.
3. `src/features/exams/AutopilotReflowNotice.tsx`: removes an unreachable final branch after exhaustive handling of `reclaim-commitment` and `split-topic`, which formerly referred to `option.effect` when `option` was `never`. No reachable interface path was removed.

No `any`, `@ts-ignore`, `@ts-nocheck`, or relaxed TypeScript compiler settings were added.

## Verification actually executed

- Parsed 235 TS/TSX/JS/JSX/MJS/CJS files using the TypeScript compiler parser: **0 syntax failures**.
- Checked static local import paths in those files: **0 unresolved local paths**.
- Ran these **20 actual domain test scripts** using a temporary, external TypeScript transpilation runner (not shipped with project): `verify-data`, `verify-topics`, `verify-today`, `verify-planning`, `verify-adaptive`, `verify-mistakes`, `verify-exams`, `verify-progress`, `verify-settings`, `verify-transfer`, `verify-cloud`, `verify-notifications`, `verify-onboarding`, `verify-guides`, `verify-help`, `verify-parked-inbox`, `verify-transition`, `verify-polish`, `verify-visual-overhaul`, `verify-auth`. **All 20 passed.** The runner transpiles TypeScript; it is *not* a semantic typechecker.
- Ran the real contrast script: **37 text/surface pairs passed**, minimum body text contrast **4.60:1**.
- Independently parsed GLB asset headers: distinct valid brain and Lego assets. Brain SHA-256: `5823fab71fe9aba3f48f64392f8588830fc6cab1e38ae92f1248bddf90fa4dbf`; Lego SHA-256: `cbe285aa33b9e64fcd5a405cbd45358ee51108142d036d13e285fc3f76a717c6`.
- Compared `package.json` dependencies and devDependencies to root `package-lock.json`: **0 mismatches**.
- An isolated TypeScript compiler pass without Expo/React Native dependencies helped identify the above repairs, but generated many missing-module and React typing errors. It **cannot certify** a full `npm run typecheck` pass.

## Checks NOT completed

**Do not interpret this artifact as fully verified.** The environment cannot resolve `registry.npmjs.org`, so `npm ci`, the full version-pinned project `npm run typecheck` (TypeScript 6, Expo tsconfig and React Native typings), `npx expo export --platform android --clear`, and an actual Android run were **not executed**. The native-presentation verification script also could not run because `three` is unavailable; the GLB assets were inspected independently instead. `verify-focus` and `verify-review` require React Native AsyncStorage and could not start in this environment; `verify-release` needs the project's normal TS/ESM toolchain.

The reported 129 errors were found against the **older** ZIP. The new ZIP includes an extensive existing fix set, and three additional genuine diagnostic issues were addressed here; the actual number of errors remaining cannot be established without installing the required dependencies and performing the real TypeScript check.

## Next acceptance gate (external machine / CI)

Run against this exact archive in a clean environment with working dependencies:

```bash
npm ci
npm run typecheck
npm run verify
npx expo export --platform android --clear
```

Do not publish any EAS Update or assume compatibility with the installed APK until typecheck and Android export pass and native runtime compatibility is verified.
