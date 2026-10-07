#!/usr/bin/env bash
set -euo pipefail
sdkmanager 'system-images;android-35;default;x86_64' 'emulator'
printf 'no\n' | avdmanager create avd --force --name tamkeen-local-pages --package 'system-images;android-35;default;x86_64' --device 'pixel_2'
sudo chmod a+rw /dev/kvm
"$ANDROID_HOME/emulator/emulator" -avd tamkeen-local-pages -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -memory 2048 > "$RUNNER_TEMP/tamkeen-emulator.log" 2>&1 &
emulator_pid=$!
trap 'adb emu kill >/dev/null 2>&1 || kill "$emulator_pid" 2>/dev/null || true' EXIT
timeout 180 adb wait-for-device
booted=false
for attempt in $(seq 1 90); do
  if [[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == '1' ]]; then booted=true; break; fi
  sleep 2
done
if [[ "$booted" != true ]]; then cat "$RUNNER_TEMP/tamkeen-emulator.log"; exit 1; fi
adb shell input keyevent 82
cd android
./gradlew testDebugUnitTest connectedDebugAndroidTest --stacktrace
