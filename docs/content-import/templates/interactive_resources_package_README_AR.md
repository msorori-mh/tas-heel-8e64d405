# دليل حزمة الموارد التفاعلية (HTML Interactive Resources Package Guide)

## 1. الهيكل العام للحزمة المرفوعة

يتم رفع جميع الموارد التفاعلية في حزمة مضغوطة برمز رئيسي: `interactive_resources_files.zip`.

تحتوي الحزمة على مجلد مستقل لكل مورد تفاعلي، ويجب أن يطابق اسم المجلد حقل `resource_code` في ملف Excel وحقل `resource_code` في `manifest.json`.

```
interactive_resources_files.zip
├── MM-G12-BIO-L001/
│   ├── index.html
│   ├── manifest.json
│   └── assets/
│       ├── style.css
│       ├── app.js
│       └── images/
│           └── diagram.png
└── EXP-G12-PHY-L004/
    ├── index.html
    ├── manifest.json
    └── assets/
        ├── experiment.js
        └── styles.css
```

---

## 2. مواصفات ملف `manifest.json`

يجب أن يتواجد ملف `manifest.json` في المجلد الرئيسي لكل مورد وفق الصيغة التالية:

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
    "assets/app.js"
  ],
  "content_sha256": ""
}
```

---

## 3. الشروط الأمنية الصارمة للمحتوى (Security Constraints)

1. **الروابط الخارجية والمكتبات:**
   - ممنوع استدعاء أية مكتبات خارجية عبر شبكة CDN (مثل cdnjs, unpkg, googlefonts).
   - جميع ملفات JavaScript و CSS والصور والأيقونات يجب أن تكون محليّة داخل مجلد `assets/`.

2. **تضمين النصوص البرمجية:**
   - النصوص البرمجية المضمنة (Inline Scripts) مسموحة وسيتم حساب تشفير SHA-256 لها آلياً وتضمينها في CSP.
   - ممنوع استخدام سمات الأحداث المضمنة (Event Handler attributes) مثل `onclick`, `onload`, `onerror`, `onmouseover`.
   - ممنوع استخدام روابط `javascript:`.
   - ممنوع استخدام `eval()` أو `new Function()`.
   - ممنوع استخدام `document.write`.

3. **العزل وشجرة DOM:**
   - يمنع منعاً باتاً استدعاء `window.parent` أو `top.location` أو التعامل مع DOM التطبيق الرئيسي.
   - يمنع استخدام `document.cookie` أو الوصول إلى `localStorage` أو `sessionStorage` أو `IndexedDB` الخاصة بالتطبيق.
   - يمنع استدعاء جسر الهاتف المحمول `window.Capacitor` أو عميل `Supabase`.

4. **العناصر المحظورة:**
   - ممنوع تضمين عناصر `<iframe>` داخل ملف HTML المستورد.
   - ممنوع تضمين نماذج `<form>` أو تقديم بيانات لأي سيرفر خارجي.
   - ممنوع تسجيل `ServiceWorker`.

---

## 4. الحدود الفنية والحجوم (Package Limits)

- **الحجم الأقصى للمورد المضغوط:** 25MB.
- **الحجم الأقصى للمورد بعد فك الضغط:** 100MB.
- **الحجم الأقصى للحزمة الرئيسية ZIP:** 500MB.
- **العدد الأقصى للملفات للمورد الواحد:** 500 ملف.
- **العدد الأقصى لعمق المجلدات:** 8 مستويات.
- **الحجم الأقصى لملف HTML أو JS فردي:** 10MB.
- **تأطير الفيديو:** لا يُسمح بتضمين فيديو داخل المحتوى مباشرة؛ يُستخدم نوع المورد `video` المستقل.

---

## 5. التواصل مع التطبيق عبر Bridge

يمكن للتجربة أو الخريطة إرسال أحداث آمنة للتطبيق عبر كائن العقد `window.__TasheelBridge`:

```javascript
// عند إتمام تحميل الخريطة أو التجربة
window.__TasheelBridge.markReady();

// عند بدء الطالب للتجربة
window.__TasheelBridge.markStarted();

// عند تفاعل الطالب مع عنصر
window.__TasheelBridge.sendInteraction({ action: "zoom_node", nodeId: "n12" });

// عند إكمال خطوة في التجربة
window.__TasheelBridge.markStepCompleted(1);

// عند إكمال التجربة كاملة
window.__TasheelBridge.markExperimentCompleted({ score: 100 });
```
