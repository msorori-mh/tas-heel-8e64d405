import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/contacts")({
  component: AdminContactsPage,
});

const PAGE_SIZE = 25;

export function AdminContactsPage() {
  const { enabled, loading } = useRequireAdminSection("full");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const messages = useQuery({
    queryKey: ["admin-contacts", page, unreadOnly],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from("contact_submissions")
        .select("id,full_name,email,subject,message,is_read,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (unreadOnly) query = query.eq("is_read", false);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (!enabled) throw new Error("forbidden");
      // The database admin policy is authoritative; a zero-row update is a failure.
      const { error } = await supabase
        .from("contact_submissions")
        .update({ is_read: true })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-contacts"] });
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold">رسائل التواصل</h1>
        {loading ? (
          <p role="status">جارٍ التحقق من الصلاحيات…</p>
        ) : !enabled ? (
          <p role="alert">ليست لديك صلاحية الوصول لهذه الصفحة.</p>
        ) : (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => {
                  setUnreadOnly(event.target.checked);
                  setPage(0);
                }}
              />{" "}
              غير المقروءة فقط
            </label>
            {messages.isLoading ? (
              <p role="status">جارٍ تحميل الرسائل…</p>
            ) : messages.isError ? (
              <div role="alert">
                تعذر تحميل الرسائل.{" "}
                <Button onClick={() => void messages.refetch()}>إعادة المحاولة</Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  عدد الرسائل المطابقة: {messages.data?.count ?? 0}
                </p>
                {!messages.data?.rows.length && <p>لا توجد رسائل مطابقة.</p>}
                {messages.data?.rows.map((message) => (
                  <article
                    key={message.id}
                    className="space-y-3 rounded-xl border bg-card p-4 break-words"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <h2 className="font-bold">{message.subject}</h2>
                      <span>{message.is_read ? "مقروءة" : "غير مقروءة"}</span>
                    </div>
                    <p>
                      {message.full_name} — <bdi>{message.email}</bdi>
                    </p>
                    <time dateTime={message.created_at}>
                      {new Date(message.created_at).toLocaleString("ar-YE")}
                    </time>
                    <p className="whitespace-pre-wrap leading-7">{message.message}</p>
                    {!message.is_read && (
                      <Button
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(message.id)}
                      >
                        تحديد كمقروءة
                      </Button>
                    )}
                  </article>
                ))}
                <div className="flex items-center gap-3">
                  <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
                    السابق
                  </Button>
                  <span>صفحة {page + 1}</span>
                  <Button
                    disabled={(page + 1) * PAGE_SIZE >= (messages.data?.count ?? 0)}
                    onClick={() => setPage(page + 1)}
                  >
                    التالي
                  </Button>
                </div>
              </>
            )}
            {markRead.isError && <p role="alert">تعذر تحديث حالة الرسالة. حاول مرة أخرى.</p>}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
