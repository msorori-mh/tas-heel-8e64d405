# تمكين بلا نت — Offline-first Foundation V1

الحالة: **G1 IMPLEMENTED / NOT MERGED / NOT DEPLOYED**

نقطة البداية: `main@9713cdb165109987d9d1b672fc44d80b184c6939`.

## الهدف

هذه البوابة لا تدّعي أن التطبيق أصبح كاملًا دون إنترنت. هدفها إنشاء طبقة محلية موحدة وآمنة يمكن البناء عليها في البوابات التالية دون هدم بنية الكتب والملفات الموجودة.

## ما كان موجودًا قبل هذه البوابة

- كاش ملفات دروس وPDF في `src/lib/offline/pdf-cache.ts`.
- تنزيل ملفات الدروس والكتب عبر مسارات مصادق عليها.
- حزم ملفات محدودة في `offline-pack.ts`.
- سجل Native للكتب المحفوظة وOffline Entry عند فشل WebView.

الفجوة: لا يوجد مخزن محلي موحد للمنهج/الوحدات/الدروس/الأسئلة/الاختبارات والتقدم، ولا صف mutations موثوق لإعادة المزامنة بعد العمل دون اتصال.

## ما أضيف

### 1. Native SQLite

Plugin جديد: `TamkeenOfflineStore` داخل مساحة التطبيق الخاصة، بقاعدة:

`tamkeen-offline.db`

الجداول الأولية:

- `offline_content`: snapshots للمحتوى الذي يحتاجه الطالب لعرض الحزم المحملة.
- `sync_queue`: عمليات الطالب المؤجلة للمزامنة.

لا توجد جداول Supabase جديدة، ولا Migration إنتاجي.

### 2. منع الأسرار

طبقة TypeScript وطبقة Android ترفضان payload يحتوي مفاتيح من عائلات:

- access/refresh token
- Authorization
- password
- service role
- signed URL
- secret

الغرض: قاعدة Offline تخزن بيانات تعلم فقط، ولا تتحول إلى مخزن اعتماد أو مفاتيح خلفية.

### 3. Idempotent sync queue

`idempotency_key` فريد في SQLite. إعادة إدخال العملية نفسها تستخدم `CONFLICT_IGNORE`، وبالتالي عودة الشبكة أو إعادة تشغيل الهاتف لا تضاعف نفس mutation.

يوجد:

- enqueue
- list pending
- mark synced
- mark failed + attempts
- bounded drain engine

محرك المزامنة لا يخترع API جديدة ولا يتجاوز RLS؛ handler السيرفر يُحقن لاحقًا ويجب أن يعيد استخدام نفس العقود المصرح بها في المسار Online.

### 4. عقد حزم المحتوى

تم تعريف scope صريح بحسب:

- الصف
- `sanaa | aden`
- `s1 | s2 | full_year`
- المادة أو كل المواد

أنواع المحتوى تغطي catalog/subject/unit/lesson ومكونات الدرس والأسئلة و«اختبر فهمك» والنماذج الوزارية ومؤشر المراجعة.

الأصول المنفصلة تشمل PDF/HTML/images/mind maps وغيرها مع version/size/checksum.

## ما لم يتغير

- `capacitor.config.ts` ما يزال يحمل `https://studentamkeen.com` كواجهة رئيسية.
- Offline Entry الحالي للكتب لم يُزل.
- الإدارة وأكاديمية المعلمين خارج النطاق.
- لا تغيير في Auth أو RLS أو RPC أو schema الإنتاج.
- لا نشر ولا Play Console ولا AAB ضمن هذه البوابة.

## البوابات التالية

1. **G2 Content Package Builder/API**: توليد manifest فعلي من بيانات الطالب المصرح بها، مع revisions وتحديث تفاضلي.
2. **G3 Download Manager**: تنزيل الحزم، استكمال، checksum، مساحة وWi-Fi only وربط الملفات بالmanifest.
3. **G4 Bundled Student Runtime**: واجهة الطالب داخل APK بدل الاعتماد على remote SSR عند التشغيل.
4. **G5 Offline lesson runtime**: الرئيسية ← المواد ← الوحدات ← الدروس ← المكونات السبعة من SQLite/الملفات.
5. **G6 Tests/progress**: اختبر فهمك، أسئلة الكتاب، النماذج الوزارية والنتائج محليًا.
6. **G7 Sync adapters**: ربط progress/attempts/mistakes/review بالعقود الفعلية وإثبات عدم التكرار.
7. **G8 Physical airplane tests**: cold launch، force stop، reboot، انقطاع أثناء التنزيل، عودة الشبكة، وتحديث الحزمة.

## معيار إغلاق المشروع كاملًا

بعد تنزيل الحزمة: وضع طيران + Force stop + فتح التطبيق → تصفح المنهج والدروس والمكونات وحل الاختبارات ومراجعة التقدم بلا شبكة. عند عودة الشبكة تتم مزامنة كل mutation مرة واحدة بلا فقد أو تكرار.
