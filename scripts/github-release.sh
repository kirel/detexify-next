#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-$(node -p "require('$ROOT_DIR/package.json').version")}"
TAG="${TAG:-v$VERSION}"
TITLE="${TITLE:-Detexify Next $VERSION}"
ARCH="${ARCH:-arm64}"
ZIP_PATH="${ZIP_PATH:-$ROOT_DIR/artifacts/mac/DetexifyNext-$VERSION-macOS-$ARCH.zip}"
DRAFT="${DRAFT:-false}"
PRERELEASE="${PRERELEASE:-false}"
PUSH_TAG="${PUSH_TAG:-true}"
ALLOW_DIRTY="${ALLOW_DIRTY:-false}"
REMOTE="${REMOTE:-origin}"
NOTES_FILE="${NOTES_FILE:-}"
NOTES="${NOTES:-}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Release artifact does not exist: $ZIP_PATH" >&2
  echo "Build it first, for example:" >&2
  echo "  mise exec -- npm run package:mac" >&2
  echo "  mise exec -- npm run notarize:mac" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required." >&2
  exit 1
fi

if [[ "$ALLOW_DIRTY" != "true" && "$ALLOW_DIRTY" != "1" ]]; then
  if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
    echo "Working tree is not clean. Commit/stash changes or set ALLOW_DIRTY=true." >&2
    git -C "$ROOT_DIR" status --short >&2
    exit 1
  fi
fi

gh auth status >/dev/null

SHA256="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"

if git -C "$ROOT_DIR" rev-parse "$TAG" >/dev/null 2>&1; then
  TAG_SHA="$(git -C "$ROOT_DIR" rev-list -n 1 "$TAG")"
  if [[ "$TAG_SHA" != "$HEAD_SHA" ]]; then
    echo "Tag $TAG already exists but does not point at HEAD." >&2
    echo "tag:  $TAG_SHA" >&2
    echo "HEAD: $HEAD_SHA" >&2
    exit 1
  fi
  echo "==> Tag $TAG already exists locally and points at HEAD"
else
  echo "==> Creating annotated tag $TAG"
  git -C "$ROOT_DIR" tag -a "$TAG" -m "$TITLE"
fi

if [[ "$PUSH_TAG" == "true" || "$PUSH_TAG" == "1" ]]; then
  echo "==> Pushing tag $TAG"
  git -C "$ROOT_DIR" push "$REMOTE" "$TAG"
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG already exists. Uploading/replacing artifact."
  gh release upload "$TAG" "$ZIP_PATH" --clobber
  exit 0
fi

if [[ -z "$NOTES" ]]; then
  NOTES="Initial macOS preview release.

macOS: Apple Silicon, macOS 13+

SHA256:
$SHA256"
fi

args=(release create "$TAG" "$ZIP_PATH" --title "$TITLE")

if [[ -n "$NOTES_FILE" ]]; then
  args+=(--notes-file "$NOTES_FILE")
else
  args+=(--notes "$NOTES")
fi

if [[ "$DRAFT" == "true" || "$DRAFT" == "1" ]]; then
  args+=(--draft)
fi

if [[ "$PRERELEASE" == "true" || "$PRERELEASE" == "1" ]]; then
  args+=(--prerelease)
fi

echo "==> Creating GitHub release $TAG"
printf 'Artifact: %s\n' "$ZIP_PATH"
printf 'SHA256:   %s\n' "$SHA256"
gh "${args[@]}"
