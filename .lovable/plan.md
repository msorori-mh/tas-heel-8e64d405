
# خطة: توثيق نظام الدفع الحالي لإعادة استخدامه في تطبيق آخر

الهدف: إنتاج ملف مرجعي واحد يوثّق كامل نظام الدفع المستخدم في تطبيق "تمكين طلاب الثانوية" (Yemen / RTL / YER) بحيث يمكن للمطور نسخ البنية والمنطق إلى تطبيق جديد دون الرجوع للكود.

## المُخرج (Deliverable)
ملف واحد فقط:
- `/mnt/documents/payments-system-reference.md` (سيتم عرضه عبر `<presentation-artifact>` للتحميل).

لن يتم أي تعديل على الكود أو قاعدة البيانات — التوثيق فقط.

## محتوى الملف (الأقسام)

1. **نظرة عامة على الفلسفة**
   - نموذج "محفظة + اشتراك" (Wallet-then-Subscription): المستخدم يشحن محفظته بإيصال حوالة، ثم يستهلك الرصيد لتفعيل اشتراك.
   - عملة أساسية `YER`، Manual review بواسطة الأدمن (لا بوابة دفع آلية).
   - Legacy path: `payment_requests` (دفع مباشر لخطة) — للقراءة فقط في المسار الجديد.

2. **مخطط قاعدة البيانات** — جدول-جدول مع كل الأعمدة والأنواع والقيود والفهارس:
   - `payment_methods` (7 صفوف حقيقية: بنك الكريمي شمال/جنوب، بنك الشرق اليمني، بنك القطيبي، شبكة موحدة، حوالة كريمي، نقطة حاسب).
   - `subscription_plans` (شهري 3000 / فصلي 8000 / سنوي 25000 YER).
   - `subscriptions` (حالة، صف، فصل، إلغاء/استرداد).
   - `wallet_accounts` (رصيد لكل مستخدم/عملة).
   - `wallet_transactions` (append-only، مع `balance_before/after` و `reference_type/id` و `reverses_transaction_id`).
   - `wallet_topup_requests` (المسار الحالي: submitted → under_review → credited/rejected).
   - `payment_requests` (Legacy، مع fraud_flags، refund، receipt_hash).

3. **قيم البيانات الجاهزة للـ Seed**
   - INSERT كامل لخطط الاشتراك الثلاث بالأسعار الفعلية.
   - INSERT كامل لطرق الدفع السبعة بأسمائها وأرقام حساباتها الحقيقية.
   - Enum values للحقول النصية (status, type, direction, reference_type).

4. **RLS و GRANTs**
   - سياسات كل جدول (owner-only للطالب، admin-only للمراجعة).
   - حجب `content_manager` من كل المسارات المالية.
   - Storage bucket `receipts` وسياساته (upload تحت `{uid}/wallet-topups/...`، قفل الحذف بعد التقديم).

5. **دوال قاعدة البيانات (RPCs) — بالتوقيع والغرض والمنطق**
   - `ensure_wallet_account`, `auto_create_wallet_for_profile` (Trigger).
   - `create_wallet_transaction` (Ledger الوحيد الذي يعدّل الرصيد).
   - `prevent_wallet_tx_mutation` (Trigger — الجدول append-only).
   - `create_wallet_topup_request` (طالب فقط، يرفض staff).
   - `approve_wallet_topup_request` / `reject_wallet_topup_request` (Admin).
   - `pay_subscription_from_wallet` (خصم من المحفظة → تفعيل اشتراك).
   - `has_active_subscription`, `admin_adjust_wallet`, `admin_refund_subscription`.
   - Legacy: `approve_payment_request` / `reject_payment_request` (مع fraud flags لعدم مطابقة المبلغ).
   - Notifications: `notify_admins_on_pending_payment` (Trigger).

6. **التدفقات (Sequence Flows) — ASCII diagrams**
   - Top-up flow: Upload receipt → RPC → Admin review → deposit ledger → wallet credited.
   - Subscription activation: `pay_subscription_from_wallet` → debit ledger → subscription active.
   - Refund flow: reverse transaction + `refunded_at/by`.

7. **OCR للإيصالات (اختياري)**
   - Server Function `extractReceiptData` عبر Lovable AI Gateway (Gemini vision).
   - JSON schema المُخرج: `sender_name`, `transaction_number`, `amount`, `transfer_date`, `confidence`.
   - System prompt العربي (يمني) — منسوخ حرفياً.

8. **طبقة الـ TanStack Server Functions (النموذج المعماري)**
   - نمط `createServerFn` + `requireSupabaseAuth` / `requireAdminAuth`.
   - مثال `getWalletTopupReceiptSignedUrl` (Signed URL بواسطة service role).
   - سبب فصل client vs admin client.

9. **قائمة التبعيات وقرارات معمارية للنقل**
   - لا بوابة دفع (Stripe/Paddle) — Manual review فقط.
   - عملة واحدة YER — كيف تعمّم لعملات متعددة.
   - Idempotency: `uniq_wallet_tx_wallet_topup_deposit` على `reference_id`.
   - Audit: `write_audit_log` لكل إجراء أدمن.
   - قرار "التطبيق المجاني حالياً" وأثر ذلك (Flag: `STUDENT_FREE_ACCESS`).

10. **قائمة النقل (Migration Checklist)**
    - ترتيب تطبيق SQL في التطبيق الجديد.
    - المتطلبات المسبقة: `auth.users`, `profiles`, `user_roles`, `has_role`, `write_audit_log`, `update_updated_at_column`.
    - نقاط يجب تخصيصها (العملة، مبالغ الخطط، طرق الدفع المحلية).

## المصادر التي سأستخرج منها المحتوى
- ملفات الترحيل: `supabase/migrations/20260704150000_wallet_topup_requests.sql` + الملفات المرتبطة.
- تعريفات الدوال الحية من الـ `pg_proc` (سبق فحصها).
- `docs/PAYMENTS-PORT-DB-RLS-RPC-01-REPORT.md`.
- `src/lib/admin-wallet-topups.functions.ts` و `src/lib/payments-ocr.functions.ts`.
- بيانات الـ seed الحية من `payment_methods` و `subscription_plans`.

## ما لن يُنفَّذ
- لا تغييرات على الكود.
- لا Migrations.
- لا Publish.
- لا نقل بيانات فعلي — فقط توثيق مرجعي.
