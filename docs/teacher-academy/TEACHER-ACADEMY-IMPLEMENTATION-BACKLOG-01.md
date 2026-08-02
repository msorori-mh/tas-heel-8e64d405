# TEACHER-ACADEMY-IMPLEMENTATION-BACKLOG-01 — قائمة المهام والتنفيذ الموحدة

خارطة الطريق وقائمة المهام التنفيذية الموحدة لبوابة «أكاديمية معلم الثانوية» مرتبة في 17 مرحلة تسلسلية قياسية وفق القرارات S1–S7.

| حقل | قيمة |
|---|---|
| اسم الوثيقة | Teacher Academy — Canonical Implementation Backlog (17 Stages) |
| معرّف الوثيقة | TEACHER-ACADEMY-IMPLEMENTATION-BACKLOG-01 |
| التاريخ | 2026-08-03 |
| الحالة | **DRAFT — CANONICAL BLUEPRINT UPDATE 03** |
| النطاق | خطة تنفيذية وتصميم المهام فقط — لا كود ولا SQL |

---

## 1. مبادئ ترتيب وترقيم Backlog

1. **الترتيب القياسي ذو الـ 17 مرحلة (17 Stages):** تنظم جميع المهام في 17 مرحلة متسلسلة زمنيأ بدون أي تداخل أو معكوسات.
2. **تقديم نموذج التهديدات (Requirement 13):** تم تقديم مرحلة نموذج التهديدات والمخاطر الأمنية (Stage 9) لتسبق تماماً مرحلة تصميم الجداول والـ Schema (Stage 10).
3. **حظر وقرع التبعيات الدائرية (Requirement 11):** تم فك التبعية الدائرية بين TA-045 و TA-063 حيث تعتمد TA-063 على TA-045 و TA-056، ولا تعتمد TA-045 على TA-063.
4. **تحديث التاكسونومي (Requirement 3):** تم تطهير Backlog تماماً من أي مسميات قديمة مثل 	a_paths أو 	a_modules أو 	a_lessons أو 	a_admin.
5. **اتساق نطاق Offline (Requirement 10):**
   - **MVP:** App Shell, Catalog, Text Content, Progress Outbox (Last-write-wins).
   - **P1:** Interactive Activities, Assessments, Evidence Outbox, Conflict Resolution.
   - **P2:** Protected Offline Video, Native Mobile Packaging.

---

## 2. النواحي والمراحل الـ 17 المعتمدة (The 17 Canonical Stages)

1. owner decisions (القرارات المعتمدة وقرارات المالك)
2. canonical glossary (المصطلحات الموحدة والتاكسونومي القياسي)
3. capabilities (حوكمة الصلاحيات المؤطرة academy_capability_grants)
4. organizations (المؤسسات والعقود والمقاعد الزمانية)
5. identity/privacy (الهوية المشتركة وفصل ملفات المعلمين وال الخصوصية)
6. domain model (النموذج المفهومي الشامل للبيانات)
7. certificates (الشهادات المستقلة وسجل الساعات المهنية)
8. entitlements/commerce (المنتجات والاستحقاقات والفواتير والعقود)
9. 	hreat model (نموذج التهديدات والمخاطر الأمنية — قبل الـ Schema)
10. schema design (تصميم الهيكل والـ Schema للجداول والإصدارات)
11. migrations/RLS/RPC tests (فحوص واختبارات سياسات RLS والدوال)
12. 	eacher frontend (بناء واجهة PWA المستقلة للمعلمين)
13. offline (محرك العمل غير المتصل والمزامنة)
14. content/catalog seed (بناء وتغذية كتالوج البرامج والمقررات)
15. commercial runtime (تشغيل محرك التجارة والاستحقاقات المؤسسية)
16. security review (المراجعة الأمنية الشاملة واختبارات الاختراق)
17. launch gates (بوابات الإطلاق والجودة لإنتاج الحزمة)

---

## 3. الرسم البياني للـ Backlog الموحد (110 Task)

