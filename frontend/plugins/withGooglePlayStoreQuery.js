const { withAndroidManifest } = require('expo/config-plugins');

const PLAY_STORE_PACKAGE = 'com.android.vending';

module.exports = function withGooglePlayStoreQuery(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const queries = manifest.queries ?? (manifest.queries = []);
    const alreadyDeclared = queries.some((query) =>
      query.package?.some((entry) => entry.$['android:name'] === PLAY_STORE_PACKAGE)
    );

    if (!alreadyDeclared) {
      queries.push({ package: [{ $: { 'android:name': PLAY_STORE_PACKAGE } }] });
    }

    return modConfig;
  });
};
