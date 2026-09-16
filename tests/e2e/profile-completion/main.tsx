import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "../../../src/hooks/use-auth";
import { Route } from "../../../src/routes/complete-profile";
import "../../../src/styles.css";
function Fixture() {
  const [hash, setHash] = useState(location.hash);
  const auth = useAuth();
  useEffect(() => {
    const update = () => setHash(location.hash);
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  const Complete = Route.options.component;
  return hash === "#/app" && auth.profileComplete ? (
    <main dir="rtl">
      <h1>تم استكمال الملف</h1>
      <output aria-label="الملف المحفوظ">{JSON.stringify(auth.profile)}</output>
    </main>
  ) : (
    <Complete />
  );
}
createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <Fixture />
  </AuthProvider>,
);
