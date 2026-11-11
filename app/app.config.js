// Dynamic Expo config on top of app.json.
// Push notifications use Firebase Cloud Messaging topics (no server database: the phone subscribes to topics such as
// "t_INFQ_hr", and the site's GitHub Action sends to a topic). Firebase needs two files that only the owner of the
// Firebase project can download (Project settings → Your apps):
//   app/google-services.json        (Android)
//   app/GoogleService-Info.plist    (iOS)
// They are git-ignored. Without them the app builds and runs normally and simply has no push (src/lib/push.ts copes).
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const android = fs.existsSync(path.join(__dirname, 'google-services.json'));
  const ios = fs.existsSync(path.join(__dirname, 'GoogleService-Info.plist'));
  const plugins = (config.plugins || []).map((p) => {
    // React Native Firebase's iOS pods need static frameworks.
    if (Array.isArray(p) && p[0] === 'expo-build-properties') return [p[0], { ...p[1], ios: { ...(p[1] && p[1].ios), useFrameworks: 'static' } }];
    return p;
  });
  if (android || ios) plugins.push('@react-native-firebase/app', '@react-native-firebase/messaging');
  return {
    ...config,
    plugins,
    android: { ...config.android, ...(android ? { googleServicesFile: './google-services.json' } : {}) },
    ios: {
      ...config.ios,
      ...(ios ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
      ...(ios ? { infoPlist: { ...(config.ios && config.ios.infoPlist), UIBackgroundModes: ['remote-notification'] }, entitlements: { ...(config.ios && config.ios.entitlements), 'aps-environment': 'production' } } : {}),
    },
    extra: { ...config.extra, pushConfigured: { android, ios } },
  };
};
