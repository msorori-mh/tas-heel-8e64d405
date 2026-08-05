/**
 * Sample HTML package fixtures for testing.
 */

export const VALID_MIND_MAP_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>الخريطة الذهنية للخلية النباتية</title>
  <style>
    body { font-family: sans-serif; background-color: #0f172a; color: #ffffff; margin: 0; padding: 20px; }
    .title { font-size: 20px; font-weight: bold; color: #38bdf8; margin-bottom: 10px; }
    .box { border: 2px solid #38bdf8; border-radius: 8px; padding: 12px; margin: 8px 0; background: #1e293b; }
  </style>
</head>
<body>
  <div class="title">تركيب الخلية النباتية</div>
  <div class="box">الجدار الخلوي - الجدار الخارجي للحماية</div>
  <div class="box">البلاستيدات الخضراء - البناء الضوئي</div>
  <script>
    console.log("Mind map loaded");
  </script>
</body>
</html>`;

export const VALID_MIND_MAP_MANIFEST = {
  resource_code: "MM-G12-BIO-L001",
  entry_file: "index.html",
  version: 1,
  resource_type: "mind_map_html",
  offline_enabled: true,
};

export const VALID_EXPERIMENT_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تجربة قانون أوم</title>
  <style>
    body { font-family: sans-serif; background-color: #022c22; color: #ffffff; padding: 20px; }
    .formula { font-size: 24px; color: #34d399; font-weight: bold; }
  </style>
</head>
<body>
  <h1>محاكاة قانون أوم</h1>
  <div class="formula">V = I × R</div>
  <script>
    if (window.__TasheelBridge) {
      window.__TasheelBridge.markStarted();
    }
  </script>
</body>
</html>`;

export const VALID_EXPERIMENT_MANIFEST = {
  resource_code: "EXP-G12-PHY-L004",
  entry_file: "index.html",
  version: 1,
  resource_type: "practical_experiment_html",
  offline_enabled: true,
};
