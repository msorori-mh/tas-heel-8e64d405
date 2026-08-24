# أكاديمية معلم الثانوية — عقد الاحتفاظ بالبيانات والتدقيق وعمليات الدعم (Stage 14)

| الحقل | القيمة |
|---|---|
| المعرّف | `TEACHER_ACADEMY_MVP_DATA_RETENTION_AUDIT_AND_SUPPORT_OPERATIONS_CONTRACT_14` |
| الحالة | `PASS_DESIGN_CONTINUATION_ONLY` |
| الأساس | Stage 09 Threat Model + Stage 11 UX Release Contract + Stage 12 Screen/Role Acceptance Matrix + Stage 13 Implementation Waves |
| النطاق | Retention / Audit / Support Operations / Privacy-by-scope / Incident workflow |
| Schema / Migration / Production write / Deploy | **ممنوع** |
| تكامل بنك أسئلة الطلاب | **DISABLED** حتى إثبات الإغلاق المستقل النهائي Runtime/Cutover |

## 1. قرار البوابة الحالي

آخر حالة موثقة للمشروع الطلابي لا تفتح بوابة برمجة الأكاديمية بعد:

```text
QUESTION_BANK_IMPORT_FOUNDATION=PASS_STRONG
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=NOT_PROVEN
IMPORT_CONTRACT=PASS_STRONG_WITH_LIFECYCLE_CHANGE_REVIEW_REQUIRED
CURRICULUM_CONTENT_STRUCTURE=PASS_STRONG
ACADEMY_ROLES_CAPABILITIES=PASS_DESIGN_FROZEN
ACADEMY_COMMERCE_SUBSCRIPTIONS=PASS_DESIGN_FROZEN
ACADEMY_CERTIFICATES=PASS_DESIGN_FROZEN
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
```

التغيير الأخير في تطبيق الطلاب جعل الاستيراد والنشر يتمان بضغطة واحدة، مع تنفيذ سلسلة الاعتماد والنشر إلى READY خادميًا. هذا لا يثبت فشل العقد، لكنه تغيير جوهري في دلالة دورة حياة المحتوى ويجب أن يمر بمراجعة مستقلة قبل اعتباره جزءًا من بوابة الأمان التي تعتمد عليها الأكاديمية.

بناءً عليه تستمر أعمال التصميم فقط، ولا يبدأ Backend أو Schema أو Migration للأكاديمية.

## 2. مبدأ الملكية والعزل

- `auth.users` هوية مشتركة فقط عند الحاجة.
- بيانات الأكاديمية لا تُخزن داخل جداول الطالب أو ملفات الطالب.
- لا يستمد أي Role/Capability للأكاديمية من `student app_role`.
- لا يملك Support أو Trainer أو Organization Manager حق قراءة PII الطالب بسبب دور أكاديمي.
- لا تستخدم الأكاديمية Wallet أو Subscription أو Certificate الخاصة بتطبيق الطالب.
- أي تكامل لاحق مع محتوى الطالب أو بنك الأسئلة يكون Read-only على Published Version/Revision مثبت الهوية.

## 3. تصنيف البيانات للـMVP

### A — Identity reference

الحد الأدنى المسموح:

- `auth_user_id`
- معرف Academy profile داخلي
- حالة الحساب الأكاديمي

غير المسموح افتراضيًا:

- نسخ كامل لملف الطالب
- خدمات الطالب
- درجات الطالب
- سجل حضور الطالب
- بيانات ولي الأمر

### B — Academy profile

يشمل فقط ما يلزم لتجربة المعلم:

- الاسم العرضي
- البريد/الهاتف عند الحاجة التشغيلية
- المحافظة/الجهة التعليمية إن كانت مطلوبة للبرنامج
- التخصص/المادة/المرحلة
- تفضيلات إشعار الأكاديمية

### C — Learning records

- enrollment
- pinned program version
- progress
- submissions
- rubric evidence
- completion evidence
- certificate lifecycle

هذه سجلات تاريخية ولا تحذف لمجرد انتهاء entitlement.

### D — Commerce records

- products
- orders
- invoices
- contracts
- seats
- entitlements

يجب الاحتفاظ بمرجع مالي/تعاقدي وتدقيق مناسب دون كشفه لأدوار تعليمية لا تحتاجه.

### E — Audit/security records

- capability grant/revoke
- sensitive support access
- certificate issue/revoke
- contract/seat changes
- entitlement mutations
- emergency access
- failed authorization attempts ذات القيمة الأمنية

## 4. سياسة الاحتفاظ — Design Baseline

هذه مدد تصميمية وليست سياسة قانونية نهائية؛ يجب مواءمتها مع المتطلبات النظامية قبل الإنتاج.

