#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_logo="${1:-${repo_root}/assets/brand/student-tamkeen-mark-approved.png}"

if [[ ! -f "${source_logo}" ]]; then
  echo "Approved logo source not found: ${source_logo}" >&2
  exit 1
fi

if ! command -v convert >/dev/null 2>&1; then
  echo "ImageMagick convert is required to generate brand assets." >&2
  exit 1
fi

work_dir="$(mktemp -d "${repo_root}/.tmp-brand-assets.XXXXXX")"
trap 'rm -rf "${work_dir}"' EXIT
mark="${work_dir}/student-tamkeen-mark.png"

# Remove only the approved source's warm-white plate. The central negative
# space intentionally becomes transparent and is restored by each target's
# explicit brand background.
convert "${source_logo}" \
  -alpha on \
  -fuzz 8% \
  -transparent "rgb(254,253,251)" \
  -trim +repage \
  -filter Lanczos \
  "${mark}"

mkdir -p \
  "${repo_root}/public/brand" \
  "${repo_root}/public/icons" \
  "${repo_root}/mobile/www" \
  "${repo_root}/docs/mobile/google-play/assets"

convert "${mark}" -resize "x512" -strip PNG32:"${repo_root}/public/brand/student-tamkeen-mark.png"
convert "${mark}" -resize "x220" -strip PNG32:"${repo_root}/mobile/www/student-tamkeen-mark.png"

make_square() {
  local output="$1"
  local size="$2"
  local mark_height="$3"
  convert -size "${size}x${size}" xc:'#FBFAF7' \
    \( "${mark}" -resize "x${mark_height}" \) \
    -gravity center -compose over -composite -strip PNG32:"${output}"
}

make_round() {
  local output="$1"
  local size="$2"
  local mark_height="$3"
  local center=$((size / 2))
  convert -size "${size}x${size}" xc:none \
    -fill '#FBFAF7' -draw "circle ${center},${center} ${center},0" \
    \( "${mark}" -resize "x${mark_height}" \) \
    -gravity center -compose over -composite -strip PNG32:"${output}"
}

make_foreground() {
  local output="$1"
  local size="$2"
  local mark_height="$3"
  convert -size "${size}x${size}" xc:none \
    \( "${mark}" -resize "x${mark_height}" \) \
    -gravity center -compose over -composite -strip PNG32:"${output}"
}

make_splash() {
  local output="$1"
  local width="$2"
  local height="$3"
  local shortest="$width"
  if (( height < width )); then shortest="$height"; fi
  local mark_height=$((shortest / 5))
  convert -size "${width}x${height}" xc:'#FBFAF7' \
    \( "${mark}" -resize "x${mark_height}" \) \
    -gravity center -compose over -composite -strip PNG24:"${output}"
}

make_square "${repo_root}/public/icons/favicon-64.png" 64 50
make_square "${repo_root}/public/icons/icon-192.png" 192 146
make_square "${repo_root}/public/icons/icon-512.png" 512 390
make_square "${repo_root}/public/icons/icon-maskable-512.png" 512 292

convert -size 1024x500 xc:'#FBFAF7' \
  -fill '#E6F8F5' -draw 'circle 70,55 270,55' \
  -fill '#EAF0F8' -draw 'circle 954,70 764,70' \
  -fill '#FFF0EC' -draw 'circle 930,470 720,470' \
  \( "${mark}" -resize 'x286' \) \
  -gravity center -compose over -composite -strip PNG24:"${repo_root}/docs/mobile/google-play/assets/feature-graphic-1024x500.png"

densities=(mdpi hdpi xhdpi xxhdpi xxxhdpi)
launcher_sizes=(48 72 96 144 192)
foreground_sizes=(108 162 216 324 432)

for index in "${!densities[@]}"; do
  density="${densities[$index]}"
  launcher_size="${launcher_sizes[$index]}"
  foreground_size="${foreground_sizes[$index]}"
  target="${repo_root}/android/app/src/main/res/mipmap-${density}"
  make_square "${target}/ic_launcher.png" "${launcher_size}" $((launcher_size * 72 / 100))
  make_round "${target}/ic_launcher_round.png" "${launcher_size}" $((launcher_size * 66 / 100))
  make_foreground "${target}/ic_launcher_foreground.png" "${foreground_size}" $((foreground_size * 60 / 100))
done

make_splash "${repo_root}/android/app/src/main/res/drawable/splash.png" 480 320
make_splash "${repo_root}/android/app/src/main/res/drawable-land-mdpi/splash.png" 480 320
make_splash "${repo_root}/android/app/src/main/res/drawable-land-hdpi/splash.png" 800 480
make_splash "${repo_root}/android/app/src/main/res/drawable-land-xhdpi/splash.png" 1280 720
make_splash "${repo_root}/android/app/src/main/res/drawable-land-xxhdpi/splash.png" 1600 960
make_splash "${repo_root}/android/app/src/main/res/drawable-land-xxxhdpi/splash.png" 1920 1280
make_splash "${repo_root}/android/app/src/main/res/drawable-port-mdpi/splash.png" 320 480
make_splash "${repo_root}/android/app/src/main/res/drawable-port-hdpi/splash.png" 480 800
make_splash "${repo_root}/android/app/src/main/res/drawable-port-xhdpi/splash.png" 720 1280
make_splash "${repo_root}/android/app/src/main/res/drawable-port-xxhdpi/splash.png" 960 1600
make_splash "${repo_root}/android/app/src/main/res/drawable-port-xxxhdpi/splash.png" 1280 1920

echo "Student Tamkeen brand assets generated from ${source_logo}"
