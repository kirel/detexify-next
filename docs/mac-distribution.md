# macOS Distribution

Detexify Next's macOS app is intended for direct distribution outside the Mac App Store.

Recommended v1 channel:

1. build a signed `.app` bundle;
2. notarize with Apple;
3. publish a zipped app on GitHub Releases and/or kirelabs.org;
4. add Homebrew Cask later;
5. add Sparkle auto-update later if desired.

## Why direct distribution

The app is a menu-bar utility with a global hotkey and bundled offline web UI. Direct Developer ID distribution is simpler than Mac App Store review/sandboxing and is the normal route for this kind of tool.

## Requirements

- Apple Developer Program membership.
- `Developer ID Application` certificate in your keychain.
- Notary credentials stored with `xcrun notarytool`.
- Xcode command-line tools / Swift toolchain.

Create notary credentials once:

```bash
xcrun notarytool store-credentials detexify-notary \
  --apple-id you@example.com \
  --team-id TEAMID \
  --password app-specific-password
```

You can also use App Store Connect API key credentials if preferred.

## Local unsigned package

For local testing only:

```bash
npm run package:mac
```

Output:

```text
artifacts/mac/Detexify Next.app
artifacts/mac/DetexifyNext-<version>-macOS-arm64.zip
```

Unsigned builds are not suitable for public distribution.

## Signed package

```bash
SIGN_IDENTITY='Developer ID Application: Your Name (TEAMID)' \
  VERSION=0.1.0 \
  npm run package:mac
```

The script:

1. builds the web app and copies it into Mac resources;
2. builds the Swift executable in release mode for `arm64`;
3. creates `Detexify Next.app`;
4. writes `Info.plist`;
5. copies `WebApp` into `Contents/Resources/WebApp`;
6. signs the app if `SIGN_IDENTITY` is set;
7. creates a zip and prints its SHA256.

The bundle identifier defaults to:

```text
org.kirelabs.detexify-next
```

Override if needed:

```bash
BUNDLE_ID=org.example.detexify-next npm run package:mac
```

## Notarize

After a signed Developer ID build:

```bash
NOTARY_PROFILE=detexify-notary npm run notarize:mac
```

Or explicitly:

```bash
NOTARY_PROFILE=detexify-notary \
  APP_PATH='artifacts/mac/Detexify Next.app' \
  ZIP_PATH='artifacts/mac/DetexifyNext-0.1.0-macOS-arm64.zip' \
  npm run notarize:mac
```

The script submits the zip, waits for notarization, staples the ticket to the app, verifies Gatekeeper assessment, and rebuilds the final zip.

## Verify manually

```bash
codesign --verify --deep --strict --verbose=2 'artifacts/mac/Detexify Next.app'
spctl --assess --type execute --verbose 'artifacts/mac/Detexify Next.app'
```

## GitHub Release

Create a release tag and upload the notarized zip:

```bash
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 \
  'artifacts/mac/DetexifyNext-0.1.0-macOS-arm64.zip' \
  --title 'Detexify Next 0.1.0' \
  --notes 'Initial macOS preview release.'
```

## Homebrew Cask later

Once releases are stable, add a cask similar to:

```ruby
cask "detexify-next" do
  version "0.1.0"
  sha256 "..."

  url "https://github.com/kirel/detexify-next/releases/download/v#{version}/DetexifyNext-#{version}-macOS-arm64.zip"
  name "Detexify Next"
  desc "Menu-bar LaTeX symbol recognizer"
  homepage "https://detexify-next.kirelabs.org"

  app "Detexify Next.app"
end
```

## Future improvements

- Add a real app icon.
- Add CI release workflow for tagged versions.
- Add Sparkle for auto-update.
- Consider universal builds only if Intel support becomes a goal. Current target is Apple Silicon `arm64`.
