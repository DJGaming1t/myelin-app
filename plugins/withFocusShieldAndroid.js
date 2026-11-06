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
  { name: 'android.permission.ACCESS_NETWORK_STATE' },
  { name: 'android.permission.RECEIVE_BOOT_COMPLETED' },
];

const KOTLIN_FILES = [
  'FocusShieldStore.kt',
  'FocusShieldBlockerActivity.kt',
  'FocusShieldMonitorService.kt',
  'FocusShieldDnsPacketEngine.kt',
  'FocusShieldDnsVpnService.kt',
  'FocusShieldScheduleReceiver.kt',
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
  manifest.queries[0] = primaryQueries;

  const appNode = manifest.application?.[0];
  if (!appNode) return;

  appNode.service = appNode.service || [];

  // 1. App Blocking Foreground Monitor Service (Chunk A)
  const monitorServiceName = '.focusshield.FocusShieldMonitorService';
  if (!appNode.service.some((s) => s?.$?.['android:name'] === monitorServiceName)) {
    appNode.service.push({
      $: {
        'android:name': monitorServiceName,
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

  // 2. Local Loopback DNS Sinkhole VpnService (Chunk B Website Blocking)
  const vpnServiceName = '.focusshield.FocusShieldDnsVpnService';
  if (!appNode.service.some((s) => s?.$?.['android:name'] === vpnServiceName)) {
    appNode.service.push({
      $: {
        'android:name': vpnServiceName,
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:permission': 'android.permission.BIND_VPN_SERVICE',
        'android:foregroundServiceType': 'specialUse',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.net.VpnService' } }],
        },
      ],
      property: [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value':
              'Local on-device DNS sinkhole for user-selected distracting websites during active MYELIN Focus sessions',
          },
        },
      ],
    });
  }

  // 3. Full-Screen Fallback Interception Activity (Chunk A)
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

  // 4. Recurring Schedule & Reboot Recovery BroadcastReceiver (Chunk C)
  appNode.receiver = appNode.receiver || [];
  const receiverName = '.focusshield.FocusShieldScheduleReceiver';
  if (!appNode.receiver.some((r) => r?.$?.['android:name'] === receiverName)) {
    appNode.receiver.push({
      $: {
        'android:name': receiverName,
        'android:enabled': 'true',
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
            { $: { 'android:name': 'android.intent.action.TIME_SET' } },
            { $: { 'android:name': 'android.intent.action.TIMEZONE_CHANGED' } },
            { $: { 'android:name': 'com.djgaming1t.myelin.focusshield.SCHEDULE_EVALUATE' } },
          ],
        },
      ],
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
        if (fs.existsSync(fromPath)) {
          fs.copyFileSync(fromPath, toPath);
        }
      }
      return modConfig;
    },
  ]);

  return config;
}

module.exports = withFocusShieldAndroid;
module.exports.ensurePermissionsAndQueries = ensurePermissionsAndQueries;
module.exports.registerPackageInMainApplication = registerPackageInMainApplication;
