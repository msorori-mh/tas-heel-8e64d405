#!/usr/bin/env bash
set -euo pipefail

original_package=app.studentamkeen.tamkeen
test_package=app.studentamkeen.tamkeen.offlinetest
evidence=artifacts/side-by-side
mkdir -p "$evidence"

# Both APKs are installed on a new disposable emulator. No user's device or
# production app data is accessed. Keep the original installation throughout.
adb install input/tamkeen-offline-1.2.0-code-6.apk
original_before="$(adb shell pm list packages -U "$original_package" | tr -d '\r')"
adb install previous/tamkeen-offline-1.2.0-side-by-side.apk
export TEST_PACKAGE_RECORD="$(adb shell pm list packages -U "$test_package" | tr -d '\r')"
adb install -r output/tamkeen-offline-1.2.0-test2.apk
adb shell pm list packages -U | tr -d '\r' > "$evidence/packages.txt"
export ORIGINAL_PACKAGE_RECORD="$original_before"
python3 - <<'PY'
from pathlib import Path
import os, re
rows = Path('artifacts/side-by-side/packages.txt').read_text().splitlines()
uids = {}
for package in ('app.studentamkeen.tamkeen', 'app.studentamkeen.tamkeen.offlinetest'):
    matching = [r for r in rows if r.startswith(f'package:{package} ')]
    assert len(matching) == 1, matching
    uids[package] = re.search(r'uid:(\d+)', matching[0]).group(1)
    if package == 'app.studentamkeen.tamkeen':
        assert matching[0] == os.environ['ORIGINAL_PACKAGE_RECORD']
    else:
        assert matching[0] == os.environ['TEST_PACKAGE_RECORD']
print('TEST_APK_UPDATE_PRESERVES_UID=PASS')
assert len(set(uids.values())) == 2, 'Applications must have different Android UIDs'
print('COINSTALL_DISTINCT_UIDS_ORIGINAL_PRESERVED=PASS')
PY

# The existing exact Supabase redirect is intentionally unchanged. Testers
# select "تمكين — اختبار" / Just once in Android's application chooser.
# PKCE verifiers and sessions remain in each app's separate private storage.
adb shell cmd package query-activities --brief -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'app.studentamkeen.tamkeen://auth/callback' > "$evidence/callback-handlers.txt"
python3 - <<'PY'
from pathlib import Path
import re
handlers = Path('artifacts/side-by-side/callback-handlers.txt').read_text()
assert re.search(r'app\.studentamkeen\.tamkeen/(?:app\.studentamkeen\.tamkeen)?\.MainActivity', handlers)
assert 'app.studentamkeen.tamkeen.offlinetest/app.studentamkeen.tamkeen.MainActivity' in handlers
print('BOTH_OAUTH_CALLBACK_CHOICES=PASS')
PY

adb logcat -c
adb shell am start -W -n "$test_package/app.studentamkeen.tamkeen.MainActivity" > "$evidence/launch.txt"
grep -q 'Status: ok' "$evidence/launch.txt"
for attempt in {1..20}; do
  adb shell uiautomator dump /sdcard/side-by-side-ui.xml >/dev/null
  adb pull /sdcard/side-by-side-ui.xml "$evidence/ui.xml" >/dev/null
  if python3 - <<'PY'
from pathlib import Path
text = Path('artifacts/side-by-side/ui.xml').read_text()
assert 'دخول الطالب' in text
assert 'دخول المعلم' in text
assert 'تعذر حفظ الحساب' not in text
PY
  then break; fi
  if [[ "$attempt" == 20 ]]; then exit 1; fi
  sleep 1
done
adb exec-out screencap -p > "$evidence/phone-launch.png"
read -r tap_x tap_y < <(python3 - <<'PY'
import re, xml.etree.ElementTree as ET
root = ET.parse('artifacts/side-by-side/ui.xml')
node = next(n for n in root.iter('node') if n.get('text') == 'دخول الطالب')
x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.attrib['bounds']))
print((x1+x2)//2, (y1+y2)//2)
PY
)
adb shell input tap "$tap_x" "$tap_y"
adb shell uiautomator dump /sdcard/side-by-side-auth.xml >/dev/null
adb pull /sdcard/side-by-side-auth.xml "$evidence/auth-ui.xml" >/dev/null
python3 - <<'PY'
from pathlib import Path
text = Path('artifacts/side-by-side/auth-ui.xml').read_text()
assert 'مساحة الطلاب' in text
assert 'المتابعة باستخدام Google' in text
assert 'العودة لاختيار نوع الحساب' in text
print('STUDENT_GOOGLE_ENTRY_AFTER_ROLE_CHOICE=PASS')
PY
adb exec-out screencap -p > "$evidence/student-sign-in.png"
adb logcat -d -b crash > "$evidence/crashes.txt"
if grep -Fq "Process: $test_package," "$evidence/crashes.txt"; then exit 1; fi
echo 'SIDE_BY_SIDE_INSTALL_AND_BUNDLED_UI=PASS'
