import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  History,
  LoaderCircle,
  Save,
  Settings,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import {
  adminGetSettings,
  adminListAcademyAdmins,
  adminListAuditLog,
  adminSetUserCapabilities,
  adminUpdateSettings,
} from "./lib/academy-api";
import type {
  AcademyAdminAccount,
  AcademyCapability,
  AcademySettings,
  AdminAuditEvent,
} from "./types";

const CAPABILITIES: Array<{ id: AcademyCapability; label: string }> = [
  { id: "ACADEMY_CATALOG_MANAGE", label: "إدارة البرامج والإعدادات" },
  { id: "ACADEMY_TEACHERS_VIEW", label: "عرض المعلمين وإدارة حالتهم" },
  { id: "ACADEMY_PROGRESS_VIEW", label: "عرض التقدم والتقارير والشهادات" },
];

const ACTION_LABELS: Record<AdminAuditEvent["action"], string> = {
  SETTINGS_UPDATED: "تحديث إعدادات الأكاديمية",
  CAPABILITY_GRANTED: "منح صلاحية إدارية",
  CAPABILITY_REVOKED: "سحب صلاحية إدارية",
  PROGRAM_PUBLISHED: "نشر برنامج",
  PROGRAM_DRAFT_DELETED: "حذف مسودة برنامج",
  PROGRAM_ARCHIVED: "أرشفة برنامج",
  PROGRAM_RESTORED: "استعادة برنامج",
  TEACHER_STATUS_UPDATED: "تغيير حالة معلم",
  CERTIFICATE_REVOKED: "إلغاء شهادة",
  LIVE_SESSION_CREATED: "إنشاء محاضرة مباشرة",
  LIVE_SESSION_UPDATED: "تعديل محاضرة مباشرة",
  LIVE_SESSION_DELETED: "حذف محاضرة مباشرة",
};

function messageOf(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  if (raw.includes("ACADEMY_ADMIN_USER_NOT_FOUND")) return "لا يوجد حساب مسجل بهذا البريد.";
  if (raw.includes("ACADEMY_ADMIN_SELF_LOCKOUT_BLOCKED")) {
    return "لا يمكنك سحب صلاحية إدارة الأكاديمية من حسابك الحالي.";
  }
  if (raw.includes("ACADEMY_LAST_CATALOG_MANAGER_REQUIRED")) {
    return "يجب أن يبقى مسؤول واحد على الأقل بصلاحية إدارة الأكاديمية.";
  }
  if (raw.includes("INVALID_ACADEMY_SETTINGS")) return "راجع قيم الإعدادات المدخلة.";
  return raw || "تعذرت العملية. حاول مرة أخرى.";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });
}

function toggleCapability(
  current: AcademyCapability[],
  capability: AcademyCapability,
): AcademyCapability[] {
  return current.includes(capability)
    ? current.filter((item) => item !== capability)
    : [...current, capability];
}

