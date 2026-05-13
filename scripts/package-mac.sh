#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-Detexify Next}"
EXECUTABLE_NAME="${EXECUTABLE_NAME:-DetexifyNextMac}"
BUNDLE_ID="${BUNDLE_ID:-org.kirelabs.detexify-next}"
VERSION="${VERSION:-$(node -p "require('$ROOT_DIR/package.json').version")}"
BUILD_NUMBER="${BUILD_NUMBER:-$(git -C "$ROOT_DIR" rev-list --count HEAD 2>/dev/null || echo 1)}"
ARCH="${ARCH:-arm64}"
CONFIGURATION="${CONFIGURATION:-release}"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/artifacts/mac}"
APP_PATH="$DIST_DIR/$APP_NAME.app"
ZIP_PATH="$DIST_DIR/DetexifyNext-$VERSION-macOS-$ARCH.zip"
SIGN_IDENTITY="${SIGN_IDENTITY:-}"

if [[ "$ARCH" != "arm64" ]]; then
  echo "Unsupported ARCH=$ARCH. Detexify Next currently packages Apple Silicon arm64 builds only." >&2
  exit 1
fi

mkdir -p "$DIST_DIR"

echo "==> Preparing bundled web app"
(
  cd "$ROOT_DIR"
  npm run prepare:mac-web
)

echo "==> Building Swift package ($CONFIGURATION, $ARCH)"
(
  cd "$ROOT_DIR/apps/mac"
  swift build -c "$CONFIGURATION" --arch "$ARCH"
)

BUILD_DIR="$ROOT_DIR/apps/mac/.build/${ARCH}-apple-macosx/$CONFIGURATION"
BINARY_PATH="$BUILD_DIR/$EXECUTABLE_NAME"
WEBAPP_SOURCE="$ROOT_DIR/apps/mac/Sources/DetexifyNextMac/Resources/WebApp"

if [[ ! -x "$BINARY_PATH" ]]; then
  echo "Could not find built executable: $BINARY_PATH" >&2
  exit 1
fi

if [[ ! -f "$WEBAPP_SOURCE/index.html" ]]; then
  echo "Bundled web app is missing index.html: $WEBAPP_SOURCE" >&2
  exit 1
fi

echo "==> Creating app bundle: $APP_PATH"
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"
cp "$BINARY_PATH" "$APP_PATH/Contents/MacOS/$EXECUTABLE_NAME"
chmod 755 "$APP_PATH/Contents/MacOS/$EXECUTABLE_NAME"
rsync -a --delete "$WEBAPP_SOURCE/" "$APP_PATH/Contents/Resources/WebApp/"
cat > "$APP_PATH/Contents/PkgInfo" <<'PKGINFO'
APPL????
PKGINFO

cat > "$APP_PATH/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>$EXECUTABLE_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>$BUILD_NUMBER</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key>
  <true/>
</dict>
</plist>
PLIST

if [[ -n "$SIGN_IDENTITY" ]]; then
  echo "==> Code signing with identity: $SIGN_IDENTITY"
  if [[ "$SIGN_IDENTITY" == "-" ]]; then
    codesign --force --deep --sign - "$APP_PATH"
  else
    codesign --force --deep --sign "$SIGN_IDENTITY" --timestamp --options runtime "$APP_PATH"
  fi
  codesign --verify --deep --strict --verbose=2 "$APP_PATH"
else
  echo "==> Skipping code signing. Set SIGN_IDENTITY='Developer ID Application: ...' for distribution signing."
fi

echo "==> Creating zip: $ZIP_PATH"
rm -f "$ZIP_PATH"
(
  cd "$DIST_DIR"
  ditto -c -k --keepParent "$APP_NAME.app" "$ZIP_PATH"
)

SHA256="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"

echo
printf 'App:    %s\n' "$APP_PATH"
printf 'Zip:    %s\n' "$ZIP_PATH"
printf 'SHA256: %s\n' "$SHA256"

if [[ -z "$SIGN_IDENTITY" ]]; then
  cat <<EOF

Unsigned package created for local testing only.
For public distribution, rerun with e.g.:

  SIGN_IDENTITY='Developer ID Application: Your Name (TEAMID)' npm run package:mac
EOF
else
  cat <<EOF

Signed package created. Next step if this is a Developer ID build:

  NOTARY_PROFILE=detexify-notary ZIP_PATH='$ZIP_PATH' APP_PATH='$APP_PATH' npm run notarize:mac
EOF
fi
