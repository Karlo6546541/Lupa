#!/usr/bin/env bash
# Local Android build on Linux (no Android Studio needed). Produces a standalone APK signed with the DEBUG key —
# fine for installing on your own phone, NOT for Google Play (Play needs an .aab signed with the upload key; use EAS).
#   bash tools/build-android-local.sh            → dist/lupa-<version>-release-debugsigned.apk
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-$HOME/opt/jdk-17.0.21+9}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/opt/android-sdk}"; export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
ARCHS="${ARCHS:-arm64-v8a,armeabi-v7a,x86_64}"
CI=1 npx expo prebuild --platform android --no-install
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures="$ARCHS" --no-daemon -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g")
VER=$(node -p "require('./app.json').expo.version")
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk "dist/lupa-${VER}-release-debugsigned.apk"
ls -la dist/
