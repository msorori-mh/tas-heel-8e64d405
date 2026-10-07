package app.studentamkeen.tamkeen;
import org.junit.Test;
import static org.junit.Assert.*;
public class LocalPageRoutesTest {
    @Test public void exactLocalAssetsOnly() {
        assertEquals("index.html", LocalPageRoutes.asset("https", "studentamkeen.com", "/index.html", "GET"));
        assertEquals("local-runtime.js", LocalPageRoutes.asset("https", "studentamkeen.com", "/local-runtime.js", "GET"));
        for (String path : new String[]{"/app", "/auth/callback", "/api/offline-pack", "/../index.html", "/%69ndex.html", "/index.html/"}) {
            assertNull(LocalPageRoutes.asset("https", "studentamkeen.com", path, "GET"));
        }
    }
    @Test public void refusesOtherOriginsAndWrites() {
        assertNull(LocalPageRoutes.asset("http", "studentamkeen.com", "/index.html", "GET"));
        assertNull(LocalPageRoutes.asset("https", "studentamkeen.com.evil.test", "/index.html", "GET"));
        assertNull(LocalPageRoutes.asset("https", "studentamkeen.com:444", "/index.html", "GET"));
        assertNull(LocalPageRoutes.asset("https", "studentamkeen.com", "/index.html", "POST"));
    }
}
