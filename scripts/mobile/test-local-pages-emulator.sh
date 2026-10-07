#!/usr/bin/env bash
set -euo pipefail
# Command-line tools and emulator releases differ in their default AVD directory.
# Give both the same explicit, disposable location without changing HOME.
export ANDROID_AVD_HOME="$RUNNER_TEMP/tamkeen-avd"
mkdir -p "$ANDROID_AVD_HOME"
sdkmanager 'system-images;android-35;default;x86_64' 'emulator'
printf 'no\n' | avdmanager create avd --force --name tamkeen-local-pages --package 'system-images;android-35;default;x86_64' --device 'pixel_2' --path "$ANDROID_AVD_HOME/tamkeen-local-pages.avd"
test -f "$ANDROID_AVD_HOME/tamkeen-local-pages.ini"
"$ANDROID_HOME/emulator/emulator" -list-avds
sudo chmod a+rw /dev/kvm
"$ANDROID_HOME/emulator/emulator" -avd tamkeen-local-pages -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader -no-metrics -accel on -memory 2048 > "$RUNNER_TEMP/tamkeen-emulator.log" 2>&1 &
emulator_pid=$!
cleanup() {
  mkdir -p "$GITHUB_WORKSPACE/android/app/build/reports/emulator"
  cp "$RUNNER_TEMP/tamkeen-emulator.log" "$GITHUB_WORKSPACE/android/app/build/reports/emulator/emulator.log" || true
  adb emu kill >/dev/null 2>&1 || kill "$emulator_pid" 2>/dev/null || true
}
trap cleanup EXIT
if ! timeout 180 adb wait-for-device; then
  cat "$RUNNER_TEMP/tamkeen-emulator.log"
  exit 1
fi
booted=false
for attempt in $(seq 1 90); do
  if [[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == '1' ]]; then booted=true; break; fi
  sleep 2
done
if [[ "$booted" != true ]]; then cat "$RUNNER_TEMP/tamkeen-emulator.log"; exit 1; fi
adb shell input keyevent 82
cd android
test_status=0
./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest --stacktrace || test_status=$?
mkdir -p app/build/reports/local-pages-screenshots
for screen in home settings lesson; do
  adb pull "/sdcard/local-pages-$screen.png" app/build/reports/local-pages-screenshots/ >/dev/null 2>&1 || true
done
exit "$test_status"