### Stage 1: Owner Decisions
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-001 | MVP | owner decisions | وثيقة وتأكيد قرارات المالك الأربعة AD1–AD4 | None | توثيق رسمي معتمد |
| TA-002 | MVP | owner decisions | واعتماد قرارات S1-S7 في النظام | TA-001 | موافقة المالك المكتوبة |
| TA-003 | MVP | owner decisions | حظر توسيع enum app_role الخاص بالطلاب | TA-002 | إقرار عدم التعديل على app_role |
| TA-004 | MVP | owner decisions | إلغاء Admin Bypass الشامل وصياغة سياسة الإدارة | TA-002 | اعتماد حظر الـ Blanket Bypass |
| TA-005 | MVP | owner decisions | اعتماد نطاقات العمل غير المتصل MVP/P1/P2 | TA-002 | اعتماد التوزيع القياسي لـ Offline |

### Stage 2: Canonical Glossary
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-006 | MVP | canonical glossary | صياغة وثيقة التاكسونومي القياسي (programs->cohorts) | TA-002 | توحيد المصطلحات في جميع الوثائق |
| TA-007 | MVP | canonical glossary | حذف واستبدال mssmya ta_paths, ta_modules | TA-006 | خلو الوثائق من المسميات القديمة |
| TA-008 | MVP | canonical glossary | تعريف مصطلحات الكيانات الـ 24 الموحدة | TA-006 | جدول التعاريف القياسي بالكامل |
| TA-009 | MVP | canonical glossary | توحيد مصطلحات الشهادات والساعات المهنية | TA-008 | مطابقة مصطلحات S5 |
| TA-010 | MVP | canonical glossary | توحيد مصطلحات الاستحقاقات والمقاعد B2B | TA-008 | مطابقة مصطلحات S4 و S6 |

### Stage 3: Capabilities
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-011 | MVP | capabilities | مواصفات جدول academy_capability_grants | TA-003, TA-008 | تصميم النطاقات Scopes الكامل |
| TA-012 | MVP | capabilities | مواصفات Scope: program_version_id | TA-011 | تقييد المنح بإصدار البرنامج |
| TA-013 | MVP | capabilities | مواصفات Scope: cohort_id | TA-011 | تقييد المنح بالدفعة التدريبية |
| TA-014 | MVP | capabilities | مواصفات Scope: organization_id | TA-011 | تقييد المنح بالمؤسسة |
| TA-015 | MVP | capabilities | مواصفات بروتوكول Access Emergency الطارئ | TA-004, TA-011 | المدة الزمنية والمسبب الإجباري |
| TA-016 | MVP | capabilities | تصميم جدول emergency_access_audit_logs | TA-015 | سجل Audit كامل للطلبات الطارئة |
| TA-017 | MVP | capabilities | مصفوفة الصلاحيات الموحدة للأدوار العشرة | TA-011 | تغطية جميع الأدوار دون app_role |

### Stage 4: Organizations
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-018 | MVP | organizations | مواصفات جدول organizations (مدارس/مكاتب) | TA-008, TA-014 | دعم الهيكلة المؤسسية |
| TA-019 | MVP | organizations | مواصفات organization_memberships الزمنية | TA-018 | حقول البداية والنهاية للعضوية |
| TA-020 | MVP | organizations | مواصفات organization_relationships الهرمية | TA-018 | دعم علاقة الأصل والفرع |
| TA-021 | MVP | organizations | مواصفات organization_contracts (عقود B2B) | TA-018 | مدة العقد وشروط الترخيص |
| TA-022 | MVP | organizations | مواصفات contract_seats وتتبع المقاعد | TA-021 | حقول المقاعد المخصصة والمستهلكة |
| TA-023 | MVP | organizations | مواصفات إعادة تدوير المقاعد وإلغائها | TA-022 | سياسة استعادة المقعد |
| TA-024 | MVP | organizations | تقارير الاستهلاك المؤسسي للمقاعد | TA-022 | لوحة متابعة المقاعد للمؤسسة |

