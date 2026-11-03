#!/usr/bin/env bash
# Builds the Android APK on this computer (no Expo cloud queue).
#   bash app/tools/build-apk.sh        → app/dist-apk/oyuur-<version>.apk
# Needs Java 17, the Android SDK in C:\Users\1\Android and the Oyuur key in C:\Users\1\Oyuur-keys
# (see КАК-ЗАПУСТИТЬ.md, app/credentials/README.md).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME_17:-C:/Users/1/Android/jdk17}"
export ANDROID_HOME="${ANDROID_HOME:-C:/Users/1/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"
export NODE_ENV=production
# IPv6 to Maven Central hangs on this network (VPN): every Java process goes over IPv4.
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true -Djava.net.preferIPv4Addresses=true"

# Windows paths over 260 characters break the C++ part of the build, so the app is mirrored
# to a short folder and built there (the first copy is ~3.5 GB, then only changes).
short="${APK_BUILD_DIR:-C:/o/app}"
mkdir -p "$short"
set +e
src="$(cygpath -w "$here")"
# Only the app's own build folders are skipped (full paths: a bare "dist" would skip every
# package's dist inside node_modules too).
robocopy "$src" "$(cygpath -w "$short")" //MIR //NFL //NDL //NJH //NJS //NP //R:1 //W:1 \
  //XD "$src\\android" "$src\\ios" "$src\\dist" "$src\\dist-apk" "$src\\.expo" >/dev/null
rc=$?
set -e
[ "$rc" -lt 8 ] || { echo "robocopy failed ($rc)"; exit 1; }
cd "$short"

# The native project is made from app.json each time (it isn't kept in git).
npx expo prebuild -p android --no-install --clean
cd android
# CMake 3.31's ninja (1.12) handles long paths; the default 3.22 one doesn't.
printf 'sdk.dir=%s\ncmake.dir=%s\n' "$ANDROID_HOME" "$ANDROID_HOME/cmake/3.31.6" > local.properties
./gradlew.bat assembleRelease --no-daemon -q
version="$(node -p "require('../app.json').expo.version")"
mkdir -p "$here/dist-apk"
# Gradle signs with the open test key; the Oyuur key re-signs it (app/credentials/README.md).
bash "$here/tools/sign-apk.sh" app/build/outputs/apk/release/app-release.apk "$here/dist-apk/oyuur-$version.apk"
echo "APK: $here/dist-apk/oyuur-$version.apk"
