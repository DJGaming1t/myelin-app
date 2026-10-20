const fs = require('node:fs');
const path = require('node:path');
const {
  withAndroidManifest,
  withMainApplication,
  withProjectBuildGradle,
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
  { name: 'android.permission.ACCESS_NETWORK_STATE' },
  { name: 'android.permission.RECEIVE_BOOT_COMPLETED' },
];

const KOTLIN_FILES = [
  'FocusShieldStore.kt',
  'FocusShieldDns.kt',
  'FocusShieldDnsVpnService.kt',
  'FocusShieldScheduleReceiver.kt',
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

  const vpnName = '.focusshield.FocusShieldDnsVpnService';
  if (!appNode.service.some(s => s?.$?.['android:name'] === vpnName)) appNode.service.push({
    $: { 'android:name': vpnName, 'android:exported': 'false', 'android:permission': 'android.permission.BIND_VPN_SERVICE', 'android:foregroundServiceType': 'specialUse' },
    'intent-filter': [{ action: [{ $: { 'android:name': 'android.net.VpnService' } }] }],
    'meta-data': [{ $: { 'android:name': 'android.net.VpnService.SUPPORTS_ALWAYS_ON', 'android:value': 'false' } }],
    property: [{ $: { 'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE', 'android:value': 'User-initiated local DNS website filter during Focus and scheduled study windows' } }],
  });
  appNode.receiver = appNode.receiver || [];
  const receiverName = '.focusshield.FocusShieldScheduleReceiver';
  if (!appNode.receiver.some(r => r?.$?.['android:name'] === receiverName)) appNode.receiver.push({
    $: { 'android:name': receiverName, 'android:exported': 'false' },
    'intent-filter': [{ action: ['android.intent.action.BOOT_COMPLETED', 'android.intent.action.MY_PACKAGE_REPLACED', 'android.intent.action.TIME_SET', 'android.intent.action.TIMEZONE_CHANGED'].map(name => ({ $: { 'android:name': name } })) }],
  });

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

function alignKotlinBuildTools(contents) {
  // LiteRT's existing plugin pins the compiler, but Expo's version catalog still
  // selects KSP1 for Kotlin 2.1. Keep the compiler and KSP2 selection consistent.
  if (contents.includes('// MYELIN Kotlin/KSP alignment')) return contents;
  contents = contents.replace("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')", "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0')");
  if (!contents.includes('kotlin-gradle-plugin:2.3.0')) return contents;
  const marker = 'apply plugin: "expo-root-project"';
  if (!contents.includes(marker)) throw new Error('Focus Shield: cannot align LiteRT Kotlin and Expo KSP in this build template.');
  return contents.replace(marker, '// MYELIN Kotlin/KSP alignment\next.kotlinVersion = "2.3.0"\next.kspVersion = "2.3.0"\n' + marker);
}

function withFocusShieldAndroid(config) {
  config = withProjectBuildGradle(config, modConfig => {
    modConfig.modResults.contents = alignKotlinBuildTools(modConfig.modResults.contents);
    return modConfig;
  });
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

module.exports.alignKotlinBuildTools = alignKotlinBuildTools;