| الفئة | baseline | سلوك الانتهاء |
|---|---|---|
| Academy profile | طوال عمر الحساب + فترة إغلاق | حذف/إخفاء حسب policy مع إبقاء مراجع audit الضرورية |
| Enrollment/Progress | طويل الأجل | لا يحذف بانتهاء الاشتراك |
| Assessment evidence | طويل الأجل للشهادات | يبقى قابلًا لإثبات الشهادة |
| Certificates | طويل الأجل | revoke بدلاً من الحذف الصامت |
| Contracts/Invoices | حسب متطلبات المحاسبة/العقد | archive/read-restricted |
| Entitlements | تاريخي | status expiration/revoke بدل حذف التاريخ |
| Audit logs الحساسة | مدة محددة بالسياسة | append-only ثم archival/purge مضبوط |
| Temporary support access | قصير جدًا | expires automatically + audit |
| Offline sync payloads | أقصر مدة ممكنة | purge بعد ack/reconciliation |

## 5. قواعد الحذف والتعطيل

- حذف البرنامج المنشور لا يمحو تسجيلات أو شهادات سابقة؛ يستخدم `DEPRECATED/ARCHIVED`.
- إلغاء entitlement يمنع الوصول المستقبلي وفق السياسة ولا يحذف التقدم.
- سحب مقعد مؤسسي لا يمحو السجل التاريخي.
- إلغاء عضوية مؤسسة لا يمنح Support حق تجاوز تاريخ العضوية.
- إغلاق حساب المستخدم يجب أن يعالج PII بصورة منفصلة عن evidence والعقود التي يلزم الاحتفاظ بها.
- لا `ON DELETE CASCADE` عبر حدود Student ↔ Academy.
- لا `ON DELETE CASCADE` من Product/Contract إلى Learning Evidence أو Certificates.

## 6. Audit contract

كل حدث حساس يجب أن يسجل على الأقل:

```text
event_type
actor_user_id
academy_role_or_capability
scope_type
scope_id
target_type
target_id
reason_or_ticket
before_state_reference
after_state_reference
timestamp
correlation_id
```

قواعد إلزامية:

- سجل Audit لا يعتمد على UI فقط.
- لا يستطيع صاحب العملية تعديل سجل الحدث بعد إنشائه.
- Service role لا يمثل مستخدمًا بشريًا في السجل دون actor attribution.
- عمليات الطوارئ تحمل reason + expiry.
- قراءة Audit نفسها Capability مستقلة ومقيدة.

## 7. نموذج عمليات الدعم

### L0 — Self service

- إعادة تعيين إعدادات بسيطة.
- إرشادات الوصول.
- عرض حالة entitlement للمستخدم نفسه.

لا كشف لبيانات متعلم آخر.

### L1 — Academy Support

مسموح:

- قراءة بيانات تشغيلية محدودة للتذكرة.
- تشخيص enrollment/entitlement status.
- إعادة إرسال إشعار أو تحديث حالة دعم غير حساسة.

ممنوع:

- تعديل درجة/تقييم.
- إصدار شهادة.
- منح entitlement يدويًا دون workflow.
- قراءة بيانات الطلاب خارج الأكاديمية.

### L2 — Scoped Operations

قدرات محددة مثل:

- contract.seat.manage ضمن organization
- enrollment.repair ضمن program/cohort
- certificate.reissue ضمن policy

كلها بسبب وتدقيق.

### L3 — Emergency Operator

- وصول مؤقت فقط.
- Just-in-time grant.
- reason إلزامي.
- expiry إلزامي.
- مراجعة لاحقة للحدث.
- لا grant دائم.

## 8. فصل الواجبات

| العملية | المنشئ | المعتمد/المنفذ | المراجع |
|---|---|---|---|
| Program publish | Program Manager | Academy Publisher capability | Audit/QA |
| Contract seat grant | Org Manager | Contract/Entitlement service | Audit |
| Assessment grade | Trainer scoped | Trainer/Reviewer بحسب policy | Learner appeal trail |
| Certificate issue | Completion engine + Officer | Certificate Officer | Audit |
| Certificate revoke | Certificate Officer | scoped authorized action | Audit + reason |
| Emergency access | requester | time-bound approver/policy | mandatory post-review |

لا يجمع Support العام كل هذه القدرات في دور واحد.

## 9. Support UX acceptance

شاشة الدعم المخطط لها يجب أن تبدأ من Ticket/Reference لا من متصفح شامل لكل المستخدمين.

الحد الأدنى:

1. البحث بمعرف تذكرة أو Academy user محدد.
2. إظهار أقل قدر من البيانات اللازمة.
3. إبراز scope الحالي والقدرات الفعلية.
4. عدم وجود زر «دخول كالمستخدم» في MVP.
5. كل mutation يحمل سببًا مرئيًا ومطلوبًا.
6. العمليات غير المسموحة تظهر `DENIED_BY_CAPABILITY` ولا تُخفى خلف admin fallback.

