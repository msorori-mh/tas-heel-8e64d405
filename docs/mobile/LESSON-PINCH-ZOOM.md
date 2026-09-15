# Lesson pinch zoom — Android review

Baseline: b5ddbd98e9625c5a12cd42a913124f51ac578594 (session restore + unified offline review).

Opaque lesson iframes do not bubble touch events to the parent React component. Android now observes the WebView's native touch stream and hit-tests the parent document on the first finger. Two fingers inside a lesson viewport scale that component between 100% and 300%. Hit testing accounts for visual viewport scale and offsets, including when the surrounding page has already been zoomed. Single-finger taps and scrolling remain WebView-owned. Native cancellation ends the initial touch when pinch takes ownership; pointer-count changes rebase distance.

The shared viewer handles element-scoped gesture events without changing iframe srcdoc, sandbox, CSP, or interactive state. Existing zoom buttons remain. Gesture state clears on content changes. No database, auth, production deployment, or Google Play changes.

Verification: five component cases (textbook/explanation/summary/mindmap/experiment), invalid and stale gesture rejection, existing browser geometry/RTL/interaction checks, and Android instrumentation using the real compiled viewer with two native pointers over both static and interactive opaque iframes. The instrumentation also checks an outside gesture and a subsequent single-finger zoom-button tap. Fixtures are packaged only in the instrumentation APK.

Phone review: spread two fingers over lesson content, pinch inward, check ordinary scrolling and interactive controls, and reopen the app to confirm the previous session. Desktop/browser behavior remains the existing browser zoom plus buttons; this change targets the Android app.

Production/Play: HOLD pending review. Review APK signing remains the pre-existing ephemeral debug certificate limitation.
