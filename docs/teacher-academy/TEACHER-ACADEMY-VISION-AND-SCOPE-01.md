# TEACHER-ACADEMY-VISION-AND-SCOPE-01 — رؤية ونطاق «أكاديمية معلم الثانوية»

تعريف الرؤية والنطاق والقرارات المعتمدة وسجل القرارات الموحد لمنظومة «أكاديمية معلم الثانوية» (Teacher Academy) — المرجع الأساسي للحزمة الاستراتيجية.

| حقل | قيمة |
|---|---|
| اسم الوثيقة | Teacher Academy — Vision, Scope, Approved Decisions & Traceability Matrix |
| معرّف الوثيقة | TEACHER-ACADEMY-VISION-AND-SCOPE-01 |
| التاريخ | 2026-08-03 |
| الحالة | **DRAFT — CANONICAL BLUEPRINT UPDATE 03** |
| النطاق | تحليل وتصميم فقط — لا كود ولا SQL ولا Migrations |

---

## 1. الرؤية والأهداف الاستراتيجية

### 1.1 الرؤية
تمكين معلمي المرحلة الثانوية في المملكة العربية السعودية من التميز المهني المستدام وتطوير مهاراتهم التدريسية والتخصصية عبر بوابة تعليمية مستقلة ومخصصة (Teacher Academy PWA)، مدمجة مفهوماً ومتكاملة قرائياً مع منظومة مناهج وبنك أسئلة «تسهيل»، ومصممة لدعم التأهيل التخصصي والترخيص المهني والتعلم الموجه بالتشخيص الذاتي والمؤسسي.

### 1.2 لماذا الآن — العلاقة بمنظومة طلاب الثانوية
1. **الارتقاء بالبنية الموحدة:** المناهج والمواد والدروس وبنك الأسئلة القائمة هي الأساس المرجعي للمحتوى التدريبي ومواد الأمثلة، مما يمنع ازدواجية الإنتاج وتشتت المفاهيم.
2. **عزل الصلاحيات:** استقلال صلاحيات أكاديمية المعلم تماماً عن صلاحيات إدارة وبنك أسئلة الطلاب، حيث لا تُمنح أي صلاحية طلابية تلقائياً لأي دور تدريبي.
3. **فصل الواجهات:** تطبيق الطلاب واجهة مستقلة مخصصة للتعلم والتقييم الطلابي، بينما تعمل بوابة المعلمين عبر PWA مستقل بهوية وتجربة مهنية مخصصة.
4. **النمو المؤسسي B2B/B2G:** فتح قناة شراكة مؤسسية موازية للمدارس ومكاتب التعليم والإدارات التعليمية عبر عقود ترخيص ومقاعد تدريبية محددة.

### 1.3 الأهداف الاستراتيجية (قابلة للقياس)
| # | الهدف | مؤشر قياس مقترح |
|---|---|---|
| G1 | رفع جاهزية المعلمين لتوظيف المنصة في التدريس | نسبة إتمام المسار التأسيسي، تحسّن درجات التقييم القبلي والبعدي |
| G2 | بناء خط إنتاج تدريبي داخلي ومؤسسي | عدد المدربين والمقيّمين النشطين، زمن دورة مراجعة المهام |
| G3 | إصدار شهادات مهنية موثوقة قابلة للتحقق | عدد الشهادات الصادرة، نسبة التحقق الخارجي الناجح عبر Verifier |
| G4 | التوسع المؤسسي للمدارس والمناطق | عدد العقود المؤسسية وتغطية المقاعد للمعلمين في المدارس |
| G5 | الحفاظ التام على استقرار منظومة الطلاب | صفر حوادث تداخل صلاحيات، صفر تسريب لبيانات الطلاب الشخصية |

