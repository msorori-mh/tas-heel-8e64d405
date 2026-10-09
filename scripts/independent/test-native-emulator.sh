#!/usr/bin/env bash
set -euo pipefail
app=app.studentamkeen.tamkeen.staging
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell svc wifi disable
adb shell svc data disable
adb shell cmd connectivity airplane-mode enable
run_case() {
  adb shell am instrument -w -r -e class "app.studentamkeen.tamkeen.NativeShellOfflineTest#$1" "$app.test/androidx.test.runner.AndroidJUnitRunner" | tee "artifacts/native-shell/emulator-$1.txt"
  grep -Fq 'OK (1 test)' "artifacts/native-shell/emulator-$1.txt"
  adb pull "/sdcard/Android/data/$app/files/offline-$1.png" "artifacts/native-shell/emulator-$1.png"
}
run_case seedAndOpen
adb shell am force-stop "$app"
run_case restoreAfterProcessDeath
