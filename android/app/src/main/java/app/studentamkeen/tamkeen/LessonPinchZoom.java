package app.studentamkeen.tamkeen;

import android.annotation.SuppressLint;
import android.view.MotionEvent;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;

/** Observe native touches before an opaque iframe consumes them. No iframe access or JS interface. */
public final class LessonPinchZoom {
    private LessonPinchZoom() {}

    @SuppressLint("ClickableViewAccessibility") // Single-finger events stay with WebView accessibility.
    public static void install(WebView view) {
        view.setOnTouchListener(new android.view.View.OnTouchListener() {
            int generation = 0;
            String target;
            float left, top, right, bottom, previousSpan;
            boolean consuming;
            MotionEvent lastForwarded;

            void emit(String phase, float factor) {
                if (target == null || !Float.isFinite(factor)) return;
                view.evaluateJavascript("document.getElementById(" + JSONObject.quote(target)
                    + ")?.dispatchEvent(new CustomEvent('tamkeen:lesson-pinch',{detail:{phase:'"
                    + phase + "',factor:" + factor + "}}))", null);
            }
            boolean inside(float x, float y) {
                return x >= left && x <= right && y >= top && y <= bottom;
            }
            float span(MotionEvent e) {
                return (float)Math.hypot(e.getX(0)-e.getX(1), e.getY(0)-e.getY(1));
            }
            @Override public boolean onTouch(android.view.View ignored, MotionEvent e) {
                int action = e.getActionMasked();
                if (action == MotionEvent.ACTION_DOWN) {
                    final int request = ++generation;
                    target = null; consuming = false; previousSpan = 0;
                    if (view.getWidth() <= 0) return false;
                    // DOM hit testing returns the iframe element in the parent document, even for opaque origins.
                    view.evaluateJavascript("(()=>{const r=innerWidth/" + view.getWidth()
                        + ",e=document.elementFromPoint(" + e.getX() + "*r," + e.getY()
                        + "*r)?.closest('[data-lesson-zoom]');if(!e)return null;const b=e.getBoundingClientRect();"
                        + "return [e.id,b.left/r,b.top/r,b.right/r,b.bottom/r]})()", value -> {
                            if (request != generation) return;
                            try {
                                JSONArray a = new JSONArray(value);
                                target = a.getString(0); left=(float)a.getDouble(1); top=(float)a.getDouble(2);
                                right=(float)a.getDouble(3); bottom=(float)a.getDouble(4);
                            } catch (Exception invalidOrOutside) { target = null; }
                        });
                }
                if (!consuming && target != null && e.getPointerCount() == 2
                    && (action == MotionEvent.ACTION_POINTER_DOWN || action == MotionEvent.ACTION_MOVE)
                    && inside(e.getX(0), e.getY(0)) && inside(e.getX(1), e.getY(1))) {
                    consuming = true;
                    // Cancel the pointer stream WebView actually received. The second
                    // finger may not have been forwarded yet; cancelling two unknown
                    // pointers can leave Chromium's iframe touch state inconsistent.
                    MotionEvent cancel = MotionEvent.obtain(lastForwarded != null ? lastForwarded : e);
                    cancel.setAction(MotionEvent.ACTION_CANCEL);
                    view.onTouchEvent(cancel); cancel.recycle();
                    previousSpan = span(e);
                    emit("start", 1);
                    view.getParent().requestDisallowInterceptTouchEvent(true);
                } else if (consuming && action == MotionEvent.ACTION_MOVE && e.getPointerCount() == 2) {
                    float next = span(e);
                    if (previousSpan > 0 && next > 0) emit("scale", next / previousSpan);
                    previousSpan = next;
                }
                // Rebase after adding/removing a finger; never jump when pointer indexes change.
                if (action == MotionEvent.ACTION_POINTER_DOWN || action == MotionEvent.ACTION_POINTER_UP) previousSpan = 0;
                boolean handled = consuming;
                if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                    if (consuming) emit("end", 1);
                    ++generation; target = null; consuming = false;
                    view.getParent().requestDisallowInterceptTouchEvent(false);
                }
                if (lastForwarded != null) { lastForwarded.recycle(); lastForwarded = null; }
                if (!handled && action != MotionEvent.ACTION_UP && action != MotionEvent.ACTION_CANCEL) {
                    lastForwarded = MotionEvent.obtain(e);
                }
                return handled;
            }
        });
    }
}
