# دليل فريق المحتوى — تجهيز واستيراد الموارد التفاعلية (HTML)

هذا الدليل يوضح خطوة بخطوة كيفية تجهيز الخرائط الذهنية التفاعلية والتجارب العملية بصيغة HTML ورفعها عبر مركز الاستيراد ومراجعتها ونشرها للطلاب.

---

## الخطوات العلمية للتجهيز والنشر (16 خطوة)

### 1. تجهيز الخريطة أو التجربة
قم بإعداد الخريطة الذهنية أو التجربة العملية باستخدام HTML5 وCSS3 وJavaScript. التأكد من عملها بسلاسة وتجاوبها مع الشاشات المختلفة (هواتف، أجهزة لوحية، أجهزة مكتبية) ودعمها للاتجاه من اليمين لليسار (RTL).

### 2. إنشاء مجلد للمورد باسم `resource_code`
أنشئ مجลداً رئيساً يطابق تماماً كود المورد الفريد المُعتمد (مثال: `MM-G12-BIO-L001` للخرائط أو `EXP-G12-PHY-L004` للتجارب).

### 3. وضع الملف الرئيسي `index.html`
ضع الملف الرئيسي باسم `index.html` داخل مجلد المورد المباشر.

### 4. وضع الملفات المساعدة داخل مجلد `assets`
ضع ملفات التصميم والبرمجة والصور داخل مجلد فرعي باسم `assets/`:
- `assets/style.css`
- `assets/app.js`
- `assets/images/`

### 5. منع CDN والروابط الخارجية
حسّب الضوابط الأمنية، يُمنع منعاً باتاً استدعاء أي مكتبات خارجية من شبكة الإنترنت (مثل Google Fonts أو FontAwesome أو cdnjs). جميع الملفات يجب أن تكون محليّة داخل مجلد `assets/`.

### 6. إنشاء ملف `manifest.json`
أنشئ ملف `manifest.json` داخل المجلد وفق النموذج المعتمد:
```json
{
  "resource_code": "MM-G12-BIO-L001",
  "entry_file": "index.html",
  "version": 1,
  "resource_type": "mind_map_html",
  "offline_enabled": true,
  "required_files": ["index.html", "assets/style.css", "assets/app.js"],
  "content_sha256": ""
}
```

### 7. تعبئة بيانات Excel
حمل قالب الاستيراد `interactive_lesson_resources_template.xlsx` وقم بتعبئة الصفوف:
- `resource_code`: كود المورد (مطابق للمجلد).
- `grade_code`: كود الصف.
- `subject_code`: كود المادة.
- `unit_code`: كود الوحدة (اختياري).
- `lesson_code`: كود الدرس (إلزامي).
- `resource_type`: `mind_map_html` أو `practical_experiment_html`.
- `title_ar`: العنوان بالعربية.
- `alt_text_ar`: النص البديل للوصولية (إلزامي للخرائط).
- `package_path`: مسار المجلد داخل ZIP.

### 8. ضغط الموارد في حزمة ZIP واحدة
قم بضغط كافة مجلدات الموارد في حزمة واحدة باسم `interactive_resources_files.zip`.

### 9. رفع ملف Excel وحزمة ZIP عبر لوحة التحكم
توجه إلى لوحة التحكم عبر المسار `/admin/content-import` واختر تبويب **الموارد التفاعلية (HTML)** وقم برفع ملف Excel وحزمة ZIP.

### 10. قراءة تقرير الفحص الأمني (Dry-Run / Security Report)
افحص نتائج الفحص التلقائي:
- التأكد من عدم وجود ملفات مفقودة.
- التأكد من خلو المحتوى من الأكواد المحظورة (`eval`, `window.parent`, روابط خارجية).
- التأكد من سلامة سياسة CSP وتشفير SHA-256.

### 11. إصلاح الأخطاء إن وُجدت
في حال ظهور أي تنبيهات أو أخطاء أمنية، قم بتعديل الملفات المحلية وإلغاء الاستدعاءات المحظورة.

### 12. إعادة الرفع والفحص
أعد ضغط الحزمة ورفعها مرة أخرى للتأكد من الحصول على تقرير فحص نظيم (PASS).

### 13. إرسال المحتوى للمراجعة
بعد نجاح الفحص، قم بإرسال المورد لمرحلة المراجعة `in_review`.

### 14. المعاينة والمراجعة الفنية
يقوم المراجع عبر الصفحة `/admin/content-review` بمعاينة الخريطة أو التجربة داخل بيئة العزل الآمنة (Sandbox)، واختبار الهاتف، واختبار وضع العمل دون اتصال (Offline).

### 15. الاعتماد والنشر للطالب
عند اعتماد المورد، يتم تغيير حالته إلى `published` ليصبح متاحاً فوراً للطلاب داخل صفحة الدرس المحددة.

### 16. تحديث الإصدارات المستقبليّة (Versioning)
عند الحاجة لتحديث خريطة أو تجربة منشورّة لاحقاً، قم بزيادة رقم الإصدار `version` إلى (2، 3 ...) دون استبدال النسخة المنشورة بصمت، لضمان حفظ سجل التراجعات والنزاهة الفنية.

---

## نموذج مجلد جاهز للنسخ (Copyable Template Folder Structure)

```
MM-G12-BIO-L001/
├── index.html
├── manifest.json
└── assets/
    ├── style.css
    ├── script.js
    └── images/
        └── concept_map.svg
```

### 1. نموذج `index.html` مبسط وجاهز:
```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>خريطة ذهنية تفاعلية</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <div class="container">
    <h1>الخريطة الذهنية — تركيبة الخلية</h1>
    <div id="mindmap" class="mindmap-box">
      <div class="node root">الخلية النباتية</div>
    </div>
  </div>
  <script src="assets/script.js"></script>
</body>
</html>
```

### 2. نموذج `manifest.json` مبسط وجاهز:
```json
{
  "resource_code": "MM-G12-BIO-L001",
  "entry_file": "index.html",
  "version": 1,
  "resource_type": "mind_map_html",
  "offline_enabled": true,
  "required_files": [
    "index.html",
    "assets/style.css",
    "assets/script.js"
  ],
  "content_sha256": ""
}
```