### 1.4 مبادئ التصميم الثابتة
1. **عزل الصلاحيات القائم على Capabilities:** اعتماد جدول cademy_capability_grants مع نطاقات محددة (Scoped Assignments) دون توسيع enum pp_role الخاص بالطلاب.
2. **التحقق العام من الشهادة بلا حساب:** إتاحة التحقق العام عبر رمز QR أو رابط مباشر دون الحاجة لتسجيل الدخول، وبلا كشف لبيانات الطالب أو البيانات الشخصية الحساسة.
3. **التصميم التراكمي للـ PWA:** البدء بـ PWA مرن مع استراتيجية ترحيل واضحة للتطبيق الأصيل (Native) في مرحلة P2 عند تحقق المحفزات.
4. **عربي أولاً ومجمل RTL:** تصميم الواجهات والمحتوى والتقارير والشهادات باللغة العربية أولاً وبدعم RTL كامل.

---

## 2. نطاق العمل

### 2.1 داخل النطاق (In Scope)
| # | البند | الوصف والنطاق |
|---|---|---|
| S1 | بوابة معلمين مستقلة (PWA) | واجهة مستقلة تماماً بهوية وتجربة مخصصة للمعلمين والمدربين والإداريين |
| S2 | الهيكل التعليمي المعتمد (S1) | إدارة البرامج التدريبية وإصداراتها والمقررات والوحدات والدروس والدفعات (cademy_programs -> cademy_cohorts) |
| S3 | تتبع التقدم والتعلم | تسجيل التقدم التدريبي في كل درس ووحدة واختبار ومهمة |
| S4 | التقييمات والتشخيص | تشخيص الكفايات، الاختبارات القصيرة، والتقييمات النهائية والمهام التطبيقية |
| S5 | الشهادات وسجل الساعات (S5) | إصدار الشهادات المستقلة cademy_certificates وسجل الساعات المهنية professional_hours_ledger |
| S6 | إدارة المؤسسات والعقود (S4) | إدارة المدارس والمكاتب organizations والمظلات المؤسسية والعقود الزمانية والمقاعد contract_seats |
| S7 | محرك التجارة والاستحقاقات (S6) | إدارة المنتجات والأوامر والاستحقاقات entitlements والفواتير المستقلة عن اشتراكات الطلاب |
| S8 | عزل الخصوصية والهوية (S7) | حساب Auth مشترك بحسابات معلمين مستقلة 	eacher_profiles دون SELECT عام على جداول الطلاب |
| S9 | حوكمة الصلاحيات (S2 & S3) | منح الصلاحيات المؤطرة cademy_capability_grants وآلية الوصول الطارئ المؤقت المسببة والمؤرخة |
| S10| العمل Offline الموحد | دعم النمط غير المتصل وفق مستويات MVP وP1 وP2 المحددة صراحة |

### 2.2 خارج النطاق (Out of Scope) — صراحة
| # | البند | التبرير |
|---|---|---|
| O1 | أي تعديل على واجهة أو صلاحيات الطلاب | الواجهتان منفصلتان صراحة لضمان الاستقرار (G5) |
| O2 | توسيع enum pp_role الخاص بالطلاب | عزل الصلاحيات يمنع pollute الأدوار الطلابية |
| O3 | تطبيق Native في MVP | الاعتماد على PWA أولاً؛ التطبيق الأصيل مؤجَّل لـ P2 عند تحقق المحفزات |
| O4 | تحكيم صلاحيات حساس بناءً على اسم الدور | الاعتماد حصراً على Capability Grants المؤطرة |
| O5 | أي Admin bypass شامل أو دائم | منع platform_admin أو 	a_admin من التجاوز الشامل المباشر |
| O6 | قراءة أو كتابة جداول الاشتراكات والدوائر المالية للطلاب | التجارة مستقبلاً عبر محرك استحقاقات مستقل للأكاديمية |
| O7 | قراءة PII للطلاب من قبل بوابة المعلمين | حظر SELECT العام على جداول profiles للطلاب |
| O8 | تنفيذ runtime code أو migrations أو SQL | الحزمة الحالية تصميم واستراتيجية فقط |
| O9 | الاعتماد على أسماء التاكسونومي القديمة | حذف 	a_paths و 	a_modules و 	a_lessons نهائياً |

