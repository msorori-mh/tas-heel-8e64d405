#!/usr/bin/env bash
set -euo pipefail

bundle_path="${1:?Usage: verify-play-aab.sh /path/to/app.aab}"

if [[ ! -f "$bundle_path" ]]; then
  echo "AAB not found: $bundle_path" >&2
  exit 1
fi

unzip -tq "$bundle_path" >/dev/null

if ! unzip -Z1 "$bundle_path" | grep -qx 'base/manifest/AndroidManifest.xml'; then
  echo "Invalid AAB: base manifest is missing" >&2
  exit 1
fi

native_entries="$(unzip -Z1 "$bundle_path" | grep -E '(^|/)lib/[^/]+/[^/]+\.so$' || true)"
if [[ -n "$native_entries" ]]; then
  echo "Unaudited native libraries found in AAB; run the Android 16 KB compatibility workflow:" >&2
  echo "$native_entries" >&2
  exit 1
fi

bundle_size="$(wc -c < "$bundle_path" | tr -d ' ')"
echo "PLAY_AAB_STRUCTURE=PASS"
echo "PLAY_AAB_NATIVE_LIBS=NONE_16KB_NOT_APPLICABLE"
echo "PLAY_AAB_BYTES=$bundle_size"
