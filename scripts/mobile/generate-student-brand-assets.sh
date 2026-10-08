#!/usr/bin/env bash
# Regenerates every Tamkeen brand asset (launcher, splash, PWA, academy, Play
# listing) from the geometric "Ta as a check mark" definition.
# The owner-approved source stays pinned at assets/brand/student-tamkeen-mark-approved.png.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
approved_source="${repo_root}/assets/brand/student-tamkeen-mark-approved.png"

if [[ ! -f "${approved_source}" ]]; then
  echo "Approved logo source not found: ${approved_source}" >&2
  exit 1
fi

if ! python3 -c "import PIL" >/dev/null 2>&1; then
  echo "Pillow is required: python3 -m pip install Pillow" >&2
  exit 1
fi

python3 "${repo_root}/scripts/mobile/generate_student_brand_assets.py" --out "${repo_root}" "$@"