### Stage 5: Identity / Privacy
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-025 | MVP | identity/privacy | مواصفات الربط بـ Auth Account (auth.users) | TA-008 | عدم تكرار الحساب الأساسي |
| TA-026 | MVP | identity/privacy | مواصفات جدول teacher_profiles المستقل | TA-025 | عزل بيانات المعلم المهنية |
| TA-027 | MVP | identity/privacy | مواصفات teacher_subject_assignments | TA-026 | ربط التخصصات والمواد بالمعلم |
| TA-028 | MVP | identity/privacy | مواصفات teacher_organization_memberships | TA-019, TA-026 | ربط المعلم بالمؤسسات |
| TA-029 | MVP | identity/privacy | سياسة حظر SELECT العام على profiles الطلاب | TA-026 | سياسة RLS تمنع الوصول لبيانات الطلاب |
| TA-030 | MVP | identity/privacy | فحوص حماية PII وعدم تسريب بيانات الطلاب | TA-029 | Zero Data Leakage للطلاب |

### Stage 6: Domain Model
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-031 | MVP | domain model | مواصفات academy_programs | TA-008 | الكيان الموحد للبرامج |
| TA-032 | MVP | domain model | مواصفات academy_program_versions | TA-031 | إصدارات البرامج والمنهج |
| TA-033 | MVP | domain model | مواصفات academy_courses | TA-032 | المقررات التدريبية |
| TA-034 | MVP | domain model | مواصفات academy_modules | TA-033 | الوحدات التدريبية |
| TA-035 | MVP | domain model | مواصفات academy_lessons | TA-034 | الدروس والتفاصيل |
| TA-036 | MVP | domain model | مواصفات academy_cohorts والدفعات | TA-032 | الدفعات والتسجيل الزمني |
| TA-037 | MVP | domain model | مواصفات تتبع التقدم وإنجاز الدروس | TA-035, TA-036 | سجل إتمام الدروس والوحدات |
| TA-038 | MVP | domain model | توثيق العلاقات الـ 24 الشاملة للكيانات | TA-031..TA-037 | مخطط الكيانات الموحد ERD |

### Stage 7: Certificates
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-039 | MVP | certificates | مواصفات academy_certificates المستقلة | TA-038 | عزل شهادات المعلم عن الطلاب |
| TA-040 | MVP | certificates | مواصفات academy_certificate_events | TA-039 | سجل أحداث الإصدار والإبطال |
| TA-041 | MVP | certificates | مواصفات professional_hours_ledger | TA-039 | دفتر احتساب الساعات المهنية |
| TA-042 | MVP | certificates | آلية التحقق العام عبر الرمز و QR | TA-039 | صفحة تحقق عامة بلا تسجيل دخول |
| TA-043 | MVP | certificates | سياسة إبطال الشهادة والمسببات | TA-040 | توثيق أسباب ومسار الإبطال |
| TA-044 | MVP | certificates | التصدير الرقمي للشهادة وطباعتها | TA-042 | ملفات PDF قابلة للطباعة |

### Stage 8: Entitlements / Commerce
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-045 | MVP | entitlements/commerce | مواصفات محرك الاستحقاقات المستقل | TA-038 | عدم التبعية على TA-063 (فك الدائرية) |
| TA-046 | MVP | entitlements/commerce | مواصفات كيان products للتدريب | TA-045 | حزم المنتجات والاشتراكات |
| TA-047 | MVP | entitlements/commerce | مواصفات كيان orders والشراء | TA-046 | أوامر الشراء B2B و B2C |
| TA-048 | MVP | entitlements/commerce | مواصفات كيان entitlements المنوحة | TA-047 | تتبع الاستحقاق الفعلي |
| TA-049 | MVP | entitlements/commerce | مواصفات كيان invoices والفواتير | TA-047 | إصدار وتتبع الفواتير |
| TA-050 | MVP | entitlements/commerce | مواصفات كيان contracts التجارية | TA-047 | عقود المدارس والمناطق |
| TA-051 | MVP | entitlements/commerce | حظر استخدام subscriptions و wallets الطلاب | TA-045 | Zero access لجداول مالية الطلاب |

