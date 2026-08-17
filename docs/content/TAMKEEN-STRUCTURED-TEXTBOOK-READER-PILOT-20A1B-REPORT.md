# TAMKEEN_STRUCTURED_TEXTBOOK_READER_PILOT_20A1B — تقرير

**الحالة:** PASS_READY_FOR_REVIEW — لا Publish.

## المصدر
- مصدر الحقيقة: `src/content/official-textbook/pilot-20a1b/approved.json` (31 بلوك، sha256 محفوظ في manifest).
- الدرس: سورة السجدة - الدرس الأول: مكانة القرآن الكريم وكمال قدرة الله (تربية إسلامية، الفصل الأول).

## الصور
رُفعت الصور الثلاث إلى تخزين تمكين المُدار (روابط same-origin، بدون base64 وبدون استضافة خارجية):
- `assets/pilot-b025-01.png`، `assets/pilot-b027-01.png`، `assets/pilot-b027-02.png`
- الخرائط في `src/lib/content/official-textbook/structured-blocks.ts` (`PILOT_20A1B_ASSET_MAP`).
- ملاحظة تشغيلية: إنشاء bucket عام مرفوض على المنصة، لذلك الأصول تُقدَّم من تخزين المشروع المُدار نفس الأصل.

## القارئ
`src/components/lessons/StructuredTextbookReader.tsx` — RTL، Mobile-first، بدون `dangerouslySetInnerHTML`.
معالجة نوعية لكل بلوك: عنوان الدرس، الأهداف، الفقرات، القوائم، الآيات، معاني المفردات، الأشكال، النشاط، التقويم.
مدمج في صفحة الدرس عبر `resolveStructuredDocument()` ويُعرض تلقائياً عند ربط الدرس بالمحتوى المعتمد.

## التحقق البصري والآلي
- عدد البلوكات المعروضة: **31/31** بنفس الترتيب المعتمد.
- تطابق نصي: **0 نص مفقود** بعد مقارنة كل الفقرات/العناصر/الآيات/الأسئلة بالنص المعروض.
- لا Horizontal overflow على 390px ولا على 1440px.
- الصور الثلاث محمّلة فعلياً (678 / 366 / 488 px عرض أصلي).
- لا أخطاء console.

## اللقطات
- Mobile 390px: `/mnt/documents/20a1b/mobile.png`
- Desktop 1440px: `/mnt/documents/20a1b/desktop.png`
- مسار المعاينة: `/preview/structured-textbook-20a1b` (noindex، للمراجعة فقط).