---

## 3. القرارات المعتمدة (S1–S7 & AD1–AD4)

القرارات الـ 11 التالية معتمدة نهائياً وحاكمة لجميع وثائق الأكاديمية:

| المعرّف | اسم القرار | تفاصيل القرار المعتمد |
|---|---|---|
| **S1** | النموذج التعليمي القياسي | اعتماد التسلسل الهرمي: cademy_programs -> cademy_program_versions -> cademy_courses -> cademy_modules -> cademy_lessons -> cademy_cohorts. |
| **S2** | حوكمة الصلاحيات | منح الصلاحيات عبر جدول cademy_capability_grants بنطاقات محددة (Scoped Assignments)، مع حظر توسيع pp_role. |
| **S3** | حدود الإدارة والوصول الطارئ | إلغاء Admin bypass الشامل؛ الوصول الإداري الطارئ مؤقت، مسبب صراحة، مؤرخ، ومسجل بالكامل في سجل Audit. |
| **S4** | إدارة المؤسسات والعقود | هيكلة المؤسسات عبر organizations و organization_memberships و organization_relationships و organization_contracts و contract_seats. |
| **S5** | استراتيجية الشهادات المستقلة | عزل شهادات الأكاديمية عبر cademy_certificates و cademy_certificate_events و professional_hours_ledger بعيداً عن جداول الطلاب. |
| **S6** | محرك التجارة والاستحقاقات | إدارة المنتجات عبر products و orders و entitlements و invoices و contracts بمعزل تام عن اشتراكات ومحافظ الطلاب. |
| **S7** | الهوية والخصوصية الصارمة | استخدام Auth Account مشترك مع فصل البيانات في 	eacher_profiles و 	eacher_subject_assignments و 	eacher_organization_memberships وحظر SELECT العام على profiles الطلاب. |
| **AD1** | فصل الواجهات (Two Frontends) | واجهة الطلاب وواجهة المعلمين تطبيقان منفصلان تماماً. |
| **AD2** | Backend مشترك | قاعدة بيانات مشتركة مع عزل منطقي وسياسات RLS صارمة. |
| **AD3** | استقلال نطاق التدريب | لا وراثة أو تقاطع بين صلاحيات بنك أسئلة الطلاب وأكاديمية المعلمين. |
| **AD4** | PWA أولاً | البدء بـ PWA وتأجيل التطبيق الأصيل لمرحلة P2. |

---

## 4. تحليل المستخدمين وحوكمة الصلاحيات (الأدوار العشرة)

تُدار كل التفاعلات عبر Capability Grants المؤطرة:

| # | الدور المفهومي | Capability Grants المقترنة | النطاق المسموح (Scoped Assignment) |
|---|---|---|---|
| 1 | المعلم المتدرب (Teacher Trainee) | program.enroll, lesson.read, assessment.submit, certificate.view | الدفعة (cohort_id) المسجل بها |
| 2 | المعلم الممارس (Teacher) | program.browse, diagnostic.take, portfolio.manage | الحساب الفردي وتعيينات المواد |
| 3 | المدرب (Trainer) | cohort.lead, content.author_draft, discussion.moderate | الدفعة (cohort_id) المكلّف بها |
| 4 | المقيّم (Assessor / Reviewer) | submission.grade, rubric.evaluate, feedback.write | النطاق المحدد للمهام الموكلة |
| 5 | المرشد (Mentor) | trainee.progress_read, feedback.provide | المجموعة أو الدفعة المستهدفة |
| 6 | مدير البرنامج (Program Manager) | program_version.manage, cohort.create, trainer.assign | البرنامج أو إصداره (program_version_id) |
| 7 | مسؤول تدريب المدرسة (School Admin) | org.members_read, org.seat_assign, org.reports_view | المؤسسة (organization_id) الخاصة بمدرسته |
| 8 | مسؤول مكتب التعليم (District Admin) | district.reports_view, district.orgs_monitor | المؤسسة الأب والمؤسسات التابعة |
| 9 | مسؤول النظام (System Admin) | emergency.access_request, audit.view, system.configure | مسبّب بالكامل ولفترة زمنية محدودة جداً |
| 10| المتحقق من الشهادة (Verifier) | certificate.public_verify | عام (Public) عبر الرمز أو QR فقط |