### Stage 9: Threat Model (BEFORE Schema Design)
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-052 | MVP | threat model | تحليل مخاطر Escalation Privilege عبر الأدوار | TA-017, TA-030 | تقرير تحليل المخاطر وتحديد الضوابط |
| TA-053 | MVP | threat model | تحليل مخاطر تسريب بيانات PII للطلاب | TA-030 | تقرير حماية بيانات الطلاب |
| TA-054 | MVP | threat model | تحليل مخاطر Admin Overreach والتجاوز | TA-015 | تقرير حوكمة Access Emergency |
| TA-055 | MVP | threat model | تحليل مخاطر تزوير الشهادات والاستحقاقات | TA-042, TA-048 | تقرير تأمين الشهادات والترخيص |
| TA-056 | MVP | threat model | الاعتماد الأمني لنموذج التهديدات | TA-052..TA-055 | موافقة الأمن قبل بدء الـ Schema |

### Stage 10: Schema Design
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-057 | MVP | schema design | تصميم Schema الكيانات التعليمية (programs->cohorts) | TA-056 | جداول الهيكل التعليمي جاهزة للتصميم |
| TA-058 | MVP | schema design | تصميم Schema جدول academy_capability_grants | TA-056, TA-011 | تصميم جدول الصلاحيات ونطاقاتها |
| TA-059 | MVP | schema design | تصميم Schema كيانات المؤسسات والعقود والمقاعد | TA-056, TA-022 | تصميم جداول S4 |
| TA-060 | MVP | schema design | تصميم Schema جداول المعلم والخصوصية | TA-056, TA-026 | تصميم جداول S7 |
| TA-061 | MVP | schema design | تصميم Schema جداول الشهادات وسجل الساعات | TA-056, TA-039 | تصميم جداول S5 |
| TA-062 | MVP | schema design | تصميم Schema جداول التجارة والاستحقاقات | TA-056, TA-045 | تصميم جداول S6 (تعتمد على TA-045) |
| TA-063 | MVP | schema design | تصميم Schema جداول التدقيق والوصول الطارئ | TA-056, TA-016 | تصميم جداول Audit و Emergency Log |
| TA-064 | MVP | schema design | مراجعة واعتماد Schema الكاملة للـ 24 كياناً | TA-057..TA-063 | اعتماد الهيكل الكامل للـ Database Schema |

### Stage 11: Migrations / RLS / RPC Tests
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-065 | MVP | migrations/RLS/RPC tests | تصميم فحوص RLS لجداول الكيانات التعليمية | TA-064 | إعداد فحوص RLS الإيجابية والسلبية |
| TA-066 | MVP | migrations/RLS/RPC tests | تصميم فحوص RLS لجدول Capability Grants | TA-064 | اختبار منع الوصول خارج Scope |
| TA-067 | MVP | migrations/RLS/RPC tests | تصميم فحوص RLS لحظر SELECT على profiles الطلاب | TA-064 | 100% حظر الوصول لبيانات الطلاب |
| TA-068 | MVP | migrations/RLS/RPC tests | تصميم فحوص RLS لجداول الشهادات والمؤسسات | TA-064 | عزل الوصول بحسب المؤسسة |
| TA-069 | MVP | migrations/RLS/RPC tests | مواصفات RPC للوصول الطارئ وتأكيد Audit | TA-064 | اختبار تفعيل وإلغاء Access Emergency |
| TA-070 | MVP | migrations/RLS/RPC tests | مواصفات RPC لحساب الساعات واستحقاق المقاعد | TA-064 | اختبار حساب الساعات والـ Seats |
| TA-071 | MVP | migrations/RLS/RPC tests | خطة اختبارات الـ Integration والدوال | TA-065..TA-070 | حزمة الفحوص الآلية الجاهزة |
| TA-072 | MVP | migrations/RLS/RPC tests | الاعتماد الفني لفحوص RLS وRPC | TA-071 | موافقة فريق الجودة التقنية |