export function AdminSettings() {
  const [settings, setSettings] = useState<AcademySettings | null>(null);
  const [admins, setAdmins] = useState<AcademyAdminAccount[]>([]);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [draftCapabilities, setDraftCapabilities] = useState<Record<string, AcademyCapability[]>>(
    {},
  );
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminCapabilities, setNewAdminCapabilities] = useState<AcademyCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function reload() {
    const [settingsRow, adminRows, auditRows] = await Promise.all([
      adminGetSettings(),
      adminListAcademyAdmins(),
      adminListAuditLog(75),
    ]);
    setSettings(settingsRow);
    setAdmins(adminRows);
    setAudit(auditRows);
    setDraftCapabilities(
      Object.fromEntries(adminRows.map((admin) => [admin.user_id, admin.capabilities])),
    );
  }

  useEffect(() => {
    let active = true;
    reload()
      .catch((loadError) => active && setError(messageOf(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setBusy("settings");
    setError(null);
    setSuccess(null);
    try {
      await adminUpdateSettings({
        ...settings,
        academy_name: settings.academy_name.trim(),
        support_email: settings.support_email?.trim() || null,
        support_phone: settings.support_phone?.trim() || null,
        certificate_issuer_name: settings.certificate_issuer_name.trim(),
        certificate_signatory_name: settings.certificate_signatory_name?.trim() || null,
        certificate_signatory_title: settings.certificate_signatory_title?.trim() || null,
        default_live_provider: settings.default_live_provider.trim(),
        default_live_instructions: settings.default_live_instructions.trim(),
      });
      await reload();
      setSuccess("حُفظت الإعدادات وأضيف التغيير إلى سجل التدقيق.");
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function saveAdmin(email: string, capabilities: AcademyCapability[], busyKey: string) {
    const action = capabilities.length ? "حفظ الصلاحيات المحددة" : "سحب جميع الصلاحيات";
    if (!window.confirm(`${action} للحساب ${email}؟`)) return;
    setBusy(busyKey);
    setError(null);
    setSuccess(null);
    try {
      await adminSetUserCapabilities(email, capabilities);
      await reload();
      setSuccess("حُدّثت الصلاحيات وسُجّل التغيير.");
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function addAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newAdminEmail.trim() || newAdminCapabilities.length === 0) return;
    await saveAdmin(newAdminEmail.trim(), newAdminCapabilities, "new-admin");
    setNewAdminEmail("");
    setNewAdminCapabilities([]);
  }

  if (loading || !settings) {
    return (
      <div className="loading-inline">
        <LoaderCircle className="spin" /> جارٍ تحميل الإعدادات…
      </div>
    );
  }

  return (
    <div
      className="admin-section settings-admin"
      role="tabpanel"
      id="admin-panel-settings"
      aria-labelledby="admin-tab-settings"
    >
      <div className="section-toolbar">
        <div>
          <h2>الإعدادات والصلاحيات</h2>
          <p className="muted">
            إعدادات تشغيلية موحدة وإدارة مسؤولي الأكاديمية بسجل غير قابل للتعديل.
          </p>
        </div>
        <span className="security-chip">
          <ShieldCheck /> محكومة بالصلاحيات
        </span>
      </div>
      {error ? <div className="notice error-notice">{error}</div> : null}
      {success ? <div className="notice success-notice">{success}</div> : null}

      <form className="admin-form settings-form" onSubmit={saveSettings}>
        <div className="settings-section-heading">
          <Settings />
          <div>
            <h3>هوية الأكاديمية والدعم</h3>
            <p className="muted">البيانات المركزية المستخدمة في التشغيل والتواصل.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            اسم الأكاديمية
            <input
              value={settings.academy_name}
              minLength={3}
              maxLength={120}
              onChange={(event) => setSettings({ ...settings, academy_name: event.target.value })}
              required
            />
          </label>
          <label>
            بريد الدعم (اختياري)
            <input
              type="email"
              value={settings.support_email ?? ""}
              onChange={(event) => setSettings({ ...settings, support_email: event.target.value })}
            />
          </label>
          <label>
            هاتف الدعم (اختياري)
            <input
              dir="ltr"
              value={settings.support_phone ?? ""}
              onChange={(event) => setSettings({ ...settings, support_phone: event.target.value })}
            />
          </label>
          <label>
            المدة الافتراضية للبرنامج
            <input
              type="number"
              min={1}
              max={100000}
              value={settings.default_program_minutes}
              onChange={(event) =>
                setSettings({ ...settings, default_program_minutes: Number(event.target.value) })
              }
              required
            />
          </label>
          <label>
            نسبة الاجتياز الافتراضية
            <input
              type="number"
              min={1}
              max={100}
              value={settings.default_pass_percentage}
              onChange={(event) =>
                setSettings({ ...settings, default_pass_percentage: Number(event.target.value) })
              }
              required
            />
          </label>
        </div>

        <div className="settings-section-heading">
          <CheckCircle2 />
          <div>
            <h3>بيانات إصدار الشهادة</h3>
            <p className="muted">هوية الجهة والتوقيع المعتمدان عند عرض الشهادات.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            الجهة المصدرة
            <input
              value={settings.certificate_issuer_name}
              onChange={(event) =>
                setSettings({ ...settings, certificate_issuer_name: event.target.value })
              }
              required
            />
          </label>
          <label>
            اسم الموقّع (اختياري)
            <input
              value={settings.certificate_signatory_name ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, certificate_signatory_name: event.target.value })
              }
            />
          </label>
          <label>
            صفة الموقّع (اختياري)
            <input
              value={settings.certificate_signatory_title ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, certificate_signatory_title: event.target.value })
              }
            />
          </label>
        </div>

        <div className="settings-section-heading">
          <Save />
          <div>
            <h3>افتراضات المحاضرات المباشرة</h3>
            <p className="muted">تبقى الروابط خارجية ومحايدة؛ هذه القيم تسرّع الجدولة فقط.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            المنصة الافتراضية
            <input
              list="academy-default-live-providers"
              value={settings.default_live_provider}
              onChange={(event) =>
                setSettings({ ...settings, default_live_provider: event.target.value })
              }
              required
            />
            <datalist id="academy-default-live-providers">
              <option value="Zoom" />
              <option value="Google Meet" />
              <option value="Microsoft Teams" />
            </datalist>
          </label>
          <label className="full-field">
            تعليمات الحضور الافتراضية
            <textarea
              maxLength={2000}
              value={settings.default_live_instructions}
              onChange={(event) =>
                setSettings({ ...settings, default_live_instructions: event.target.value })
              }
            />
          </label>
        </div>
        <div className="settings-save-row">
          <small>آخر تحديث: {formatDate(settings.updated_at)}</small>
          <button className="primary-button" type="submit" disabled={busy === "settings"}>
            {busy === "settings" ? <LoaderCircle className="spin" /> : <Save />} حفظ الإعدادات
          </button>
        </div>
      </form>

      <section className="settings-panel">
        <div className="settings-section-heading">
          <ShieldCheck />
          <div>
            <h3>مسؤولو الأكاديمية</h3>
            <p className="muted">
              لا يمكن للمسؤول سحب إدارة الأكاديمية من نفسه، ويجب أن يبقى مدير واحد على الأقل.
            </p>
          </div>
        </div>
        <form className="admin-form nested-form admin-invite-form" onSubmit={addAdmin}>
          <label>
            بريد حساب موجود
            <input
              type="email"
              value={newAdminEmail}
              onChange={(event) => setNewAdminEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </label>
          <fieldset className="capability-fieldset">
            <legend>الصلاحيات</legend>
            {CAPABILITIES.map((capability) => (
              <label key={capability.id}>
                <input
                  type="checkbox"
                  checked={newAdminCapabilities.includes(capability.id)}
                  onChange={() =>
                    setNewAdminCapabilities((current) => toggleCapability(current, capability.id))
                  }
                />
                {capability.label}
              </label>
            ))}
          </fieldset>
          <button
            className="primary-button"
            type="submit"
            disabled={busy === "new-admin" || newAdminCapabilities.length === 0}
          >
            {busy === "new-admin" ? <LoaderCircle className="spin" /> : <UserPlus />} إضافة أو تحديث
          </button>
        </form>

        <div className="data-list admin-access-list">
          {admins.map((admin) => {
            const selected = draftCapabilities[admin.user_id] ?? admin.capabilities;
            return (
              <article className="data-row admin-access-row" key={admin.user_id}>
                <div className="data-main">
                  <strong dir="ltr">{admin.email}</strong>
                  <small>آخر منح: {formatDate(admin.last_granted_at)}</small>
                  <div className="capability-checkboxes">
                    {CAPABILITIES.map((capability) => (
                      <label key={capability.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(capability.id)}
                          onChange={() =>
                            setDraftCapabilities((current) => ({
                              ...current,
                              [admin.user_id]: toggleCapability(selected, capability.id),
                            }))
                          }
                        />
                        {capability.label}
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy === admin.user_id}
                  onClick={() => void saveAdmin(admin.email, selected, admin.user_id)}
                >
                  {busy === admin.user_id ? <LoaderCircle className="spin" /> : <Save />} حفظ
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="settings-panel">
        <div className="settings-section-heading">
          <History />
          <div>
            <h3>سجل التدقيق</h3>
            <p className="muted">آخر 75 عملية إدارية منذ تفعيل السجل؛ لا يمكن تعديلها أو حذفها.</p>
          </div>
        </div>
        <div className="audit-list">
          {audit.length === 0 ? (
            <div className="compact-empty">لا توجد عمليات مسجلة بعد.</div>
          ) : null}
          {audit.map((event) => (
            <article key={event.audit_id}>
              <span className="audit-dot" />
              <div>
                <strong>{ACTION_LABELS[event.action]}</strong>
                <p>
                  بواسطة <bdi>{event.actor_email ?? "حساب محذوف"}</bdi>
                  {event.target_email ? (
                    <>
                      {" "}
                      · على <bdi>{event.target_email}</bdi>
                    </>
                  ) : null}
                </p>
                <small>{formatDate(event.created_at)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
