#!/usr/bin/env bash
# Signs an APK with the Oyuur key and the proof of key rotation from the old open test key
# (app/credentials/README.md): phones with the old APK 1.0 / 1.2 update over it.
#   bash app/tools/sign-apk.sh in.apk out.apk
# The key: OYUUR_KEYSTORE and OYUUR_KEYSTORE_PASS_FILE (default C:\Users\1\Oyuur-keys).
set -euo pipefail
in="${1:?usage: sign-apk.sh in.apk out.apk}"
out="${2:?usage: sign-apk.sh in.apk out.apk}"
cred="$(cd "$(dirname "$0")/../credentials" && pwd)"
keys="${OYUUR_KEYS:-C:/Users/1/Oyuur-keys}"
ks="${OYUUR_KEYSTORE:-$keys/oyuur-release.p12}"
pass="${OYUUR_KEYSTORE_PASS_FILE:-$keys/password.txt}"
[ -f "$ks" ] && [ -f "$pass" ] || { echo "No Oyuur key at $ks (see app/credentials/README.md)"; exit 1; }
sdk="${ANDROID_HOME:-C:/Users/1/Android/sdk}"
apksigner=(java -jar "$sdk/build-tools/$(ls "$sdk/build-tools" | sort -V | tail -1)/lib/apksigner.jar")

# The old key signs v1/v2 (Android 7–8 check only these), the new key signs v3 with the lineage.
# Rotation from Android 9 (28): apksigner's default is 33, which would leave Android 9–12 on the old key.
"${apksigner[@]}" sign \
  --ks "$cred/test-debug.keystore" --ks-pass pass:android --ks-key-alias androiddebugkey \
  --next-signer --ks "$ks" --ks-pass "file:$pass" --ks-key-alias oyuur \
  --lineage "$cred/lineage.bin" --rotation-min-sdk-version 28 --v4-signing-enabled false \
  --out "$out" "$in"

# The check: v3 verifies, the lineage inside is exactly old test key → Oyuur key.
# (Outputs go to variables first: grep -q in a pipe under pipefail can fail on a closed pipe.)
v3="$("${apksigner[@]}" verify -v "$out")"
grep -q 'Verified using v3 scheme (APK Signature Scheme v3): true' <<<"$v3" \
  || { echo "APK has no valid v3 signature"; exit 1; }
old="$("${apksigner[@]}" verify --print-certs --max-sdk-version 27 "$out")"
grep -q 'SHA-1 digest: 5e8f16062ea3cd2c4a0d547876baa6f38cabf625' <<<"$old" \
  || { echo "Android 7–8 would not see the old test key"; exit 1; }
lineage="$("${apksigner[@]}" lineage --in "$out" --print-certs)"
grep -qx 'Signer #1 in lineage certificate SHA-1 digest: 5e8f16062ea3cd2c4a0d547876baa6f38cabf625' <<<"$lineage" \
  && grep -qx 'Signer #2 in lineage certificate SHA-1 digest: 2e8942192a8c1b49eed1cfc9a41a104c57d15679' <<<"$lineage" \
  && ! grep -q 'Signer #3' <<<"$lineage" \
  || { echo "APK lineage is not old test key → Oyuur key"; exit 1; }
echo "Signed: $out (old test key → Oyuur key)"
