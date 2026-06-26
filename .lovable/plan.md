# خطة تحقق المرحلة التالية — Read Only

**السياق:** Lovable ↔ GitHub متزامنان على `7dc9515`. المطلوب التحقق فقط من جاهزية المشروع للنشر لاحقاً، **دون** تنفيذ publish أو migrations أو تعديلات Supabase/Auth/ملفات.

---

## 1) تأكيد Supabase env (Runtime / Sandbox)
- قراءة `.env` في الـ sandbox والتحقق من وجود:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_PROJECT_ID`
  - `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (server-side)
- التحقق أن قيمها تشير إلى نفس project ref المعتمد لتنوير (`zbdhxyuulyovihjgeqbn`).
- **النتيجة المتوقعة:** ENV_OK أو ENV_MISSING:<list>.

## 2) تأكيد عدم وجود Missing Supabase env في الكود
- `rg` بحث عن أي استخدامات لـ `import.meta.env.VITE_SUPABASE_*` و `process.env.SUPABASE_*` للتأكد أن الكود لا يطلب متغيراً غير معرف.
- فحص `src/integrations/supabase/client.ts` و `client.server.ts` للتأكد من سلامة الاستيراد.
- **النتيجة المتوقعة:** NO_MISSING_ENV_REFS أو قائمة بالمراجع المفقودة.

## 3) تأكيد إمكانية build بدون نشر
- تشغيل build محلي فقط داخل الـ sandbox (`bun run build` أو `vite build`) — **بدون** `preview_ui--publish`.
- رصد:
  - exit code
  - أي تحذير حول env injection (مثل "VITE_SUPABASE_URL is undefined at build time")
  - حجم الـ bundle ووجود مخرجات `dist/`
- **النتيجة المتوقعة:** BUILD_OK أو BUILD_FAILED:<reason>.

## 4) فحص Payment issue قد يمنع النشر لاحقاً
- التحقق من وجود تكامل دفع مفعل (Paddle/Stripe) عبر:
  - فحص `package.json` لأي SDK دفع.
  - `rg` لاستخدامات `paddle`/`stripe` في الكود.
  - فحص الـ secrets المتوفرة (`fetch_secrets`) بحثاً عن مفاتيح دفع.
- التحقق إن كان هناك أي gate في pipeline النشر مرتبط بحالة الدفع.
- **النتيجة المتوقعة:** NO_PAYMENT_BLOCKER أو PAYMENT_ISSUE:<details>.

---

## التقرير النهائي (مخرجات هذه الخطة فقط)
سأرجع تقريراً موجزاً بالحقول التالية:
1. Supabase env (runtime): OK / MISSING
2. Missing env refs in code: NONE / LIST
3. Local build: OK / FAILED + reason
4. Payment blocker: NONE / DETAILS
5. **قرار النشر اللاحق:** READY_TO_PUBLISH / NEEDS_FIX:<list>

---

## محظورات صارمة في هذه الخطة
- ❌ لا `preview_ui--publish`
- ❌ لا `supabase--migration` ولا أي SQL writes
- ❌ لا تعديل Supabase Auth / providers / RLS
- ❌ لا تعديل أي ملف في المشروع (read-only fully)
- ❌ لا إضافة/تحديث secrets

## الأدوات المستخدمة (read-only فقط)
`code--view`, `code--exec` (rg + build فقط), `secrets--fetch_secrets`, `supabase--project_info` (للقراءة فقط).