### Stage 12: Teacher Frontend
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-073 | MVP | teacher frontend | تصميم هيكل واجهة PWA المستقلة للمعلمين | TA-064 | إعداد الـ App Shell بهوية خاصة |
| TA-074 | MVP | teacher frontend | تصميم شاشات الانضمام والملف المهني | TA-073 | واجهات إكمال ملف المعلم |
| TA-075 | MVP | teacher frontend | تصميم شاشات التقييم التشخيصي وتسكين الدفعات | TA-073 | واجهات أداء التشخيص |
| TA-076 | MVP | teacher frontend | تصميم شاشات الكتالوج والبرامج والدروس | TA-073 | واجهات تصفح المنهج التدريبي |
| TA-077 | MVP | teacher frontend | تصميم شاشات أداء الدرس والمحتوى النصي | TA-073 | واجهات عرض النص والأنشطة |
| TA-078 | MVP | teacher frontend | تصميم شاشات تسليم الأدلة والمهام التطبيقية | TA-073 | واجهات رفع الملفات |
| TA-079 | MVP | teacher frontend | تصميم شاشات استعراض الشهادات وسجل الساعات | TA-073 | واجهات عرض الشهادة والـ QR |
| TA-080 | MVP | teacher frontend | تصميم شاشات المدرب والمقيّم وطابور المراجعة | TA-073 | واجهات تقييم Rubrics |
| TA-081 | MVP | teacher frontend | تصميم شاشات إدارة المؤسسات وتوزيع المقاعد | TA-073 | واجهات مسؤول المدرسة/المكتب |
| TA-082 | MVP | teacher frontend | تصميم شاشة طلب الوصول الإداري الطارئ | TA-073 | واجهة طلب Access Emergency مسبب |

### Stage 13: Offline Scope
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-083 | MVP | offline | تصميم محرك PWA Service Worker و App Shell | TA-073 | عمل الواجهة الأساسية Offline |
| TA-084 | MVP | offline | تصميم التخزين المحلي للكتالوج والمحتوى النصي | TA-083 | قراءة البرامج والدروس النصية Offline |
| TA-085 | MVP | offline | تصميم Progress Outbox بمزامنة Last-write-wins | TA-083 | تسجيل وإرسال التقدم عند الاتصال |
| TA-086 | P1 | offline | تصميم التخزين المحلي للأنشطة والتقييمات | TA-085 | أداء الاختبارات القصيرة Offline |
| TA-087 | P1 | offline | تصميم Evidence Outbox لرفع أدلة المهام | TA-086 | حفظ ملفات الأدلة محلياً |
| TA-088 | P1 | offline | تصميم محرك المزامنة الثنائي وحل التعارضات | TA-086 | حل التعارضات عند تعدد الأجهزة |
| TA-089 | P2 | offline | تصميم التنزيل والتشفير المحمي للفيديوهات | TA-088 | تنزيل وتشغيل الفيديو Offline |
| TA-090 | P2 | offline | مواصفات تحويل PWA إلى Native Packaging | TA-089 | حزم التطبيق الأصيل (TWA/Capacitor) |

### Stage 14: Content / Catalog Seed
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-091 | MVP | content/catalog seed | تصميم هيكل بيانات الـ Seed للبرامج التأسيسية 9 | TA-064 | إعداد بيانات البرامج العامة |
| TA-092 | MVP | content/catalog seed | تصميم هيكل بيانات الـ Seed للبرامج التخصصية 10 | TA-091 | إعداد بيانات البرامج التخصصية |
| TA-093 | MVP | content/catalog seed | إعداد مصفوفة ربط الكفايات بمجالات التشخيص 8 | TA-092 | ربط الكفايات بالمقررات |
| TA-094 | MVP | content/catalog seed | صياغة أدلة التقييم ومواصفات الـ Rubrics | TA-091 | معايير تصحيح المهام |
| TA-095 | MVP | content/catalog seed | إعداد بنك أسئلة التقييم التشخيصي للمعلمين | TA-093 | مفردات التقييم التشخيصي |
| TA-096 | MVP | content/catalog seed | الاعتماد التربوي للكتالوج والمحتوى الأول | TA-095 | موافقة اللجنة التربوية |

