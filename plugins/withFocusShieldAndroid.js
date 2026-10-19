const fs = require('node:fs');
const path = require('node:path');
const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');

const REQUIRED_PERMISSIONS = [
  {
    name: 'android.permission.PACKAGE_USAGE_STATS',
    toolsIgnore: 'ProtectedPermissions',
  },
  { name: 'android.permission.SYSTEM_ALERT_WINDOW' },
  { name: 'android.permission.HIDE_OVERLAY_WINDOWS' },
  { name: 'android.permission.FOREGROUND_SERVICE' },
  { name: 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE' },
  { name: 'android.permission.POST_NOTIFICATIONS' },
];

const KOTLIN_FILES = [
  'FocusShieldStore.kt',
  'FocusShieldBlockerActivity.kt',
  'FocusShieldMonitorService.kt',
  'FocusShieldModule.kt',
  'FocusShieldPackage.kt',
];

function ensurePermissionsAndQueries(manifest) {
  manifest.$ = manifest.$ || {};
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }

  manifest['uses-permission'] = manifest['uses-permission'] || [];
  for (const item of REQUIRED_PERMISSIONS) {
    const exists = manifest['uses-permission'].some(
      (p) => p?.$?.['android:name'] === item.name,
    );
    if (!exists) {
      const attrs = { 'android:name': item.name };
      if (item.toolsIgnore) {
        attrs['tools:ignore'] = item.toolsIgnore;
      }
      manifest['uses-permission'].push({ $: attrs });
    }
  }

  // Allow querying launchable user apps without QUERY_ALL_PACKAGES
  manifest.queries = manifest.queries || [{}];
  const primaryQueries = manifest.queries[0] || {};
  primaryQueries.intent = primaryQueries.intent || [];
  const hasLauncherQuery = primaryQueries.intent.some((intentNode) => {
    const actions = intentNode.action || [];
    const categories = intentNode.category || [];
    return (
      actions.some((a) => a?.$?.['android:name'] === 'android.intent.action.MAIN') &&
      categories.some((c) => c?.$?.['android:name'] === 'android.intent.category.LAUNCHER')
    );
  });
  if (!hasLauncherQuery) {
    primaryQueries.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
    });
  }
  for (const intent of [
    { action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }] },
    { action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }], category: [{ $: { 'android:name': 'android.intent.category.HOME' } }] },
  ]) {
    if (!primaryQueries.intent.some(existing => JSON.stringify(existing) === JSON.stringify(intent))) primaryQueries.intent.push(intent);
  }
  manifest.queries[0] = primaryQueries;

  const appNode = manifest.application?.[0];
  if (!appNode) return;

  appNode.service = appNode.service || [];
  const serviceName = '.focusshield.FocusShieldMonitorService';
  if (!appNode.service.some((s) => s?.$?.['android:name'] === serviceName)) {
    appNode.service.push({
      $: {
        'android:name': serviceName,
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'specialUse',
      },
      property: [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value':
              'User-initiated active study session app blocker for MYELIN Focus timer',
          },
        },
      ],
    });
  }

  appNode.activity = appNode.activity || [];
  const activityName = '.focusshield.FocusShieldBlockerActivity';
  if (!appNode.activity.some((a) => a?.$?.['android:name'] === activityName)) {
    appNode.activity.push({
      $: {
        'android:name': activityName,
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:launchMode': 'singleInstance',
        'android:excludeFromRecents': 'true',
        'android:taskAffinity': '',
        'android:configChanges': 'orientation|screenSize|screenLayout|smallestScreenSize',
        'android:theme': '@android:style/Theme.DeviceDefault.NoActionBar',
      },
    });
  }
}

function registerPackageInMainApplication(contents) {
  const pkgImport = 'import com.djgaming1t.myelin.focusshield.FocusShieldPackage';
  let updated = contents;

  if (!updated.includes(pkgImport)) {
    updated = updated.replace(
      /(package\s+com\.djgaming1t\.myelin\s*\n)/,
      `$1\n${pkgImport}\n`,
    );
  }

  if (!updated.includes('FocusShieldPackage()')) {
    if (updated.includes('PackageList(this).packages.apply {')) {
      updated = updated.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n              add(FocusShieldPackage())',
      );
    } else if (updated.includes('val packages = PackageList(this).packages')) {
      updated = updated.replace(
        'val packages = PackageList(this).packages',
        'val packages = PackageList(this).packages\n            packages.add(FocusShieldPackage())',
      );
    }
  }

  if (!updated.includes(pkgImport) || !updated.includes('add(FocusShieldPackage())')) {
    throw new Error('Focus Shield: unsupported MainApplication template; package not registered.');
  }
  return updated;
}

function withFocusShieldAndroid(config) {
  config = withAndroidManifest(config, (modConfig) => {
    ensurePermissionsAndQueries(modConfig.modResults.manifest);
    return modConfig;
  });

  config = withMainApplication(config, (modConfig) => {
    modConfig.modResults.contents = registerPackageInMainApplication(
      modConfig.modResults.contents,
    );
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const srcDir = path.join(projectRoot, 'plugins', 'focus-shield-android');
      const destDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'djgaming1t',
        'myelin',
        'focusshield',
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of KOTLIN_FILES) {
        const fromPath = path.join(srcDir, file);
        const toPath = path.join(destDir, file);
        fs.copyFileSync(fromPath, toPath);
      }
      return modConfig;
    },
  ]);

  return config;
}

module.exports = withFocusShieldAndroid;
module.exports.ensurePermissionsAndQueries = ensurePermissionsAndQueries;
module.exports.registerPackageInMainApplication = registerPackageInMainApplication;
