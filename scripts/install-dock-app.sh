#!/usr/bin/env bash
# Build ~/Applications/Harness.app (WKWebView shell around DeepSeek Harness web,
# Dock running-dot) and pin it to the Dock.  Icon is a full-bleed 1:1 square,
# sharp 90° corners.  Display name "Harness"; bundle id kept stable as
# com.jays.dsh-harness-web so existing Dock pins and saved frames survive.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

ROOT="$(cd "$(dirname "$0")" && pwd)"
LIVE="${HOME}/apps/dsh-runtime"
APP="${HOME}/Applications/Harness.app"
PNG="${ROOT}/assets/harness-icon-1024.png"
[[ -f "$PNG" ]] || PNG="${LIVE}/assets/harness-icon-1024.png"
SWIFT="${ROOT}/HarnessWindow.swift"
[[ -f "$SWIFT" ]] || SWIFT="${LIVE}/HarnessWindow.swift"

if [[ ! -f "$PNG" ]]; then
  echo "missing harness-icon-1024.png" >&2
  exit 1
fi
if [[ ! -f "$SWIFT" ]]; then
  echo "missing HarnessWindow.swift" >&2
  exit 1
fi

mkdir -p "${HOME}/Applications"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

SDK="$(xcrun --sdk macosx --show-sdk-path)"
swiftc -O \
  -target arm64-apple-macos14 \
  -sdk "$SDK" \
  -framework Cocoa -framework WebKit \
  -o "$APP/Contents/MacOS/DeepSeekHarness" \
  "$SWIFT"
chmod 755 "$APP/Contents/MacOS/DeepSeekHarness"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$PNG" --out "$TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z "$((s * 2))" "$((s * 2))" "$PNG" --out "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>Harness</string>
  <key>CFBundleExecutable</key><string>DeepSeekHarness</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>com.jays.dsh-harness-web</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Harness</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.1</string>
  <key>CFBundleVersion</key><string>2</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSMultipleInstancesProhibited</key><true/>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticTermination</key><false/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSAllowsArbitraryLoads</key><true/>
  </dict>
</dict>
</plist>
PLIST
echo -n "APPL????" > "$APP/Contents/PkgInfo"
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true

mkdir -p "${LIVE}/assets"
cp "$SWIFT" "${LIVE}/HarnessWindow.swift"
cp "${ROOT}/ensure-web.sh" "${LIVE}/ensure-web.sh"
cp "${ROOT}/open-harness.sh" "${LIVE}/open-harness.sh"
cp "$PNG" "${LIVE}/assets/harness-icon-1024.png"
cp "$ROOT/install-dock-app.sh" "${LIVE}/install-dock-app.sh"
chmod 755 "${LIVE}/ensure-web.sh" "${LIVE}/open-harness.sh" "${LIVE}/install-dock-app.sh"
if [[ -f "${ROOT}/dsh.sh" ]]; then
  cp "${ROOT}/dsh.sh" "${LIVE}/dsh.sh"
  chmod 755 "${LIVE}/dsh.sh"
fi
if [[ -f "${ROOT}/start-web.sh" ]]; then
  cp "${ROOT}/start-web.sh" "${LIVE}/start-web.sh"
  chmod 755 "${LIVE}/start-web.sh"
fi

if command -v dockutil >/dev/null 2>&1; then
  # Legacy pins from the pre-rebrand .app name.  Remove by either label.
  for label in "Harness" "DeepSeek Harness Web"; do
    if dockutil --list | grep -q "$label"; then
      dockutil --remove "$label" --no-restart || true
    fi
  done
  if dockutil --list | awk -F'\t' '{print $1}' | grep -qx "DeepSeek"; then
    dockutil --add "$APP" --after "DeepSeek" --no-restart
  else
    dockutil --add "$APP" --no-restart
  fi
  killall Dock 2>/dev/null || true
else
  echo "dockutil not installed; app is at $APP — drag it to the Dock" >&2
fi

echo "installed $APP"
echo "WKWebView shell; Dock running-dot; second click focuses the same window"
