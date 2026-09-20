"""Validate the distributable, not just an intermediate build directory."""
import hashlib, json, pathlib, re, sys, zipfile
apk = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None
    config = json.loads(archive.read('assets/capacitor.config.json'))
    assert config['appId'] == 'app.studentamkeen.tamkeen.review.offlineui'
    assert 'url' not in config['server']
    assert config['server']['hostname'] == 'studentamkeen.com'
    descriptor = json.loads(archive.read('assets/public/review-build.json'))
    assert descriptor['kind'] == 'TEST_ONLY' and descriptor['playUpload'] is False
    assert descriptor['featureSha'] == '7a8c7c7dbfab7ac56b95360ebe035c2a88276074'
    assert descriptor['capacitySha'] == '01310672afdb3805bceb8bd4c124bf5557718ea9'
    assert descriptor['backendCapacityApplied'] is False
    assert descriptor['academyOfflineStage'] == 1
    assert descriptor['academyNotesMigrationApplied'] is False
    assert config['server']['errorPath'] == 'app-recovery.html'
    assert descriptor['offlineShell'] == 'normal-app-local-first-v2'
    assert descriptor['legacyOfflineLibrary'] is False
    recovery = archive.read('assets/public/app-recovery.html').decode()
    assert "location.replace('/')" in recovery
    assert 'دروسك المحفوظة' not in recovery
    assert 'assets/public/academy-shell/index.html' in archive.namelist()
    academy_assets = json.loads(archive.read('assets/public/academy-shell/assets.json'))
    assert academy_assets
    for asset in academy_assets:
        assert 'assets/public' + asset in archive.namelist(), asset
    academy_scripts = ''.join(archive.read('assets/public' + asset).decode() for asset in academy_assets if asset.endswith('.js'))
    assert 'tamkeen-academy-offline-v1' in academy_scripts
    assert 'save_offline_note' in academy_scripts
    html = archive.read('assets/public/index.html')
    assert hashlib.sha256(html).hexdigest() == descriptor['htmlSha256']
    settings = archive.read('assets/public/assets/' + descriptor['settingsAsset'])
    assert hashlib.sha256(settings).hexdigest() == descriptor['settingsSha256']
    assert 'تنزيل المواد دون إنترنت' in settings.decode()
    assert 'تأكيد الحذف' in settings.decode()
    assert archive.read('assets/public/review-offline.html').decode() == recovery
    scripts = re.findall(r'<script[^>]+src="(/[^"?]+)', html.decode())
    assert scripts
    for script in scripts:
        assert 'assets/public' + script in archive.namelist(), script
    assert not any(name.endswith(('.jks', '.keystore', '.env')) for name in archive.namelist())
    print(json.dumps({'package': config['appId'], 'ui': 'embedded review', 'sourceSha': descriptor['sourceSha'], 'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(), 'size': apk.stat().st_size, 'checks': 'PASS'}, indent=2))