---

## 5. عوامل النجاح والمخاطر

### 5.1 عوامل النجاح الحرجة
1. **الالتزام الكامل بقرارات S1–S7:** منع أي انحراف عن الهيكل أو الصلاحيات أو محرك الاستحقاقات.
2. **العزل التام لبيانات الطلاب:** حماية الخصوصية ومنع أي استعلام عام عن profiles الطلاب من واجهة الأكاديمية.
3. **جودة المحتوى التدريبي:** تقديم مسارات تخصصية وعامة ذات قيمة مضافة عالية للمعلمين.

### 5.2 المخاطر ومعالجتها
- **مخاطرة تداخل الصلاحيات:** تُعالج بحظر app_role وتفعيل academy_capability_grants.
- **مخاطرة Over-privilege الإدارية:** تُعالج بإلغاء Admin bypass وتفعيل Emergency Access المؤقت المسبب.
- **مخاطرة التعارض عند العمل Offline:** تُعالج بتحديد نطاق MVP بدقة (text, catalog, outbox) وتأجيل حل التعارض المتقدم لـ P1.

---

## 6. سجل القرارات الموحد وسلسلة التتبع (64-Point Traceability Matrix)

يربط هذا الجدول جميع نقاط القرار والافتراضات الـ 64 الأصلية في الوثائق بالقرارات الـ 21 المعتمدة (S1–S7, AD1–AD4, OD-1–OD-10):