## 10. Privacy-by-scope acceptance matrix

| الدور | Profile | Learning | Commerce | Certificates | Student domain |
|---|---|---|---|---|---|
| Teacher Learner | own | own | own | own | NONE |
| Trainer | cohort-minimum | scoped cohort | NONE | read limited if needed | NONE |
| Program Manager | minimum | aggregate/scoped | NONE | program scoped | NONE |
| Org Manager | membership minimum | contract/seat aggregate | org scoped | NONE unless granted | NONE |
| Certificate Officer | identity minimum | completion evidence only | NONE | scoped | NONE |
| Support | ticket minimum | diagnostic limited | diagnostic status only | diagnostic limited | NONE |
| Emergency Operator | explicit temporary scope | explicit | explicit | explicit | NONE by default |

## 11. Offline and device retention

MVP Offline يبقى محدودًا وفق Stage 13:

- shell
- catalog metadata المسموح
- text learning content المسموح
- progress outbox

غير مسموح Offline في MVP:

- contract administration
- certificate issue/revoke
- role/grant mutations
- support privileged data
- student-domain data
- QB answer keys/rationales الحساسة

يجب حذف outbox بعد successful reconciliation وعدم الاحتفاظ بنسخة privileged في local storage.

## 12. Incident workflow baseline

عند الاشتباه في تجاوز نطاق أو تسريب:

1. Freeze relevant privileged grant عند الإمكان.
2. Preserve audit evidence.
3. Identify affected Academy scopes.
4. Confirm Student domain isolation separately.
5. Revoke sessions/temporary grants إذا لزم.
6. Do not delete evidence to "clean" incident state.
7. Document corrective action before re-enable.

## 13. بوابات Stage 14

```text
ACADEMY_DATA_OWNERSHIP_BOUNDARY=PASS_DESIGN
ACADEMY_RETENTION_MODEL=PASS_DESIGN_BASELINE
ACADEMY_AUDIT_CONTRACT=PASS_DESIGN
ACADEMY_SUPPORT_OPERATIONS=PASS_DESIGN
ACADEMY_SUPPORT_ADMIN_BYPASS=ZERO_BY_DESIGN
STUDENT_DATA_SUPPORT_ACCESS=ZERO_BY_DESIGN
ACADEMY_OFFLINE_PRIVILEGED_DATA=ZERO_BY_DESIGN
QUESTION_BANK_RUNTIME_INTEGRATION=DISABLED
PRODUCTION_WRITE=NO
MIGRATION=NO
DEPLOY=NO
```

## 14. ما الذي لا تفتحه هذه المرحلة

Stage 14 لا تفوض:

- إنشاء جداول Academy.
- إنشاء RLS production policies.
- migrations.
- نشر واجهة معلمين.
- تطبيق Commerce.
- ربط بنك الأسئلة.
- نسخ بيانات الطلاب.

## 15. الموانع التي تبقي Programming Gate مغلقة

### P1 — Question Bank final runtime closure

```text
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=NOT_PROVEN
```

### P2 — Import lifecycle change review

المسار الحالي في تطبيق الطلاب ينفذ one-shot direct publication إلى READY عبر سلسلة خادمية مدققة. قبل استخدام «استقرار الاستيراد» كبوابة تعتمد عليها الأكاديمية، يجب أن يثبت review مستقل أن:

- evidence لا يتم اختلاقه أو اعتماده من UI وحدها.
- owner approval policy مقصودة ومصرح بها.
- DRAFT/REVIEW/READY guarantees لم تُضعف.
- no answer/rationale leakage.
- failure atomicity/idempotency سليمة.

حتى ذلك الحين:

```text
IMPORT_LIFECYCLE_CHANGE=REVIEW_REQUIRED
```

## 16. المرحلة الآمنة التالية

إذا ظلت بوابة البرمجة مغلقة، المرحلة الآمنة التالية هي:

```text
TEACHER_ACADEMY_MVP_NONPROD_UX_PROTOTYPE_AND_ACCEPTANCE_PACK_15
```

نطاقها المسموح:

- Wireframes/route map.
- Role-based screen states.
- Empty/error/denied/expired states.
- Mock-data prototype فقط.
- Accessibility acceptance.
- Mobile/responsive acceptance.
- لا Backend حقيقي، لا DB، لا Migration، لا Production.

## 17. الحكم

```text
TEACHER_ACADEMY_STAGE_14=PASS_DESIGN_CONTINUATION_ONLY
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
IMPORT_LIFECYCLE_CHANGE=REVIEW_REQUIRED
CRITICAL_STUDENT_ACADEMY_CROSS_ACCESS=ZERO_BY_DESIGN
NEXT_SAFE_STAGE=TEACHER_ACADEMY_MVP_NONPROD_UX_PROTOTYPE_AND_ACCEPTANCE_PACK_15
```
