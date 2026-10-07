package app.studentamkeen.tamkeen;

/** Pure route policy: no filesystem paths, arbitrary hosts, or API routes. */
public final class LocalPageRoutes {
    private LocalPageRoutes() {}
    public static String asset(String scheme, String authority, String path, String method) {
        if (!"https".equals(scheme) || !"studentamkeen.com".equals(authority) || !"GET".equals(method)) return null;
        if ("/index.html".equals(path)) return "index.html";
        if ("/student-tamkeen-mark.png".equals(path)) return "student-tamkeen-mark.png";
        if ("/local-runtime.js".equals(path)) return "local-runtime.js";
        return null;
    }
}
