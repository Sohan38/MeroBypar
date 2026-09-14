---
name: release-validation
description: Comprehensive release verification procedure for MeroByapar covering TypeScript compilation, Vite web bundle build, Capacitor/Android synchronization, package identity, version consistency, and git status checks.
---

# MeroByapar Release Validation Guide

Use this skill before releasing a new version, cutting an APK/AAB build, or finalizing major milestones to ensure software stability, packaging consistency, and production readiness.

---

## Stage 1: TypeScript & Code Quality Verification

Confirm zero compilation and type errors:

```powershell
npm run typecheck
```

- Target: Must exit with code 0.
- If errors exist: Resolve them strictly according to domain contracts; do not use `@ts-ignore` or `any` casts as workarounds.

If tests exist:
```powershell
npx vitest run
```

---

## Stage 2: Web Production Bundle Build

Compile the production PWA web distribution:

```powershell
npm run build
```

- Target: Confirms Vite successfully bundles `dist/` with service worker precache (`vite-plugin-pwa`) and minified assets.
- Ensure no unresolved module errors or circular dependency breaks appear during bundling.

---

## Stage 3: Capacitor & Android Synchronization

Sync the latest web build into the native Android Capacitor shell:

```powershell
npx cap sync android
```

- Target: Copies `dist/` into `android/app/src/main/assets/public/` and updates native plugin bridges (`@capacitor-mlkit/barcode-scanning`, `@capacitor/filesystem`, etc.).
- Inspect terminal output for any missing native plugin bindings.

---

## Stage 4: Package Identity & Version Verification

Cross-verify version metadata across all three configuration targets:

1. **`package.json`**:
   - `version`: (e.g. `1.0.1`)
2. **`capacitor.config.ts`**:
   - `appId`: Must remain `com.sohan.merobyapar`
   - `appName`: Must remain `MeroByapar`
3. **`android/app/build.gradle`**:
   - `applicationId`: Must match `com.sohan.merobyapar`
   - `versionCode`: Integer incremented with each release (e.g., `1`, `2`, `3`...)
   - `versionName`: String matching or reflecting `package.json` release version (e.g., `"1.0.1"`)

---

## Stage 5: Android Build Verification (Optional / Pre-Release)

To verify the Android build without launching Android Studio:

```powershell
cd android
./gradlew assembleDebug
cd ..
```

- Verifies that Gradle compiles the APK cleanly and dependencies resolve without conflicts.
- For release signing, ensure release signing keys and keystore configs are not committed to source control.

---

## Stage 6: Git Hygiene & Uncommitted Changes Audit

Before declaring the release validated:

```powershell
git status
```

- Verify that no untracked scratch files, debug logs, or unwanted temporary artifacts exist.
- Ensure that only intended modifications are staged or committed.
