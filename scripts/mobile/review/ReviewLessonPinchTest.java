package app.studentamkeen.tamkeen;

import static org.junit.Assert.*;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.BridgeWebViewClient;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Real native two-pointer input over the actual React viewer and its sandboxed iframe. */
@RunWith(AndroidJUnit4.class)
public class ReviewLessonPinchTest {
    private String evaluate(ActivityScenario<ReviewActivity> activity, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        activity.onActivity(a -> a.getBridge().getWebView().evaluateJavascript(script, v -> {result.set(v);done.countDown();}));
        assertTrue(done.await(10, TimeUnit.SECONDS)); return result.get();
    }
    private void touch(ActivityScenario<ReviewActivity> activity, long down, int action, int count, float x, float y, float gap) {
        int[] location = new int[2];
        activity.onActivity(a -> a.getBridge().getWebView().getLocationOnScreen(location));
        MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[count];
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
        for (int i=0;i<count;i++) {
            props[i]=new MotionEvent.PointerProperties(); props[i].id=i; props[i].toolType=MotionEvent.TOOL_TYPE_FINGER;
            coords[i]=new MotionEvent.PointerCoords(); coords[i].x=location[0]+x+(i==0?-gap:gap);coords[i].y=location[1]+y;coords[i].pressure=1;coords[i].size=1;
        }
        MotionEvent e=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,count,props,coords,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
        try {
            assertTrue("Android input injection failed", InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(e,true));
        } finally {e.recycle();}
    }

    private void pinch(ActivityScenario<ReviewActivity> a, float x, float y, float from, float to) throws Exception {
        long down=SystemClock.uptimeMillis();
        touch(a,down,MotionEvent.ACTION_DOWN,1,x,y,from); Thread.sleep(150);
        touch(a,down,MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,x,y,from);
        for(int i=0;i<=12;i++) {touch(a,down,MotionEvent.ACTION_MOVE,2,x,y,from+(to-from)*i/12);Thread.sleep(25);}
        touch(a,down,MotionEvent.ACTION_POINTER_UP|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,x,y,to);
        touch(a,down,MotionEvent.ACTION_UP,1,x,y,to); Thread.sleep(150);
    }
    private void tapButton(ActivityScenario<ReviewActivity> a, String label, String expected, String mode) throws Exception {
        // WebView dispatch is asynchronous; use an actual-duration tap and wait for its DOM click.
        evaluate(a,"window.tapTrace=[];if(!window.traceInstalled){window.traceInstalled=true;['pointerdown','pointerup','pointercancel','click'].forEach(t=>document.addEventListener(t,e=>window.tapTrace.push([t,e.clientX,e.clientY,e.target.tagName,e.target.getAttribute('aria-label')]),true))}");
        JSONArray button=new JSONArray(evaluate(a,"(()=>{const e=document.querySelector('[aria-label=\""+label+"\"]');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return [innerWidth,b.x+b.width/2,b.y+b.height/2]})()"));
        AtomicReference<Integer> width=new AtomicReference<>(); a.onActivity(v->width.set(v.getBridge().getWebView().getWidth()));
        float ratio=width.get()/(float)button.getDouble(0);
        long down=SystemClock.uptimeMillis();
        touch(a,down,MotionEvent.ACTION_DOWN,1,(float)button.getDouble(1)*ratio,(float)button.getDouble(2)*ratio,0);
        Thread.sleep(100);
        touch(a,down,MotionEvent.ACTION_UP,1,(float)button.getDouble(1)*ratio,(float)button.getDouble(2)*ratio,0);
        long end=System.currentTimeMillis()+3000;
        while(!evaluate(a,"document.querySelector('output').textContent").equals("\""+expected+"\"") && System.currentTimeMillis()<end) Thread.sleep(100);
        String actual=evaluate(a,"document.querySelector('output').textContent");
        if (!actual.equals("\""+expected+"\"")) {
            android.graphics.Bitmap screenshot=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            java.io.File dir=InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir("pinch-evidence");dir.mkdirs();
            if(screenshot!=null) {try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(dir,"tap-failure.png"))) {screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}screenshot.recycle();}
        }
        assertEquals(mode+" native tap "+label+" bounds="+button+" elapsed="+(SystemClock.uptimeMillis()-down)+" trace="+evaluate(a,"JSON.stringify({events:tapTrace,scroll:[scrollX,scrollY],visual:[visualViewport.scale,visualViewport.offsetTop,visualViewport.offsetLeft],focus:document.activeElement?.tagName,hit:document.elementFromPoint("+button.getDouble(1)+","+button.getDouble(2)+")?.outerHTML})"), "\""+expected+"\"",actual);
    }
    @Test public void pinchInsideOpaqueLessonWithoutReloading() throws Exception {
        for (String mode : new String[]{"interactive", "static"}) {
        try(ActivityScenario<ReviewActivity> a=ActivityScenario.launch(ReviewActivity.class)) {
            Thread.sleep(2500);
            a.onActivity(activity -> {
                activity.getBridge().setWebViewClient(new BridgeWebViewClient(activity.getBridge()) {
                    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                        try {
                            String path=request.getUrl().getPath(); if(path.equals("/")) path="/index.html";
                            String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":"text/html";
                            return new WebResourceResponse(mime,"UTF-8",InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("pinch"+path));
                        } catch(Exception missing) {return new WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0]));}
                    }
                });
                activity.getBridge().getWebView().loadUrl("https://studentamkeen.com/?" + mode);
            });
            long end=System.currentTimeMillis()+20000;
            while(!evaluate(a,"!!document.querySelector('[data-lesson-zoom]')").equals("true") && System.currentTimeMillis()<end) Thread.sleep(200);
            assertEquals("true",evaluate(a,"!!document.querySelector('[data-lesson-zoom]')"));
            tapButton(a,"تكبير المحتوى","125%",mode+" before pinch");
            tapButton(a,"إعادة الحجم الأصلي","100%",mode+" before pinch");
            evaluate(a,"window.scrollTo(0,0)");
            Thread.sleep(200);
            JSONArray bounds=new JSONArray(evaluate(a,"(()=>{const b=document.querySelector('[data-lesson-zoom]').getBoundingClientRect();return [innerWidth,b.left,b.top,b.width]})()"));
            AtomicReference<Integer> width=new AtomicReference<>(); a.onActivity(v->width.set(v.getBridge().getWebView().getWidth()));
            float ratio=width.get()/(float)bounds.getDouble(0);
            float x=((float)bounds.getDouble(1)+(float)bounds.getDouble(3)/2)*ratio;
            float y=((float)bounds.getDouble(2)+120)*ratio;
            evaluate(a,"window.pinchFrame=document.querySelector('iframe');window.pinchSrc=pinchFrame.srcdoc");
            pinch(a,x,y,30*ratio,85*ratio);
            assertEquals("true",evaluate(a,"parseInt(document.querySelector('output').textContent)>150"));
            assertEquals("true",evaluate(a,"document.querySelector('iframe')===pinchFrame && pinchFrame.srcdoc===pinchSrc && !pinchFrame.sandbox.contains('allow-same-origin')"));
            pinch(a,x,y,85*ratio,20*ratio);
            assertEquals("\"100%\"",evaluate(a,"document.querySelector('output').textContent"));
            pinch(a,x,2*ratio,30*ratio,85*ratio);
            assertEquals("\"100%\"",evaluate(a,"document.querySelector('output').textContent"));
            tapButton(a,"تكبير المحتوى","125%",mode);

        }
        }
    }
}
