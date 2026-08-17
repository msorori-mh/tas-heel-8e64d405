# TAMKEEN_DESIGN_SYSTEM_V2_FOUNDATION_19C — تقرير

## سجل النسخة (Version Reconciliation Record)

```text
BASE_SHA=a8f6ee3f1a93a11ddfddc0783dadcbab1259411a
MISSING_HISTORICAL_REFERENCE=72546eab9855f94647d84d52c8caaa02f281f8f7
MISSING_REFERENCE_STATUS=UNRESOLVED_NON_PROJECT_REFERENCE
PUBLISHED_BASE=UNKNOWN
PUBLISH_HOLD=YES
```

المرجع المفقود لم يُستخدم كمرجع تنفيذ ولم يُستبدل تلقائياً.

## النطاق المنفّذ

Source / UI foundation فقط:

| البند | الحالة |
| --- | --- |
| Publish | NO |
| Deploy | NO |
| Migration | NO |
| DB writes | NO |
| RLS / RPC changes | NO |
| Real-app rollout | NO |

## المخرجات

1. **طبقة الرموز (CSS)** — `src/styles.css`
   - أصبح نطاق الرموز `.ds-v2, .fm-v2` (نفس القيم؛ شاشات 19A/19B مجمّدة كما هي).
   - رموز جديدة موثّقة: `--ds-radius-sm|md|lg|pill`, `--ds-shadow-raised`, `--ds-space-section`, `--ds-space-card`.
   - أداة جديدة: `ds-raised`. الأدوات القائمة (`fm-card`, `fm-press`, `fm-bar`, `fm-grad`) بقيت متوافقة، مع ربط `fm-card` بمتغير الحواف.

2. **مصدر الحقيقة (TS)** — `src/lib/design/ds-v2-tokens.ts`
   - جداول موثّقة: الألوان، الحواف، الظلال، المقياس الطباعي.
   - `DS_V2_APP_ROLLOUT_ENABLED = false` — مفتاح التعميم يبقى مغلقاً حتى مرحلة معتمدة لاحقة.

3. **المكونات الأساسية** — `src/components/design-system/ds-v2.tsx`
   - `DsScope`, `DsCard` (plain / raised / signature), `DsSectionTitle`, `DsButton` (primary / secondary / quiet / signature), `DsBadge` (muted / goal / success / secondary), `DsProgress` (مع ARIA)، `DsStat`.
   - عرض فقط: لا جلب بيانات، لا توجيه، لا آثار جانبية، ولا ألوان hex مكتوبة داخل المكونات.

4. **شاشة العرض المرجعية** — `src/routes/prototype.19c.tsx` على `/prototype/19c`
   - RTL، mobile-first، `noindex`، غير مرتبطة من أي مسار داخل التطبيق.

## ضوابط العزل

- لا تغيير على رموز التطبيق الحقيقي: الطبقة الجذرية في `src/styles.css` لم تُمس؛ التفعيل يتطلب صراحةً وجود `.ds-v2` في الشجرة.
- شاشات 19A/19B (`/prototype/19a/*`) دون تغيير سلوكي — نفس القيم عبر المُحدِّد المشترك.
- لا ملفات قاعدة بيانات، ولا إعدادات إنتاج، ولا عقود استيراد/محتوى ضمن هذا التغيير.

## الحكم

```text
TAMKEEN_DESIGN_SYSTEM_V2_FOUNDATION_19C = FOUNDATION_READY
APP_ROLLOUT = NOT_STARTED (requires separate approval)
PUBLISH = HOLD
```
