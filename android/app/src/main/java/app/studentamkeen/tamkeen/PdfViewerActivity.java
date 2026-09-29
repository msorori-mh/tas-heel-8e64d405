package app.studentamkeen.tamkeen;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ScaleGestureDetector;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.HorizontalScrollView;
import android.widget.ScrollView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import java.io.File;

/**
 * 18C2 — native PDF page renderer.
 *
 * Uses android.graphics.pdf.PdfRenderer (PDFium) with RENDER_MODE_FOR_DISPLAY,
 * which renders the embedded Arabic subset fonts of the ministry books
 * correctly (pdf.js does not). Only the current page is rasterised; the
 * previous bitmap is recycled before the next one is created.
 */
public class PdfViewerActivity extends AppCompatActivity {

    public static final String EXTRA_ABSOLUTE_PATH = "absolutePath";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_INITIAL_PAGE = "initialPage";
    public static final String EXTRA_LAST_PAGE = "lastPage";

    private static final float MIN_SCALE = 1.0f;
    private static final float MAX_SCALE = 3.0f;

    private ParcelFileDescriptor descriptor;
    private PdfRenderer renderer;
    private Bitmap currentBitmap;

    private final ExecutorService renderExecutor = Executors.newSingleThreadExecutor();
    private final AtomicInteger renderGeneration = new AtomicInteger();
    private volatile boolean destroyed;
    // Bound each bitmap to 12 MiB; zoom still grows the scrollable display surface.
    private static final long MAX_RENDER_PIXELS = 3L * 1024 * 1024;

    private ImageView pageView;
    private TextView pageLabel;
    private Button prevButton;
    private Button nextButton;

    private int pageIndex = 0;
    private float scale = 1.0f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View root = buildLayout();
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(root);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { finishWithResult(); }
        });

        String path = getIntent().getStringExtra(EXTRA_ABSOLUTE_PATH);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        int initialPage = Math.max(1, getIntent().getIntExtra(EXTRA_INITIAL_PAGE, 1));

        if (title != null && !title.trim().isEmpty()) {
            setTitle(title);
        }

        try {
            File file = new File(path);
            descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(descriptor);
        } catch (Exception e) {
            Toast.makeText(this, "تعذّر فتح الملف", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        if (savedInstanceState != null) initialPage = savedInstanceState.getInt(EXTRA_LAST_PAGE, initialPage);
        pageIndex = Math.min(initialPage, renderer.getPageCount()) - 1;
        showPage(pageIndex);
    }

    private View buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#111827"));
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        pageLabel = new TextView(this);
        pageLabel.setTextColor(Color.WHITE);
        pageLabel.setPadding(24, 24, 24, 16);
        pageLabel.setGravity(Gravity.CENTER);
        root.addView(pageLabel, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        pageView = new ImageView(this);
        pageView.setAdjustViewBounds(true);
        pageView.setScaleType(ImageView.ScaleType.FIT_CENTER);

        HorizontalScrollView hScroll = new HorizontalScrollView(this);
        hScroll.addView(pageView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ScrollView vScroll = new ScrollView(this);
        vScroll.addView(hScroll, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(vScroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        final ScaleGestureDetector pinch = new ScaleGestureDetector(this,
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override
                    public boolean onScale(ScaleGestureDetector detector) {
                        float next = scale * detector.getScaleFactor();
                        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
                        showPage(pageIndex);
                        return true;
                    }
                });
        vScroll.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                pinch.onTouchEvent(event);
                return false;
            }
        });

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(16, 16, 16, 24);

        prevButton = new Button(this);
        prevButton.setText("السابق");
        prevButton.setOnClickListener(v -> showPage(pageIndex - 1));

        nextButton = new Button(this);
        nextButton.setText("التالي");
        nextButton.setOnClickListener(v -> showPage(pageIndex + 1));

        Button closeButton = new Button(this);
        closeButton.setText("رجوع للدرس");
        closeButton.setOnClickListener(v -> finishWithResult());

        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bar.addView(prevButton, lp);
        bar.addView(nextButton, new LinearLayout.LayoutParams(lp));
        bar.addView(closeButton, new LinearLayout.LayoutParams(lp));
        root.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        return root;
    }

    /** PdfRenderer is confined to one worker; stale pinch/page requests are discarded. */
    private void showPage(int index) {
        if (renderer == null || destroyed || index < 0 || index >= renderer.getPageCount()) return;
        pageIndex = index;
        int generation = renderGeneration.incrementAndGet();
        float requestedScale = scale;
        int viewportWidth = getResources().getDisplayMetrics().widthPixels;
        pageLabel.setText("صفحة " + (pageIndex + 1) + " من " + renderer.getPageCount());
        prevButton.setEnabled(pageIndex > 0);
        nextButton.setEnabled(pageIndex < renderer.getPageCount() - 1);
        renderExecutor.execute(() -> {
            if (destroyed || generation != renderGeneration.get()) return;
            Bitmap bitmap = null;
            try (PdfRenderer.Page page = renderer.openPage(index)) {
                int displayWidth = Math.max(1, Math.round(viewportWidth * requestedScale));
                int displayHeight = Math.max(1, Math.round((float) displayWidth * page.getHeight() / page.getWidth()));
                double factor = Math.min(1, Math.sqrt((double) MAX_RENDER_PIXELS / ((long) displayWidth * displayHeight)));
                int width = Math.max(1, (int) (displayWidth * factor));
                int height = Math.max(1, (int) (displayHeight * factor));
                bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                bitmap.eraseColor(Color.WHITE);
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                Bitmap rendered = bitmap;
                runOnUiThread(() -> {
                    if (destroyed || generation != renderGeneration.get()) { rendered.recycle(); return; }
                    pageView.setLayoutParams(new FrameLayout.LayoutParams(displayWidth, displayHeight));
                    pageView.setImageBitmap(rendered);
                    if (currentBitmap != null && !currentBitmap.isRecycled()) currentBitmap.recycle();
                    currentBitmap = rendered;
                });
            } catch (Exception | OutOfMemoryError error) {
                if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
                runOnUiThread(() -> {
                    if (!destroyed && generation == renderGeneration.get()) Toast.makeText(this, "تعذّر عرض الصفحة. جرّب تقليل التكبير.", Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        state.putInt(EXTRA_LAST_PAGE, pageIndex + 1);
        super.onSaveInstanceState(state);
    }

    private void finishWithResult() {
        Intent data = new Intent();
        data.putExtra(EXTRA_LAST_PAGE, pageIndex + 1);
        setResult(Activity.RESULT_OK, data);
        finish();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        renderGeneration.incrementAndGet();
        pageView.setImageDrawable(null);
        if (currentBitmap != null && !currentBitmap.isRecycled()) currentBitmap.recycle();
        currentBitmap = null;
        renderExecutor.execute(() -> {
            try {
                if (renderer != null) renderer.close();
                if (descriptor != null) descriptor.close();
            } catch (Exception ignored) { /* already closed */ }
        });
        renderExecutor.shutdown();
        super.onDestroy();
    }
}
