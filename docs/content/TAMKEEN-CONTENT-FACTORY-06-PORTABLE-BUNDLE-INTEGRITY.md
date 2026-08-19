# Content Factory 06 — Portable Bundle Integrity

## القرار

`PASS_CONTENT_FACTORY_06_SOURCE_BUNDLE_INTEGRITY`

## ما أُغلق

- لم يعد provenance الرسمي مسارًا نصيًا يمكن ادعاؤه؛ صار ملفًا مرفوعًا ومحسوب SHA-256.
- يثبت Manifest `provenancePath` و`provenanceSha256` معًا لكل artifact رسمي.
- يمنع validator أسماء الملفات غير الآمنة وتكرار أي مسار بين المحتوى أو provenance أو companion الإجابات.
- ينتج Builder حزمة ZIP واحدة تحتوي `manifest.json` وكل الملفات الفعلية، بدل فصل Manifest عن bytes المصدر.
- يعيد CF04 فحص بصمة provenance خادميًا عند staging metadata.

## الحدود

- ZIP يُنشأ محليًا ولا يُرفع إلى التخزين في هذه المرحلة.
- لا execute، لا publish، لا READY، ولا كتابة محتوى أو إنتاج.
- المرحلة التالية CF07: server-side ZIP byte verification ثم private artifact storage، وبعدها فقط يمكن تصميم atomic domain staging.

`PRODUCTION_WRITES=0`
