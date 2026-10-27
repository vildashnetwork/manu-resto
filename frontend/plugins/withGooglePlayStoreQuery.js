const { withAndroidManifest } = require('expo/config-plugins');

const PLAY_STORE_PACKAGE = 'com.android.vending';

module.exports = function withGooglePlayStoreQuery(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const queries = manifest.queries ?? (manifest.queries = [{}]);
    const query = queries[0] ?? (queries[0] = {});
    query.package ??= [];
    const alreadyDeclared = query.package.some((entry) => entry.$['android:name'] === PLAY_STORE_PACKAGE);

    if (!alreadyDeclared) {
      query.package.push({ $: { 'android:name': PLAY_STORE_PACKAGE } });
    }

    return modConfig;
  });
};
