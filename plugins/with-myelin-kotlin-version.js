const {
  createRunOncePlugin,
  withGradleProperties,
} = require('@expo/config-plugins');

const DEFAULT_KOTLIN_VERSION = '2.3.0';

function withMyelinKotlinVersion(config, props = {}) {
  const kotlinVersion = String(
    props.kotlinVersion || DEFAULT_KOTLIN_VERSION,
  ).trim();

  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(kotlinVersion)) {
    throw new Error(
      `Invalid MYELIN Android Kotlin version: ${kotlinVersion}`,
    );
  }

  return withGradleProperties(config, (nextConfig) => {
    nextConfig.modResults = nextConfig.modResults.filter(
      (item) =>
        !(
          item.type === 'property' &&
          item.key === 'android.kotlinVersion'
        ),
    );

    nextConfig.modResults.push({
      type: 'property',
      key: 'android.kotlinVersion',
      value: kotlinVersion,
    });

    return nextConfig;
  });
}

module.exports = createRunOncePlugin(
  withMyelinKotlinVersion,
  'with-myelin-kotlin-version',
  '1.0.0',
);