| الرقم الأصلي | النطاق / الوثيقة الأصلية | نقطة القرار / الافتراض الأصلي | القرار المعتمد الموحد | فئة القرار |
|---|---|---|---|---|
| DEC-01 | Vision & Scope | تسلسل الهرم التعليمي للمسارات | **S1** (academy_programs -> cohorts) | Consolidated |
| DEC-02 | Vision & Scope | آلية منح صلاحيات التدريب | **S2** (academy_capability_grants) | Consolidated |
| DEC-03 | Vision & Scope | صلاحيات المسؤولين وتجاوز Admin | **S3** (Emergency Access Only) | Consolidated |
| DEC-04 | Vision & Scope | نمذجة المدارس ومكاتب التعليم | **S4** (organizations & contracts) | Consolidated |
| DEC-05 | Vision & Scope | هيكلة الشهادات وساعات التدريب | **S5** (academy_certificates & hours) | Consolidated |
| DEC-06 | Vision & Scope | نموذج التجارة والمنتجات | **S6** (products, orders & entitlements) | Consolidated |
| DEC-07 | Vision & Scope | حساب المعلم وخصوصية بيانات الطلاب | **S7** (teacher_profiles & Auth shared) | Consolidated |
| DEC-08 | Vision & Scope | تفكيك واجهة الطلاب عن المعلمين | **AD1** (Two Separate Frontends) | Consolidated |
| DEC-09 | Vision & Scope | توحيد Backend والمناهج | **AD2** (Shared Backend) | Consolidated |
| DEC-10 | Vision & Scope | استقلال صلاحيات بنك الأسئلة عن TA | **AD3** (Domain Independence) | Consolidated |
| DEC-11 | Vision & Scope | تقنية الواجهة الأولى | **AD4** (PWA First) | Consolidated |
| DEC-12 | Vision & Scope | النموذج التجاري النهائي | **OD-1** (B2B Free / Paid / Hybrid) | Business |
| DEC-13 | Vision & Scope | الاعتماد المهني الخارجي | **OD-2** (Professional Licensing) | Deferred |
| DEC-14 | Vision & Scope | مزود البريد المعاملاتي | **OD-3** (Email Provider & Budget) | Pre-runtime |
| DEC-15 | Vision & Scope | مزود رسائل SMS وسياسة PII | **OD-4** (SMS Provider Policy) | Deferred |
| DEC-16 | Product Requirements | نمذجة المسار التعليمي | **S1** (academy_programs -> cohorts) | Consolidated |
| DEC-17 | Product Requirements | هيكل البرامج وإصداراتها | **S1** (academy_program_versions) | Consolidated |
| DEC-18 | Product Requirements | تقسيم المقررات والوحدات | **S1** (academy_courses & modules) | Consolidated |
| DEC-19 | Product Requirements | تعريف دروس الأكاديمية | **S1** (academy_lessons) | Consolidated |
| DEC-20 | Product Requirements | إدارة الدفعات التدريبية | **S1** (academy_cohorts) | Consolidated |
| DEC-21 | Product Requirements | حوكمة Capability Grants | **S2** (Scoped Capability Grants) | Consolidated |
| DEC-22 | Product Requirements | منع توسيع enum app_role | **S2** (No app_role expansion) | Consolidated |
| DEC-23 | Product Requirements | حظر Admin blanket bypass | **S3** (Zero Blanket Bypass) | Consolidated |
| DEC-24 | Product Requirements | بروتوكول الوصول الإداري الطارئ | **S3** (Temporary Emergency Access) | Consolidated |
| DEC-25 | Product Requirements | سجل Audit لإجراءات Admin | **S3** (Mandatory Audit Log) | Consolidated |
| DEC-26 | Product Requirements | إدارة المؤسسات التدريبية | **S4** (organizations) | Consolidated |
| DEC-27 | Product Requirements | العضويات الزمنية للمؤسسة | **S4** (organization_memberships) | Consolidated |
| DEC-28 | Product Requirements | عقود ترخيص المؤسسات | **S4** (organization_contracts) | Consolidated |
| DEC-29 | Product Requirements | توزيع وإعادة مقاعد التدريب | **S4** (contract_seats) | Consolidated |
| DEC-30 | Product Requirements | عزل جداول شهادات المعلمين | **S5** (academy_certificates) | Consolidated |
| DEC-31 | Product Requirements | تسجيل أحداث الشهادات | **S5** (academy_certificate_events) | Consolidated |
| DEC-32 | Product Requirements | دفتر التطوير المهني للساعات | **S5** (professional_hours_ledger) | Consolidated |
| DEC-33 | Product Requirements | تحديد منتجات الأكاديمية | **S6** (products & orders) | Consolidated |
| DEC-34 | Product Requirements | محرك الاستحقاقات التجارية | **S6** (entitlements & invoices) | Consolidated |
| DEC-35 | Product Requirements | عزل اشتراكات المعلمين عن الطلاب | **S6** (Decoupled Commerce Engine) | Consolidated |
| DEC-36 | Product Requirements | الملف المهني للمعلم | **S7** (teacher_profiles) | Consolidated |
| DEC-37 | Product Requirements | إسناد التخصصات والمواد للمعلم | **S7** (teacher_subject_assignments) | Consolidated |
| DEC-38 | Product Requirements | حظر SELECT العام على profiles الطلاب | **S7** (Strict Student PII Isolation) | Consolidated |
| DEC-39 | Training Catalog | هيكلة المسارات العامة والتربوية | **S1** (academy_programs & versions) | Consolidated |
| DEC-40 | Training Catalog | هيكلة المسارات التخصصية لمواد الثانوية | **S1** (10 Subject Programs) | Consolidated |
| DEC-41 | Training Catalog | ربط الكفايات بمجالات التشخيص الـ 8 | **S1** (Diagnostic Mapping Matrix) | Consolidated |
| DEC-42 | Training Catalog | إزالة تاكسونومي ta_paths القديمة | **S1** (Deprecate ta_paths/modules) | Consolidated |
| DEC-43 | Architecture & Roles | تصميم RLS وسياق Capability Grants | **S2** (RLS & Scoped Grants) | Pre-schema |
| DEC-44 | Architecture & Roles | آلية الإدارة المؤقتة ومبررات الاستثناء | **S3** (Emergency Access Protocol) | Pre-schema |
| DEC-45 | Architecture & Roles | النموذج المفهومي للبيانات (24 كيان) | **S1–S7** (Canonical Domain Model) | Consolidated |
| DEC-46 | Architecture & Roles | مصفوفة الصلاحيات الموحدة | **S2** (Unified Capability Matrix) | Consolidated |
| DEC-47 | Architecture & Roles | نموذج التهديدات والمخاطر الأمنية | **Stage 9** (Threat Model BEFORE Schema)| Pre-schema |
| DEC-48 | Architecture & Roles | بروتوكول المزامنة والعمل Offline | **MVP/P1/P2** (Unified Sync Matrix) | Consolidated |
| DEC-49 | UX Flows | رحلة الانضمام والملف المهني | **S7** (Teacher Onboarding & Privacy) | Consolidated |
| DEC-50 | UX Flows | رحلة التشخيص وإسناد الدفعات | **S1** (Diagnostic & Cohort Flow) | Consolidated |
| DEC-51 | UX Flows | رحلة التعلم عبر البرامج والدروس | **S1** (Learning Journey) | Consolidated |
| DEC-52 | UX Flows | رحلة تسليم الأدلة والتقييم | **S2** (Assessor Rubric Evaluation) | Consolidated |
| DEC-53 | UX Flows | رحلة اصدار الشهادات والتحقق العام | **S5** (Certificate Verification) | Consolidated |
| DEC-54 | UX Flows | رحلات الإدارة والطلب الطارئ | **S3** (Emergency Access UX Flow) | Consolidated |
| DEC-55 | Business Model | نماذج الإيرادات المؤسسية (B2B) | **S6** (B2B Organization Licensing) | Business |
| DEC-56 | Business Model | تسعير المقاعد والاشتراكات | **S6** (Contract Seats & Pricing) | Business |
| DEC-57 | Business Model | عدم المساس بمحافظ الطلاب | **S6** (Zero Student Wallet Impact) | Consolidated |
| DEC-58 | Implementation Backlog| ترتيب مراحل التنفيذ (17 مرحلة) | **Backlog Re-ordered** (17 Stages) | Consolidated |
| DEC-59 | Implementation Backlog| إزالة التبعية الدائرية TA-045 <-> TA-063 | **Cycle Resolved** (TA-045 -> TA-063) | Consolidated |
| DEC-60 | Implementation Backlog| تقديم نموذج التهديدات على Schema | **Stage 9 BEFORE Stage 10** | Consolidated |
| DEC-61 | Implementation Backlog| نطاق MVP لـ Offline | **MVP**: Shell, Catalog, Text, Outbox | Consolidated |
| DEC-62 | Implementation Backlog| نطاق P1 لـ Offline | **P1**: Activities, Evidence, Conflict | Consolidated |
| DEC-63 | Implementation Backlog| نطاق P2 لـ Offline | **P2**: Encrypted Video, Native App | Consolidated |
| DEC-64 | Implementation Backlog| حظر العمل التنفيذي في PR #54 | **Design Only** (Zero Code / Migrations) | Consolidated |

---

## 7. الخطوات التالية المقترحة

1. اعتماد هذا التحديث المرجعي الشامل للحزمة التصميمية في PR #54.
2. إجراء المراجعة المستقلة للوثائق السبع للتأكد من الاتساق التام خلو الكود من التناقضات.
3. الإبقاء على PR #54 بحالة **Draft** وعدم دمجه أو بدء أي تنفيذ برمجي قبل الاعتماد النهائي.
