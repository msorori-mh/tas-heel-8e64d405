# تحديث هوية التطبيق: «تمكين الطالب»

## الهدف
جعل عنوان الصفحة الرئيسية وجميع وسوم الهوية (title، og:title، twitter:title، og:site_name، apple-mobile-web-app-title، JSON-LD، manifest، صفحة عدم الاتصال) تظهر باسم التطبيق الموحد «تمكين الطالب».

## النطاق
- `src/routes/__root.tsx` — title الافتراضي ووسوم OpenGraph/Twitter/PWA وJSON-LD.
- `src/routes/index.tsx` — title صفحة الهبوط و og:title.
- `public/manifest.webmanifest` — name و short_name.
- `public/offline.html` — `<title>`.

## خارج النطاق
- نصوص الهيرو والعناوين المرئية (الشارة و `<h1>` وحقوق النشر)؛ هي مُحدّثة فعلاً.
- عناوين الصفحات الداخلية الأخرى (مثل «شروط الاستخدام — تمكين»)؛ تُترك لمرة لاحقة إن أُريد توحيدها.
- الروابط الأساسية (`canonical` / `og:url`) — لا تُغيّر.
- أي DB writes / migrations / RLS / RPC / نشر.

## الخطوات
1. تعديل `head()` في `src/routes/__root.tsx`:
   - `title`: "تمكين الطالب"
   - `og:site_name`: "تمكين الطالب"
   - `og:title`: "تمكين الطالب"
   - `twitter:title`: "تمكين الطالب"
   - `apple-mobile-web-app-title`: "تمكين الطالب"
   - `JSON-LD`: `name` في Organization و WebSite ← "تمكين الطالب"
2. تعديل `head()` في `src/routes/index.tsx`:
   - `title`: "تمكين الطالب"
   - `og:title`: "تمكين الطالب"
3. تعديل `public/manifest.webmanifest`:
   - `name` و `short_name`: "تمكين الطالب"
4. تعديل `public/offline.html`:
   - `<title>`: "غير متصل — تمكين الطالب"
5. تشغيل `typecheck` و `build:dev`.
6. فحص دخان (Smoke test) بجلسة طالب مخوّل على `/` و `/app` و `/lessons/...`:
   - `document.title` يطابق "تمكين الطالب".
   - console errors = 0.
   - القارئ البنيوي (إن فُتح الدرس التجريبي) يعمل بلا مشاكل.
7. التوقف؛ لا يُنفّذ نشر إلا بتصريح صريح `APPROVED_PRODUCTION_PUBLISH` على HEAD المطابق.

## المخاطر
منخفضة جداً — تغييرات metadata و PWA فقط، لا تأثير على المنطق أو البيانات.
