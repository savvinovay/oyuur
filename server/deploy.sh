#!/usr/bin/env bash
# Puts the server and the web version of the app on the homelab:
# https://oyuur.ayaal.savvinov.me (Gitea repo ayaal/oyuur; a push to main builds and deploys).
#   server/deploy.sh            — server + the web build from app/dist (if there is one)
# Build the web version first:  cd app && npx expo export -p web
# The Android app for friends: put it in server/apk/ as oyuur-<version>.apk (not in our git);
# it is then at https://oyuur.ayaal.savvinov.me/oyuur-<version>.apk and saves under that name.
# The deploy repo is kept in server/.deploy (not in our git).
# The owner's page (/owner — reports) is on only when the server has OWNER_TOKEN in its environment:
# a long random key (at least 16 characters, e.g. `openssl rand -base64 32`), set on the homelab, never in git.
# Without it /owner is 404. A new key signs the owner out everywhere.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
remote="https://gitea.savvinov.me/ayaal/oyuur.git"
work="$here/.deploy"

if [ ! -d "$work/.git" ]; then
  rm -rf "$work"
  git clone -q "$remote" "$work" 2>/dev/null || { mkdir -p "$work" && git -C "$work" init -q -b main && git -C "$work" remote add origin "$remote"; }
fi
# Same author as the project's own commits.
git -C "$work" config user.name "$(git -C "$here/.." config user.name)"
git -C "$work" config user.email "$(git -C "$here/.." config user.email)"
git -C "$work" fetch -q origin main 2>/dev/null && git -C "$work" reset -q --hard origin/main || true

# Replace everything with the current server and web build.
find "$work" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r "$here/src" "$here/package.json" "$here/Dockerfile" "$here/homelab.yaml" "$work/"
mkdir -p "$work/public"
if [ -d "$here/../app/dist" ]; then
  cp -r "$here/../app/dist/." "$work/public/"
else
  echo '<!doctype html><meta charset="utf-8"><title>Oyuur</title><p>Oyuur: the web version is coming.</p>' > "$work/public/index.html"
fi
for apk in "$here"/apk/*.apk; do
  [ -f "$apk" ] && cp "$apk" "$work/public/"
done

cd "$work"
git add -A
if git diff --cached --quiet; then
  echo "Nothing changed."
  exit 0
fi
git commit -q -m "Deploy $(git -C "$here/.." rev-parse --short HEAD) $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q origin HEAD:main
echo "Pushed: $(git rev-parse --short HEAD)"
