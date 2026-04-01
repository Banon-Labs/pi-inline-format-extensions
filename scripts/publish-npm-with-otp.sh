#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
EXT_REPO=$(cd "$SCRIPT_DIR/.." && pwd)
PI_REPO=$(cd "$EXT_REPO/../pi-inline-format" && pwd)

DRY_RUN=0
SKIP_RELEASE_CHECK=0
EXT_ONLY=0
PI_ONLY=0

usage() {
  cat <<'EOF'
Usage: scripts/publish-npm-with-otp.sh [options]

Publishes the npm packages in this exact order:
  1. @banon-labs/pi-inline-format-extensions
  2. @banon-labs/pi-inline-format

Safety checks before publish:
  - verifies npm auth is available
  - verifies both repos are clean
  - verifies a matching GitHub release exists for the package version and already has a .tgz asset

OTP behavior:
  - by default, reads the npm OTP from /dev/tty before each publish so you can type it interactively
  - dry-run mode skips OTP prompts

Options:
  --dry-run             Run npm publish --dry-run instead of publishing.
  --skip-release-check  Skip GitHub release existence/asset validation.
  --extensions-only     Publish only @banon-labs/pi-inline-format-extensions.
  --pi-only             Publish only @banon-labs/pi-inline-format.
  -h, --help            Show this help.
EOF
}

while (($# > 0)); do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-release-check)
      SKIP_RELEASE_CHECK=1
      shift
      ;;
    --extensions-only)
      EXT_ONLY=1
      shift
      ;;
    --pi-only)
      PI_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$EXT_ONLY" -eq 1 && "$PI_ONLY" -eq 1 ]]; then
  echo "Choose at most one of --extensions-only or --pi-only." >&2
  exit 1
fi

for command in npm gh node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "$command is required." >&2
    exit 1
  fi
done

npm whoami >/dev/null

ensure_clean_repo() {
  local repo="$1"
  local label="$2"
  if [[ -n "$(git -C "$repo" status --short)" ]]; then
    echo "$label has uncommitted changes:" >&2
    git -C "$repo" status --short >&2
    exit 1
  fi
}

package_field() {
  local repo="$1"
  local field="$2"
  node -e 'const pkg=require(process.argv[1]); console.log(pkg[process.argv[2]]);' "$repo/package.json" "$field"
}

ensure_release_asset() {
  local repo_slug="$1"
  local tag="$2"
  local package_name="$3"
  local json
  json=$(gh release view "$tag" --repo "$repo_slug" --json tagName,assets)
  node -e '
const data = JSON.parse(process.argv[1]);
const packageName = process.argv[2];
const assets = Array.isArray(data.assets) ? data.assets : [];
const hasTgz = assets.some((asset) => typeof asset.name === "string" && asset.name.endsWith(".tgz"));
if (!hasTgz) {
  console.error(`Release ${data.tagName} for ${packageName} is missing a .tgz asset.`);
  process.exit(3);
}
' "$json" "$package_name"
}

prompt_for_otp() {
  local package_name="$1"
  local otp
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '%s' "000000"
    return 0
  fi
  if [[ ! -r /dev/tty ]]; then
    echo "Cannot read /dev/tty for OTP input." >&2
    exit 1
  fi
  printf 'Enter npm OTP for %s: ' "$package_name" > /dev/tty
  IFS= read -r otp < /dev/tty
  printf '\n' > /dev/tty
  if [[ -z "$otp" ]]; then
    echo "OTP is required." >&2
    exit 1
  fi
  printf '%s' "$otp"
}

publish_one() {
  local repo="$1"
  local repo_slug="$2"
  local package_name="$3"
  local version="$4"
  local tag="v${version}"
  local publish_args=(publish --access public)

  ensure_clean_repo "$repo" "$package_name"

  if [[ "$SKIP_RELEASE_CHECK" -eq 0 ]]; then
    ensure_release_asset "$repo_slug" "$tag" "$package_name"
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    publish_args+=(--dry-run)
  else
    local otp
    otp=$(prompt_for_otp "$package_name")
    publish_args+=(--otp "$otp")
  fi

  echo "==> Publishing ${package_name}@${version} from ${repo}"
  (
    cd "$repo"
    npm "${publish_args[@]}"
  )
}

EXT_PACKAGE=$(package_field "$EXT_REPO" name)
EXT_VERSION=$(package_field "$EXT_REPO" version)
PI_PACKAGE=$(package_field "$PI_REPO" name)
PI_VERSION=$(package_field "$PI_REPO" version)

if [[ "$PI_ONLY" -eq 0 ]]; then
  publish_one "$EXT_REPO" "Banon-Labs/pi-inline-format-extensions" "$EXT_PACKAGE" "$EXT_VERSION"
fi

if [[ "$EXT_ONLY" -eq 0 ]]; then
  publish_one "$PI_REPO" "Banon-Labs/pi-inline-format" "$PI_PACKAGE" "$PI_VERSION"
fi

echo "Done."
