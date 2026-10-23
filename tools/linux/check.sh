#!/usr/bin/env bash
# Linux check, run inside the container built by tools/linux/Dockerfile.
set -euo pipefail

OUT=${1:-/out}
mkdir -p "$OUT"

step() { echo; echo "=== $* ==="; }

Xvfb :99 -screen 0 1920x1080x24 >/tmp/xvfb.log 2>&1 &
XVFB=$!
export DISPLAY=:99
trap 'kill "${OPENBOX:-}" "$XVFB" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  xdpyinfo -display :99 >/dev/null 2>&1 && break
  [ -e /tmp/.X11-unix/X99 ] && break
  sleep 0.2
done
openbox >/tmp/openbox.log 2>&1 &
OPENBOX=$!
sleep 1

step "format check"; npm run format:check
step "i18n check";    npm run i18n:check
step "lint renderer";  npx nx lint renderer
step "lint desktop";   npx nx lint desktop
step "test renderer";  npx nx test renderer --run
step "test desktop";   npx nx test desktop --run
step "build desktop";  npx nx build desktop

step "pty-smoke (built)"
npx electron tools/pty-smoke.cjs dist/apps/desktop/pty-host.js

step "ui-drive (built)"
node tools/ui-drive.cjs "$OUT/ui-drive"

step "make AppImage"
npx nx make desktop
shopt -s nullglob
images=(dist/executables/*.AppImage)
if [ "${#images[@]}" -ne 1 ]; then
  echo "FAIL: expected exactly one AppImage in dist/executables, found ${#images[@]}" >&2
  exit 1
fi
APPIMAGE=$(realpath "${images[0]}")

step "extract AppImage"
rm -rf /tmp/appimage
mkdir -p /tmp/appimage
(cd /tmp/appimage && "$APPIMAGE" --appimage-extract >/dev/null)

step "pty-smoke (AppImage)"
npx electron tools/pty-smoke.cjs /tmp/appimage/squashfs-root/resources/app.asar/desktop/pty-host.js

step "ui-drive (AppImage)"
ASCUA_EXECUTABLE=/tmp/appimage/squashfs-root/ascua node tools/ui-drive.cjs "$OUT/ui-drive-appimage"

step "copy AppImage"
cp "$APPIMAGE" "$OUT/"

echo
echo "LINUX CHECK PASSED"