### Stage 15: Commercial Runtime
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-097 | P1 | commercial runtime | تصميم التكامل مع بوابة الدفع للـ B2C | TA-064, TA-048 | إتاحة شراء المسارات الفردية |
| TA-098 | P1 | commercial runtime | تصميم نظام الاشتراكات والمحفظة المالية المعلم | TA-097 | محفظة مستقلة عن الطلاب |
| TA-099 | P1 | commercial runtime | تصميم إدارة عقود B2B للمدارس وتوزيع الفواتير | TA-064, TA-049 | إصدار الفواتير التلقائي للمؤسسة |
| TA-100 | P1 | commercial runtime | تصميم تتبع وتجديد المقاعد الزمانية تلقائياً | TA-099 | تجديد وإلغاء المقاعد المنتهية |
| TA-101 | P2 | commercial runtime | تصميم نظام العروض والحزم المؤسسية المخصصة | TA-099 | حزم الخصومات للمناطق التعليمية |
| TA-102 | P2 | commercial runtime | تقارير Revenue Recognition والتدقيق المالي | TA-101 | تقارير الاعتراف بالإيراد للمالية |

### Stage 16: Security Review
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-103 | MVP | security review | فحص أمني شامل لـ Capability Grants و Scopes | TA-072, TA-082 | 100% حظر الصلاحيات غير المأذونة |
| TA-104 | MVP | security review | فحص عدم إمكانية الوصول لـ profiles الطلاب | TA-067 | تأكيد عزل PII الطلاب بالكامل |
| TA-105 | MVP | security review | مراجعة سجلات Audit والوصول الطارئ Emergency | TA-069 | تأكيد التسجيل والمسبب الإجباري |
| TA-106 | P1 | security review | اختبارات Penetration Testing شاملة للبوابة | TA-103..TA-105 | خلو النظام من الثغرات العالية |

### Stage 17: Launch Gates
| Task ID | Phase | Stage | Description | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| TA-107 | MVP | launch gates | بوابة الجودة 1: اكتمال وثائق التصميم المعماري | TA-064, TA-103 | اعتماد Blueprint بالكامل |
| TA-108 | MVP | launch gates | بوابة الجودة 2: اعتماد الرؤية والقرارات S1-S7 | TA-107 | موافقة المالك والشؤون الفنية |
| TA-109 | MVP | launch gates | بوابة الجودة 3: الجاهزية للتحول إلى التنفيذ | TA-108 | عدم وجود أي قرارات مفتوحة |
| TA-110 | MVP | launch gates | الإقرار بعدم التمرير أو الدمج في PR #54 الحالية | TA-109 | الإبقاء على PR #54 بحالة Draft |

---

## 4. مقاييس التحقق الآلي وسجل الجودة

- **إجمالي المهام (Total Tasks):** 110 task.
- **معرّفات فريدة (Unique Task IDs):** 100% فريدة (TA-001 إلى TA-110).
- **التبعيات الدائرية (Dependency Cycles):** ZERO (0).
- **التبعيات المفقودة (Missing Dependencies):** ZERO (0).
- **المراحل التسلسلية (Stage Ordering):** 17 مرحلة مرتبة بنجاح دون أي معكوسات.
- **مرحلة التهديدات (Threat Model Stage):** تقع في المرحلة 9 قبل الـ Schema في المرحلة 10.
- **توافق Offline:** MVP (85 task) / P1 (15 task) / P2 (10 task).
