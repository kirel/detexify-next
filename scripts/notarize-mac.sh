#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-Detexify Next}"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/artifacts/mac}"
APP_PATH="${APP_PATH:-$DIST_DIR/$APP_NAME.app}"
ZIP_PATH="${ZIP_PATH:-$(ls -t "$DIST_DIR"/DetexifyNext-*-macOS-*.zip 2>/dev/null | head -n 1 || true)}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"

if [[ -z "$NOTARY_PROFILE" ]]; then
  cat >&2 <<'EOF'
NOTARY_PROFILE is required.

Create it once with:

  xcrun notarytool store-credentials detexify-notary \
    --apple-id you@example.com \
    --team-id TEAMID \
    --password app-specific-password

Then run:

  NOTARY_PROFILE=detexify-notary npm run notarize:mac
EOF
  exit 1
fi

if [[ -z "$ZIP_PATH" || ! -f "$ZIP_PATH" ]]; then
  echo "ZIP_PATH does not exist: ${ZIP_PATH:-<empty>}" >&2
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "APP_PATH does not exist: $APP_PATH" >&2
  exit 1
fi

echo "==> Submitting to Apple notarization service"
xcrun notarytool submit "$ZIP_PATH" --keychain-profile "$NOTARY_PROFILE" --wait

echo "==> Stapling notarization ticket"
xcrun stapler staple "$APP_PATH"

echo "==> Verifying signed/notarized app"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose "$APP_PATH"

echo "==> Rebuilding distributable zip with stapled app"
rm -f "$ZIP_PATH"
(
  cd "$DIST_DIR"
  ditto -c -k --keepParent "$APP_NAME.app" "$ZIP_PATH"
)

SHA256="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
printf 'Notarized zip: %s\n' "$ZIP_PATH"
printf 'SHA256:        %s\n' "$SHA256"
